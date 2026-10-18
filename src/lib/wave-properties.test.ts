import { describe, expect, test } from "bun:test";
import {
  DEFAULT_WAVE_PROPERTIES, WAVE_MAX_FRAME_DELTA, WAVE_PROPERTY_LIMITS, WAVE_PROPERTY_WINDOW,
  WAVE_PROBE_POSITION, advanceWaveTime, calculateWaveProperties, createWavePropertyFrame,
  formatWaveProperty, parseWaveProperty, quarterPeriodWaveTime, resolveWaveProperties,
  updateWaveProperty, wavePlotCoordinates, wavePropertyDisplacement, wavePropertyExtrema,
  type WavePropertiesDraft, type WaveProperty,
} from "./wave-properties";

const initial = (): WavePropertiesDraft => ({ ...DEFAULT_WAVE_PROPERTIES });
const wave = (patch: Partial<{ amplitude: number; frequency: number; wavelength: number }> = {}) =>
  calculateWaveProperties({ amplitude: 1, frequency: 0.5, wavelength: 4, ...patch });

// This model is independent of the tank's dispersion model: f and λ are independent inputs.
describe("wave properties in SI units", () => {
  test("derives period, phase speed, extrema and maximum displacement", () => {
    expect(wave()).toEqual({
      amplitude: 1, frequency: 0.5, wavelength: 4, period: 2, speed: 2,
      maximumDisplacement: 1, crestDisplacement: 1, troughDisplacement: -1, peakToPeak: 2,
    });
  });

  test("amplitude changes height, not period, wavelength or phase speed", () => {
    const low = wave({ amplitude: 0.5 });
    const high = wave({ amplitude: 2 });
    expect(high.maximumDisplacement).toBe(4 * low.maximumDisplacement);
    expect(high.peakToPeak).toBe(4 * low.peakToPeak);
    expect([high.period, high.frequency, high.wavelength, high.speed])
      .toEqual([low.period, low.frequency, low.wavelength, low.speed]);
  });

  test("frequency and wavelength each change propagation speed", () => {
    expect(wave({ frequency: 1 }).speed).toBe(wave().speed * 2);
    expect(wave({ frequency: 1 }).period).toBe(wave().period / 2);
    expect(wave({ wavelength: 2 }).speed).toBe(wave().speed / 2);
  });

  test("zero amplitude is valid but has no distinct crests or troughs", () => {
    const flat = wave({ amplitude: 0 });
    expect(flat.maximumDisplacement).toBe(0);
    expect(flat.troughDisplacement).toBe(0);
    expect(Object.is(flat.troughDisplacement, -0)).toBe(false);
    expect(wavePropertyExtrema(flat, 3)).toBeNull();
    expect(wavePropertyDisplacement(flat, 1.3, 5)).toBeCloseTo(0, 12);
    const frame = createWavePropertyFrame(flat, 3, 600);
    expect(frame.crest).toBeNull();
    expect(frame.amplitudeMeasure).toBe("");
    expect(frame.wavelengthMeasure).toBe("");
    expect(frame.trace).not.toMatch(/NaN|Infinity/);
  });

  for (const property of ["amplitude", "frequency", "wavelength"] as const) {
    for (const value of [NaN, Infinity, -Infinity, -1, Number.MAX_VALUE]) {
      test(`rejects invalid ${property} = ${value}`, () => {
        expect(() => wave({ [property]: value })).toThrow(RangeError);
      });
    }
    test(`accepts inclusive bounds for ${property}`, () => {
      const { min, max } = WAVE_PROPERTY_LIMITS[property];
      expect(wave({ [property]: min })[property]).toBe(min);
      expect(wave({ [property]: max })[property]).toBe(max);
      expect(() => wave({ [property]: max + 0.01 })).toThrow(RangeError);
    });
  }
});

