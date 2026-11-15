# BrailleBridge

**Turning digital words into Braille you can touch.**

Built for **MadHacks 2026**, BrailleBridge is an AI-assisted accessibility prototype for DeafBlind accessibility and tactile reading. It connects a web application to a custom, three-cell refreshable Braille display, allowing users to read text through physical raised-dot patterns.

The display presents **three Braille characters at a time**. Pressing the physical **NEXT** button advances to the next group, so a small display can present a longer message.

## Why we built it

Text on a screen and spoken audio are not equally accessible to everyone. BrailleBridge explores a tactile way to access written information, with a single interface for bringing text from different sources into Braille.

Our goal is to bridge the gap between digital information and physical, touch-based reading.

## How it works

1. **Bring in text.** Use the web interface to enter text or access its speech, camera, document, and website-text workflows.
2. **Prepare the message.** Review the text and, where the required AI service is available, simplify or process it before translation.
3. **Translate into Braille.** The backend converts the message into six-dot Braille patterns and divides the result into groups of three cells.
4. **Read by touch.** Six servo-driven drums position the dots on the physical display.
5. **Keep reading.** Press NEXT to move through the message. The web interface also includes page navigation and a display reset control.

Input workflows and web controls are implemented to varying degrees; see [Prototype status](#prototype-status) for what has been verified on the assembled hardware.

## The hardware

Each Braille cell contains two columns of three dots. Our mechanism uses **two rotating drums per cell**, with one servo controlling each drum. Six servos form the three-cell display.

| Component | Role |
| --- | --- |
| Arduino UNO Q | Runs Linux, the application backend, and local services |
| Arduino UNO R3 | Receives display commands and controls servos and buttons |
| Six servos and six three-dot drums | Form the physical Braille patterns |
| Custom frame and drum assembly | Holds the tactile display mechanism |
| Physical NEXT button | Advances to the next three characters |
| Six Braille-entry buttons and a SPACE button | Provide additional inputs defined in the firmware |
| External regulated 5 V servo supply | Powers the servo mechanism separately from the controller |

```text
Web application / local AI services
                 |
        Python FastAPI backend
          Arduino UNO Q
                 |
       USB serial (115200 baud)
                 |
          Arduino UNO R3
                 |
     Six servos -> six dot drums
                 |
       Three tactile Braille cells

Physical NEXT button -> backend page controller -> next display page
```

**Power and calibration:** Do not power the six servos from the UNO R3's 5 V pin or USB supply. Use an external regulated 5 V supply rated at least 3 A, sized for the actual servos' peak current, with a shared ground to the UNO R3. Verify wiring, polarity, and calibration before enabling movement. Disconnect servo power if the mechanism jams or overheats.

The firmware's example calibration values are placeholders. The assembled device needs its own verified settings. The backend already transforms standard Braille patterns to match the physical drum orientation; changes to firmware orientation must be checked against the actual display.

## Software

| Technology | Purpose |
| --- | --- |
| React + Vite | Web interface, text review, and Braille preview |
| Python + FastAPI | Translation endpoints, page control, and hardware APIs |
| Liblouis | English Grade 1 and Grade 2 Braille translation |
| PySerial | Communication between the UNO Q and UNO R3 |
| Arduino Servo library | Servo control on the UNO R3 |

The hackathon device also used local services for OCR (IndraOCR), language translation (SMaLL-100), and speech recognition (Cactus Whistle). Those services require separate installation and model files; installing the application dependencies alone does not reproduce the deployed device.

## Prototype status

The team reported successful tests on the assembled prototype for:

- **Physical Braille output:** standard masks `[1, 3, 9]` displayed the Braille patterns for A, B, and C with the correct dot orientation.
- **Button-driven pagination:** loading `ABCDEF`, displaying the first page, and pressing NEXT advanced the controller and display to the second page.
- **Blank reset:** sending `[0, 0, 0]` cleared the physical display and returned an acknowledgment.
- **USB communication:** the UNO Q recognized the UNO R3 at `/dev/ttyACM0`.

The web interface includes Next, Previous, and Reset Display controls, but those flows need separate hardware demonstration. Camera, speech, AI processing, and complete input-to-display workflows also need end-to-end verification before being described as fully tested.

This is a **hackathon prototype**, not a certified assistive device. Servo movement can take several seconds, and a fresh-device deployment still requires additional setup documentation.

## Run the application locally

You will need Node.js with npm, Python with pip, and **Liblouis with its Python bindings and English translation tables**. Liblouis is a system dependency and is not installed by `requirements.txt`; installation depends on your operating system. The current translator includes support for discovering Homebrew-installed bindings on macOS.

From the repository root, install the backend dependencies and start the API:

```sh
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.api.server:app --host 127.0.0.1 --port 8000
```

In another terminal, start the frontend:

```sh
cd frontend
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. The development server forwards the main API requests to port 8000. Speech-related requests use a separate service on port 8001; see the [speech backend notes](backend/speech/README.md) for its configuration.

These steps start the application code, not a complete hardware deployment. The current API startup uses `/dev/ttyACM0` for the UNO R3, so other devices or operating systems require adapting that connection. Physical output also requires the assembled and calibrated display, flashed firmware, and motor configuration. Motor commands are disabled by default through `BRAILLE_MOTORS_ENABLED`; enabling movement requires setting it to `1` in the backend environment after the hardware is ready.

Local AI services and their models must be provisioned separately for features that depend on them.

## Repository guide

| Path | Contents |
| --- | --- |
| [`frontend/`](frontend/) | Main React app, Braille preview, and input workflows |
| [`backend/api/`](backend/api/) | FastAPI application and endpoints |
| [`backend/braille/`](backend/braille/) | Braille translation and pagination |
| [`backend/hardware/`](backend/hardware/) | Serial communication, page control, orientation mapping, and motor guard |
| [`backend/ai/`](backend/ai/) | Client for local AI services |
| [`backend/speech/`](backend/speech/) | Speech-related backend code and configuration notes |
| [`hardware/arduino/braille_display/`](hardware/arduino/braille_display/) | Arduino display firmware |
| [`contracts/braille-api.md`](contracts/braille-api.md) | Braille API contract |

## What's next

- Verify each input mode through the complete physical-display workflow.
- Document the final wiring, servo models, power supply, and calibrated firmware settings.
- Add build photos and mechanical assembly instructions.
- Package service installation and model setup for a fresh UNO Q.
- Evaluate tactile readability and usability with people who use Braille.
