import * as k from "@/components/iso/iso-kit";
import { BED, PROJECTION as P, TANK, TOP_PROJECTION } from "./view";

export interface TankArtwork { back: string; front: string; source: string; paddle: string; top: string }

const solid = (plan: k.Plan, z: number, h: number, className = "", bevel = 0.65) =>
  k.solidSvg(k.slabOf(plan, z, h, P, 6, bevel), { tone: "mid", className });
const round = (x: number, y: number, r: number, z: number, h: number, className = "") =>
  k.solidSvg(k.cylinder(x, y, r, z, h, P, 40, 0.35), { tone: "mid", className });
const line = (d: string, tone: k.LineTone = "lo") => k.lineSvg(d, { tone });
const screw = (x: number, y: number, z: number) =>
  line(k.ring(x, y, 2.15, z, P, 16), "mid") + k.dotsSvg([k.iso([x, y, z], P)], { size: 0.65, tone: "hi" });
const plan = (x: number, y: number, w: number, d: number, r = 1.3) => ({ x, y, w, d, r });

function baseArt() {
  const parts: string[] = [];
  parts.push(`<path class="tank-shadow" d="${k.haloOf(BED, -74, 12, P)}"/>`);
  const feet = k.corners(BED, 30).sort((a, b) => k.depthOf([...a, 0], P) - k.depthOf([...b, 0], P));
  for (const [x, y] of feet) {
    parts.push(round(x, y, 11, -72, 5, "rubber"));
    parts.push(round(x, y, 8, -67, 5, "metal-dark"));
    parts.push(round(x, y, 5.5, -62, 31, "steel"));
    parts.push(solid(plan(x - 12, y - 12, 24, 24, 3), -31, 9, "metal"));
  }
  for (const y of [-122, 110]) parts.push(solid(plan(-192, y, 384, 12), -32, 10, "metal"));
  parts.push(solid(BED, -22, 14, "bed", 1.6));
  parts.push(line(k.sideSeam(BED, -14, P, 6), "lo"));
  parts.push(line(k.planOutline(k.insetPlan(BED, 5), -8, P, 6), "lo"));
  for (const [x, y] of k.corners(BED, 10)) parts.push(screw(x, y, -7.9));
  parts.push(solid({ ...TANK, r: 3 }, -8, 3, "tank-floor"));
  // Far retaining walls and their aluminum rim strips.
  parts.push(solid(plan(-209, -159, 418, 9, 2), -5, 17, "tank-wall"));
  parts.push(solid(plan(-209, -150, 9, 300, 1), -5, 17, "tank-wall"));
  parts.push(solid(plan(-211, -162, 422, 12, 2), 12, 3, "rim"));
  parts.push(solid(plan(-212, -150, 12, 300, 1), 12, 3, "rim"));
  parts.push(`<path class="water-still" d="${k.planOutline(TANK, 0, P)}"/>`);
  for (const x of [-160, -80, 0, 80, 160]) parts.push(`<path class="floor-grid" d="${k.lineOnTop([x, -150], [x, 150], 0, P)}"/>`);
  for (const y of [-100, -50, 0, 50, 100]) parts.push(`<path class="floor-grid" d="${k.lineOnTop([-200, y], [200, y], 0, P)}"/>`);
  // Far gantry upright. The near upright belongs to the front layer.
  parts.push(solid(plan(-112, -171, 24, 14, 2), -8, 8, "metal"));
  parts.push(solid(plan(-104, -168, 8, 8), 0, 85, "steel"));
  parts.push(solid(plan(-108, -171, 16, 14), 82, 8, "metal"));
  return parts.join("");
}