describe("editable, reciprocal controls", () => {
  test("accepts decimal/scientific SI values and an explicit amplitude zero", () => {
    expect(parseWaveProperty("0", "amplitude")).toBe(0);
    expect(parseWaveProperty(" .5 ", "frequency")).toBe(0.5);
    expect(parseWaveProperty("1e-1", "frequency")).toBe(0.1);
  });

  for (const property of Object.keys(WAVE_PROPERTY_LIMITS) as WaveProperty[]) {
    for (const text of ["", " ", ".", "-", "1e", "NaN", "Infinity", "-Infinity", "1e999", "0x1", "1 Hz", "-0.01", "100"]) {
      test(`withholds invalid ${property} input ${JSON.stringify(text)}`, () => {
        expect(() => parseWaveProperty(text, property)).toThrow(RangeError);
        const result = resolveWaveProperties(updateWaveProperty(initial(), property, text));
        expect(result.model).toBeNull();
        expect(result.errors[property]).toBeTruthy();
      });
    }
  }

  test("zero is rejected for frequency, period and wavelength", () => {
    for (const property of ["frequency", "period", "wavelength"] as const) {
      expect(() => parseWaveProperty("0", property)).toThrow(RangeError);
    }
  });

  test("editing frequency immediately updates period, without mutating the draft", () => {
    const before = initial();
    const draft = updateWaveProperty(before, "frequency", "3");
    expect(before).toEqual(DEFAULT_WAVE_PROPERTIES);
    expect(draft.period).toBe(String(1 / 3));
    expect(draft.timingSource).toBe("frequency");
    expect(resolveWaveProperties(draft).model?.period).toBe(1 / 3);
  });

  test("editing period immediately updates frequency and leaves other inputs alone", () => {
    const draft = updateWaveProperty(initial(), "period", "0.4");
    expect(draft.frequency).toBe("2.5");
    expect(draft.amplitude).toBe(initial().amplitude);
    expect(draft.wavelength).toBe(initial().wavelength);
    expect(draft.timingSource).toBe("period");
    expect(resolveWaveProperties(draft).model?.period).toBe(0.4);
    expect(resolveWaveProperties(draft).model?.speed).toBe(10);
  });

  test("changing which reciprocal is edited does not round or drift the model", () => {
    let draft = updateWaveProperty(initial(), "frequency", "3");
    draft = updateWaveProperty(draft, "period", draft.period);
    draft = updateWaveProperty(draft, "frequency", draft.frequency);
    const result = resolveWaveProperties(draft);
    expect(result.errors).toEqual({});
    expect(result.model?.frequency).toBeCloseTo(3, 14);
    expect(result.model?.period).toBeCloseTo(1 / 3, 14);
  });

  test("both reciprocal endpoint pairs are accepted in either direction", () => {
    for (const [frequency, period] of [[0.1, 10], [4, 0.25]]) {
      const fromFrequency = resolveWaveProperties(updateWaveProperty(initial(), "frequency", String(frequency)));
      const fromPeriod = resolveWaveProperties(updateWaveProperty(initial(), "period", String(period)));
      expect(fromFrequency.model).toEqual(fromPeriod.model);
      expect(fromFrequency.model?.period).toBe(period);
    }
  });

  test("incomplete timing clears its reciprocal, withholds all results, and can recover", () => {
    const invalid = updateWaveProperty(initial(), "frequency", "");
    expect(invalid.period).toBe("");
    expect(resolveWaveProperties(invalid).model).toBeNull();
    const recovered = updateWaveProperty(invalid, "period", "4");
    expect(recovered.frequency).toBe("0.25");
    expect(resolveWaveProperties(recovered).model?.period).toBe(4);
  });

  test("collects all independent errors instead of silently clamping any input", () => {
    const draft = { ...initial(), amplitude: "-1", frequency: "", wavelength: "5" };
    const result = resolveWaveProperties(draft);
    expect(result.model).toBeNull();
    expect(Object.keys(result.errors).sort()).toEqual(["amplitude", "frequency", "wavelength"]);
  });
});

