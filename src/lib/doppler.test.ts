import { describe, expect, test } from 'bun:test';
import {
  calculateDoppler,
  DOPPLER_PRESETS,
  dopplerWavefronts,
  validateDoppler,
  type DopplerField,
  type DopplerParameters,
} from './doppler';

const BASE: DopplerParameters = { fs: 440, c: 343, vs: 0, vo: 0 };
const parameters = (overrides: Partial<DopplerParameters> = {}): DopplerParameters => ({ ...BASE, ...overrides });

function near(actual: number, expected: number, relative = 1e-12): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(1e-12, Math.abs(expected) * relative));
}

describe('classical Doppler cases in the stationary medium', () => {
  test('source approaches a stationary observer: positive source velocity', () => {
    const result = calculateDoppler(parameters({ vs: 70 }));
    near(result.observedHz, 440 * 343 / (343 - 70));
    expect(result.shiftHz).toBeGreaterThan(0);
    expect(result.wavelengthAheadM).toBeLessThan(result.restWavelengthM);
    expect(result.wavelengthBehindM).toBeGreaterThan(result.restWavelengthM);
  });

  test('source recedes from a stationary observer: negative source velocity', () => {
    const result = calculateDoppler(parameters({ vs: -70 }));
    near(result.observedHz, 440 * 343 / (343 + 70));
    expect(result.shiftHz).toBeLessThan(0);
    expect(result.wavelengthAheadM).toBeGreaterThan(result.restWavelengthM);
    expect(result.wavelengthBehindM).toBeLessThan(result.restWavelengthM);
  });

  test('observer approaches a stationary source: negative observer velocity', () => {
    const result = calculateDoppler(parameters({ vo: -70 }));
    near(result.observedHz, 440 * (343 + 70) / 343);
    near(result.wavelengthAheadM, 343 / 440);
    near(result.wavelengthBehindM, 343 / 440);
    expect(result.shiftHz).toBeGreaterThan(0);
  });

  test('observer recedes from a stationary source: positive observer velocity', () => {
    const result = calculateDoppler(parameters({ vo: 70 }));
    near(result.observedHz, 440 * (343 - 70) / 343);
    near(result.wavelengthAheadM, 343 / 440);
    near(result.wavelengthBehindM, 343 / 440);
    expect(result.shiftHz).toBeLessThan(0);
  });

  test('both velocities are independently signed, not replaced by closing speed', () => {
    for (const vs of [-160, -40, 0, 40, 160]) {
      for (const vo of [-160, -40, 0, 40, 160]) {
        const result = calculateDoppler(parameters({ vs, vo }));
        near(result.observedHz, 440 * (343 - vo) / (343 - vs));
        near(result.observedHz, result.encounterSpeedMps / result.wavelengthAheadM);
        expect(Math.sign(result.shiftHz)).toBe(Math.sign(vs - vo));
      }
    }
  });

  test('both stationary yields the emitted frequency and symmetric spacing', () => {
    const result = calculateDoppler(BASE);
    expect(result.observedHz).toBe(440);
    expect(result.frequencyRatio).toBe(1);
    expect(result.shiftHz).toBe(0);
    expect(result.shiftPercent).toBe(0);
    expect(result.wavelengthAheadM).toBe(result.wavelengthBehindM);
  });

  test('moving together has no frequency shift, but the medium spacing is asymmetric', () => {
    for (const speed of [-300, -70, 70, 300]) {
      const result = calculateDoppler(parameters({ vs: speed, vo: speed }));
      expect(result.observedHz).toBe(440);
      expect(result.shiftHz).toBe(0);
      expect(result.shiftPercent).toBe(0);
      expect(result.wavelengthAheadM).not.toBe(result.wavelengthBehindM);
    }
  });

  test('equal closing speeds do not make moving-source and moving-observer cases equivalent', () => {
    const movingSource = calculateDoppler(parameters({ vs: 70 }));
    const movingObserver = calculateDoppler(parameters({ vo: -70 }));
    expect(movingSource.observedHz).toBeGreaterThan(movingObserver.observedHz);
    expect(movingSource.wavelengthAheadM).not.toBe(movingObserver.wavelengthAheadM);
  });

  test('the five exported presets are unique, meaningful and in the valid domain', () => {
    expect(DOPPLER_PRESETS.map((preset) => preset.id)).toEqual([
      'source-toward', 'source-away', 'observer-toward', 'observer-away', 'both-moving',
    ]);
    for (const preset of DOPPLER_PRESETS) {
      expect(validateDoppler(preset.parameters)).toEqual({});
      expect(calculateDoppler(preset.parameters).observedHz).toBeGreaterThan(0);
    }
    expect(DOPPLER_PRESETS[0].parameters.vs).toBeGreaterThan(0);
    expect(DOPPLER_PRESETS[1].parameters.vs).toBeLessThan(0);
    expect(DOPPLER_PRESETS[2].parameters.vo).toBeLessThan(0);
    expect(DOPPLER_PRESETS[3].parameters.vo).toBeGreaterThan(0);
    expect(DOPPLER_PRESETS[4].parameters.vs).not.toBe(0);
    expect(DOPPLER_PRESETS[4].parameters.vo).not.toBe(0);
  });
});

