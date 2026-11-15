import { describe, expect, it } from 'vitest';
import { createServoCalibration, createSixMotorCalibration, maskToColumnPatterns, threeCellsToMotorColumns } from './brailleColumns.js';

describe('six-motor Braille columns', () => {
  it.each(Array.from({ length: 8 }, (_, pattern) => pattern))('extracts left column pattern %i', (pattern) => {
    expect(maskToColumnPatterns(pattern)).toEqual({ left: pattern, right: 0 });
  });

  it.each(Array.from({ length: 8 }, (_, pattern) => pattern))('extracts right column pattern %i', (pattern) => {
    expect(maskToColumnPatterns(pattern << 3)).toEqual({ left: 0, right: pattern });
  });

  it('orders all six motors by cell then left/right column', () => {
    const cells = [0b010_101, 0b111_000, 0b001_110];
    expect(threeCellsToMotorColumns(cells)).toEqual([0b101, 0b010, 0b000, 0b111, 0b110, 0b001]);
  });

  it('keeps all eight calibration slots unset until hardware testing', () => {
    const calibration = createServoCalibration();
    expect(calibration.snapshot()).toEqual(Array(8).fill(null));
    expect(() => calibration.mapMotorColumns([0, 1, 2, 3, 4, 5])).toThrow(/not calibrated/);
  });

  it('maps configured patterns without assuming angles or pins', () => {
    const calibration = createServoCalibration({ 0: 1000, 1: 1100, 2: 1200, 3: 1300, 4: 1400, 5: 1500 });
    expect(calibration.mapMotorColumns([0, 1, 2, 3, 4, 5])).toEqual([1000, 1100, 1200, 1300, 1400, 1500]);
  });

  it('supports independent eight-pattern calibration for every motor', () => {
    const calibration = createSixMotorCalibration();
    for (let motor = 1; motor <= 6; motor += 1) {
      for (let pattern = 0; pattern < 8; pattern += 1) calibration.motor(motor).setPosition(pattern, motor * 100 + pattern);
    }
    expect(calibration.mapMotorColumns([0, 1, 2, 3, 4, 5])).toEqual([100, 201, 302, 403, 504, 605]);
    expect(calibration.snapshot()).toHaveLength(6);
  });

  it.each([[-1], [64], [1.5], ['1'], [null]])('rejects invalid Braille mask %j', (mask) => {
    expect(() => maskToColumnPatterns(mask)).toThrow(/Invalid/);
  });

  it('rejects wrong cell counts, invalid column patterns, and invalid positions', () => {
    expect(() => threeCellsToMotorColumns([1, 2])).toThrow(/Exactly three/);
    expect(() => threeCellsToMotorColumns([1, 2, 64])).toThrow(/Invalid/);
    const calibration = createServoCalibration();
    expect(() => calibration.setPosition(8, 90)).toThrow(/Invalid/);
    expect(() => calibration.setPosition(0, Number.NaN)).toThrow(/Invalid/);
    expect(() => calibration.mapMotorColumns([0, 1, 2])).toThrow(/Exactly six/);
    expect(() => createSixMotorCalibration().motor(0)).toThrow(/Invalid motor/);
  });
});
