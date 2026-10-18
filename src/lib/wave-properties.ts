export const WAVE_PROPERTY_LIMITS = {
  amplitude: { label: "Amplitude", symbol: "A", unit: "m", min: 0, max: 2, step: 0.01 },
  frequency: { label: "Frequency", symbol: "f", unit: "Hz", min: 0.1, max: 4, step: 0.01 },
  period: { label: "Period", symbol: "T", unit: "s", min: 0.25, max: 10, step: 0.01 },
  wavelength: { label: "Wavelength", symbol: "λ", unit: "m", min: 0.5, max: 4, step: 0.01 },
} as const;

export type WaveProperty = keyof typeof WAVE_PROPERTY_LIMITS;
export type WaveTimingProperty = "frequency" | "period";
export type WavePropertiesDraft = Record<WaveProperty, string> & { timingSource: WaveTimingProperty };
export type WavePropertyErrors = Partial<Record<WaveProperty, string>>;

export const DEFAULT_WAVE_PROPERTIES: Readonly<WavePropertiesDraft> = {
  amplitude: "1", frequency: "0.5", period: "2", wavelength: "4", timingSource: "frequency",
};

export interface WaveProperties {
  amplitude: number;
  frequency: number;
  wavelength: number;
  period: number;
  speed: number;
  maximumDisplacement: number;
  crestDisplacement: number;
  troughDisplacement: number;
  peakToPeak: number;
}

export const WAVE_PROPERTY_WINDOW = {
  xMin: 0, xMax: 10, yMin: -2.5, yMax: 2.5,
  left: 38, right: 16, top: 18, bottom: 34, height: 300,
} as const;
export const WAVE_PROBE_POSITION = 2;
export const WAVE_MAX_FRAME_DELTA = 1 / 30;

