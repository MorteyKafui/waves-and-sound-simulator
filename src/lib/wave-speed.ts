export type WaveSpeedTopic = "wave-speed" | "string-speed" | "sound-speed";
export type SoundMedium = "solid" | "liquid" | "gas";

export const GAS_CONSTANT = 8.31446261815324; // J/(mol·K)

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite number greater than zero.`);
  }
  return value;
}

function computed(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} is outside the supported numeric range. Use less extreme values.`);
  }
  return value;
}

/** Parse editable decimal/scientific notation without treating an empty field as zero. */
export function parseNumericInput(value: string, label: string): number {
  const text = value.trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    throw new RangeError(`Enter a number for ${label.toLowerCase()}.`);
  }
  const number = Number(text);
  if (!Number.isFinite(number)) {
    throw new RangeError(`${label} must be finite.`);
  }
  return number;
}

export function celsiusToKelvin(celsius: number): number {
  if (!Number.isFinite(celsius)) throw new RangeError("Temperature must be finite.");
  return positive(celsius + 273.15, "Absolute temperature (K)");
}

export function frequencyFromCycles(cycles: number, time: number): number {
  return computed(positive(cycles, "Cycle count") / positive(time, "Counting time"), "Frequency");
}

export function waveAtSpeed(speed: number, frequency: number) {
  positive(speed, "Wave speed");
  positive(frequency, "Frequency");
  return {
    wavelength: computed(speed / frequency, "Wavelength"),
    period: computed(1 / frequency, "Period"),
  };
}

export function transitTime(distance: number, speed: number): number {
  return computed(positive(distance, "Distance") / positive(speed, "Wave speed"), "Travel time");
}

export type WaveSpeedMeasurement =
  | { method: "frequency"; frequency: number; wavelength: number }
  | { method: "cycles"; cycles: number; time: number; wavelength: number }
  | { method: "transit"; distance: number; time: number };

export interface WaveSpeedMeasurementResult {
  speed: number;
  frequency: number | null;
  wavelength: number | null;
  period: number | null;
}

export function calculateWaveSpeed(input: WaveSpeedMeasurement): WaveSpeedMeasurementResult {
  if (input.method === "transit") {
    return {
      speed: computed(positive(input.distance, "Travel distance") / positive(input.time, "Travel time"), "Wave speed"),
      frequency: null,
      wavelength: null,
      period: null,
    };
  }
  const frequency = input.method === "cycles"
    ? frequencyFromCycles(input.cycles, input.time)
    : positive(input.frequency, "Frequency");
  const wavelength = positive(input.wavelength, "Wavelength");
  return {
    speed: computed(frequency * wavelength, "Wave speed"),
    frequency,
    wavelength,
    period: computed(1 / frequency, "Period"),
  };
}

export function linearDensityFromMass(mass: number, length: number): number {
  return computed(positive(mass, "String mass") / positive(length, "String length"), "Linear density");
}

type StringParameters = { tension: number; length: number; frequency: number };
export type StringSpeedInput = StringParameters & (
  | { densityMode: "direct"; linearDensity: number }
  | { densityMode: "mass-length"; mass: number }
);

export function calculateStringSpeed(input: StringSpeedInput) {
  positive(input.tension, "Tension");
  positive(input.length, "String length");
  const linearDensity = input.densityMode === "mass-length"
    ? linearDensityFromMass(input.mass, input.length)
    : positive(input.linearDensity, "Linear density");
  // Taking square roots first avoids overflow in T/μ when the speed is representable.
  const speed = computed(Math.sqrt(input.tension) / Math.sqrt(linearDensity), "String wave speed");
  return {
    speed,
    linearDensity,
    ...waveAtSpeed(speed, input.frequency),
    travelTime: transitTime(input.length, speed),
  };
}

export type SoundSpeedInput =
  | { medium: "solid"; mode: "bulk"; bulkModulus: number; shearModulus: number; density: number }
  | { medium: "solid"; mode: "rod"; youngModulus: number; density: number }
  | { medium: "liquid"; bulkModulus: number; density: number }
  | { medium: "gas"; gamma: number; temperatureKelvin: number; molarMass: number };

/** Longitudinal, small-signal sound speed; SI inputs throughout. */
export function calculateSoundSpeed(input: SoundSpeedInput): number {
  if (input.medium === "gas") {
    positive(input.gamma, "Heat capacity ratio");
    if (input.gamma <= 1) throw new RangeError("Heat capacity ratio γ must be greater than one.");
    positive(input.temperatureKelvin, "Absolute temperature (K)");
    positive(input.molarMass, "Molar mass (kg/mol)");
    return computed(
      Math.sqrt(input.gamma) * Math.sqrt(GAS_CONSTANT) *
      (Math.sqrt(input.temperatureKelvin) / Math.sqrt(input.molarMass)),
      "Gas sound speed",
    );
  }
  const density = positive(input.density, "Volume density");
  if (input.medium === "solid" && input.mode === "rod") {
    return computed(Math.sqrt(positive(input.youngModulus, "Young’s modulus")) / Math.sqrt(density), "Rod sound speed");
  }
  const bulkModulus = positive(input.bulkModulus, "Bulk modulus");
  if (input.medium === "solid") {
    const shearModulus = positive(input.shearModulus, "Shear modulus");
    return computed(
      Math.hypot(Math.sqrt(bulkModulus), Math.sqrt(shearModulus) * Math.sqrt(4 / 3)) / Math.sqrt(density),
      "Bulk longitudinal sound speed",
    );
  }
  return computed(Math.sqrt(bulkModulus) / Math.sqrt(density), "Liquid sound speed");
}

/** Unit-amplitude travelling wave: position in wavelengths, time in periods. */
export function sampleWaveCycle(position: number, elapsedCycles: number): number {
  if (!Number.isFinite(position) || !Number.isFinite(elapsedCycles)) {
    throw new RangeError("Wave position and phase must be finite.");
  }
  return Math.sin(2 * Math.PI * ((position % 1) - (elapsedCycles % 1)));
}

/** An illustrative pulse; the crest advances from sensor A to B as progress goes 0 → 1. */
export function samplePulse(position: number, progress: number): number {
  if (!Number.isFinite(position) || !Number.isFinite(progress) ||
      position < 0 || position > 1 || progress < 0 || progress > 1) {
    throw new RangeError("Pulse position and progress must be between zero and one.");
  }
  return Math.exp(-0.5 * ((position - progress) / 0.065) ** 2);
}

// Representative room-temperature values, not precision material specifications.
export const SOLID_PRESETS = [
  { id: "steel", name: "Steel", density: 7850, bulkModulus: 160e9, shearModulus: 79e9, youngModulus: 200e9 },
  { id: "aluminium", name: "Aluminium", density: 2700, bulkModulus: 76e9, shearModulus: 26e9, youngModulus: 69e9 },
] as const;

export const LIQUID_PRESETS = [
  { id: "water", name: "Water", density: 998, bulkModulus: 2.2e9 },
  { id: "ethanol", name: "Ethanol", density: 789, bulkModulus: 1.06e9 },
] as const;

export const GAS_PRESETS = [
  { id: "air", name: "Dry air", gamma: 1.4, molarMass: 0.02897 },
  { id: "helium", name: "Helium", gamma: 5 / 3, molarMass: 0.0040026 },
  { id: "carbon-dioxide", name: "Carbon dioxide", gamma: 1.29, molarMass: 0.04401 },
] as const;