describe('Doppler units and derived quantities', () => {
  test('Hz, metres, seconds and m/s give the expected dimensional quantities', () => {
    const result = calculateDoppler({ fs: 100, c: 300, vs: 60, vo: -30 });
    near(result.emittedHz, 100);
    near(result.observedHz, 137.5);
    near(result.shiftHz, 37.5);
    near(result.shiftPercent, 37.5);
    near(result.frequencyRatio, 1.375);
    near(result.restWavelengthM, 3);
    near(result.wavelengthAheadM, 2.4);
    near(result.wavelengthBehindM, 3.6);
    near(result.encounterSpeedMps, 330);
    near(result.emissionPeriodS, 0.01);
  });

  test('doubling frequency doubles frequencies and shift Hz, halves spacing and period', () => {
    const first = calculateDoppler(parameters({ vs: 70, vo: -30 }));
    const second = calculateDoppler(parameters({ fs: 880, vs: 70, vo: -30 }));
    near(second.observedHz, first.observedHz * 2);
    near(second.shiftHz, first.shiftHz * 2);
    near(second.shiftPercent, first.shiftPercent);
    near(second.wavelengthAheadM, first.wavelengthAheadM / 2);
    near(second.wavelengthBehindM, first.wavelengthBehindM / 2);
    near(second.emissionPeriodS, first.emissionPeriodS / 2);
  });

  test('scaling every speed preserves frequency ratio but scales wavelengths', () => {
    const first = calculateDoppler({ fs: 440, c: 343, vs: 70, vo: -30 });
    const second = calculateDoppler({ fs: 440, c: 686, vs: 140, vo: -60 });
    near(second.observedHz, first.observedHz);
    near(second.wavelengthAheadM, first.wavelengthAheadM * 2);
    near(second.wavelengthBehindM, first.wavelengthBehindM * 2);
  });
});

