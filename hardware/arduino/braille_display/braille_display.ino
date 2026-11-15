// MadHacks 2026 - cam-drum braille display firmware
// 3 cells x 2 drums (one drum per column of 3 dots), 6 servos, 8 buttons.
//
// Serial protocol (115200 baud, one command per line):
//   P,<m1>,<m2>,<m3>     show 3 cells. m = 6-bit dot mask, bit0 = dot1 ... bit5 = dot6
//   T,<servo>,<stop>     move one drum to stop 0..7 (stop = 3-bit column pattern)
//   J,<servo>,<angle>    jog one servo to a raw angle 0..180 (calibration)
//   O,<servo>,<base>,<dir>,<flip>   set calibration for one drum at runtime
//   D                     dump calibration table (paste it back into CAL below)
//   Z                     all dots down
// Events sent back:
//   EV,KEY,<mask>  chord typed (6-bit, Perkins order: bit0 = dot1)
//   EV,SPACE       space / send pressed
//   EV,NEXT        next-page pressed
//
// Calibration idea: each drum was glued on at an unknown angle, so for each
// servo store base (angle of stop 0), dir (+1 or -1), and flip (1 if the
// dot rows come out upside down). Use J to find the angle where all three
// pins are UP (that is stop 7), then set base = thatAngle - dir*7*STEP.

#include <Servo.h>

const float STEP = 160.0 / 7.0;   // degrees between stops (matches the printed drums)

// Servo order: cell1-left, cell1-right, cell2-left, cell2-right, cell3-left, cell3-right
const int SERVO_PIN[6] = {3, 5, 6, 9, 10, 11};

struct Cal { float base; int dir; int flip; };
Cal CAL[6] = {               // <-- paste the output of "D" here after calibrating
  {10, 1, 0}, {10, 1, 0}, {10, 1, 0},
  {10, 1, 0}, {10, 1, 0}, {10, 1, 0}
};

// Buttons (INPUT_PULLUP, other leg to GND). Perkins layout: dots 1-6, space, next.
const int BTN_DOT[6] = {2, 4, 7, 8, 12, 13};
const int BTN_SPACE = A0;
const int BTN_NEXT  = A1;

Servo servos[6];
int currentStop[6] = {-1, -1, -1, -1, -1, -1};
unsigned long detachAt[6] = {0};
const unsigned long HOLD_MS = 450;   // power servos only while moving (drums hold position)

String line;

int reverse3(int v) { return ((v & 1) << 2) | (v & 2) | ((v >> 2) & 1); }

int angleForStop(int s, int stop) {
  if (CAL[s].flip) stop = reverse3(stop);
  float a = CAL[s].base + CAL[s].dir * stop * STEP;
  return constrain((int)(a + 0.5), 0, 180);
}

void moveServoRaw(int s, int angle) {
  if (!servos[s].attached()) servos[s].attach(SERVO_PIN[s]);
  int from = servos[s].read();
  int step = (angle > from) ? 1 : -1;
  for (int a = from; a != angle; a += step) { servos[s].write(a); delay(8); }
  servos[s].write(angle);
  detachAt[s] = millis() + HOLD_MS;
}

void setStop(int s, int stop, bool force = false) {
  stop &= 7;
  if (!force && currentStop[s] == stop) return;
  moveServoRaw(s, angleForStop(s, stop));
  currentStop[s] = stop;
  delay(60);   // stagger servo starts to avoid current spikes / brownouts
}

void showCells(int m1, int m2, int m3) {
  int m[3] = {m1, m2, m3};
  for (int c = 0; c < 3; c++) {
    setStop(2 * c,     m[c] & 7);          // left column: dots 1,2,3
    setStop(2 * c + 1, (m[c] >> 3) & 7);   // right column: dots 4,5,6
  }
  Serial.println("OK");
}

void dumpCal() {
  Serial.println("Cal CAL[6] = {");
  for (int s = 0; s < 6; s++) {
    Serial.print("  {"); Serial.print(CAL[s].base, 1); Serial.print(", ");
    Serial.print(CAL[s].dir); Serial.print(", "); Serial.print(CAL[s].flip);
    Serial.println(s < 5 ? "}," : "}");
  }
  Serial.println("};");
}