function frontArt() {
  const parts: string[] = [];
  parts.push(solid(plan(-200, 150, 409, 9, 1), -5, 17, "tank-wall"));
  parts.push(solid(plan(200, -150, 9, 300, 1), -5, 17, "tank-wall"));
  parts.push(solid(plan(-200, 150, 412, 12, 2), 12, 3, "rim"));
  parts.push(solid(plan(200, -150, 12, 300, 1), 12, 3, "rim"));
  for (const [x, y] of [[-205, -155], [205, -155], [-205, 155], [205, 155]]) {
    parts.push(solid(plan(x - 5, y - 5, 10, 10, 2), 15, 2, "metal"));
    parts.push(screw(x, y, 17.1));
  }
  const ruler = plan(-182, 152, 352, 7, 0.7);
  parts.push(solid(ruler, 15, 0.7, "scale"));
  const ticks = k.topTicks(-176, 166, 5, 5, 152.4, 15.8, [2.3, 4.5], P);
  parts.push(line(ticks.minor, "lo"), line(ticks.major, "mid"));
  parts.push(solid(plan(-112, 157, 24, 14, 2), -8, 8, "metal"));
  parts.push(solid(plan(-104, 160, 8, 8), 0, 85, "steel"));
  parts.push(solid(plan(-108, 157, 16, 14), 82, 8, "metal"));
  parts.push(screw(-100, 164, 90.1));
  // Bridge and its two carriage rails physically join the two uprights.
  parts.push(solid(plan(-111, -171, 22, 342, 2), 85, 7, "metal"));
  parts.push(solid(plan(-109, -169, 18, 338, 1), 92, 1.7, "bridge-cover"));
  for (const x of [-111, -92]) parts.push(solid(plan(x, -155, 2, 310, 0.4), 93.7, 1.7, "steel"));
  for (const y of [-164, 164]) parts.push(screw(-100, y, 93.8));
  // Controller attached to the front right of the base, with real face details.
  parts.push(solid(plan(134, 126, 54, 34, 4), -8, 20, "control-box"));
  parts.push(solid(plan(137, 129, 48, 28, 2), 12, 1, "faceplate"));
  parts.push(round(167, 142, 8.5, 13, 5, "dial"));
  parts.push(line(k.knurl(167, 142, 8.5, 13, 18, 36, P), "mid"));
  parts.push(line(k.ring(167, 142, 6.2, 18.1, P, 36), "lo"));
  parts.push(line(k.lineOnTop([167, 142], [167, 136.2], 18.2, P), "hi"));
  parts.push(round(146, 139, 2, 13, 0.8, "power-dot"));
  for (let i = 0; i < 4; i++) parts.push(line(k.planOutline(plan(141 + i * 3, 148, 1, 5, 0.5), 13.1, P, 3), "mid"));
  const label = plan(-57, 163, 80, 6, 1);
  parts.push(solid(label, -8, 0.8, "label-plate"));
  parts.push(k.faceTextSvg(k.topMatrix([-17, 167.1], -7.1, P), "WAVELAB / RT–01", { size: 2.8, tone: "mid", anchor: "middle" }));
  parts.push(screw(-53, 166, -7.1), screw(19, 166, -7.1));
  return parts.join("");
}

function sourceArt() {
  return [
    solid(plan(-116, -11, 32, 22, 2.3), 95.4, 4, "source-clamp"),
    screw(-110, -6, 99.5), screw(-90, 6, 99.5),
    solid(plan(-109, -7, 18, 14, 2), 81.4, 14, "source-motor"),
    round(-100, 0, 6, 77.4, 4, "metal"),
    round(-100, 0, 1.6, 1.7, 75.7, "steel"),
    round(-100, 0, 4.5, 0, 1.7, "source-tip"),
    line(k.ring(-100, 0, 2.6, 1.8, P, 24), "mid"),
  ].join("");
}

export function buildTankArtwork(): TankArtwork {
  return {
    back: baseArt(), front: frontArt(), source: sourceArt(),
    paddle: solid(plan(-190, -118, 7, 236, 2), 0, 8, "paddle"),
    top: k.solidSvg(k.slabOf({ ...BED, r: 7 }, -8, 8, TOP_PROJECTION, 6, 1), { tone: "mid", className: "bed" })
      + `<path class="water-still" d="${k.planOutline(TANK, 0, TOP_PROJECTION)}"/>`,
  };
}
