import { describe, expect, test } from 'bun:test';
import {
  createWaveSampler,
  DEFAULT_PARAMETERS,
  deriveWave,
  dispersion,
  MODEL_NOTES,
  samplePhasor,
  waveHeight,
  type Experiment,
  type Phasor,
  type WaveParameters,
} from './wave-physics';

const EXPERIMENTS: Experiment[] = ['reflection', 'refraction', 'diffraction', 'interference'];
const G = 9.81;
const TAU = 0.0728 / 998;
const RADIANS = Math.PI / 180;

function parameters(overrides: Partial<WaveParameters> = {}): WaveParameters {
  return { ...DEFAULT_PARAMETERS.refraction, ...overrides };
}

function near(actual: number, expected: number, relative = 1e-10, absolute = 1e-12): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    Math.max(absolute, Math.abs(expected) * relative),
  );
}

function nearPhasor(actual: Phasor, expected: Phasor, tolerance = 1e-10): void {
  near(actual.real, expected.real, tolerance, tolerance);
  near(actual.imag, expected.imag, tolerance, tolerance);
}

function magnitude(phasor: Phasor): number {
  return Math.hypot(phasor.real, phasor.imag);
}

function polar(phase: number, amplitude = 1): Phasor {
  return { real: amplitude * Math.cos(phase), imag: amplitude * Math.sin(phase) };
}

function multiply(a: Phasor, b: Phasor): Phasor {
  return { real: a.real * b.real - a.imag * b.imag, imag: a.real * b.imag + a.imag * b.real };
}

function interfaceDerivatives(sample: (x: number, y: number) => Phasor): [Phasor, Phasor] {
  const step = 0.001;
  const left2 = sample(-2 * step, 0);
  const left1 = sample(-step, 0);
  const at = sample(0, 0);
  const right1 = sample(step, 0);
  const right2 = sample(2 * step, 0);
  return [
    {
      real: (3 * at.real - 4 * left1.real + left2.real) / (2 * step),
      imag: (3 * at.imag - 4 * left1.imag + left2.imag) / (2 * step),
    },
    {
      real: (-3 * at.real + 4 * right1.real - right2.real) / (2 * step),
      imag: (-3 * at.imag + 4 * right1.imag - right2.imag) / (2 * step),
    },
  ];
}

