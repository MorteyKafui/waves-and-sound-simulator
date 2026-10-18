import { describe, expect, test } from "bun:test";
import {
  GAS_CONSTANT, GAS_PRESETS, LIQUID_PRESETS, SOLID_PRESETS,
  calculateSoundSpeed, calculateStringSpeed, calculateWaveSpeed,
  celsiusToKelvin, frequencyFromCycles, linearDensityFromMass,
  parseNumericInput, samplePulse, sampleWaveCycle, transitTime, waveAtSpeed,
  type SoundSpeedInput,
} from "./wave-speed";

describe("editable numeric inputs", () => {
  test("accepts decimal and scientific notation in SI units", () => {
    expect(parseNumericInput(" 0.0025 ", "Mass")).toBe(0.0025);
    expect(parseNumericInput("2.2e9", "Modulus")).toBe(2.2e9);
    expect(parseNumericInput("-.5", "Temperature")).toBe(-0.5);
    expect(parseNumericInput("0", "Temperature")).toBe(0);
  });
  for (const input of ["", " ", "-", ".", "1e", "NaN", "Infinity", "1e999", "0x10", "2 kg"]) {
    test(`rejects incomplete or nonfinite input ${JSON.stringify(input)}`, () => {
      expect(() => parseNumericInput(input, "Mass")).toThrow(RangeError);
    });
  }
});

describe("determining wave speed", () => {
  test("frequency times wavelength uses metres, hertz and metres per second", () => {
    expect(calculateWaveSpeed({ method: "frequency", frequency: 5, wavelength: 0.8 })).toEqual({
      speed: 4, frequency: 5, wavelength: 0.8, period: 0.2,
    });
  });
  test("counts cycles to obtain frequency before calculating speed", () => {
    expect(frequencyFromCycles(20, 4)).toBe(5);
    expect(calculateWaveSpeed({ method: "cycles", cycles: 20, time: 4, wavelength: 0.8 })).toEqual(
      calculateWaveSpeed({ method: "frequency", frequency: 5, wavelength: 0.8 }),
    );
    expect(frequencyFromCycles(2.5, 0.5)).toBe(5);
  });
  test("a pulse transit does not invent a frequency or wavelength", () => {
    expect(calculateWaveSpeed({ method: "transit", distance: 12, time: 3 })).toEqual({
      speed: 4, frequency: null, wavelength: null, period: null,
    });
  });
  test("scales consistently with each measurement", () => {
    expect(calculateWaveSpeed({ method: "frequency", frequency: 10, wavelength: 0.8 }).speed).toBe(8);
    expect(calculateWaveSpeed({ method: "frequency", frequency: 5, wavelength: 1.6 }).speed).toBe(8);
    expect(calculateWaveSpeed({ method: "transit", distance: 12, time: 6 }).speed).toBe(2);
  });
  for (const invalid of [0, -1, NaN, Infinity, -Infinity]) {
    test(`rejects invalid measured quantities: ${invalid}`, () => {
      expect(() => calculateWaveSpeed({ method: "frequency", frequency: invalid, wavelength: 1 })).toThrow(RangeError);
      expect(() => calculateWaveSpeed({ method: "frequency", frequency: 1, wavelength: invalid })).toThrow(RangeError);
      expect(() => calculateWaveSpeed({ method: "transit", distance: invalid, time: 1 })).toThrow(RangeError);
      expect(() => calculateWaveSpeed({ method: "transit", distance: 1, time: invalid })).toThrow(RangeError);
      expect(() => frequencyFromCycles(invalid, 1)).toThrow(RangeError);
      expect(() => frequencyFromCycles(1, invalid)).toThrow(RangeError);
    });
  }
  test("rejects overflow and underflow instead of leaking NaN or Infinity", () => {
    expect(() => calculateWaveSpeed({ method: "frequency", frequency: 1e308, wavelength: 10 })).toThrow(RangeError);
    expect(() => calculateWaveSpeed({ method: "frequency", frequency: 1e-300, wavelength: 1e-300 })).toThrow(RangeError);
    expect(() => calculateWaveSpeed({ method: "frequency", frequency: Number.MIN_VALUE, wavelength: 1 })).toThrow(RangeError);
    expect(() => calculateWaveSpeed({ method: "transit", distance: 1e308, time: 1e-308 })).toThrow(RangeError);
    expect(() => frequencyFromCycles(1e308, 1e-308)).toThrow(RangeError);
  });
});

