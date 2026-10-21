import { useId } from "react";
import { samplePulse, sampleWaveCycle, type SoundMedium } from "@/lib/wave-speed";
import {
  cylinder, depthOf, fitProjection, iso, knurl, pathOf, planOutline, ring, slabOf, topTicks,
  type Plan, type Point3, type SolidPaths,
} from "./iso/iso-kit";

export type SpeedAssembly = "panel" | "sensor-a" | "sensor-b" | "cursors" | "clamps" | "string" | "sample" | "particles" | "ruler";
export type SpeedBenchKind = "wave" | "pulse" | "string" | "sound";

/*
 * Figure concept: a rail-mounted optical bench accepts three interchangeable
 * subjects. A vertical profile panel records a travelling displacement wave
 * and a travelling pulse; a suspended string window shows a transverse wave;
 * a sectioned acoustic specimen shows a longitudinal wave. Only the phase
 * moves; apparatus dimensions and amplitude are schematic, never extra inputs
 * to the model.
 *
 * Parts inventory (shared + interchangeable, not decorative marks):
 * Base: 4 rubber pads, 4 levelling feet, chassis, raised bed, deck inlay,
 * rear/front retaining lips, 4 rail saddles, 2 raised rails, 4 end stops.
 * Profile insert: chart panel, 2 panel clamps + bolts, chart ruler, ticks,
 * 2 reading heads (foot, post, head), 2 index carriages + lock knobs +
 * 2 rising pointers, the traced wave.
 * String insert: 2 tension fixtures (footplate, 2 bolts, guide column, slide,
 * lower/upper jaw, screw neck, knurled head), pointer rail + ticks,
 * 2 index carriages + 2 rising pointers, the string with seated ends.
 * Acoustic insert: 2 support cradles, specimen/rod or cell floor, rear wall,
 * 2 end walls, material section, front cut lip; 2 coupled transducer bodies
 * and caps; compression bands and the particle lattice.
 * Camera: fixed 70° azimuth / 34° elevation. Rear structures precede the
 * subject; jaws, reading heads, the cell's cut lip and the front ruler follow
 * it. No exploded pose.
 */
const BASE: Plan = { x: -179, y: -58, w: 358, d: 116, r: 7 };
const DECK: Plan = { x: -145, y: -28, w: 290, d: 56, r: 2 };
const P = fitProjection(
  [-179, 179].flatMap(x => [-58, 58].flatMap(y => [-13, 76].map(z => [x, y, z] as Point3))),
  620, 330, { pad: 30, azimuth: 70, elevation: 34 },
);
const at = (point: Point3) => iso(point, P);
const line = (a: Point3, b: Point3) => pathOf([at(a), at(b)]);
const slab = (plan: Plan, z: number, height: number, bevel = 0.6) => slabOf(plan, z, height, P, 5, bevel);
const box = (x: number, y: number, w: number, d: number, z: number, h: number, r = 1.2) => slab({ x, y, w, d, r }, z, h);
const byDepth = <T extends { center: Point3 }>(parts: T[]) => parts.sort((a, b) => depthOf(a.center, P) - depthOf(b.center, P));

/* The chart: a vertical panel whose face carries the displacement profile. */
const PANEL_FACE = -27;
const PANEL_TOP = 52;
const PANEL_RULER: Plan = { x: -142, y: -26, w: 284, d: 9, r: 1 };
const PANEL_TICKS = topTicks(-135, 135, 4.5, 5, -25.1, 14.85, [3, 7], P);

/* The string: a suspended wire with its own pointer rail underneath. */
const STRING_RAIL: Plan = { x: -140, y: -9, w: 280, d: 9, r: 1 };
const STRING_TICKS = topTicks(-135, 135, 4.5, 5, -8.1, 17.85, [3, 7], P);

/* Displacement geometry on the chart and on the string. */
const WAVE_BASE = 30;
const WAVE_AMPLITUDE = 18;
const PULSE_AMPLITUDE = 22;
const STRING_Z = 43;
const STRING_AMPLITUDE = 16;
const TRACE_Z = 13.85;

/** Height of the drawn wave at world x, in the same units the chart uses. */
function waveHeight(kind: SpeedBenchKind, x: number, phase: number) {
  const u = (x + 135) / 270;
  if (kind === "pulse") return WAVE_BASE + PULSE_AMPLITUDE * samplePulse(u, phase);
  return WAVE_BASE + WAVE_AMPLITUDE * sampleWaveCycle(2 * u, phase);
}

