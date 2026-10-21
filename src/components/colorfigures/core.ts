/*
 * Colorfigures engine, ported for Wavelab.
 *
 * The engine owns the camera (drag to turn), the shading (three flat tones by
 * the way a face meets a light that turns with the viewer), the heavy ink
 * silhouette with finer inner lines, and the flat cast shadow. A figure script
 * describes its object as convex solids in 3D; the engine sorts them, draws
 * them and, when asked, ghosts the case so the mechanism inside can be seen.
 *
 * Every solid is convex, so only the faces that point at the viewer are ever
 * drawn: the others are hidden by the body itself. That keeps the painter's
 * order honest without a depth buffer.
 */

export type Vec3 = readonly [number, number, number];
export type Flat = readonly [number, number];

export interface Material {
  /** light, mid and dark flat tones */
  l: string;
  m: string;
  d: string;
  /** silhouette ink; falls back to the scene ink */
  ink?: string;
}

export interface SolidTag {
  at: Vec3;
  text: string;
  /** offset in screen pixels from the anchor */
  dx: number;
  dy: number;
}

export interface Solid {
  id?: string;
  verts: Vec3[];
  /** index loops into verts, wound counter-clockwise seen from outside */
  faces: number[][];
  mat: Material;
  /** a name tag, drawn only while labels are on */
  tag?: SolidTag;
  /** the part is working right now and takes the accent colour */
  on?: boolean;
  /** drawn only in see-through mode */
  inside?: boolean;
  /** faded to a ghost in see-through mode */
  ghost?: boolean;
  /** skip the ink on this solid */
  noInk?: boolean;
}

export interface SceneLine {
  from: Vec3;
  to: Vec3;
  mat?: Material;
  width?: number;
  /** the line is a texture: draw it dotted */
  dotted?: boolean;
}

export interface SceneText {
  at: Vec3;
  text: string;
  size?: number;
  tone?: string;
  /** anchor: start, middle or end */
  anchor?: "start" | "middle" | "end";
}

export interface Scene {
  solids: Solid[];
  lines?: SceneLine[];
  dots?: { at: Vec3; r: number; mat?: Material; on?: boolean }[];
  texts?: SceneText[];
  /** the accent colour used for parts that are working */
  accent?: string;
}

export interface Camera {
  yaw: number;
  pitch: number;
  zoom: number;
}

export interface RenderOptions {
  width: number;
  height: number;
  paper: string;
  ink: string;
  shadow: string;
  /** 0 = closed object, 1 = fully see-through */
  seeThrough: number;
  labels: boolean;
  /** how heavy the silhouette ink is, in pixels */
  inkWeight?: number;
}

const DEG = Math.PI / 180;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec3): Vec3 => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

export function frameOf(axis: Vec3): [Vec3, Vec3] {
  const forward = unit(axis);
  const helper = Math.abs(forward[2]) > 0.9 ? [1, 0, 0] as Vec3 : [0, 0, 1] as Vec3;
  const right = unit(cross(helper, forward));
  return [right, cross(forward, right)];
}

/* ---------------------------------------------------------------- geometry */

export interface SolidOptions {
  id?: string;
  tag?: SolidTag;
  on?: boolean;
  inside?: boolean;
  ghost?: boolean;
  noInk?: boolean;
}

/** Extrude a closed 3D profile along a translation: the workhorse for boxes. */
export function extrudeSolid(profile: Vec3[], offset: Vec3, mat: Material, options: SolidOptions = {}): Solid {
  const count = profile.length;
  const verts = [...profile, ...profile.map((point) => add(point, offset))];
  const faces: number[][] = [];
  // The profile is wound so its own normal points along the offset: the far
  // cap is the profile itself, the near cap is reversed.
  faces.push(profile.map((_, index) => count - 1 - index));
  faces.push(profile.map((_, index) => count + index));
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    faces.push([index, next, count + next, count + index]);
  }
  return { verts, faces, mat, ...options };
}

