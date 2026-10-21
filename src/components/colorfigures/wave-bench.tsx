import {
  boxSolid, cylinderSolid, extrudeSolid, rodSolid, roundedBoxSolid,
  type Material, type Scene, type Solid, type Vec3,
} from "./core";

/*
 * WAVE INDICATOR BENCH — WB-01.
 *
 * A wave display bench for the wave-properties experiment. A drive unit turns
 * at the wave's frequency; a row of sliders on a guide rail carries the
 * markers, and the markers' heights are the model's displacement at their own
 * station. The wave ribbon threaded through the marker tips is the same curve
 * the calibrated scope plots.
 *
 * The machine is honest about what it is: the sliders are set to the model's
 * displacement, and the drive's needle shows the phase of the wave on the
 * rail. See-through opens the drive housing to the motor, the worm wheel and
 * the shaft that turns the phase disc.
 *
 * World units are metres: the rail spans the same 0-10 m window as the scope.
 */

const CAST: Material = { l: "var(--cf-cast-l)", m: "var(--cf-cast-m)", d: "var(--cf-cast-d)" };
const STEEL: Material = { l: "var(--cf-steel-l)", m: "var(--cf-steel-m)", d: "var(--cf-steel-d)" };
const IRON: Material = { l: "var(--cf-iron-l)", m: "var(--cf-iron-m)", d: "var(--cf-iron-d)" };
const BRASS: Material = { l: "var(--cf-brass-l)", m: "var(--cf-brass-m)", d: "var(--cf-brass-d)" };
const SIGNAL: Material = { l: "var(--cf-signal-l)", m: "var(--cf-signal-m)", d: "var(--cf-signal-d)" };
const RUBBER: Material = { l: "var(--cf-rubber-l)", m: "var(--cf-rubber-m)", d: "var(--cf-rubber-d)" };
const PAPER: Material = { l: "var(--cf-paper-l)", m: "var(--cf-paper-m)", d: "var(--cf-paper-d)" };

const RAIL_Z = 6.95;
const REST_Z = 3;
const MARKERS = 13;
const PROBE_X = 2;
const WINDOW = 10;

export interface WaveBenchModel {
  amplitude: number;
  wavelength: number;
  period: number;
  frequency: number;
}

/** y(x, t) = A sin(2π(x/λ − t/T)): the same curve the calibrated scope plots. */
function displacement(model: WaveBenchModel, x: number, time: number) {
  const phase = ((time % model.period) + model.period) % model.period / model.period;
  return model.amplitude * Math.sin(2 * Math.PI * (x / model.wavelength - phase));
}

function markerPositions() {
  return Array.from({ length: MARKERS }, (_, index) => (index * WINDOW) / (MARKERS - 1));
}

/** A thin band that follows the curve, built as one convex segment at a time. */
function ribbonSegment(x0: number, z0: number, x1: number, z1: number, mat: Material): Solid {
  const half = 0.055;
  const profile: Vec3[] = [
    [x0, -half, z0], [x1, -half, z1], [x1, half, z1], [x0, half, z0],
  ];
  return extrudeSolid(profile, [0, half * 2, 0], mat);
}