describe('Doppler domain and finite numerical safety', () => {
  for (const field of ['fs', 'c', 'vs', 'vo'] as DopplerField[]) {
    test(`rejects all nonfinite ${field} values`, () => {
      for (const value of [NaN, Infinity, -Infinity]) {
        const input = parameters({ [field]: value });
        expect(validateDoppler(input)[field]).toBeTruthy();
        expect(() => calculateDoppler(input)).toThrow(RangeError);
        expect(() => dopplerWavefronts(input)).toThrow(RangeError);
      }
    });
  }

  test('frequency and sound speed must be strictly positive', () => {
    for (const field of ['fs', 'c'] as const) {
      for (const value of [0, -0, -1, -343]) {
        expect(() => calculateDoppler(parameters({ [field]: value }))).toThrow(RangeError);
      }
    }
  });

  test('both signed sonic boundaries and supersonic speeds are rejected', () => {
    for (const field of ['vs', 'vo'] as const) {
      for (const value of [-400, -343, 343, 400]) {
        const input = parameters({ [field]: value });
        expect(validateDoppler(input)[field]).toContain('strictly less');
        expect(() => calculateDoppler(input)).toThrow(RangeError);
      }
    }
  });

  test('strictly subsonic inputs arbitrarily near each boundary remain finite and positive', () => {
    for (const vs of [-343 + 1e-8, 343 - 1e-8]) {
      for (const vo of [-343 + 1e-8, 343 - 1e-8]) {
        const result = calculateDoppler(parameters({ vs, vo }));
        expect(Object.values(result).every(Number.isFinite)).toBe(true);
        expect(result.observedHz).toBeGreaterThan(0);
        expect(result.wavelengthAheadM).toBeGreaterThan(0);
        expect(result.wavelengthBehindM).toBeGreaterThan(0);
      }
    }
  });

  test('rejects overflow and underflow rather than returning Infinity, NaN or zero spacing', () => {
    for (const input of [
      { fs: Number.MAX_VALUE, c: 343, vs: 342, vo: 0 },
      { fs: Number.MIN_VALUE, c: 343, vs: 0, vo: 0 },
      { fs: 440, c: Number.MAX_VALUE, vs: -Number.MAX_VALUE / 2, vo: 0 },
      { fs: Number.MAX_VALUE, c: Number.MIN_VALUE, vs: 0, vo: 0 },
    ]) {
      expect(() => calculateDoppler(input)).toThrow(RangeError);
    }
  });

  test('reports independent field errors without modifying input values', () => {
    const input = Object.freeze({ fs: 0, c: -1, vs: NaN, vo: Infinity });
    expect(Object.keys(validateDoppler(input)).sort()).toEqual(['c', 'fs', 'vo', 'vs']);
    expect(() => calculateDoppler(input)).toThrow(RangeError);
    expect(input.fs).toBe(0);
    expect(input.c).toBe(-1);
    expect(Number.isNaN(input.vs)).toBe(true);
  });
});

describe('true-emission wavefront snapshot', () => {
  test('each wave expands at c about its original emission position', () => {
    const input = { fs: 100, c: 300, vs: 60, vo: -30 };
    const fronts = dopplerWavefronts(input);
    expect(fronts).toHaveLength(9);
    fronts.forEach((front, index) => {
      expect(front.periodsAgo).toBe(index + 1);
      near(front.ageSeconds, (index + 1) / input.fs);
      near(front.centerXM, -input.vs * front.ageSeconds);
      near(front.radiusM, input.c * front.ageSeconds);
      near(front.aheadXM, front.centerXM + front.radiusM);
      near(front.behindXM, front.centerXM - front.radiusM);
    });
  });

  test('front and back crest spacings match the calculator for either source direction', () => {
    for (const vs of [-300, -70, 0, 70, 300]) {
      const input = parameters({ vs });
      const result = calculateDoppler(input);
      const fronts = dopplerWavefronts(input);
      for (let index = 1; index < fronts.length; index++) {
        near(fronts[index].aheadXM - fronts[index - 1].aheadXM, result.wavelengthAheadM);
        near(fronts[index - 1].behindXM - fronts[index].behindXM, result.wavelengthBehindM);
      }
    }
  });

  test('observer motion cannot alter the medium wavefronts', () => {
    expect(dopplerWavefronts(parameters({ vs: 70, vo: -120 })))
      .toEqual(dopplerWavefronts(parameters({ vs: 70, vo: 120 })));
    expect(dopplerWavefronts(BASE).every((front) => front.centerXM === 0)).toBe(true);
  });

  test('does not mutate parameters or reuse snapshot arrays', () => {
    const input = Object.freeze(parameters({ vs: 70 }));
    const first = dopplerWavefronts(input);
    const second = dopplerWavefronts(input);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(input.vs).toBe(70);
  });

  test('wavefront count is bounded and finite', () => {
    expect(dopplerWavefronts(BASE, 1)).toHaveLength(1);
    expect(dopplerWavefronts(BASE, 32)).toHaveLength(32);
    for (const count of [0, -1, 1.5, 33, NaN, Infinity]) {
      expect(() => dopplerWavefronts(BASE, count)).toThrow(RangeError);
    }
    expect(() => dopplerWavefronts({ fs: 1, c: Number.MAX_VALUE / 2, vs: 0, vo: 0 }, 9)).toThrow(RangeError);
  });
});