describe("ideal flexible string", () => {
  const direct = { tension: 80, length: 2, frequency: 50, densityMode: "direct" as const, linearDensity: 0.005 };
  test("uses sqrt(T/μ) and derives wavelength, period and end-to-end time", () => {
    const result = calculateStringSpeed(direct);
    expect(result.speed).toBeCloseTo(Math.sqrt(80 / 0.005), 10);
    expect(result.wavelength).toBeCloseTo(result.speed / 50, 12);
    expect(result.period).toBe(0.02);
    expect(result.travelTime).toBeCloseTo(2 / result.speed, 12);
  });
  test("mass/length and direct linear density are equivalent", () => {
    expect(linearDensityFromMass(0.01, 2)).toBe(0.005);
    expect(calculateStringSpeed({ tension: 80, length: 2, frequency: 50, densityMode: "mass-length", mass: 0.01 }))
      .toEqual(calculateStringSpeed(direct));
  });
  test("frequency changes wavelength, not speed at fixed tension and density", () => {
    const first = calculateStringSpeed(direct);
    const doubled = calculateStringSpeed({ ...direct, frequency: 100 });
    expect(doubled.speed).toBe(first.speed);
    expect(doubled.wavelength).toBe(first.wavelength / 2);
    expect(doubled.travelTime).toBe(first.travelTime);
  });
  test("quadrupling tension doubles speed; quadrupling density halves it", () => {
    const speed = calculateStringSpeed(direct).speed;
    expect(calculateStringSpeed({ ...direct, tension: 320 }).speed).toBe(speed * 2);
    expect(calculateStringSpeed({ ...direct, linearDensity: 0.02 }).speed).toBe(speed / 2);
  });
  test("changing length alone has different meaning in the two density modes", () => {
    expect(calculateStringSpeed({ ...direct, length: 8 }).speed).toBe(calculateStringSpeed(direct).speed);
    expect(calculateStringSpeed({ tension: 80, length: 8, frequency: 50, densityMode: "mass-length", mass: 0.01 }).speed)
      .toBe(calculateStringSpeed(direct).speed * 2);
  });
  test("takes square roots before dividing for extreme but representable speeds", () => {
    const result = calculateStringSpeed({ ...direct, tension: 1e300, linearDensity: 1e-300, frequency: 1e150 });
    expect(result.speed / 1e300).toBeCloseTo(1, 12);
  });
  for (const key of ["tension", "length", "frequency", "linearDensity"] as const) {
    test(`validates string ${key}`, () => {
      for (const value of [0, -1, NaN, Infinity]) {
        expect(() => calculateStringSpeed({ ...direct, [key]: value })).toThrow(RangeError);
      }
    });
  }
  test("validates mass and derived density", () => {
    expect(() => linearDensityFromMass(0, 2)).toThrow(RangeError);
    expect(() => linearDensityFromMass(1, 0)).toThrow(RangeError);
    expect(() => linearDensityFromMass(1e308, 1e-308)).toThrow(RangeError);
    expect(() => calculateStringSpeed({ ...direct, densityMode: "mass-length", mass: 0 })).toThrow(RangeError);
  });
});