describe('finite-depth capillary–gravity dispersion', () => {
  test('satisfies the full dispersion relation across frequency and depth scales', () => {
    for (const frequency of [0.001, 0.05, 0.5, 2, 8, 50, 1000]) {
      for (const depthMm of [0.01, 0.1, 1, 4, 10, 100, 10000]) {
        const wave = dispersion(frequency, depthMm);
        const rhs = (G * wave.k + TAU * wave.k ** 3) * Math.tanh(wave.k * depthMm / 1000);
        near(rhs, (2 * Math.PI * frequency) ** 2, 2e-12);
        near(wave.omega, 2 * Math.PI * frequency);
        near(wave.k * wave.wavelength / 1000, 2 * Math.PI);
        near(wave.phaseSpeed, frequency * wave.wavelength / 1000);
        near(wave.kh, wave.k * depthMm / 1000);
        expect(wave.k).toBeGreaterThan(0);
        expect(wave.groupSpeed).toBeGreaterThan(0);
      }
    }
  });

  test('wavenumber increases and wavelength decreases with frequency at fixed depth', () => {
    for (const depth of [0.1, 4, 100]) {
      let previousK = 0;
      let previousWavelength = Infinity;
      for (const frequency of [0.01, 0.1, 1, 2, 8, 20, 100, 1000]) {
        const wave = dispersion(frequency, depth);
        expect(wave.k).toBeGreaterThan(previousK);
        expect(wave.wavelength).toBeLessThan(previousWavelength);
        previousK = wave.k;
        previousWavelength = wave.wavelength;
      }
    }
  });

  test('wavelength and phase speed increase with water depth at fixed frequency', () => {
    let previousWavelength = 0;
    let previousSpeed = 0;
    for (const depth of [0.1, 0.5, 1, 4, 10, 40, 100]) {
      const wave = dispersion(2, depth);
      expect(wave.wavelength).toBeGreaterThan(previousWavelength);
      expect(wave.phaseSpeed).toBeGreaterThan(previousSpeed);
      previousWavelength = wave.wavelength;
      previousSpeed = wave.phaseSpeed;
    }
  });

  test('recovers nondispersive shallow-water gravity waves', () => {
    const wave = dispersion(0.001, 5);
    const shallowSpeed = Math.sqrt(G * 0.005);
    expect(wave.kh).toBeLessThan(0.001);
    near(wave.phaseSpeed, shallowSpeed, 1e-6);
    near(wave.groupSpeed, shallowSpeed, 1e-6);
  });

  test('recovers the deep-water gravity group-speed ratio', () => {
    const wave = dispersion(0.1, 1_000_000);
    expect(wave.kh).toBeGreaterThan(30);
    near(wave.phaseSpeed, G / wave.omega, 1e-6);
    near(wave.groupSpeed / wave.phaseSpeed, 0.5, 1e-6);
  });

  test('includes capillarity and approaches the deep-water capillary group-speed ratio', () => {
    const wave = dispersion(1000, 100);
    expect(TAU * wave.k ** 2 / G).toBeGreaterThan(100);
    near(wave.groupSpeed / wave.phaseSpeed, 1.5, 0.003);
    const gravityOnly = G * wave.k * Math.tanh(wave.kh);
    expect(gravityOnly / wave.omega ** 2).toBeLessThan(0.01);
  });

  test('analytic group speed agrees with a numerical d(omega)/dk', () => {
    for (const [frequency, depth] of [[0.1, 1], [2, 4], [8, 10], [100, 50]]) {
      const delta = frequency * 1e-5;
      const lower = dispersion(frequency - delta, depth);
      const upper = dispersion(frequency + delta, depth);
      const numerical = (upper.omega - lower.omega) / (upper.k - lower.k);
      near(dispersion(frequency, depth).groupSpeed, numerical, 1e-8);
    }
  });

  test('rejects invalid and unrepresentable inputs rather than returning NaN', () => {
    for (const invalid of [0, -1, NaN, Infinity, -Infinity]) {
      expect(() => dispersion(invalid, 10)).toThrow(RangeError);
      expect(() => dispersion(8, invalid)).toThrow(RangeError);
    }
    expect(() => dispersion(Number.MAX_VALUE, 10)).toThrow(RangeError);
    expect(() => dispersion(Number.MIN_VALUE, 10)).toThrow(RangeError);
    expect(() => dispersion(8, Number.MIN_VALUE)).toThrow(RangeError);
  });
});

