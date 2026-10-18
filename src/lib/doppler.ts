/** Classical, collinear sound in a uniform stationary medium; observer is right of source. */
export interface DopplerParameters {
  /** Emitted frequency in Hz, strictly positive. */
  fs: number;
  /** Sound speed relative to the medium in m/s, strictly positive. */
  c: number;
  /** Source velocity in m/s; positive is rightward, toward the observer. */
  vs: number;
  /** Observer velocity in m/s; positive is rightward, away from the source. */
  vo: number;
}

export type DopplerField = keyof DopplerParameters;
export type DopplerErrors = Partial<Record<DopplerField, string>>;
export type DopplerCase =
  | 'source-toward'
  | 'source-away'
  | 'observer-toward'
  | 'observer-away'
  | 'both-moving';

export interface DopplerPreset {
  id: DopplerCase;
  label: string;
  description: string;
  parameters: Readonly<DopplerParameters>;
}

export const DOPPLER_PRESETS: readonly DopplerPreset[] = [
  {
    id: 'source-toward',
    label: 'Source toward observer',
    description: 'The source moves right (+vₛ); the observer stays still (vₒ = 0).',
    parameters: { fs: 440, c: 343, vs: 70, vo: 0 },
  },
  {
    id: 'source-away',
    label: 'Source away from observer',
    description: 'The source moves left (−vₛ); the observer stays still (vₒ = 0).',
    parameters: { fs: 440, c: 343, vs: -70, vo: 0 },
  },
  {
    id: 'observer-toward',
    label: 'Observer toward source',
    description: 'The observer moves left (−vₒ); the source stays still (vₛ = 0).',
    parameters: { fs: 440, c: 343, vs: 0, vo: -70 },
  },
  {
    id: 'observer-away',
    label: 'Observer away from source',
    description: 'The observer moves right (+vₒ); the source stays still (vₛ = 0).',
    parameters: { fs: 440, c: 343, vs: 0, vo: 70 },
  },
  {
    id: 'both-moving',
    label: 'Both moving',
    description: 'Set each signed velocity independently, including zero or equal velocities.',
    parameters: { fs: 440, c: 343, vs: 45, vo: -30 },
  },
];

export interface DopplerResult {
  emittedHz: number;
  observedHz: number;
  shiftHz: number;
  shiftPercent: number;
  frequencyRatio: number;
  /** Wavelength in metres for a stationary source, c / fs. */
  restWavelengthM: number;
  /** Observer-side (+x) crest spacing, (c - vs) / fs, in metres. */
  wavelengthAheadM: number;
  /** Opposite-side (-x) crest spacing, (c + vs) / fs, in metres. */
  wavelengthBehindM: number;
  /** Speed of right-going crests relative to the observer, in m/s. */
  encounterSpeedMps: number;
  /** Time between source emissions in seconds. */
  emissionPeriodS: number;
}

export interface DopplerWavefront {
  /** Number of emission periods before the current instant. */
  periodsAgo: number;
  ageSeconds: number;
  /** Emission position in metres relative to the source's current x = 0. */
  centerXM: number;
  /** Distance travelled at c since emission, in metres. */
  radiusM: number;
  /** Intersections with the x axis, in metres. */
  aheadXM: number;
  behindXM: number;
}

/** Field-level errors; no clamping or supersonic extension of the model. */
export function validateDoppler({ fs, c, vs, vo }: DopplerParameters): DopplerErrors {
  const errors: DopplerErrors = {};
  if (!Number.isFinite(fs) || fs <= 0) {
    errors.fs = 'Enter a finite emitted frequency greater than 0 Hz.';
  }
  if (!Number.isFinite(c) || c <= 0) {
    errors.c = 'Enter a finite sound speed greater than 0 m/s.';
  }
  for (const [field, value, name] of [
    ['vs', vs, 'source'],
    ['vo', vo, 'observer'],
  ] as const) {
    if (!Number.isFinite(value)) {
      errors[field] = `Enter a finite signed ${name} velocity in m/s.`;
    } else if (!errors.c && Math.abs(value) >= c) {
      errors[field] = `The ${name} speed must be strictly less than c (${c} m/s): |${field === 'vs' ? 'vₛ' : 'vₒ'}| < c.`;
    }
  }
  return errors;
}

/** Throws RangeError for invalid inputs or results outside finite floating-point range. */
export function calculateDoppler(parameters: DopplerParameters): DopplerResult {
  const errors = Object.values(validateDoppler(parameters));
  if (errors.length) throw new RangeError(errors.join(' '));

  const { fs, c, vs, vo } = parameters;
  const emissionSpeed = c - vs;
  const encounterSpeedMps = c - vo;
  const frequencyRatio = encounterSpeedMps / emissionSpeed;
  const observedHz = fs * frequencyRatio;
  const result: DopplerResult = {
    emittedHz: fs,
    observedHz,
    shiftHz: observedHz - fs,
    shiftPercent: (frequencyRatio - 1) * 100,
    frequencyRatio,
    restWavelengthM: c / fs,
    wavelengthAheadM: emissionSpeed / fs,
    wavelengthBehindM: (c + vs) / fs,
    encounterSpeedMps,
    emissionPeriodS: 1 / fs,
  };
  const positive = [
    emissionSpeed, result.observedHz, result.frequencyRatio,
    result.restWavelengthM, result.wavelengthAheadM, result.wavelengthBehindM,
    result.encounterSpeedMps, result.emissionPeriodS,
  ];
  if (!Object.values(result).every(Number.isFinite) || !positive.every((value) => value > 0 && Number.isFinite(value))) {
    throw new RangeError('These parameters produce results outside the finite numerical range. Use less extreme values.');
  }
  return result;
}

/**
 * Snapshot of actual past emissions, not circles centred on the moving source.
 * Each centre stays at x = -vs * age; its radius is c * age. Observer motion
 * changes interception, never the medium's wavefront geometry.
 */
export function dopplerWavefronts(parameters: DopplerParameters, count = 9): DopplerWavefront[] {
  if (!Number.isInteger(count) || count < 1 || count > 32) {
    throw new RangeError('Wavefront count must be an integer from 1 to 32.');
  }
  const result = calculateDoppler(parameters);
  return Array.from({ length: count }, (_, index) => {
    const periodsAgo = index + 1;
    const ageSeconds = periodsAgo * result.emissionPeriodS;
    const wavefront: DopplerWavefront = {
      periodsAgo,
      ageSeconds,
      centerXM: -parameters.vs * ageSeconds,
      radiusM: periodsAgo * result.restWavelengthM,
      aheadXM: periodsAgo * result.wavelengthAheadM,
      behindXM: -periodsAgo * result.wavelengthBehindM,
    };
    if (!Object.values(wavefront).every(Number.isFinite)) {
      throw new RangeError('The emission snapshot exceeds the finite numerical range. Use less extreme values.');
    }
    return wavefront;
  });
}
