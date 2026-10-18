/** Linear, inviscid capillary–gravity water waves. No rendering or runtime dependencies. */

export type Experiment = 'reflection' | 'refraction' | 'diffraction' | 'interference';

export interface WaveParameters {
  /** Hz; strictly positive. */
  frequency: number;
  /** Surface elevation amplitude in mm; nonnegative. Per incident wave/source. */
  amplitude: number;
  /** Incident water depth in mm; strictly positive. */
  depth: number;
  /** Transmitted water depth in mm; strictly positive. */
  secondDepth: number;
  /** Incidence from the +x interface normal, in degrees, between -90 and 90. */
  angle: number;
  /** Full aperture width in mm; strictly positive. */
  slitWidth: number;
  /** Distance between the two source centers in mm; strictly positive. */
  separation: number;
  /** Phase of the y = +separation/2 source relative to the other, in degrees. */
  phase: number;
}

export interface DispersionResult {
  /** Rad/m. */
  k: number;
  /** Rad/s. */
  omega: number;
  /** mm. */
  wavelength: number;
  /** m/s. */
  phaseSpeed: number;
  /** d(omega)/dk, in m/s. */
  groupSpeed: number;
  /** Dimensionless relative depth. */
  kh: number;
}

export interface DerivedWave extends DispersionResult {
  /** mm. */
  secondWavelength: number;
  /** Transmitted phase speed, m/s. */
  secondSpeed: number;
  /** Degrees from the normal; null for total internal reflection. */
  refractedAngle: number | null;
  /** Degrees; null unless the second medium has the greater phase speed. */
  criticalAngle: number | null;
  /** Normal-incidence Fraunhofer first-minimum angle, degrees, or null. */
  firstMinimum: number | null;
  /** Slit width / incident wavelength. */
  slitRatio: number;
  /** Paraxial fringe spacing in mm on a screen 300 mm from the sources. */
  fringeSpacing: number;
  phaseRadians: number;
}

/** Dimensionless, amplitude-independent complex surface-elevation transfer. */
export interface Phasor {
  real: number;
  imag: number;
}

export interface WaveSampler {
  readonly omega: number;
  /** The captured amplitude in mm; it is NOT included in samplePhasor. */
  readonly amplitude: number;
  samplePhasor(xMm: number, yMm: number): Phasor;
  height(xMm: number, yMm: number, timeSeconds: number): number;
}

const GRAVITY = 9.81;
const DENSITY = 998;
const SURFACE_TENSION = 0.0728;
const CAPILLARITY = SURFACE_TENSION / DENSITY;
const TWO_PI = 2 * Math.PI;
const TO_RADIANS = Math.PI / 180;
const TO_DEGREES = 180 / Math.PI;
const REFLECTION_WALL_MM = 100;
const APERTURE_X_MM = -40;
const SOURCE_X_MM = -100;
const APERTURE_INTERVALS = 20;
const SNELL_ROUNDOFF = 32 * Number.EPSILON;

const BASE_PARAMETERS: WaveParameters = {
  frequency: 8,
  amplitude: 0.5,
  depth: 10,
  secondDepth: 4,
  angle: 30,
  slitWidth: 20,
  separation: 50,
  phase: 0,
};

export const DEFAULT_PARAMETERS: Record<Experiment, WaveParameters> = {
  reflection: { ...BASE_PARAMETERS },
  refraction: { ...BASE_PARAMETERS },
  diffraction: { ...BASE_PARAMETERS, angle: 0 },
  interference: { ...BASE_PARAMETERS, angle: 0 },
};