describe('derived quantities and defaults', () => {
  test('provides valid, independent default parameter objects for all experiments', () => {
    for (const experiment of EXPERIMENTS) {
      const defaults = DEFAULT_PARAMETERS[experiment];
      expect(defaults.frequency).toBe(8);
      expect(defaults.amplitude).toBe(0.5);
      expect(deriveWave(defaults).wavelength).toBeGreaterThan(0);
    }
    expect(DEFAULT_PARAMETERS.reflection).not.toBe(DEFAULT_PARAMETERS.refraction);
    expect(DEFAULT_PARAMETERS.diffraction).not.toBe(DEFAULT_PARAMETERS.interference);
    expect(MODEL_NOTES.length).toBeGreaterThan(0);
    expect(MODEL_NOTES.join(' ')).toContain('not exact');
  });

  test('retains the base dispersion and uses mm for screen and aperture quantities', () => {
    const p = parameters({ phase: 90 });
    const wave = deriveWave(p);
    expect(wave).toMatchObject(dispersion(p.frequency, p.depth));
    near(wave.secondWavelength, dispersion(p.frequency, p.secondDepth).wavelength);
    near(wave.secondSpeed, dispersion(p.frequency, p.secondDepth).phaseSpeed);
    near(wave.slitRatio, p.slitWidth / wave.wavelength);
    near(wave.fringeSpacing, wave.wavelength * 300 / p.separation);
    near(wave.phaseRadians, Math.PI / 2);
    near(deriveWave({ ...p, separation: p.separation * 2 }).fringeSpacing, wave.fringeSpacing / 2);
  });

  test('obeys signed Snell refraction using phase speeds', () => {
    for (const angle of [-65, -30, 0, 30, 65]) {
      const p = parameters({ angle });
      const wave = deriveWave(p);
      expect(wave.refractedAngle).not.toBeNull();
      near(
        Math.sin((wave.refractedAngle as number) * RADIANS) / wave.secondSpeed,
        Math.sin(angle * RADIANS) / wave.phaseSpeed,
      );
      expect(Math.abs(wave.refractedAngle as number)).toBeLessThanOrEqual(Math.abs(angle));
      expect(wave.criticalAngle).toBeNull();
    }
  });

  test('equal depths have equal wavelengths, unchanged angles and no critical angle', () => {
    for (const angle of [-90, -89.999995, -30, 0, 30, 89.999995, 90]) {
      const wave = deriveWave(parameters({ secondDepth: 10, angle }));
      near(wave.secondWavelength, wave.wavelength);
      near(wave.secondSpeed, wave.phaseSpeed);
      near(wave.refractedAngle as number, angle);
      expect(wave.criticalAngle).toBeNull();
    }
  });

  test('finds critical incidence and distinguishes the propagating and evanescent branches', () => {
    const p = parameters({ frequency: 2, depth: 2, secondDepth: 40, angle: 0 });
    const wave = deriveWave(p);
    const critical = wave.criticalAngle as number;
    expect(critical).toBeGreaterThan(0);
    expect(critical).toBeLessThan(90);
    near(Math.sin(critical * RADIANS), wave.phaseSpeed / wave.secondSpeed);
    near(deriveWave({ ...p, angle: critical }).refractedAngle as number, 90);
    near(deriveWave({ ...p, angle: -critical }).refractedAngle as number, -90);
    expect(deriveWave({ ...p, angle: critical - 0.0001 }).refractedAngle).not.toBeNull();
    expect(deriveWave({ ...p, angle: critical + 0.0001 }).refractedAngle).toBeNull();
    expect(deriveWave({ ...p, angle: -critical - 0.0001 }).refractedAngle).toBeNull();
  });

  test('first diffraction minimum exists only when the aperture is at least one wavelength', () => {
    const p = parameters();
    const wavelength = dispersion(p.frequency, p.depth).wavelength;
    near(deriveWave({ ...p, slitWidth: 2 * wavelength }).firstMinimum as number, 30);
    near(deriveWave({ ...p, slitWidth: wavelength }).firstMinimum as number, 90);
    expect(deriveWave({ ...p, slitWidth: wavelength / 2 }).firstMinimum).toBeNull();
  });

  test('validates parameters without mutating the input', () => {
    const p = Object.freeze(parameters());
    expect(() => deriveWave(p)).not.toThrow();
    const invalid: Partial<WaveParameters>[] = [
      { frequency: 0 }, { amplitude: -0.1 }, { depth: 0 }, { secondDepth: -1 },
      { angle: 90.1 }, { angle: -90.1 }, { slitWidth: 0 }, { separation: 0 },
      { phase: Infinity }, { amplitude: NaN },
    ];
    for (const change of invalid) {
      expect(() => deriveWave({ ...p, ...change })).toThrow(RangeError);
    }
  });
});

