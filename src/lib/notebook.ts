import { createWaveSampler, deriveWave, type Experiment, type WaveParameters } from './wave-physics';

export interface Observation {
  id: string;
  createdAt: string;
  experiment: Experiment;
  parameters: WaveParameters;
  probe: { x: number; y: number };
  time: number;
  elevation: number;
  note: string;
}

export const NOTEBOOK_KEY = 'wavelab-notebook-v1';

const MAX_RECORDS = 100;
const MAX_ID_LENGTH = 128;
const MAX_NOTE_LENGTH = 4096;
// Accommodates 100 maximum-length notes even when JSON escapes every character.
const MAX_RAW_LENGTH = 3_000_000;
const CSV_HEADER = 'id,created_at,experiment,frequency_hz,amplitude_mm,depth_mm,second_depth_mm,angle_deg,slit_width_mm,separation_mm,phase_deg,probe_x_mm,probe_y_mm,time_s,elevation_mm,note';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isExperiment(value: unknown): value is Experiment {
  return value === 'reflection' || value === 'refraction'
    || value === 'diffraction' || value === 'interference';
}

function readParameters(value: unknown): WaveParameters | null {
  if (!isObject(value)) return null;
  const { frequency, amplitude, depth, secondDepth, angle, slitWidth, separation, phase } = value;
  if (!isFiniteNumber(frequency) || !isFiniteNumber(amplitude)
    || !isFiniteNumber(depth) || !isFiniteNumber(secondDepth)
    || !isFiniteNumber(angle) || !isFiniteNumber(slitWidth)
    || !isFiniteNumber(separation) || !isFiniteNumber(phase)) return null;

  const parameters = { frequency, amplitude, depth, secondDepth, angle, slitWidth, separation, phase };
  try {
    // Reuse the physics domain rules, including unrepresentable dispersion inputs.
    const wave = deriveWave(parameters);
    return Object.values(wave).every((entry) => entry === null || isFiniteNumber(entry))
      ? parameters : null;
  } catch {
    return null;
  }
}

function readProbe(value: unknown): Observation['probe'] | null {
  if (!isObject(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return null;
  return { x: value.x, y: value.y };
}

function isTime(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isNote(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_NOTE_LENGTH;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || (value.length !== 24 && value.length !== 27)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function sampleElevation(
  experiment: Experiment,
  parameters: WaveParameters,
  probe: Observation['probe'],
  time: number,
): number {
  const elevation = createWaveSampler(experiment, parameters).height(probe.x, probe.y, time);
  if (!Number.isFinite(elevation)) throw new RangeError('Observation elevation must be finite');
  return elevation;
}

/** Snapshot physical mm/s inputs. Time is nonnegative; notes may contain at most 4096 UTF-16 units. */
export function createObservation(
  experiment: Experiment,
  parameters: WaveParameters,
  probe: Observation['probe'],
  time: number,
  note = '',
): Observation {
  const parameterSnapshot = readParameters(parameters);
  const probeSnapshot = readProbe(probe);
  if (!isExperiment(experiment)) throw new RangeError('Unknown observation experiment');
  if (!parameterSnapshot) throw new RangeError('Invalid observation parameters');
  if (!probeSnapshot) throw new RangeError('Observation probe coordinates must be finite');
  if (!isTime(time)) throw new RangeError('Observation time must be finite and nonnegative');
  if (!isNote(note)) throw new RangeError('Observation note must be a string of at most 4096 UTF-16 units');

  const elevation = sampleElevation(experiment, parameterSnapshot, probeSnapshot, time);
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    experiment,
    parameters: parameterSnapshot,
    probe: probeSnapshot,
    time,
    elevation,
    note,
  };
}

function readObservation(value: unknown): Observation | null {
  if (!isObject(value) || typeof value.id !== 'string'
    || value.id.trim().length === 0 || value.id.length > MAX_ID_LENGTH
    || !isIsoDate(value.createdAt) || !isExperiment(value.experiment)
    || !isTime(value.time) || !isFiniteNumber(value.elevation) || !isNote(value.note)) return null;

  const parameters = readParameters(value.parameters);
  const probe = readProbe(value.probe);
  if (!parameters || !probe) return null;
  try {
    // Finite coordinates can still overflow a field calculation. Reject unsafe restores,
    // but preserve the stored measurement rather than silently replacing it.
    sampleElevation(value.experiment, parameters, probe, value.time);
  } catch {
    return null;
  }

  // Copy only schema fields: never retain untrusted extra keys or nested objects.
  return {
    id: value.id,
    createdAt: value.createdAt,
    experiment: value.experiment,
    parameters,
    probe,
    time: value.time,
    elevation: value.elevation,
    note: value.note,
  };
}

/** Read a JSON array, skipping invalid records and retaining the first 100 valid entries. */
export function parseObservations(raw: string | null): Observation[] {
  if (typeof raw !== 'string' || raw.length > MAX_RAW_LENGTH) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const observations: Observation[] = [];
  for (const candidate of parsed) {
    const observation = readObservation(candidate);
    if (observation) observations.push(observation);
    if (observations.length === MAX_RECORDS) break;
  }
  return observations;
}

function csvCell(value: string | number): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError('CSV numeric fields must be finite');
    return String(value);
  }

  let text = value;
  // Spreadsheet importers can ignore whitespace before formula markers. Leading
  // controls and full-width markers are unsafe in some importers/locales, too.
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || (code >= 127 && code <= 159) || '=+-@＝＋－＠'.includes(character)) {
      text = `'${value}`;
      break;
    }
    if (character.trim() !== '') break;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 quoting and CRLF rows; only text cells receive formula-injection prefixes. */
export function observationsToCsv(records: Observation[]): string {
  const rows = records.map((record) => {
    const p = record.parameters;
    return [
      record.id, record.createdAt, record.experiment,
      p.frequency, p.amplitude, p.depth, p.secondDepth, p.angle,
      p.slitWidth, p.separation, p.phase,
      record.probe.x, record.probe.y, record.time, record.elevation, record.note,
    ].map(csvCell).join(',');
  });
  return [CSV_HEADER, ...rows].join('\r\n');
}