export const MODEL_NOTES: string[] = [
  'Units: frequency Hz; amplitude, depths, wavelengths, coordinates, slit width and separation mm; angles and source phase degrees; time s; k rad/m; speeds m/s. Incidence is measured from +x, the interface normal.',
  'Water has g = 9.81 m/s², density 998 kg/m³ and surface tension 0.0728 N/m. Dispersion solves omega² = (g k + (sigma/rho) k³) tanh(k h); group speed is its analytic derivative d(omega)/dk.',
  'Linear, inviscid, irrotational, constant-surface-tension waves over a rigid flat bottom in each region. Quantitative validity requires small steepness k a and small a/h. There is no viscosity, breaking, current, nonlinear interaction or contact-line physics.',
  'Fields are monochromatic steady states, not pulses or causal startup transients. The displayed tank may span x = -200…200 mm and y = -150…150 mm; no outer-tank walls or coordinate clipping are imposed except the specified barriers.',
  'samplePhasor returns dimensionless H, independent of amplitude and time. Height in mm is amplitude * Re(H exp(-i omega t)). createWaveSampler snapshots parameters and precomputes dispersion and aperture sources for spatial/time caching.',
  'Reflection uses equal-amplitude incident and reflected plane waves at a rigid wall x = 100 mm. Their normal derivatives cancel exactly on the water side; x > 100 is excluded and returns zero. Antinodes can reach twice the incident amplitude.',
  'Refraction at x = 0 preserves frequency and tangential wavenumber. A single vertical mode on each side matches surface elevation and normal depth-integrated volume flux, Qx = omega kx/k² times elevation. It omits depth-step evanescent modes and capillary junction stresses, so it is not exact finite-depth step scattering and does not generally conserve the full capillary–gravity energy flux. The shallow-water limit recovers standard step matching.',
  'Total internal reflection uses complex normal wavenumber +i alpha in x >= 0, a decaying transmitted field and unit-modulus reflection. There is no propagating transmitted ray; the critical and refracted angles use phase speed, not group speed.',
  'Interference sums two coherent cylindrical radiators at (-100, -separation/2) and (-100, +separation/2) mm. Each has amplitude a at its regularized core; phase applies only to the second source. The outgoing kernel exp(i k (r_eff - core)) sqrt(core/r_eff), r_eff = sqrt(r² + core²), core = 1/k, models cylindrical spreading but is not an exact near-source Hankel solution. Constructive sums can reach 2a.',
  'Diffraction uses an incident plane wave for x < -40 mm and a centered gap at x = -40 mm. Beyond it, 21 coherent cylindrical aperture samples, including the incident phase ramp, are integrated with composite Simpson weights and divided by their total weight. The same finite core regularizes every sample; normalization is fixed, not adjusted per observation point. This is a one-way normalized Huygens model, not an energy-calibrated slit transmission or an exact screen boundary-value solution; incident-side reflection and aperture-edge fields are omitted. At the screen itself the gap is prescribed the incident elevation and the opaque part is zero, so the regularized outgoing approximation need not be continuous there. Very large slit/wavelength ratios or steep phase ramps need finer quadrature.',
  'firstMinimum = asin(wavelength/slitWidth) is only a normal-incidence, far-field aperture estimate (null for slitWidth < wavelength); the actual diffraction field is a spatial Huygens integral, not a pasted sinc. Fringe spacing wavelength * 300/separation assumes a paraxial far-field screen 300 mm from the sources.',
  'Finite inputs are required, with positive frequency, depths, slit width and separation, nonnegative amplitude and incidence in [-90, 90] degrees. Invalid or unrepresentable dispersion inputs throw RangeError rather than silently changing the physics.',
];

function requireFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
}

function requirePositive(name: string, value: number): void {
  requireFinite(name, value);
  if (value <= 0) {
    throw new RangeError(`${name} must be greater than zero`);
  }
}

function validateParameters(parameters: WaveParameters): void {
  requirePositive('frequency', parameters.frequency);
  requirePositive('depth', parameters.depth);
  requirePositive('secondDepth', parameters.secondDepth);
  requirePositive('slitWidth', parameters.slitWidth);
  requirePositive('separation', parameters.separation);
  requireFinite('amplitude', parameters.amplitude);
  requireFinite('angle', parameters.angle);
  requireFinite('phase', parameters.phase);
  if (parameters.amplitude < 0) {
    throw new RangeError('amplitude must be nonnegative');
  }
  if (Math.abs(parameters.angle) > 90) {
    throw new RangeError('angle must be between -90 and 90 degrees');
  }
}