describe('phasor convention and prepared sampling', () => {
  for (const experiment of EXPERIMENTS) {
    test(`${experiment}: height is a Re(H exp(-i omega t)) in mm`, () => {
      const p = parameters({ phase: 37, amplitude: 0.7 });
      const sampler = createWaveSampler(experiment, p);
      const phasor = sampler.samplePhasor(25, 17);
      near(sampler.amplitude, p.amplitude);
      near(sampler.omega, 2 * Math.PI * p.frequency);
      near(sampler.height(25, 17, 0), p.amplitude * phasor.real);
      near(sampler.height(25, 17, 1 / (4 * p.frequency)), p.amplitude * phasor.imag);
      for (const time of [-0.123, 0.047, 1.234]) {
        near(sampler.height(25, 17, time), p.amplitude * (
          phasor.real * Math.cos(sampler.omega * time)
          + phasor.imag * Math.sin(sampler.omega * time)
        ));
      }
      nearPhasor(samplePhasor(experiment, p, 25, 17), phasor);
      near(waveHeight(experiment, p, 25, 17, 0.047), sampler.height(25, 17, 0.047));
    });

    test(`${experiment}: time periodicity, half-period reversal and amplitude linearity`, () => {
      const p = parameters({ phase: 53 });
      const time = 0.017;
      const height = waveHeight(experiment, p, 35, -12, time);
      near(waveHeight(experiment, p, 35, -12, time + 1 / p.frequency), height);
      near(waveHeight(experiment, p, 35, -12, time + 0.5 / p.frequency), -height);
      near(waveHeight(experiment, { ...p, amplitude: 2 * p.amplitude }, 35, -12, time), 2 * height);
      near(waveHeight(experiment, { ...p, amplitude: 0 }, 35, -12, time), 0);
      nearPhasor(
        samplePhasor(experiment, { ...p, amplitude: 5 }, 35, -12),
        samplePhasor(experiment, p, 35, -12),
      );
      expect(Number.isFinite(waveHeight(experiment, p, 35, -12, 1e200))).toBe(true);
    });

    test(`${experiment}: prepared sampler captures parameters, not their mutable object`, () => {
      const p = parameters();
      const sampler = createWaveSampler(experiment, p);
      const before = sampler.samplePhasor(25, 17);
      const beforeHeight = sampler.height(25, 17, 0.021);
      Object.assign(p, parameters({ frequency: 3, amplitude: 2, depth: 20, secondDepth: 2,
        angle: -20, slitWidth: 60, separation: 90, phase: 180 }));
      nearPhasor(sampler.samplePhasor(25, 17), before);
      near(sampler.height(25, 17, 0.021), beforeHeight);
      near(sampler.omega, 2 * Math.PI * 8);
    });
  }

  test('rejects nonfinite spatial coordinates and times', () => {
    const sampler = createWaveSampler('interference', parameters());
    expect(() => sampler.samplePhasor(NaN, 0)).toThrow(RangeError);
    expect(() => sampler.samplePhasor(0, Infinity)).toThrow(RangeError);
    expect(() => sampler.height(0, 0, NaN)).toThrow(RangeError);
  });
});

describe('rigid-wall reflection', () => {
  test('is the same-sign sum of incident and reflected plane waves', () => {
    const p = parameters({ angle: 30 });
    const k = dispersion(p.frequency, p.depth).k / 1000;
    const x = -27;
    const y = 19;
    const incoming = polar(k * (Math.cos(p.angle * RADIANS) * x + Math.sin(p.angle * RADIANS) * y));
    const reflected = polar(k * (Math.cos(p.angle * RADIANS) * (200 - x) + Math.sin(p.angle * RADIANS) * y));
    nearPhasor(samplePhasor('reflection', p, x, y), {
      real: incoming.real + reflected.real,
      imag: incoming.imag + reflected.imag,
    });
  });

  test('has a wall antinode, an interior node and zero normal derivative at x = 100', () => {
    for (const angle of [-60, 0, 30, 90]) {
      const p = parameters({ angle });
      const sampler = createWaveSampler('reflection', p);
      near(magnitude(sampler.samplePhasor(100, 17)), 2);
      const step = 0.001;
      const at = sampler.samplePhasor(100, 17);
      const one = sampler.samplePhasor(100 - step, 17);
      const two = sampler.samplePhasor(100 - 2 * step, 17);
      near((3 * at.real - 4 * one.real + two.real) / (2 * step), 0, 0, 1e-7);
      near((3 * at.imag - 4 * one.imag + two.imag) / (2 * step), 0, 0, 1e-7);
      if (Math.abs(angle) < 90) {
        const wavelength = dispersion(p.frequency, p.depth).wavelength;
        const nodeX = 100 - wavelength / (4 * Math.cos(angle * RADIANS));
        near(magnitude(sampler.samplePhasor(nodeX, 17)), 0, 0, 1e-12);
      }
    }
  });

  test('excludes the solid side of the wall', () => {
    expect(samplePhasor('reflection', parameters(), 100.001, 0)).toEqual({ real: 0, imag: 0 });
    near(waveHeight('reflection', parameters(), 200, 100, 0.123), 0);
  });
});