export function boxSolid(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  mat: Material, options: SolidOptions = {}): Solid {
  const profile: Vec3[] = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]];
  return extrudeSolid(profile, [0, 0, z1 - z0], mat, options);
}

/** A box with softened corners, extruded in z. */
export function roundedBoxSolid(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  radius: number, mat: Material, options: SolidOptions = {}): Solid {
  const r = Math.max(0, Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2));
  const profile: Vec3[] = [];
  const corners: [number, number, number][] = [
    [x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180],
  ];
  for (const [cx, cy, start] of corners) {
    const steps = r > 0 ? 5 : 0;
    for (let step = 0; step <= steps; step++) {
      const angle = (start + (steps ? (90 * step) / steps : 45)) * DEG;
      profile.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle), z0]);
    }
  }
  return extrudeSolid(profile, [0, 0, z1 - z0], mat, options);
}

export function circleProfile(cx: number, cy: number, z: number, radius: number, steps = 20): Vec3[] {
  return Array.from({ length: steps }, (_, index) => {
    const angle = (index / steps) * Math.PI * 2;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z];
  });
}

/** A vertical cylinder standing on the floor. */
export function cylinderSolid(cx: number, cy: number, z0: number, z1: number, radius: number,
  mat: Material, options: SolidOptions = {}, steps = 20): Solid {
  return extrudeSolid(circleProfile(cx, cy, z0, radius, steps), [0, 0, z1 - z0], mat, options);
}

/** A cylinder between two points: shafts, pins, rods. */
export function rodSolid(from: Vec3, to: Vec3, radius: number, mat: Material,
  options: SolidOptions = {}, steps = 14): Solid {
  const axis = sub(to, from);
  const [u, v] = frameOf(axis);
  const profile = Array.from({ length: steps }, (_, index) => {
    const angle = (index / steps) * Math.PI * 2;
    const offset = add(scale(u, radius * Math.cos(angle)), scale(v, radius * Math.sin(angle)));
    return add(from, offset);
  });
  return extrudeSolid(profile, axis, mat, options);
}

/** A flat slab standing in the xy plane, with thickness along z. */
export function slabSolid(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number,
  mat: Material, options: SolidOptions = {}): Solid {
  return boxSolid(x0, y0, z0, x1, y1, z1, mat, options);
}

/* ----------------------------------------------------------------- camera */

interface View {
  r: Vec3;
  u: Vec3;
  v: Vec3;
  scale: number;
  ox: number;
  oy: number;
}

function viewOf(camera: Camera, scene: Scene, width: number, height: number): View {
  const yaw = camera.yaw * DEG;
  const pitch = Math.max(-8, Math.min(78, camera.pitch)) * DEG;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const v: Vec3 = [sy * cp, -cy * cp, sp];
  const r: Vec3 = [cy, sy, 0];
  const u: Vec3 = [-sy * sp, cy * sp, cp];

  const points: Vec3[] = [];
  for (const solid of scene.solids) {
    if (solid.inside) continue;
    points.push(...solid.verts);
  }
  for (const line of scene.lines ?? []) points.push(line.from, line.to);
  if (!points.length) points.push([0, 0, 0], [1, 1, 1]);
  const lo = points.reduce((acc, point) => [Math.min(acc[0], point[0]), Math.min(acc[1], point[1]), Math.min(acc[2], point[2])], [Infinity, Infinity, Infinity]);
  const hi = points.reduce((acc, point) => [Math.max(acc[0], point[0]), Math.max(acc[1], point[1]), Math.max(acc[2], point[2])], [-Infinity, -Infinity, -Infinity]);
  const corners: Vec3[] = [];
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) corners.push([x, y, z]);
  const xs = corners.map((point) => dot(point, r));
  const ys = corners.map((point) => -dot(point, u));
  const spanX = Math.max(...xs) - Math.min(...xs) || 1;
  const spanY = Math.max(...ys) - Math.min(...ys) || 1;
  const pad = 26;
  const fit = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const scaleValue = fit * (camera.zoom || 1);
  const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const midY = (Math.max(...ys) + Math.min(...ys)) / 2;
  return {
    r, u, v,
    scale: scaleValue,
    ox: width / 2 - midX * scaleValue,
    oy: height / 2 - midY * scaleValue,
  };
}