/** Solve the unique positive capillary–gravity wavenumber using a monotone bracket. */
export function dispersion(frequency: number, depthMm: number): DispersionResult {
  requirePositive('frequency', frequency);
  requirePositive('depthMm', depthMm);

  const h = depthMm / 1000;
  const omega = TWO_PI * frequency;
  const target = omega * omega;
  if (h === 0 || !Number.isFinite(target) || target === 0) {
    throw new RangeError('frequency or depth is outside the representable dispersion range');
  }

  const omegaSquared = (k: number): number =>
    k * (GRAVITY + CAPILLARITY * k * k) * Math.tanh(k * h);

  // The gravity shallow-water and gravity/capillary deep-water scales seed
  // the bracket only: no asymptotic approximation is used for the final root.
  let upper = Math.max(
    omega / Math.sqrt(GRAVITY * h),
    Math.min(target / GRAVITY, Math.cbrt(target / CAPILLARITY)),
  );
  if (!Number.isFinite(upper) || upper <= 0) {
    throw new RangeError('frequency or depth is outside the representable dispersion range');
  }
  while (omegaSquared(upper) < target) {
    upper *= 2;
    if (!Number.isFinite(upper)) {
      throw new RangeError('could not bracket the dispersion wavenumber');
    }
  }

  let lower = 0;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = lower + (upper - lower) / 2;
    if (middle === lower || middle === upper) break;
    if (omegaSquared(middle) < target) lower = middle;
    else upper = middle;
  }

  const k = lower + (upper - lower) / 2;
  const kh = k * h;
  const tanh = Math.tanh(kh);
  // Exponential form avoids both sinh overflow in deep water and cancellation
  // in 1 - tanh(kh)^2 when evaluating the group velocity.
  const exponential = Math.exp(-2 * kh);
  const sechSquared = (4 * exponential) / ((1 + exponential) * (1 + exponential));
  const phaseSpeed = omega / k;
  const capillaryTerm = CAPILLARITY * k * k;
  const groupSpeed = (phaseSpeed / 2) * (
    (GRAVITY + 3 * capillaryTerm) / (GRAVITY + capillaryTerm)
    + (kh * sechSquared) / tanh
  );
  const wavelength = (TWO_PI / k) * 1000;

  if (![k, kh, wavelength, phaseSpeed, groupSpeed].every(Number.isFinite) || k <= 0) {
    throw new RangeError('frequency or depth is outside the representable dispersion range');
  }
  return { k, omega, wavelength, phaseSpeed, groupSpeed, kh };
}

function snellSine(incidentSine: number, speedRatio: number): number {
  const sine = incidentSine * speedRatio;
  // asin is ill-conditioned at ±1: snap roundoff on either side of critical
  // incidence, without clamping genuinely supercritical (evanescent) waves.
  return Math.abs(Math.abs(sine) - 1) <= SNELL_ROUNDOFF ? Math.sign(sine) : sine;
}

export function deriveWave(parameters: WaveParameters): DerivedWave {
  validateParameters(parameters);
  const first = dispersion(parameters.frequency, parameters.depth);
  const second = dispersion(parameters.frequency, parameters.secondDepth);
  const sine = snellSine(
    Math.sin(parameters.angle * TO_RADIANS),
    second.phaseSpeed / first.phaseSpeed,
  );

  return {
    ...first,
    secondWavelength: second.wavelength,
    secondSpeed: second.phaseSpeed,
    refractedAngle: second.phaseSpeed === first.phaseSpeed
      ? parameters.angle
      : Math.abs(sine) > 1 ? null : Math.asin(sine) * TO_DEGREES,
    criticalAngle: second.phaseSpeed > first.phaseSpeed
      ? Math.asin(first.phaseSpeed / second.phaseSpeed) * TO_DEGREES
      : null,
    firstMinimum: first.wavelength <= parameters.slitWidth
      ? Math.asin(first.wavelength / parameters.slitWidth) * TO_DEGREES
      : null,
    slitRatio: parameters.slitWidth / first.wavelength,
    fringeSpacing: (first.wavelength * 300) / parameters.separation,
    phaseRadians: parameters.phase * TO_RADIANS,
  };
}