function boundedProperty(value: number, property: WaveProperty): number {
  const { label, min, max, unit } = WAVE_PROPERTY_LIMITS[property];
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} must be a finite number from ${min} to ${max} ${unit}.`);
  }
  return value === 0 ? 0 : value;
}

/** Keep incomplete edits distinct from a genuine zero-amplitude wave. */
export function parseWaveProperty(text: string, property: WaveProperty): number {
  const value = text.trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
    const { label, unit } = WAVE_PROPERTY_LIMITS[property];
    throw new RangeError(`Enter a finite number for ${label.toLowerCase()} (${unit}).`);
  }
  return boundedProperty(Number(value), property);
}

/** Only the timing field being edited is authoritative; its reciprocal is never rounded. */
export function updateWaveProperty(draft: WavePropertiesDraft, property: WaveProperty, text: string): WavePropertiesDraft {
  const next = { ...draft, [property]: text };
  if (property === "frequency" || property === "period") {
    next.timingSource = property;
    const linked = property === "frequency" ? "period" : "frequency";
    try { next[linked] = String(1 / parseWaveProperty(text, property)); }
    catch { next[linked] = ""; }
  }
  return next;
}

export function calculateWaveProperties(input: { amplitude: number; frequency: number; wavelength: number }): WaveProperties {
  const amplitude = boundedProperty(input.amplitude, "amplitude");
  const frequency = boundedProperty(input.frequency, "frequency");
  const wavelength = boundedProperty(input.wavelength, "wavelength");
  return {
    amplitude, frequency, wavelength,
    period: 1 / frequency,
    speed: frequency * wavelength,
    maximumDisplacement: amplitude,
    crestDisplacement: amplitude,
    troughDisplacement: amplitude === 0 ? 0 : -amplitude,
    peakToPeak: 2 * amplitude,
  };
}

export function resolveWaveProperties(draft: WavePropertiesDraft): {
  model: WaveProperties | null; errors: WavePropertyErrors;
} {
  const errors: WavePropertyErrors = {};
  const values: Partial<Record<WaveProperty, number>> = {};
  for (const property of ["amplitude", draft.timingSource, "wavelength"] as const) {
    try { values[property] = parseWaveProperty(draft[property], property); }
    catch (error) { errors[property] = (error as Error).message; }
  }
  if (Object.keys(errors).length) return { model: null, errors };
  const frequency = draft.timingSource === "frequency" ? values.frequency! : 1 / values.period!;
  return {
    model: calculateWaveProperties({ amplitude: values.amplitude!, frequency, wavelength: values.wavelength! }),
    errors,
  };
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return value;
}

function elapsedTime(time: number): number {
  if (finite(time, "Elapsed time") < 0) throw new RangeError("Elapsed time cannot be negative.");
  return time;
}

function phaseAt(model: WaveProperties, time: number): number {
  return (elapsedTime(time) % model.period) / model.period;
}

/** y(x,t) = A sin(2π(x/λ − ft)); reduce cycles before sin for long-running clocks. */
export function wavePropertyDisplacement(model: WaveProperties, position: number, time: number): number {
  finite(position, "Position");
  const spatialPhase = (position % model.wavelength) / model.wavelength;
  return model.amplitude * Math.sin(2 * Math.PI * (spatialPhase - phaseAt(model, time)));
}

/** Capping applies only to wall-clock animation, never to an intentional quarter-period step. */
export function advanceWaveTime(time: number, delta: number): number {
  elapsedTime(time);
  if (finite(delta, "Frame delta") < 0) throw new RangeError("Frame delta cannot be negative.");
  return finite(time + Math.min(delta, WAVE_MAX_FRAME_DELTA), "Elapsed time");
}

export function quarterPeriodWaveTime(model: WaveProperties, time: number): number {
  return finite(elapsedTime(time) + model.period / 4, "Elapsed time");
}

export function wavePropertyExtrema(model: WaveProperties, time: number) {
  if (model.amplitude === 0) {
    elapsedTime(time);
    return null;
  }
  const fraction = (0.25 + phaseAt(model, time)) % 1;
  const crest = fraction * model.wavelength;
  return { crest, nextCrest: crest + model.wavelength, trough: crest + model.wavelength / 2 };
}

export function wavePlotCoordinates(width: number) {
  finite(width, "Plot width");
  const window = WAVE_PROPERTY_WINDOW;
  if (width <= window.left + window.right) throw new RangeError("Plot width is too small.");
  const plotWidth = width - window.left - window.right;
  const plotHeight = window.height - window.top - window.bottom;
  return {
    x: (position: number) => window.left + (position - window.xMin) / (window.xMax - window.xMin) * plotWidth,
    y: (displacement: number) => window.top + (window.yMax - displacement) / (window.yMax - window.yMin) * plotHeight,
    plotWidth, plotHeight,
  };
}

/** Pixel geometry uses one fixed physical window, not an amplitude/wavelength-dependent scale. */
export function createWavePropertyFrame(model: WaveProperties, time: number, width: number) {
  const phase = phaseAt(model, time);
  const { x, y } = wavePlotCoordinates(width);
  const { xMin, xMax } = WAVE_PROPERTY_WINDOW;
  const samples = 640;
  const points: string[] = [];
  for (let index = 0; index <= samples; index++) {
    const position = xMin + (xMax - xMin) * index / samples;
    const displacement = model.amplitude * Math.sin(2 * Math.PI * (position / model.wavelength - phase));
    points.push(`${index === 0 ? "M" : "L"}${x(position).toFixed(2)},${y(displacement).toFixed(2)}`);
  }
  const extrema = wavePropertyExtrema(model, time);
  const crest = extrema ? { x: x(extrema.crest), y: y(model.amplitude) } : null;
  const nextCrest = extrema ? { x: x(extrema.nextCrest), y: y(model.amplitude) } : null;
  const trough = extrema ? { x: x(extrema.trough), y: y(-model.amplitude) } : null;
  const bracketY = y(2.3);
  return {
    trace: points.join(" "), crest, nextCrest, trough,
    probe: { x: x(WAVE_PROBE_POSITION), y: y(wavePropertyDisplacement(model, WAVE_PROBE_POSITION, time)) },
    probeDisplacement: wavePropertyDisplacement(model, WAVE_PROBE_POSITION, time),
    amplitudeMeasure: crest
      ? `M${crest.x - 4},${y(0)}h8 M${crest.x},${y(0)}V${crest.y} M${crest.x - 4},${crest.y}h8`
      : "",
    wavelengthMeasure: crest && nextCrest
      ? `M${crest.x},${crest.y}V${bracketY} M${nextCrest.x},${nextCrest.y}V${bracketY} M${crest.x},${bracketY + 4}v-8 M${crest.x},${bracketY}H${nextCrest.x} M${nextCrest.x},${bracketY + 4}v-8`
      : "",
  };
}

export function formatWaveProperty(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return "—";
  return String(Number(value.toFixed(digits)));
}