const FEET = byDepth([-151, 151].flatMap(x => [-42, 42].map(y => ({
  center: [x, y, -9] as Point3,
  pad: cylinder(x, y, 9, -13, 3, P), foot: cylinder(x, y, 7, -10, 5, P),
}))));
const RAILS = [-40, 39].map(y => ({
  y,
  saddles: [-123, 123].map(x => box(x - 9, y - 7, 18, 14, 3, 6)),
  beam: box(-146, y - 6, 292, y > 0 ? 20 : 12, 9, 5),
  stops: [-145, 142].map(x => box(x, y - 6, 3, y > 0 ? 20 : 12, 14, 2.5)),
}));
const ART = {
  chassis: slab(BASE, -5, 8, 1.2),
  bed: box(-148, -31, 296, 62, 3, 10, 3),
  deck: slab(DECK, 13, 0.8, 0),
  lips: [-57, 54].map(y => box(-171, y, 342, 3, 3, 7)),
  ruler: slab({ x: -142, y: 44, w: 284, d: 9, r: 1 }, 14, 0.8, 0),
};
const PANEL_ART = {
  board: box(-146, PANEL_FACE - 3, 292, 3, 13.8, PANEL_TOP - 13.8, 1.2),
  clamps: [-140, 140].map(x => box(x - 7, PANEL_FACE - 7, 14, 11, 13.8, 6, 1.2)),
  ruler: slab(PANEL_RULER, 14, 0.8, 0),
  /* Two reading heads, one at each end of the measured distance. */
  heads: [-135, 135].map(x => ({
    x,
    foot: box(x - 7, -25.9, 14, 9, 14.8, 4, 1.2),
    post: box(x - 2.5, -23.9, 5, 5, 18.8, 15.2, 0.8),
    head: box(x - 6, PANEL_FACE + 0.1, 12, 7, 34, 9, 1),
  })),
};
const CLAMP_ART = [-157, 157].map(x => ({
  x,
  foot: box(x - 13, -21, 26, 42, 3, 4, 3),
  column: box(x - 6, -16, 12, 9, 7, 61),
  guide: box(x - 2, -7, 4, 0.8, 12, 51, 0.3),
}));

function Solid({ shape, tone = "structure" }: { shape: SolidPaths; tone?: "base" | "structure" | "paper" | "cursor" | "sample" | "cavity" }) {
  return <g className={`speed-solid speed-solid-${tone}`}>
    <path className="speed-solid-fill" d={shape.fill}/>
    {shape.shades.map((d, index) => <path className={`speed-shade-${index}`} d={d} key={index}/>)}
    <path className="speed-solid-top" d={shape.top}/>
    <path className="speed-solid-edge" d={shape.outline}/>
    {shape.bevel && <path className="speed-solid-bevel" d={shape.bevel}/>}
  </g>;
}

function Screw({ x, y, z }: { x: number; y: number; z: number }) {
  const [cx, cy] = at([x, y, z]);
  return <g><path className="speed-screw" d={ring(x, y, 1.5, z, P, 16)}/>
    <path className="speed-screw-slot" d={line([x - 0.9, y, z], [x + 0.9, y, z])}/>
    <circle className="speed-screw-dot" cx={cx} cy={cy} r="0.35"/></g>;
}

function Rail({ index }: { index: number }) {
  const rail = RAILS[index];
  return <g>
    {rail.saddles.map((shape, i) => <g key={i}><Solid shape={shape}/><Screw x={i ? 123 : -123} y={rail.y + 5.5} z={9}/></g>)}
    <Solid shape={rail.beam}/>
    <path className="speed-bench-groove" d={line([-146, rail.y + 3, 14.05], [146, rail.y + 3, 14.05])}/>
    {rail.stops.map((shape, i) => <Solid shape={shape} key={i}/>)}
  </g>;
}

/** The vertical chart panel: board, its clamps, its ruler and two reading heads. */
function ProfilePanel() {
  return <g className="speed-assembly" data-speed-assembly="panel">
    <Solid shape={PANEL_ART.board} tone="paper"/>
    {PANEL_ART.clamps.map((shape, index) => <g key={index}>
      <Solid shape={shape}/><Screw x={index ? 140 : -140} y={PANEL_FACE - 2} z={19.9}/>
    </g>)}
    <Solid shape={PANEL_ART.ruler} tone="paper"/>
    <path className="speed-tick" d={PANEL_TICKS.minor}/><path className="speed-major-tick" d={PANEL_TICKS.major}/>
    <path className="speed-ruler-zero" d={line([-135, -25.1, 14.9], [-135, -17.6, 14.9])}/>
    {[-139, 139].map(x => <Screw key={x} x={x} y={-22} z={14.85}/>)}
    {PANEL_ART.heads.map((head, index) => <g className="speed-assembly"
      data-speed-assembly={index ? "sensor-b" : "sensor-a"} key={head.x}>
      <Solid shape={head.foot}/><Solid shape={head.post}/><Solid shape={head.head}/>
      <Screw x={head.x - 5} y={-23} z={18.8}/>
    </g>)}
  </g>;
}