describe('depth-step refraction and total internal reflection', () => {
  test('an equal-depth interface is transparent, including grazing incidence', () => {
    for (const angle of [-90, -89.999995, -40, 0, 40, 89.999995, 90]) {
      const p = parameters({ secondDepth: 10, angle });
      const sampler = createWaveSampler('refraction', p);
      const k = dispersion(p.frequency, p.depth).k / 1000;
      for (const x of [-100, -0.001, 0, 0.001, 100]) {
        nearPhasor(sampler.samplePhasor(x, 21), polar(k * (
          Math.cos(angle * RADIANS) * x + Math.sin(angle * RADIANS) * 21
        )));
      }
    }
  });

  test('normal-incidence amplitudes match elevation and depth-integrated flux', () => {
    const p = parameters({ frequency: 1, depth: 20, secondDepth: 4, angle: 0 });
    const wave = deriveWave(p);
    const r = (wave.phaseSpeed - wave.secondSpeed) / (wave.phaseSpeed + wave.secondSpeed);
    const t = 1 + r;
    const leftPhase = wave.k * -23 / 1000;
    nearPhasor(samplePhasor('refraction', p, -23, 0), {
      real: (1 + r) * Math.cos(leftPhase),
      imag: (1 - r) * Math.sin(leftPhase),
    });
    nearPhasor(samplePhasor('refraction', p, 0, 0), { real: t, imag: 0 });
    nearPhasor(samplePhasor('refraction', p, 37, 0), polar(2 * Math.PI * 37 / wave.secondWavelength, t));
    near(wave.phaseSpeed * (1 - r), wave.secondSpeed * t);
  });

  test('oblique propagating and evanescent fields match elevation and normal flux', () => {
    for (const p of [
      parameters({ angle: 45 }),
      parameters({ frequency: 2, depth: 2, secondDepth: 40, angle: 60 }),
    ]) {
      const sampler = createWaveSampler('refraction', p);
      const first = dispersion(p.frequency, p.depth);
      const second = dispersion(p.frequency, p.secondDepth);
      const step = 0.001;
      const one = sampler.samplePhasor(-step, 0);
      const two = sampler.samplePhasor(-2 * step, 0);
      nearPhasor({ real: 2 * one.real - two.real, imag: 2 * one.imag - two.imag },
        sampler.samplePhasor(0, 0), 1e-6);
      const [left, right] = interfaceDerivatives(sampler.samplePhasor);
      // Qx = omega/(i k²) d(eta)/dx; common factors and mm conversion cancel.
      near(left.real / first.k ** 2, right.real / second.k ** 2, 1e-6, 1e-11);
      near(left.imag / first.k ** 2, right.imag / second.k ** 2, 1e-6, 1e-11);
    }
  });

  test('TIR has unit reflection magnitude and a genuinely decaying transmitted field', () => {
    const p = parameters({ frequency: 2, depth: 2, secondDepth: 40, angle: 60 });
    const wave = deriveWave(p);
    expect(wave.refractedAngle).toBeNull();
    const sampler = createWaveSampler('refraction', p);
    const t = sampler.samplePhasor(0, 0);
    near(Math.hypot(t.real - 1, t.imag), 1);
    const k2 = 2 * Math.PI * 1000 / wave.secondWavelength;
    const ky = wave.k * Math.sin(p.angle * RADIANS);
    const alpha = Math.sqrt(ky ** 2 - k2 ** 2);
    const at10 = sampler.samplePhasor(10, 0);
    const at40 = sampler.samplePhasor(40, 0);
    nearPhasor(at40, { real: at10.real * Math.exp(-alpha * 0.03), imag: at10.imag * Math.exp(-alpha * 0.03) });
    expect(magnitude(at40)).toBeLessThan(magnitude(at10));
    nearPhasor(sampler.samplePhasor(10, 15), multiply(at10, polar(ky * 0.015)));
    expect(magnitude(sampler.samplePhasor(10_000, 0))).toBeLessThan(1e-20);
  });

  test('both sides remain finite at, near and beyond critical and grazing incidence', () => {
    const p = parameters({ frequency: 2, depth: 2, secondDepth: 40, angle: 0 });
    const critical = deriveWave(p).criticalAngle as number;
    for (const angle of [critical - 1e-8, critical, critical + 1e-8, -critical, 89.999, 90, -90]) {
      const sampler = createWaveSampler('refraction', { ...p, angle });
      for (const x of [-200, -0.001, 0, 0.001, 200]) {
        const phasor = sampler.samplePhasor(x, 150);
        expect(Number.isFinite(phasor.real)).toBe(true);
        expect(Number.isFinite(phasor.imag)).toBe(true);
        expect(Number.isFinite(sampler.height(x, 150, 0.03))).toBe(true);
      }
    }
  });
});

