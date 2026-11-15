export const COLUMN_PATTERN_COUNT = 8;
export const MOTOR_COUNT = 6;

function assertMask(mask) {
  if (!Number.isInteger(mask) || mask < 0 || mask > 63) throw new Error(`Invalid six-dot Braille mask: ${mask}`);
}

function assertColumnPattern(pattern) {
  if (!Number.isInteger(pattern) || pattern < 0 || pattern >= COLUMN_PATTERN_COUNT) {
    throw new Error(`Invalid three-dot column pattern: ${pattern}`);
  }
}

export function maskToColumnPatterns(mask) {
  assertMask(mask);
  return { left: mask & 0b111, right: (mask >> 3) & 0b111 };
}

// Motor order: cell 1 left/right, cell 2 left/right, cell 3 left/right.
export function threeCellsToMotorColumns(cells) {
  if (!Array.isArray(cells) || cells.length !== 3) throw new Error('Exactly three Braille cell masks are required.');
  return cells.flatMap((mask) => {
    const { left, right } = maskToColumnPatterns(mask);
    return [left, right];
  });
}

// Calibration values are intentionally empty. A future serial/hardware layer can set
// positions after the six servos are physically characterized, without changing masks.
export function createServoCalibration(initial = {}) {
  const positions = Array(COLUMN_PATTERN_COUNT).fill(null);
  Object.entries(initial).forEach(([pattern, position]) => {
    const index = Number(pattern);
    assertColumnPattern(index);
    if (!Number.isFinite(position)) throw new Error(`Invalid servo position for pattern ${pattern}`);
    positions[index] = position;
  });
  return {
    setPosition(pattern, position) {
      assertColumnPattern(pattern);
      if (!Number.isFinite(position)) throw new Error(`Invalid servo position for pattern ${pattern}`);
      positions[pattern] = position;
      return this;
    },
    getPosition(pattern) {
      assertColumnPattern(pattern);
      return positions[pattern];
    },
    mapMotorColumns(patterns) {
      if (!Array.isArray(patterns) || patterns.length !== MOTOR_COUNT) throw new Error('Exactly six motor-column patterns are required.');
      return patterns.map((pattern) => {
        assertColumnPattern(pattern);
        const position = positions[pattern];
        if (position === null) throw new Error(`Servo position is not calibrated for pattern ${pattern.toString(2).padStart(3, '0')}.`);
        return position;
      });
    },
    snapshot() { return [...positions]; },
  };
}

// Each physical servo can later receive its own eight-position table. Keeping
// the six tables separate accounts for normal mechanical variation.
export function createSixMotorCalibration(initialByMotor = []) {
  if (!Array.isArray(initialByMotor) || initialByMotor.length > MOTOR_COUNT) {
    throw new Error('Motor calibration must contain at most six tables.');
  }
  const motors = Array.from({ length: MOTOR_COUNT }, (_, index) => createServoCalibration(initialByMotor[index]));
  return {
    motor(motorNumber) {
      if (!Number.isInteger(motorNumber) || motorNumber < 1 || motorNumber > MOTOR_COUNT) throw new Error(`Invalid motor number: ${motorNumber}`);
      return motors[motorNumber - 1];
    },
    mapMotorColumns(patterns) {
      if (!Array.isArray(patterns) || patterns.length !== MOTOR_COUNT) throw new Error('Exactly six motor-column patterns are required.');
      return patterns.map((pattern, index) => {
        assertColumnPattern(pattern);
        const position = motors[index].getPosition(pattern);
        if (position === null) throw new Error(`Motor ${index + 1} is not calibrated for pattern ${pattern.toString(2).padStart(3, '0')}.`);
        return position;
      });
    },
    snapshot() { return motors.map((motor) => motor.snapshot()); },
  };
}