/** Index carriages that ride the scale and point at the wave. */
function IndexCursors({ kind, phase, valid, rail }: {
  kind: SpeedBenchKind; phase: number; valid: boolean; rail: "panel" | "string";
}) {
  if (!valid) return null;
  const first = (((kind === "pulse" ? 0 : 0.25) + phase) % 1) / 2;
  const cursors = kind === "pulse" ? [phase] : [first, first + 0.5];
  const panel = rail === "panel";
  const base = panel ? 14.8 : 17.8;
  const carriageY = panel ? -26.9 : -9;
  const pointerY = panel ? PANEL_FACE + 0.1 : -2;
  return <g className="speed-assembly" data-speed-assembly="cursors">
    {cursors.map((u, index) => {
      const x = -135 + 270 * u;
      const top = panel ? waveHeight(kind, x, phase)
        : STRING_Z + STRING_AMPLITUDE * sampleWaveCycle(2 * (x + 135) / 270, phase);
      return <g key={index} data-speed-cursor={u}>
        <Solid shape={box(x - 4, carriageY, 8, 8, base, 4, 1)} tone="cursor"/>
        <Solid shape={cylinder(x, carriageY + 5, 1.8, base + 4, 1.7, P, 16)} tone="cursor"/>
        <Solid shape={box(x - 1, pointerY, 2, 2, base + 4, top - base - 4, 0.4)} tone="cursor"/>
      </g>;
    })}
  </g>;
}

function StringFixtures({ phase, valid, front }: { phase: number; valid: boolean; front: boolean }) {
  return <g className="speed-assembly" data-speed-assembly="clamps">
    {CLAMP_ART.map(({ x, foot, column, guide }) => {
      // The following jaws seat the travelling waveform, not fixed-end nodes.
      const end = x < 0 ? -151 : 151;
      const z = STRING_Z + (valid ? STRING_AMPLITUDE * sampleWaveCycle((end + 135) / 135, phase) : 0);
      return <g key={x}>{front ? <>
        <Solid shape={box(x - 8, -7, 16, 12, z - 5, 10)}/>
        <Solid shape={box(x < 0 ? x - 8 : 151, -4, 14, 8, z - 3, 3)} tone="sample"/>
        <Solid shape={box(x < 0 ? x - 8 : 151, -4, 14, 8, z, 3)} tone="sample"/>
        <Solid shape={cylinder(x, 0, 2.2, z + 3, 2, P)}/>
        <Solid shape={cylinder(x, 0, 4.2, z + 5, 3.5, P, 24, 0.4)}/>
        <path className="speed-knurl" d={knurl(x, 0, 4.2, z + 5, z + 8.5, 24, P)}/>
      </> : <>
        <Solid shape={foot}/><Screw x={x} y={-18} z={7}/><Screw x={x} y={18} z={7}/>
        <Solid shape={column}/><Solid shape={guide} tone="sample"/>
      </>}</g>;
    })}
  </g>;
}

/** The subject itself: a travelling wave on the chart, or a string over its rail. */
function Trace({ kind, phase, valid }: { kind: SpeedBenchKind; phase: number; valid: boolean }) {
  if (!valid) return null;
  const string = kind === "string";
  const from = string ? -151 : -135;
  const to = string ? 151 : 135;
  const points = Array.from({ length: 281 }, (_, index) => {
    const x = from + (to - from) * index / 280;
    const u = (x + 135) / 270;
    if (string) {
      return [x, 0, STRING_Z + STRING_AMPLITUDE * sampleWaveCycle(2 * u, phase)] as Point3;
    }
    return [x, PANEL_FACE + 0.1, waveHeight(kind, x, phase)] as Point3;
  });
  const d = pathOf(points.map(at));
  return <g className="speed-assembly" data-speed-assembly={string ? "string" : "trace"}>
    {string && <path className="speed-string-shadow" d={pathOf(points.map(([x]) => at([x, 0, TRACE_Z])))}/>}
    <path className={string ? "speed-string-core" : "speed-trace-underlay"} d={d}/>
    <path className={string ? "speed-travelling-string" : "speed-trace"} d={d}/>
  </g>;
}