describe("travelling wave and calibrated geometry", () => {
  test("matches y = A sin[2π(x/λ − ft)]", () => {
    const model = wave({ amplitude: 1.5, frequency: 1.25, wavelength: 2 });
    for (const position of [-3, 0, 0.3, 1, 9.4]) {
      for (const time of [0, 0.1, 1, 10.2]) {
        const expected = model.amplitude * Math.sin(2 * Math.PI * (position / model.wavelength - model.frequency * time));
        expect(wavePropertyDisplacement(model, position, time)).toBeCloseTo(expected, 11);
      }
    }
  });

  test("a quarter period shifts the pattern right by a quarter wavelength", () => {
    const model = wave();
    const before = wavePropertyExtrema(model, 0)!;
    const after = wavePropertyExtrema(model, model.period / 4)!;
    expect(after.crest - before.crest).toBeCloseTo(model.wavelength / 4, 12);
    for (const position of [0, 0.7, 2, 9]) {
      expect(wavePropertyDisplacement(model, position + model.wavelength / 4, model.period / 4))
        .toBeCloseTo(wavePropertyDisplacement(model, position, 0), 12);
    }
  });

  test("the probe oscillates without any horizontal drift and repeats each period", () => {
    const model = wave();
    const frames = [0, model.period / 4, model.period / 2, model.period * 3 / 4, model.period]
      .map(time => createWavePropertyFrame(model, time, 320));
    expect(new Set(frames.map(frame => frame.probe.x)).size).toBe(1);
    expect(frames[0].probe.x).toBe(wavePlotCoordinates(320).x(WAVE_PROBE_POSITION));
    expect(frames[0].probeDisplacement).toBeCloseTo(0, 12);
    expect(frames[1].probeDisplacement).toBeCloseTo(model.amplitude, 12);
    expect(frames[3].probeDisplacement).toBeCloseTo(-model.amplitude, 12);
    expect(frames[4].probe.y).toBeCloseTo(frames[0].probe.y, 12);
  });

  test("extrema are physical crests/troughs and adjacent crests are one wavelength apart", () => {
    for (const wavelength of [0.5, 1, 4]) {
      const model = wave({ wavelength });
      for (const time of [0, 0.125, 0.5, 1.49, 12.33]) {
        const extrema = wavePropertyExtrema(model, time)!;
        expect(extrema.nextCrest - extrema.crest).toBeCloseTo(wavelength, 12);
        expect(extrema.trough - extrema.crest).toBeCloseTo(wavelength / 2, 12);
        expect(wavePropertyDisplacement(model, extrema.crest, time)).toBeCloseTo(model.amplitude, 12);
        expect(wavePropertyDisplacement(model, extrema.trough, time)).toBeCloseTo(-model.amplitude, 12);
        expect(extrema.crest).toBeGreaterThanOrEqual(WAVE_PROPERTY_WINDOW.xMin);
        expect(extrema.nextCrest).toBeLessThanOrEqual(WAVE_PROPERTY_WINDOW.xMax);
      }
    }
  });

  test("fixed vertical calibration makes doubling amplitude double the plotted height", () => {
    for (const width of [248, 320, 640, 1200]) {
      const { y } = wavePlotCoordinates(width);
      const low = createWavePropertyFrame(wave({ amplitude: 0.5 }), 0, width);
      const high = createWavePropertyFrame(wave({ amplitude: 1 }), 0, width);
      expect(y(0) - high.crest!.y).toBeCloseTo(2 * (y(0) - low.crest!.y), 12);
      expect(high.crest!.x).toBe(low.crest!.x);
      expect(high.crest!.y).toBeGreaterThan(WAVE_PROPERTY_WINDOW.top);
    }
  });

  test("fixed horizontal calibration changes crest spacing, not the window", () => {
    const { x, plotWidth } = wavePlotCoordinates(320);
    const long = createWavePropertyFrame(wave({ wavelength: 4 }), 0, 320);
    const short = createWavePropertyFrame(wave({ wavelength: 2 }), 0, 320);
    expect(long.nextCrest!.x - long.crest!.x).toBeCloseTo(2 * (short.nextCrest!.x - short.crest!.x), 12);
    expect(x(10) - x(0)).toBe(plotWidth);
    expect(x(0)).toBe(WAVE_PROPERTY_WINDOW.left);
    expect(x(10)).toBe(320 - WAVE_PROPERTY_WINDOW.right);
    // 10/λ cycles fit the same physical window, at every responsive width.
    expect((x(10) - x(0)) / (short.nextCrest!.x - short.crest!.x)).toBeCloseTo(5, 12);
  });

  test("generates finite, bounded geometry at all domain corners, even on a phone", () => {
    for (const amplitude of [0, 2]) for (const frequency of [0.1, 4]) for (const wavelength of [0.5, 4]) {
      for (const width of [248, 320, 1200]) {
        const frame = createWavePropertyFrame(wave({ amplitude, frequency, wavelength }), 1234.5, width);
        expect(frame.trace).not.toMatch(/NaN|Infinity/);
        expect(frame.trace.match(/[ML]/g)).toHaveLength(641);
        expect(frame.probe.y).toBeGreaterThan(WAVE_PROPERTY_WINDOW.top);
        expect(frame.probe.y).toBeLessThan(WAVE_PROPERTY_WINDOW.height - WAVE_PROPERTY_WINDOW.bottom);
      }
    }
  });

  test("rejects invalid coordinate widths, positions and elapsed times", () => {
    for (const width of [0, 54, -1, NaN, Infinity]) expect(() => wavePlotCoordinates(width)).toThrow(RangeError);
    for (const position of [NaN, Infinity, -Infinity]) expect(() => wavePropertyDisplacement(wave(), position, 0)).toThrow(RangeError);
    for (const time of [-1, NaN, Infinity]) {
      expect(() => wavePropertyDisplacement(wave(), 0, time)).toThrow(RangeError);
      expect(() => createWavePropertyFrame(wave(), time, 320)).toThrow(RangeError);
      expect(() => wavePropertyExtrema(wave({ amplitude: 0 }), time)).toThrow(RangeError);
    }
  });
});