/* ----------------------------------------------------------------- render */

const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function faceNormal(verts: Vec3[], face: number[]): Vec3 {
  const a = verts[face[0]!]!;
  const b = verts[face[1]!]!;
  const c = verts[face[2]!]!;
  return unit(cross(sub(b, a), sub(c, a)));
}

function toneOf(normal: Vec3, view: View, mat: Material): string {
  // The light is a headlight from above and to the right, so it turns with the
  // viewer: the object reads the same from every angle.
  const t = dot(normal, view.r) * 0.3 + dot(normal, view.u) * 0.55 + dot(normal, view.v) * 0.78;
  if (t > 0.62) return mat.l;
  if (t > 0.16) return mat.m;
  return mat.d;
}

/** The lamp sits above, in front and to the left; the shadow falls away from it. */
const LAMP: Vec3 = unit([-0.34, -0.44, 1.5]);

function hull2(points: Flat[]): Flat[] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Flat, a: Flat, b: Flat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Flat[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Flat[] = [];
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function renderScene(scene: Scene, camera: Camera, options: RenderOptions): string {
  const { width, height, paper, ink, shadow, seeThrough, labels } = options;
  const view = viewOf(camera, scene, width, height);
  const project = (point: Vec3): Flat => [
    view.ox + dot(point, view.r) * view.scale,
    view.oy - dot(point, view.u) * view.scale,
  ];

  const parts: string[] = [];
  parts.push(`<rect width="${width}" height="${height}" fill="${paper}"/>`);

  /* The flat cast shadow: every part's own footprint, thrown onto the ground. */
  {
    const paths: string[] = [];
    for (const solid of scene.solids) {
      if (solid.inside) continue;
      const corners: Flat[] = solid.verts.map((vertex) => {
        const t = vertex[2] / LAMP[2];
        return [vertex[0] - LAMP[0] * t, vertex[1] - LAMP[1] * t];
      });
      const outline = hull2(corners);
      if (outline.length < 3) continue;
      paths.push(outline.map((point, index) => {
        const [sx, sy] = project([point[0], point[1], 0]);
        return `${index ? "L" : "M"}${sx.toFixed(1)} ${sy.toFixed(1)}`;
      }).join("") + "Z");
    }
    if (paths.length) parts.push(`<path d="${paths.join("")}" fill="${shadow}" opacity="0.15" fill-rule="nonzero"/>`);
  }

  interface Face { solid: Solid; face: number[]; depth: number; normal: Vec3; }
  const faces: Face[] = [];
  for (const solid of scene.solids) {
    if (solid.inside && seeThrough < 0.5) continue;
    for (const face of solid.faces) {
      const normal = faceNormal(solid.verts, face);
      if (dot(normal, view.v) <= 0.001) continue;
      let depth = 0;
      for (const index of face) depth += dot(solid.verts[index]!, view.v);
      depth /= face.length;
      faces.push({ solid, face, depth, normal });
    }
  }
  faces.sort((a, b) => a.depth - b.depth);

  for (const entry of faces) {
    const { solid, face, normal } = entry;
    const d = project(solid.verts[face[0]!]!);
    let path = `M${d[0].toFixed(1)} ${d[1].toFixed(1)}`;
    for (let index = 1; index < face.length; index++) {
      const point = project(solid.verts[face[index]!]!);
      path += `L${point[0].toFixed(1)} ${point[1].toFixed(1)}`;
    }
    path += "Z";
    const ghosted = solid.ghost && seeThrough > 0.02;
    const opacity = ghosted ? (1 - 0.72 * seeThrough).toFixed(2) : "1";
    const fill = solid.on && scene.accent ? scene.accent : toneOf(normal, view, solid.mat);
    parts.push(`<path d="${path}" fill="${fill}" opacity="${opacity}"/>`);
  }

  /* Ink: a heavy silhouette with finer lines inside it. */
  const inkWeight = options.inkWeight ?? 1.7;
  for (const solid of scene.solids) {
    if (solid.inside && seeThrough < 0.5) continue;
    if (solid.noInk) continue;
    const ghosted = solid.ghost && seeThrough > 0.02;
    const opacity = ghosted ? (1 - 0.78 * seeThrough).toFixed(2) : "1";
    const edge = solid.mat.ink ?? ink;
    const counts = new Map<string, number>();
    const order: string[] = [];
    for (const face of solid.faces) {
      const normal = faceNormal(solid.verts, face);
      if (dot(normal, view.v) <= 0.001) continue;
      for (let index = 0; index < face.length; index++) {
        const a = face[index]!;
        const b = face[(index + 1) % face.length]!;
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (!counts.has(key)) order.push(key);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    for (const key of order) {
      const count = counts.get(key)!;
      const [a, b] = key.split("-").map(Number) as [number, number];
      const from = project(solid.verts[a]!);
      const to = project(solid.verts[b]!);
      const weight = count === 1 ? inkWeight : inkWeight * 0.45;
      parts.push(`<path d="M${from[0].toFixed(1)} ${from[1].toFixed(1)}L${to[0].toFixed(1)} ${to[1].toFixed(1)}" stroke="${edge}" stroke-width="${weight.toFixed(2)}" fill="none" opacity="${opacity}" stroke-linecap="round"/>`);
    }
  }

  for (const line of scene.lines ?? []) {
    const from = project(line.from);
    const to = project(line.to);
    const colour = line.mat?.m ?? ink;
    const dash = line.dotted ? ` stroke-dasharray="1.5 3.5"` : "";
    parts.push(`<path d="M${from[0].toFixed(1)} ${from[1].toFixed(1)}L${to[0].toFixed(1)} ${to[1].toFixed(1)}" stroke="${colour}" stroke-width="${line.width ?? 1.4}" fill="none" stroke-linecap="round"${dash}/>`);
  }

  for (const dot of scene.dots ?? []) {
    const [cx, cy] = project(dot.at);
    parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(dot.r * view.scale).toFixed(2)}" fill="${dot.on && scene.accent ? scene.accent : dot.mat?.m ?? ink}"/>`);
  }

  for (const text of scene.texts ?? []) {
    const [cx, cy] = project(text.at);
    const size = text.size ?? 11;
    const anchor = text.anchor ?? "middle";
    const offset = anchor === "middle" ? size * 0.36 : anchor === "end" ? 0 : size * 0.72;
    parts.push(`<text x="${(cx - offset).toFixed(1)}" y="${(cy + size * 0.34).toFixed(1)}" font-size="${size}" text-anchor="${anchor}" fill="${text.tone ?? ink}" font-family="ui-monospace, monospace" letter-spacing="0.06em">${escapeText(text.text)}</text>`);
  }

  /* Name tags, drawn last so they never hide under the object. */  if (labels) {
    for (const solid of scene.solids) {
      if (!solid.tag) continue;
      if (solid.inside && seeThrough < 0.5) continue;
      const [ax, ay] = project(solid.tag.at);
      const bx = ax + solid.tag.dx;
      const by = ay + solid.tag.dy;
      const text = escapeText(solid.tag.text);
      const width = text.length * 6.1 + 14;
      const height = 19;
      const left = solid.tag.dx < 0 ? bx - width : bx;
      parts.push(`<path d="M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}" stroke="${ink}" stroke-width="0.9" opacity="0.55" fill="none"/>`);
      parts.push(`<rect x="${left.toFixed(1)}" y="${(by - height / 2).toFixed(1)}" width="${width.toFixed(1)}" height="${height}" rx="4" fill="${paper}" stroke="${ink}" stroke-width="0.9" opacity="0.94"/>`);
      parts.push(`<text x="${(left + 7).toFixed(1)}" y="${(by + 3.6).toFixed(1)}" font-size="10.5" fill="${ink}" font-family="ui-monospace, monospace" letter-spacing="0.04em">${text}</text>`);
    }
  }

  return parts.join("");
}