describe('two coherent cylindrical sources', () => {
  test('equal-phase sources are symmetric about y = 0', () => {
    const sampler = createWaveSampler('interference', parameters({ phase: 0 }));
    for (const x of [-200, -100, 0, 200]) {
      for (const y of [0, 10, 25, 85, 150]) {
        nearPhasor(sampler.samplePhasor(x, y), sampler.samplePhasor(x, -y));
        near(sampler.height(x, y, 0.037), sampler.height(x, -y, 0.037));
      }
    }
  });

  test('a 180-degree relative phase gives a persistent centerline node and odd symmetry', () => {
    const sampler = createWaveSampler('interference', parameters({ phase: 180 }));
    for (const x of [-200, -100, 0, 200]) {
      near(magnitude(sampler.samplePhasor(x, 0)), 0, 0, 1e-12);
      for (const time of [0, 0.023, 0.25]) near(sampler.height(x, 0, time), 0);
      const upper = sampler.samplePhasor(x, 17);
      nearPhasor(sampler.samplePhasor(x, -17), { real: -upper.real, imag: -upper.imag });
    }
  });

  test('source phase is coherent, relative, and periodic in 360 degrees', () => {
    const at = (phase: number) => samplePhasor('interference', parameters({ phase }), 45, 31);
    const zero = at(0);
    const reversed = at(180);
    // Recover source one and source two from their sum and difference.
    const first = { real: (zero.real + reversed.real) / 2, imag: (zero.imag + reversed.imag) / 2 };
    const second = { real: (zero.real - reversed.real) / 2, imag: (zero.imag - reversed.imag) / 2 };
    nearPhasor(at(90), { real: first.real - second.imag, imag: first.imag + second.real });
    nearPhasor(at(397), at(37));
  });

  test('both finite source cores are regular and the symmetric far field spreads cylindrically', () => {
    const p = parameters();
    const sampler = createWaveSampler('interference', p);
    for (const y of [-p.separation / 2, p.separation / 2]) {
      const phasor = sampler.samplePhasor(-100, y);
      expect(Number.isFinite(phasor.real)).toBe(true);
      expect(Number.isFinite(phasor.imag)).toBe(true);
      expect(magnitude(phasor)).toBeLessThanOrEqual(2);
    }
    const core = 1000 / dispersion(p.frequency, p.depth).k;
    for (const x of [0, 100, 200]) {
      const distance = Math.hypot(x + 100, p.separation / 2, core);
      near(magnitude(sampler.samplePhasor(x, 0)), 2 * Math.sqrt(core / distance));
    }
    expect(magnitude(sampler.samplePhasor(200, 0))).toBeLessThan(magnitude(sampler.samplePhasor(0, 0)));
  });
});