describe("simulation clock and readout", () => {
  test("caps wall-clock deltas so a late frame cannot jump ahead", () => {
    expect(advanceWaveTime(2, 0.01)).toBeCloseTo(2.01, 12);
    expect(advanceWaveTime(2, 60)).toBeCloseTo(2 + WAVE_MAX_FRAME_DELTA, 12);
    expect(advanceWaveTime(2, 0)).toBe(2);
  });

  test("intentional stepping is exact, uncapped and uses the current period", () => {
    for (const frequency of [0.1, 0.5, 3, 4]) {
      const model = wave({ frequency });
      let time = 0;
      for (let index = 0; index < 4; index++) time = quarterPeriodWaveTime(model, time);
      expect(time).toBeCloseTo(model.period, 12);
      expect(quarterPeriodWaveTime(model, 2)).toBeCloseTo(2 + model.period / 4, 12);
    }
  });

  test("rejects invalid clock values and deltas", () => {
    for (const invalid of [-1, NaN, Infinity, -Infinity]) {
      expect(() => advanceWaveTime(invalid, 0.01)).toThrow(RangeError);
      expect(() => advanceWaveTime(0, invalid)).toThrow(RangeError);
      expect(() => quarterPeriodWaveTime(wave(), invalid)).toThrow(RangeError);
    }
  });

  test("formats real zero and never prints a nonfinite result", () => {
    expect(formatWaveProperty(0)).toBe("0");
    expect(formatWaveProperty(-0)).toBe("0");
    expect(formatWaveProperty(1 / 3)).toBe("0.333");
    for (const invalid of [NaN, Infinity, -Infinity]) expect(formatWaveProperty(invalid)).toBe("—");
  });
});