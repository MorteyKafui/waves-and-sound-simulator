import { boxCorners, fitProjection, iso, type Projection } from "@/components/iso/iso-kit";

export const VIEW_WIDTH = 900;
export const VIEW_HEIGHT = 580;
export const TANK = { x: -200, y: -150, w: 400, d: 300, r: 3 };
export const BED = { x: -223, y: -173, w: 446, d: 346, r: 10 };
export const PROJECTION = fitProjection(
  boxCorners(BED, -73, 96), VIEW_WIDTH, VIEW_HEIGHT,
  { pad: 49, azimuth: 38, elevation: 42 },
);
export const TOP_PROJECTION: Projection = {
  origin: [450, 287], scale: 1.37, azimuth: 90, elevation: 90,
};

export function at(x: number, y: number, z = 0, top = false) {
  return iso([x, y, z], top ? TOP_PROJECTION : PROJECTION);
}

/** Affine map from the physical water plane to the same camera used by SVG. */
export function planeMatrix(top = false): [number, number, number, number, number, number] {
  const origin = at(0, 0, 0, top);
  const x = at(1, 0, 0, top);
  const y = at(0, 1, 0, top);
  return [x[0] - origin[0], x[1] - origin[1], y[0] - origin[0], y[1] - origin[1], ...origin];
}

export function worldAt(sx: number, sy: number, top = false): [number, number] {
  const [a, b, c, d, e, f] = planeMatrix(top);
  const det = a * d - b * c;
  return [((sx - e) * d - (sy - f) * c) / det, ((sy - f) * a - (sx - e) * b) / det];
}