describe('aperture Huygens diffraction', () => {
  test('has the incident plane wave upstream and an opaque screen outside the centered gap', () => {
    const p = parameters({ angle: 25, slitWidth: 20 });
    const k = dispersion(p.frequency, p.depth).k / 1000;
    const phase = (x: number, y: number) => k * (Math.cos(p.angle * RADIANS) * x + Math.sin(p.angle * RADIANS) * y);
    nearPhasor(samplePhasor('diffraction', p, -75, 31), polar(phase(-75, 31)));
    nearPhasor(samplePhasor('diffraction', p, -40, 0), polar(phase(-40, 0)));
    nearPhasor(samplePhasor('diffraction', p, -40, 10), polar(phase(-40, 10)));
    expect(samplePhasor('diffraction', p, -40, 10.001)).toEqual({ real: 0, imag: 0 });
    expect(samplePhasor('diffraction', p, -40, -10.001)).toEqual({ real: 0, imag: 0 });
    expect(magnitude(samplePhasor('diffraction', p, -39, 50))).toBeGreaterThan(0);
  });

  test('normal incidence is symmetric; reversing incidence mirrors the aperture field', () => {
    for (const x of [-39.99, 0, 100, 200]) {
      for (const y of [0, 10, 50, 150]) {
        nearPhasor(samplePhasor('diffraction', parameters({ angle: 0 }), x, y),
          samplePhasor('diffraction', parameters({ angle: 0 }), x, -y));
        nearPhasor(samplePhasor('diffraction', parameters({ angle: 30 }), x, y),
          samplePhasor('diffraction', parameters({ angle: -30 }), x, -y));
      }
    }
  });

  test('finite cores and fixed aperture normalization bound the field for narrow and wide slits', () => {
    for (const slitWidth of [0.001, 2, 20, 100, 400]) {
      for (const angle of [-60, 0, 60]) {
        const p = parameters({ slitWidth, angle, amplitude: 0.7 });
        const sampler = createWaveSampler('diffraction', p);
        for (const x of [-40 + 1e-9, -39, -20, 0, 100, 200]) {
          for (const y of [-150, -slitWidth / 2, 0, slitWidth / 2, 150]) {
            const phasor = sampler.samplePhasor(x, y);
            expect(Number.isFinite(phasor.real)).toBe(true);
            expect(Number.isFinite(phasor.imag)).toBe(true);
            expect(magnitude(phasor)).toBeLessThanOrEqual(1 + 1e-12);
            expect(Math.abs(sampler.height(x, y, 0.019))).toBeLessThanOrEqual(p.amplitude + 1e-12);
          }
        }
      }
    }
  });

  test('the spatial integral approaches its far-field minimum but is not a whole-field sinc', () => {
    const base = parameters({ angle: 0 });
    const wavelength = dispersion(base.frequency, base.depth).wavelength;
    const p = { ...base, slitWidth: 4 * wavelength };
    const wave = deriveWave(p);
    const slope = Math.tan((wave.firstMinimum as number) * RADIANS);
    const sampler = createWaveSampler('diffraction', p);
    const farDistance = 1_000_000;
    const farAxis = magnitude(sampler.samplePhasor(-40 + farDistance, 0));
    const farMinimum = magnitude(sampler.samplePhasor(-40 + farDistance, farDistance * slope));
    expect(farMinimum / farAxis).toBeLessThan(0.01);
    const nearDistance = wavelength;
    const nearAxis = magnitude(sampler.samplePhasor(-40 + nearDistance, 0));
    const nearAtFarFieldAngle = magnitude(sampler.samplePhasor(-40 + nearDistance, nearDistance * slope));
    expect(nearAtFarFieldAngle / nearAxis).toBeGreaterThan(0.1);
    expect(farAxis).toBeLessThan(nearAxis);
  });
});

describe('tank-scale numerical bounds', () => {
  test('all four fields are finite and bounded over the tank, including barriers and sources', () => {
    for (const experiment of EXPERIMENTS) {
      for (const depth of [0.1, 4, 10, 1000]) {
        const p = parameters({ depth, secondDepth: 4, angle: 35, phase: 123 });
        const sampler = createWaveSampler(experiment, p);
        for (const x of [-200, -100, -40, -39.999, 0, 100, 100.001, 200]) {
          for (const y of [-150, -25, 0, 25, 150]) {
            const phasor = sampler.samplePhasor(x, y);
            expect(Number.isFinite(phasor.real)).toBe(true);
            expect(Number.isFinite(phasor.imag)).toBe(true);
            expect(magnitude(phasor)).toBeLessThanOrEqual(2 + 1e-10);
            expect(Math.abs(sampler.height(x, y, 0.071))).toBeLessThanOrEqual(2 * p.amplitude + 1e-10);
          }
        }
      }
    }
  });
});