function polar(phase: number, magnitude = 1): Phasor {
  return { real: magnitude * Math.cos(phase), imag: magnitude * Math.sin(phase) };
}

function multiply(a: Phasor, b: Phasor): Phasor {
  return {
    real: a.real * b.real - a.imag * b.imag,
    imag: a.real * b.imag + a.imag * b.real,
  };
}

function add(a: Phasor, b: Phasor): Phasor {
  return { real: a.real + b.real, imag: a.imag + b.imag };
}

/** Coordinates, kMm and coreMm all use mm in the spatial kernels. */
function cylindrical(dx: number, dy: number, kMm: number, coreMm: number): Phasor {
  const distance = Math.hypot(dx, dy, coreMm);
  return polar(kMm * (distance - coreMm), Math.sqrt(coreMm / distance));
}

function refractionField(
  wave: DerivedWave,
  incidentSine: number,
  incidentCosine: number,
): (xMm: number, yMm: number) => Phasor {
  const k1 = wave.k;
  const kx1Mm = (k1 * incidentCosine) / 1000;
  const kyMm = (k1 * incidentSine) / 1000;
  // Preserve exact transparency even arbitrarily close to grazing, where
  // recovering the normal wavenumber from 1 - sin²(theta) loses precision.
  if (wave.secondSpeed === wave.phaseSpeed) {
    return (xMm, yMm) => polar(kx1Mm * xMm + kyMm * yMm);
  }
  const k2 = TWO_PI * 1000 / wave.secondWavelength;
  const sine2 = snellSine(incidentSine, wave.secondSpeed / wave.phaseSpeed);
  const y1 = wave.phaseSpeed * incidentCosine;
  let reflected: Phasor;
  let transmitted: Phasor;
  let kx2Mm = 0;
  let attenuationMm = 0;

  if (Math.abs(sine2) <= 1) {
    const cosine2 = Math.sqrt(Math.max(0, 1 - sine2 * sine2));
    const y2 = wave.secondSpeed * cosine2;
    const denominator = y1 + y2;
    // Select a finite limit for the zero-normal-flux grazing degeneracy.
    const r = denominator === 0 ? 0 : (y1 - y2) / denominator;
    reflected = { real: r, imag: 0 };
    transmitted = { real: 1 + r, imag: 0 };
    kx2Mm = (k2 * cosine2) / 1000;
  } else {
    const imaginaryCosine2 = Math.sqrt(sine2 * sine2 - 1);
    const imaginaryY2 = wave.secondSpeed * imaginaryCosine2;
    const denominator = y1 * y1 + imaginaryY2 * imaginaryY2;
    reflected = {
      real: (y1 * y1 - imaginaryY2 * imaginaryY2) / denominator,
      imag: (-2 * y1 * imaginaryY2) / denominator,
    };
    transmitted = { real: 1 + reflected.real, imag: reflected.imag };
    attenuationMm = (k2 * imaginaryCosine2) / 1000;
  }

  return (xMm, yMm) => {
    const tangentialPhase = kyMm * yMm;
    if (xMm < 0) {
      return add(
        polar(kx1Mm * xMm + tangentialPhase),
        multiply(reflected, polar(-kx1Mm * xMm + tangentialPhase)),
      );
    }
    return multiply(
      transmitted,
      polar(kx2Mm * xMm + tangentialPhase, Math.exp(-attenuationMm * xMm)),
    );
  };
}

/**
 * Prepare once per parameter change. Cache samplePhasor over canvas pixels, then
 * animate with a * (H.real * cos(omega*t) + H.imag * sin(omega*t)).
 * All input parameters are captured; later mutation of the input has no effect.
 */