describe("longitudinal sound in matter", () => {
  test("steel bulk and thin-rod speeds use different elastic moduli", () => {
    const steel = SOLID_PRESETS[0];
    const bulk = calculateSoundSpeed({ ...steel, medium: "solid", mode: "bulk" });
    const rod = calculateSoundSpeed({ ...steel, medium: "solid", mode: "rod" });
    expect(bulk).toBeCloseTo(Math.sqrt((160e9 + 4 * 79e9 / 3) / 7850), 9);
    expect(rod).toBeCloseTo(Math.sqrt(200e9 / 7850), 9);
    expect(bulk).toBeGreaterThan(5800);
    expect(bulk).toBeLessThan(5900);
    expect(rod).toBeGreaterThan(5000);
    expect(rod).toBeLessThan(5100);
    expect(bulk).toBeGreaterThan(rod);
  });
  test("water uses its bulk modulus and volume density", () => {
    const water = calculateSoundSpeed({ ...LIQUID_PRESETS[0], medium: "liquid" });
    expect(water).toBeCloseTo(Math.sqrt(2.2e9 / 998), 9);
    expect(water).toBeGreaterThan(1480);
    expect(water).toBeLessThan(1490);
  });
  test("air uses adiabatic gamma, molar mass in kg/mol and temperature in kelvin", () => {
    const temperatureKelvin = celsiusToKelvin(20);
    expect(temperatureKelvin).toBeCloseTo(293.15, 12);
    const air = calculateSoundSpeed({ ...GAS_PRESETS[0], medium: "gas", temperatureKelvin });
    expect(air).toBeCloseTo(Math.sqrt(1.4 * GAS_CONSTANT * 293.15 / 0.02897), 10);
    expect(air).toBeGreaterThan(343);
    expect(air).toBeLessThan(344);
  });
  test("gas speed scales as sqrt(absolute temperature), not sqrt(Celsius)", () => {
    const cold = calculateSoundSpeed({ ...GAS_PRESETS[0], medium: "gas", temperatureKelvin: 100 });
    const hot = calculateSoundSpeed({ ...GAS_PRESETS[0], medium: "gas", temperatureKelvin: 400 });
    expect(hot).toBe(cold * 2);
    expect(celsiusToKelvin(0)).toBe(273.15);
    expect(celsiusToKelvin(-100)).toBeCloseTo(173.15, 12);
  });
  test("all presets produce meaningful finite speeds", () => {
    for (const preset of SOLID_PRESETS) {
      expect(calculateSoundSpeed({ ...preset, medium: "solid", mode: "bulk" })).toBeGreaterThan(4000);
      expect(calculateSoundSpeed({ ...preset, medium: "solid", mode: "rod" })).toBeGreaterThan(4000);
    }
    for (const preset of LIQUID_PRESETS) {
      expect(calculateSoundSpeed({ ...preset, medium: "liquid" })).toBeGreaterThan(1000);
    }
    for (const preset of GAS_PRESETS) {
      const speed = calculateSoundSpeed({ ...preset, medium: "gas", temperatureKelvin: 293.15 });
      expect(Number.isFinite(speed)).toBe(true);
      expect(speed).toBeGreaterThan(200);
      expect(speed).toBeLessThan(1100);
    }
  });
  const inputs: SoundSpeedInput[] = [
    { medium: "solid", mode: "bulk", bulkModulus: 160e9, shearModulus: 79e9, density: 7850 },
    { medium: "solid", mode: "rod", youngModulus: 200e9, density: 7850 },
    { medium: "liquid", bulkModulus: 2.2e9, density: 998 },
    { medium: "gas", gamma: 1.4, temperatureKelvin: 293.15, molarMass: 0.02897 },
  ];
  for (const input of inputs) {
    test(`validates every active quantity for ${input.medium}${input.medium === "solid" ? `/${input.mode}` : ""}`, () => {
      for (const [key, value] of Object.entries(input)) {
        if (typeof value !== "number") continue;
        for (const invalid of [0, -1, NaN, Infinity, -Infinity]) {
          expect(() => calculateSoundSpeed({ ...input, [key]: invalid } as SoundSpeedInput)).toThrow(RangeError);
        }
      }
    });
  }
  test("rejects absolute zero, negative Kelvin and nonphysical gamma", () => {
    for (const temperature of [-273.15, -300, NaN, Infinity]) {
      expect(() => celsiusToKelvin(temperature)).toThrow(RangeError);
    }
    for (const gamma of [0.5, 1]) {
      expect(() => calculateSoundSpeed({ ...GAS_PRESETS[0], gamma, medium: "gas", temperatureKelvin: 293.15 })).toThrow(RangeError);
    }
  });
  test("rejects unrepresentable output", () => {
    expect(() => calculateSoundSpeed({ medium: "liquid", bulkModulus: 1e308, density: Number.MIN_VALUE })).toThrow(RangeError);
    expect(() => waveAtSpeed(1e308, 1e-308)).toThrow(RangeError);
    expect(() => transitTime(1, 0)).toThrow(RangeError);
  });
});

describe("measuring-bench snapshots", () => {
  test("a crest travels one wavelength each period", () => {
    expect(sampleWaveCycle(0.25, 0)).toBe(1);
    expect(sampleWaveCycle(0.5, 0.25)).toBe(1);
    expect(sampleWaveCycle(1.25, 1)).toBe(1);
    expect(sampleWaveCycle(0.25, 1)).toBe(sampleWaveCycle(0.25, 0));
  });
  test("the pulse crest follows normalized travel distance", () => {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      expect(samplePulse(progress, progress)).toBe(1);
    }
    expect(samplePulse(1, 0)).toBeLessThan(1e-10);
    expect(samplePulse(0, 1)).toBeLessThan(1e-10);
  });
  test("all sampled traces remain finite and bounded", () => {
    for (let index = 0; index <= 100; index++) {
      for (const phase of [0, 0.25, 0.5, 1]) {
        expect(Math.abs(sampleWaveCycle(index / 50, phase))).toBeLessThanOrEqual(1);
        expect(samplePulse(index / 100, phase)).toBeGreaterThanOrEqual(0);
        expect(samplePulse(index / 100, phase)).toBeLessThanOrEqual(1);
      }
    }
  });
  test("rejects nonfinite phases and invalid progress", () => {
    expect(() => sampleWaveCycle(NaN, 0)).toThrow(RangeError);
    expect(() => sampleWaveCycle(0, Infinity)).toThrow(RangeError);
    for (const invalid of [-1, 2, NaN, Infinity]) {
      expect(() => samplePulse(0, invalid)).toThrow(RangeError);
      expect(() => samplePulse(invalid, 0)).toThrow(RangeError);
    }
  });
});