function AcousticSample({ medium, rod, front = false }: { medium: SoundMedium; rod: boolean; front?: boolean }) {
  const cell = medium !== "solid";
  return <g className="speed-assembly" data-speed-assembly="sample">
    {front ? cell && <Solid shape={box(-144, 22, 288, 4, 18, 8)} tone="sample"/> : <>
      {rod ? <>
        {[-112, 112].map(x => <g key={x}>
          <Solid shape={box(x - 8, -14, 16, 28, 13.8, 4)}/>
          <Solid shape={box(x - 5, -9, 10, 18, 17.8, 15.2)}/>
          <Screw x={x} y={11} z={17.8}/>
        </g>)}
        <Solid shape={box(-144, -6, 288, 12, 33, 10, 2)} tone="sample"/>
      </> : cell ? <>
        <Solid shape={box(-144, -26, 288, 52, 13.8, 4)} tone="structure"/>
        <Solid shape={box(-144, -26, 288, 4, 17.8, 32)} tone="sample"/>
        <Solid shape={box(-144, -22, 5, 44, 17.8, 32)} tone="structure"/>
        <Solid shape={box(-139, -22, 278, 44, 17.8, 21.2)} tone={medium === "gas" ? "cavity" : "sample"}/>
        <Solid shape={box(139, -22, 5, 44, 17.8, 32)} tone="structure"/>
      </> : <Solid shape={box(-144, -23, 288, 46, 13.8, 32.2, 2)} tone="sample"/>}
    </>}
  </g>;
}

function Transducers() {
  return <>{[-1, 1].map(side => <g className="speed-assembly" data-speed-assembly={side < 0 ? "sensor-a" : "sensor-b"} key={side}>
    <Solid shape={box(side < 0 ? -172 : 148, -17, 24, 34, 3, 4)}/>
    <Screw x={side * 160} y={-13} z={7}/><Screw x={side * 160} y={13} z={7}/>
    <Solid shape={box(side < 0 ? -166 : 154, -7, 12, 14, 7, 24)}/>
    <Solid shape={box(side < 0 ? -168 : 144, -10, 24, 20, 31, 12)}/>
    <Solid shape={box(side < 0 ? -171 : 168, -11, 3, 22, 30, 14)} tone="sample"/>
    <Screw x={side * 160} y={0} z={43}/>
  </g>)}</>;
}

function Particles({ phase, valid, medium, rod }: { phase: number; valid: boolean; medium: SoundMedium; rod: boolean }) {
  if (!valid) return null;
  const z = medium === "solid" ? rod ? 43.3 : 46.3 : 39.3;
  const rows = rod ? [-4, 0, 4] : [-14, 0, 14];
  const first = (((0.5 + phase) % 1) / 2);
  return <g className="speed-assembly" data-speed-assembly="particles">
    {[first, first + 0.5].map(u => <path key={u} className="speed-compression-band"
      d={planOutline({ x: -135 + 270 * u - 3, y: rows[0] - 2, w: 6, d: 2 * (rows[2] + 2), r: 1 }, z, P)}/>)}
    {rows.flatMap(y => Array.from({ length: 49 }, (_, index) => {
      const u = (index + 0.5) / 49;
      const x = -135 + 270 * u + 4 * sampleWaveCycle(2 * u, phase);
      const [cx, cy] = at([x, y, z]);
      const tracked = index === 24 && y === 0;
      return <circle className={tracked ? "speed-tracked-particle" : "speed-particle"} cx={cx} cy={cy}
        r={tracked ? 2.8 : rod ? 1 : 1.5} key={`${y}-${index}`}/>;
    }))}
  </g>;
}