export function buildWaveBench(model: WaveBenchModel | null, time: number): Scene {
  const solids: Solid[] = [];
  const lines: { from: Vec3; to: Vec3; mat?: Material; width?: number; dotted?: boolean }[] = [];
  const texts: { at: Vec3; text: string; size?: number; tone?: string; anchor?: "start" | "middle" | "end" }[] = [];
  const accent = "var(--cf-signal-m)";

  const period = model?.period ?? 1;
  const phase = model ? ((time % period) + period) % period / period : 0;

  /* ---- base ------------------------------------------------------------ */
  solids.push(roundedBoxSolid(-2.9, -1.6, 0.24, 11.3, 1.6, 0.56, 0.22, CAST));
  for (const x of [-2.2, 10.6]) for (const y of [-1.2, 1.2]) {
    solids.push(cylinderSolid(x, y, 0, 0.16, 0.3, RUBBER));
    solids.push(cylinderSolid(x, y, 0.16, 0.26, 0.22, CAST));
  }
  solids.push(boxSolid(-2.74, -1.44, 0.56, 11.14, 1.44, 0.62, IRON));
  solids.push(boxSolid(-0.7, -1.42, 0.62, 10.7, -1.0, 0.68, PAPER));
  for (let index = 0; index <= 20; index++) {
    const x = -0.7 + (index * 11.4) / 20;
    const major = index % 2 === 0;
    lines.push({ from: [x, -1.0, 0.69], to: [x, -1.0 + (major ? 0.3 : 0.16), 0.69], mat: IRON, width: major ? 1.2 : 0.8 });
  }

  /* ---- standards and rail --------------------------------------------- */
  for (const x of [-0.45, 10.45]) {
    solids.push(boxSolid(x - 0.52, -0.78, 0.62, x + 0.52, 0.78, 0.86, CAST));
    solids.push(boxSolid(x - 0.3, -0.42, 0.86, x + 0.3, 0.42, 6.4, CAST));
    for (const y of [-0.5, 0.5]) solids.push(boxSolid(x - 0.34, y - 0.06, 1.0, x + 0.34, y + 0.06, 3.4, CAST));
    solids.push(boxSolid(x - 0.42, -0.52, 6.4, x + 0.42, 0.52, 6.72, CAST));
    solids.push(rodSolid([x, -0.3, RAIL_Z], [x, 0.3, RAIL_Z], 0.26, IRON));
    for (const bx of [-0.4, 0.4]) for (const by of [-0.62, 0.62]) {
      solids.push(cylinderSolid(x + bx, by, 0.86, 0.98, 0.1, STEEL, {}, 10));
    }
  }
  solids.push(rodSolid([-0.45, 0, RAIL_Z], [10.45, 0, RAIL_Z], 0.13, STEEL, {
    id: "rail", tag: { at: [6.6, 0, RAIL_Z], text: "Guide rail", dx: 12, dy: -34 },
  }));

  /* ---- the sliders and their markers ----------------------------------- */
  const positions = markerPositions();
  positions.forEach((x, index) => {
    const height = REST_Z + displacement(model ?? { amplitude: 0, wavelength: 1, period: 1, frequency: 1 }, x, time);
    solids.push(boxSolid(x - 0.17, -0.26, 6.42, x + 0.17, 0.26, 6.78, IRON, index === 3
      ? { tag: { at: [x, 0, 6.6], text: "Slider", dx: -4, dy: -62 } }
      : {}));
    solids.push(cylinderSolid(x, 0, 6.72, 7.08, 0.23, IRON, {}, 14));
    solids.push(rodSolid([x, -0.26, 6.6], [x, -0.38, 6.6], 0.07, BRASS, {}, 10));
    solids.push(boxSolid(x - 0.05, -0.05, height, x + 0.05, 0.05, 6.42, STEEL));
    solids.push(rodSolid([x, -0.13, height], [x, 0.13, height], 0.17, BRASS, index === 4
      ? { id: "marker", tag: { at: [x, 0, height], text: "Marker", dx: 46, dy: -30 } }
      : {}));
  });

  /* ---- the wave itself -------------------------------------------------- */
  if (model) {
    const samples = 48;
    let previousX = 0;
    let previousZ = REST_Z + displacement(model, 0, time);
    for (let index = 1; index <= samples; index++) {
      const x = (index * WINDOW) / samples;
      const z = REST_Z + displacement(model, x, time);
      solids.push(ribbonSegment(previousX, previousZ, x, z, SIGNAL));
      previousX = x;
      previousZ = z;
    }
    lines.push({ from: [-0.2, 0, REST_Z], to: [10.2, 0, REST_Z], mat: IRON, width: 0.9, dotted: true });
  }

  /* ---- the fixed probe at x = 2 m --------------------------------------- */
  solids.push(boxSolid(PROBE_X - 0.24, -1.26, 0.62, PROBE_X + 0.24, -0.84, 0.8, CAST));
  solids.push(boxSolid(PROBE_X - 0.09, -1.2, 0.8, PROBE_X + 0.09, -0.9, 4.6, CAST));
  solids.push(boxSolid(PROBE_X - 0.05, -1.02, 4.42, PROBE_X + 0.05, -0.16, 4.58, STEEL));
  const probeHeight = REST_Z + displacement(model ?? { amplitude: 0, wavelength: 1, period: 1, frequency: 1 }, PROBE_X, time);
  solids.push(rodSolid([PROBE_X, -0.18, probeHeight + 0.24], [PROBE_X, -0.18, 4.42], 0.05, SIGNAL, {
    id: "probe-pointer", tag: { at: [PROBE_X, -0.18, probeHeight + 0.3], text: "Fixed probe, x = 2 m", dx: -132, dy: 16 },
  }));
  solids.push(rodSolid([PROBE_X, -0.18, probeHeight + 0.14], [PROBE_X, -0.18, probeHeight + 0.3], 0.09, SIGNAL, {}, 10));
  solids.push(boxSolid(PROBE_X + 0.14, -1.14, 1.4, PROBE_X + 0.24, -1.02, 4.9, IRON));
  for (let step = 0; step <= 8; step++) {
    const z = 1.4 + step * 0.4375;
    const major = step % 2 === 0;
    lines.push({ from: [PROBE_X + 0.14, -1.14, z], to: [PROBE_X + 0.14 - (major ? 0.1 : 0.05), -1.14, z], mat: PAPER, width: major ? 1.2 : 0.8 });
  }

  /* ---- the drive unit ---------------------------------------------------- */
  solids.push(roundedBoxSolid(-2.75, -1.05, 0.62, -1.05, 1.05, 2.7, 0.24, CAST, {
    ghost: true, id: "drive-case", tag: { at: [-1.9, -1.05, 1.6], text: "Drive unit", dx: 4, dy: 74 },
  }));
  solids.push(boxSolid(-2.6, -1.12, 0.9, -1.2, -1.05, 2.4, IRON, { ghost: true }));
  for (const y of [-0.75, -0.35, 0.35, 0.75]) {
    solids.push(boxSolid(-2.55, y - 0.08, 2.7, -1.25, y + 0.08, 2.86, IRON));
  }
  solids.push(boxSolid(-2.4, 0.4, 2.7, -1.8, 0.92, 3.12, IRON));
  solids.push(rodSolid([-1.3, -1.05, 2.3], [-1.3, -1.2, 2.3], 0.1, SIGNAL, {}, 12));
  /* The mechanism inside the case, shown when the case is opened. */
  solids.push(rodSolid([-2.6, 0, 1.5], [-1.55, 0, 1.5], 0.42, IRON, { inside: true }));
  solids.push(rodSolid([-2.5, 0, 1.5], [-1.72, 0, 1.5], 0.24, BRASS, { inside: true, on: true }));
  solids.push(rodSolid([-2.64, 0, 1.5], [-2.44, 0, 1.5], 0.19, BRASS, { inside: true }));
  for (const y of [-0.24, 0.24]) solids.push(boxSolid(-2.58, y - 0.04, 1.38, -2.4, y + 0.04, 1.62, STEEL, { inside: true }));
  solids.push(cylinderSolid(-1.25, 0, 1.16, 1.84, 0.34, STEEL, { inside: true }, 16));
  solids.push(rodSolid([-1.25, 0, 1.5], [-1.25, 0, 2.8], 0.09, STEEL, { inside: true }));
  /* The visible upper shaft and the phase disc it turns. */
  solids.push(rodSolid([-1.25, 0, 2.62], [-1.25, 0, 3.42], 0.1, STEEL));
  solids.push(cylinderSolid(-1.25, 0, 3.42, 3.56, 0.92, BRASS, {
    id: "phase-disc", tag: { at: [-1.25, 0, 3.5], text: "Phase disc", dx: -40, dy: -46 },
  }));
  for (let index = 0; index < 4; index++) {
    const angle = (index / 4) * Math.PI * 2;
    lines.push({
      from: [-1.25 + 0.5 * Math.cos(angle), 0.5 * Math.sin(angle), 3.58],
      to: [-1.25 + 0.82 * Math.cos(angle), 0.82 * Math.sin(angle), 3.58],
      mat: IRON, width: 1.1,
    });
  }
  const needle = phase * Math.PI * 2;
  const perp: Vec3 = [-Math.sin(needle), Math.cos(needle), 0];
  const needleProfile: Vec3[] = [
    [-1.25 + perp[0] * 0.1, perp[1] * 0.1, 3.58],
    [-1.25 + 0.78 * Math.cos(needle) + perp[0] * 0.05, 0.78 * Math.sin(needle) + perp[1] * 0.05, 3.58],
    [-1.25 + 0.78 * Math.cos(needle) - perp[0] * 0.05, 0.78 * Math.sin(needle) - perp[1] * 0.05, 3.58],
    [-1.25 - perp[0] * 0.1, -perp[1] * 0.1, 3.58],
  ];
  solids.push(extrudeSolid(needleProfile, [0, 0, 0.07], SIGNAL, { id: "needle", on: true }));
  solids.push(rodSolid([-1.25, 1.16, 3.3], [-1.25, 1.02, 3.46], 0.06, IRON));
  solids.push(rodSolid([-1.25, 1.02, 3.46], [-1.25, 1.16, 3.62], 0.06, IRON));

  /* ---- nameplate --------------------------------------------------------- */
  solids.push(boxSolid(7.4, -1.62, 0.3, 9.6, -1.58, 0.52, PAPER));
  texts.push({ at: [8.5, -1.63, 0.43], text: "WAVELAB / WB-01", size: 7.5, tone: "var(--cf-ink)" });

  return {
    solids,
    lines,
    texts,
    accent,
  };
}