export function createWaveSampler(
  experiment: Experiment,
  parameters: WaveParameters,
): WaveSampler {
  const wave = deriveWave(parameters);
  const { amplitude, frequency, slitWidth, separation, angle } = parameters;
  const kMm = wave.k / 1000;
  const coreMm = 1 / kMm;
  const incidentSine = Math.sin(angle * TO_RADIANS);
  const incidentCosine = Math.abs(angle) === 90 ? 0 : Math.cos(angle * TO_RADIANS);
  const kxMm = kMm * incidentCosine;
  const kyMm = kMm * incidentSine;
  const incident = (xMm: number, yMm: number): Phasor => polar(kxMm * xMm + kyMm * yMm);
  let field: (xMm: number, yMm: number) => Phasor;

  switch (experiment) {
    case 'reflection':
      field = (xMm, yMm) => xMm > REFLECTION_WALL_MM
        ? { real: 0, imag: 0 }
        : polar(
          kxMm * REFLECTION_WALL_MM + kyMm * yMm,
          2 * Math.cos(kxMm * (xMm - REFLECTION_WALL_MM)),
        );
      break;
    case 'refraction':
      field = refractionField(wave, incidentSine, incidentCosine);
      break;
    case 'interference': {
      const sourcePhase = polar(wave.phaseRadians);
      field = (xMm, yMm) => add(
        cylindrical(xMm - SOURCE_X_MM, yMm + separation / 2, kMm, coreMm),
        multiply(
          sourcePhase,
          cylindrical(xMm - SOURCE_X_MM, yMm - separation / 2, kMm, coreMm),
        ),
      );
      break;
    }
    case 'diffraction': {
      const aperture = Array.from({ length: APERTURE_INTERVALS + 1 }, (_, index) => {
        const y = slitWidth * (index / APERTURE_INTERVALS - 0.5);
        const weight = index === 0 || index === APERTURE_INTERVALS ? 1 : index % 2 === 0 ? 2 : 4;
        return { y, excitation: incident(APERTURE_X_MM, y), weight };
      });
      // Simpson's common dy/3 factor cancels against the aperture normalization.
      const totalWeight = 3 * APERTURE_INTERVALS;
      field = (xMm, yMm) => {
        if (xMm < APERTURE_X_MM) return incident(xMm, yMm);
        if (xMm === APERTURE_X_MM) {
          return Math.abs(yMm) <= slitWidth / 2 ? incident(xMm, yMm) : { real: 0, imag: 0 };
        }
        let real = 0;
        let imag = 0;
        for (const sample of aperture) {
          const contribution = multiply(
            sample.excitation,
            cylindrical(xMm - APERTURE_X_MM, yMm - sample.y, kMm, coreMm),
          );
          real += sample.weight * contribution.real;
          imag += sample.weight * contribution.imag;
        }
        return { real: real / totalWeight, imag: imag / totalWeight };
      };
      break;
    }
    default:
      throw new RangeError(`Unknown experiment: ${String(experiment)}`);
  }

  const sample = (xMm: number, yMm: number): Phasor => {
    requireFinite('xMm', xMm);
    requireFinite('yMm', yMm);
    return field(xMm, yMm);
  };

  return {
    omega: wave.omega,
    amplitude,
    samplePhasor: sample,
    height(xMm, yMm, timeSeconds) {
      requireFinite('timeSeconds', timeSeconds);
      const phasor = sample(xMm, yMm);
      // Reduce time before multiplication to keep even long-running clocks finite.
      const temporalPhase = wave.omega * (timeSeconds % (1 / frequency));
      return amplitude * (
        phasor.real * Math.cos(temporalPhase) + phasor.imag * Math.sin(temporalPhase)
      );
    },
  };
}

/** Dimensionless H; physical elevation is amplitude * Re(H exp(-i omega t)). */
export function samplePhasor(
  experiment: Experiment,
  parameters: WaveParameters,
  xMm: number,
  yMm: number,
): Phasor {
  return createWaveSampler(experiment, parameters).samplePhasor(xMm, yMm);
}

/** Surface elevation in mm. For a grid or animation, reuse createWaveSampler instead. */
export function waveHeight(
  experiment: Experiment,
  parameters: WaveParameters,
  xMm: number,
  yMm: number,
  timeSeconds: number,
): number {
  return createWaveSampler(experiment, parameters).height(xMm, yMm, timeSeconds);
}