export function SpeedBenchArt({ kind, phase, valid, medium = "solid", solidMode = "bulk" }: {
  kind: SpeedBenchKind; phase: number; valid: boolean; medium?: SoundMedium; solidMode?: "bulk" | "rod";
}) {
  const id = useId();
  const sound = kind === "sound";
  const string = kind === "string";
  const chart = kind === "wave" || kind === "pulse";
  const rod = medium === "solid" && solidMode === "rod";
  const title = !valid ? "Measuring bench awaiting valid inputs" : string ? "Travelling string suspended between tension fixtures"
    : sound ? `${medium === "solid" ? rod ? "Thin rod" : "Bulk solid specimen" : `${medium} acoustic cell`}: longitudinal particle displacement`
      : kind === "pulse" ? "A pulse crossing the measured distance between Sensor A and Sensor B" : "Raised optical bench with a two-wavelength displacement trace";
  return <svg className="speed-bench" viewBox="0 0 620 330" role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    data-kind={kind} data-medium={sound ? medium : undefined} data-solid-mode={sound && medium === "solid" ? solidMode : undefined}>
    <title id={`${id}-title`}>{title}</title>
    <desc id={`${id}-description`}>{string
      ? "A real-height string above the deck, with sliding jaws seated on guide columns. The ruler is an auto-scaled two-wavelength observation window, not the complete string length. Jaws follow the schematic displacement; they do not impose fixed nodes."
      : sound ? "A supported material sample with end-coupled transducers. A sectioned cell represents gas or liquid, a thick specimen represents bulk solid, and a slender supported bar represents the thin-rod model. Dots show longitudinal oscillation on a schematic section, not particles carried along by the wave. Specimen dimensions do not set the sound speed."
        : "A bevelled chassis on four levelling feet supports raised rails and a ruled deck. A vertical chart panel stands along the back edge; the traced displacement is recorded on its face, with two reading heads at the ends of the measured distance and index carriages whose pointers rise to the wave. The window spans two wavelengths and is auto-scaled."} All amplitudes and apparatus dimensions are illustrative. Use the HTML legend below to highlight assemblies. {valid ? "Time changes only when you scrub or advance the snapshot." : "The dynamic subject and cursors are hidden until the inputs are valid."}</desc>
    <path className="speed-bench-shadow" d={planOutline({ ...BASE, x: -187, y: -66, w: 374, d: 132 }, -13, P)}/>
    {FEET.map((foot, index) => <g key={index}><Solid shape={foot.pad} tone="base"/><Solid shape={foot.foot}/></g>)}
    <Solid shape={ART.chassis} tone="base"/>
    <path className="speed-bench-groove" d={planOutline({ x: -174, y: -53, w: 348, d: 106, r: 4 }, 3.05, P)}/>
    {[-169, 169].flatMap(x => [-48, 48].map(y => <Screw key={`${x}-${y}`} x={x} y={y} z={3.1}/>))}
    <Solid shape={ART.lips[0]} tone="base"/>
    <Rail index={0}/>
    <path className="speed-contact-shadow" d={planOutline({ ...DECK, x: -148, y: -31, w: 296, d: 62 }, 3.1, P)}/>
    <Solid shape={ART.bed}/><Solid shape={ART.deck} tone="paper"/>
    <path className="speed-deck-border" d={planOutline({ x: -141, y: -24, w: 282, d: 48, r: 1 }, TRACE_Z, P)}/>
    {!sound && !string && <path className="speed-trace-axis" d={line([-145, 0, TRACE_Z], [145, 0, TRACE_Z])}/>}
    {chart ? <ProfilePanel/> : string ? <StringFixtures phase={phase} valid={valid} front={false}/> : <AcousticSample medium={medium} rod={rod}/>}
    {sound ? <Particles phase={phase} valid={valid} medium={medium} rod={rod}/> : <Trace kind={kind} phase={phase} valid={valid}/>}
    {chart ? <>
      <IndexCursors kind={kind} phase={phase} valid={valid} rail="panel"/>
    </> : string ? <>
      <Solid shape={slab(STRING_RAIL, 13.8, 4, 1)}/>
      <path className="speed-tick" d={STRING_TICKS.minor}/><path className="speed-major-tick" d={STRING_TICKS.major}/>
      {[-137, 137].map(x => <Screw key={x} x={x} y={-5} z={17.85}/>)}
      <IndexCursors kind={kind} phase={phase} valid={valid} rail="string"/>
      <StringFixtures phase={phase} valid={valid} front/>
    </> : <><AcousticSample medium={medium} rod={rod} front/><Transducers/></>}
    {sound && <>
      <Rail index={1}/><Solid shape={ART.ruler} tone="paper"/>
      <path className="speed-tick" d={topTicks(-135, 135, 4.5, 5, 44.1, 14.85, [3, 7], P).minor}/>
      <path className="speed-major-tick" d={topTicks(-135, 135, 4.5, 5, 44.1, 14.85, [3, 7], P).major}/>
      {[-139, 139].map(x => <Screw key={x} x={x} y={49} z={14.85}/>)}
    </>}
    <Solid shape={ART.lips[1]} tone="base"/>
  </svg>;
}