// Sweep servo s slowly from 10 to 170 and back to 90 (one servo at a time to save power)
void sweepServo(int s) {
  if (!servos[s].attached()) servos[s].attach(SERVO_PIN[s]);
  for (int a = 10; a <= 170; a += 2) { servos[s].write(a); delay(20); }
  for (int a = 170; a >= 90; a -= 2) { servos[s].write(a); delay(20); }
  delay(200);
  servos[s].detach();
  currentStop[s] = -1;
}

void handle(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;
  int v[5] = {0, 0, 0, 0, 0}; int n = 0;
  int from = cmd.indexOf(',');
  while (from >= 0 && n < 5) {
    int to = cmd.indexOf(',', from + 1);
    String part = (to < 0) ? cmd.substring(from + 1) : cmd.substring(from + 1, to);
    v[n++] = part.toInt();
    from = to;
  }
  char c = cmd.charAt(0);
  if (c == 'P' && n >= 3) showCells(v[0], v[1], v[2]);
  else if (c == 'T' && n >= 2 && v[0] >= 0 && v[0] < 6) { setStop(v[0], v[1], true); Serial.println("OK"); }
  else if (c == 'J' && n >= 2 && v[0] >= 0 && v[0] < 6) { moveServoRaw(v[0], constrain(v[1], 0, 180)); currentStop[v[0]] = -1; Serial.println("OK"); }
  else if (c == 'O' && n >= 4 && v[0] >= 0 && v[0] < 6) { CAL[v[0]] = {(float)v[1], v[2] >= 0 ? 1 : -1, v[3] ? 1 : 0}; currentStop[v[0]] = -1; Serial.println("OK"); }
  else if (c == 'D') dumpCal();
  else if (c == 'Z') showCells(0, 0, 0);
  else if (c == 'W' && n >= 1 && v[0] >= 0 && v[0] < 6) { sweepServo(v[0]); Serial.println("OK"); }
  else if (c == 'W') { for (int s = 0; s < 6; s++) sweepServo(s); Serial.println("OK"); }
  else if (c == 'A' && n >= 1) { int a = constrain(v[0], 0, 180); for (int s = 0; s < 6; s++) { moveServoRaw(s, a); currentStop[s] = -1; delay(150); } Serial.println("OK"); }
  else Serial.println("ERR");
}

// ---- buttons: chord typing (press any combo, event fires when all released) ----
int chordMask = 0;
bool chordActive = false;
bool lastSpace = false, lastNext = false;
unsigned long lastScan = 0;

void scanButtons() {
  if (millis() - lastScan < 15) return;   // simple debounce
  lastScan = millis();
  int now = 0;
  for (int i = 0; i < 6; i++) if (digitalRead(BTN_DOT[i]) == LOW) now |= (1 << i);
  if (now) { chordMask |= now; chordActive = true; }
  else if (chordActive) {
    Serial.print("EV,KEY,"); Serial.println(chordMask);
    chordMask = 0; chordActive = false;
  }
  bool sp = digitalRead(BTN_SPACE) == LOW, nx = digitalRead(BTN_NEXT) == LOW;
  if (sp && !lastSpace) Serial.println("EV,SPACE");
  if (nx && !lastNext)  Serial.println("EV,NEXT");
  lastSpace = sp; lastNext = nx;
}

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < 6; i++) pinMode(BTN_DOT[i], INPUT_PULLUP);
  pinMode(BTN_SPACE, INPUT_PULLUP);
  pinMode(BTN_NEXT, INPUT_PULLUP);
  Serial.println("BRAILLE READY");
}

void loop() {
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n') { handle(line); line = ""; }
    else if (ch != '\r') line += ch;
  }
  for (int s = 0; s < 6; s++)
    if (detachAt[s] && millis() > detachAt[s]) { servos[s].detach(); detachAt[s] = 0; }
  scanButtons();
}
