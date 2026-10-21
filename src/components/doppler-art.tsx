import type { ReactNode } from 'react';

export type DopplerAssembly = 'source' | 'observer' | 'crests' | 'medium';

/*
 * Figure concept: a stationary acoustic rail bench carries a right-facing speaker
 * and an omnidirectional microphone. Only the lighting selects an assembly; no
 * part moves. The point-source overlay remains in the horizontal medium frame.
 *
 * Purposeful parts, grouped (70 solids, excluding screws and surface details):
 * Bed: 1–4 rubber foot pads, 5–8 levelling feet, 9 bed casting, 10 inset deck,
 * 11–14 rail saddles, 15–16 guide rails, 17–18 end stops, 19 ruler strip.
 * Each of two carriages: 20–23 / 35–38 bearing shoes, 24 / 39 carriage plate,
 * 25 / 40 post socket, 26 / 41 upright, 27 / 42 split clamp,
 * 28 / 43 lock-screw neck, 29 / 44 knurled lock wheel,
 * 30 / 45 wheel cap, 31 / 46 post collar, 32 / 47 mounting saddle,
 * 33 / 48 index tab, 34 / 49 carriage brake.
 * Speaker: 50 cabinet, 51 recessed baffle, 52 driver flange, 53 rubber surround,
 * 54 cone, 55 dust cap, 56–57 protective grille bars, 58–59 saddle cheeks,
 * 60 rear service cover; baffle screws, grille mounts and ventilation slots.
 * Receiver: 61 lower ferrule, 62 body, 63 capsule grille, 64 crown,
 * 65 lower grille ring, 66 upper grille ring, 67 isolation seat,
 * 68–69 cradle cheeks, 70 socket collar; grille wires and capsule seams.
 * Bed screws, bearing screws, clamp splits, rail glints and rooted ruler ticks
 * complete real joints rather than adding unrelated surface noise.
 *
 * One cabinet projection throughout: p(X,Y,Z) = (X + .6Y, 264 - .3Y - Z).
 * X stays horizontal to preserve the existing wavefront coordinate contract.
 * The speaker baffle is the +X end plane, not a screen-space rectangle: its
 * complete face uses matrix(.6,-.3,0,1). Its centre is exactly (273,142).
 * Painter order: feet → bed → saddles → rails → shoes → carriage → post → head;
 * rear cradle cheeks precede each head, near cheeks follow it. No exploded pose.
 */
type Point = readonly [number, number, number];
const DX = 0.6;
const DY = 0.48;
const BED_Y = 264;
const DEPTH = 22;
const SENSOR_Z = BED_Y - DY * DEPTH - 142;
const sourceX = 273 - DX * DEPTH;
const observerX = 510 - DX * DEPTH;
const project = ([x, y, z]: Point) => [x + DX * y, BED_Y - DY * y - z] as const;

/** The bench's own footprint, projected, so the shadow always meets the feet. */
const BED_FOOT = [project([41, 0, -30] as Point), project([667, 0, -30] as Point), project([667, 47, -30] as Point), project([41, 47, -30] as Point)] as const;

/**
 * The wavefronts live in the horizontal medium plane at the diaphragm height.
 * A circle in that plane is seen as a flat ellipse, so each crest is drawn as
 * an ellipse whose centre is where the crest was actually emitted.
 */
export function dopplerWavefrontPath(centreOffsetPx: number, radiusPx: number) {
  const centreX = 273 + centreOffsetPx;
  const centreY = 142;
  const steps = 72;
  let d = '';
  for (let index = 0; index <= steps; index++) {
    const angle = (index / steps) * Math.PI * 2;
    const x = centreX + radiusPx * Math.cos(angle) + DX * radiusPx * Math.sin(angle);
    const y = centreY - DY * radiusPx * Math.sin(angle);
    d += `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d + 'Z';
}

/** The region of the medium the crests are drawn in: behind the instrument line. */
export const DOPPLER_MEDIUM_CLIP = [
  project([-60, -167, SENSOR_Z] as Point), project([780, -167, SENSOR_Z] as Point),
  project([780, 286, SENSOR_Z] as Point), project([-60, 286, SENSOR_Z] as Point),
].map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z';
const path = (points: readonly Point[], close = true) => points.map((point, index) => `${index ? 'L' : 'M'}${project(point).join(',')}`).join(' ') + (close ? ' Z' : '');

function Block({ x, y, z, w, d, h, className = '', children }: {
  x: number; y: number; z: number; w: number; d: number; h: number;
  className?: string; children?: ReactNode;
}) {
  return (
    <g className={`doppler-solid ${className}`}>
      <path className="doppler-solid-front" d={path([[x, y, z], [x + w, y, z], [x + w, y, z + h], [x, y, z + h]])} />
      <path className="doppler-solid-side" d={path([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])} />
      <path className="doppler-solid-top" d={path([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])} />
      {children}
      <path className="doppler-solid-bevel" d={path([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h]], false)} />
    </g>
  );
}

function Screw({ x, y, z, top = false, small = false }: { x: number; y: number; z: number; top?: boolean; small?: boolean }) {
  const [cx, cy] = project([x, y, z]);
  return (
    <g className="doppler-fastener" transform={`translate(${cx} ${cy})${top ? ' matrix(1 0 .6 -.3 0 0)' : ''}`}>
      <circle r={small ? 1.6 : 2.5} />
      <path d={small ? 'M-.7 0 H.7' : 'M-1.2 0 H1.2 M0 -1.2 V1.2'} />
    </g>
  );
}

function circleAt(x: number, y: number, z: number, radius: number, from = 0, to = Math.PI * 2, steps = 40) {
  return Array.from({ length: steps + 1 }, (_, index): Point => {
    const angle = from + (to - from) * index / steps;
    return [x + radius * Math.cos(angle), y + radius * Math.sin(angle), z];
  });
}

function Cylinder({ x, y, z, r, h, className = '', knurled = false }: {
  x: number; y: number; z: number; r: number; h: number; className?: string; knurled?: boolean;
}) {
  const right = Math.atan(DX);
  const front = circleAt(x, y, z, r, right + Math.PI, right + Math.PI * 2, 24);
  const upper = circleAt(x, y, z + h, r, right + Math.PI, right + Math.PI * 2, 24);
  return (
    <g className={`doppler-turned ${className}`}>
      <path className="doppler-turned-wall" d={path([...front, ...upper.toReversed()])} />
      {knurled && Array.from({ length: 13 }, (_, index) => {
        const angle = right + Math.PI + (index + 0.5) / 13 * Math.PI;
        const px = x + r * Math.cos(angle);
        const py = y + r * Math.sin(angle);
        return <path key={index} className="doppler-knurl" d={path([[px, py, z], [px, py, z + h]], false)} />;
      })}
      <path className="doppler-turned-cap" d={path(circleAt(x, y, z + h, r))} />
      <path className="doppler-turned-lip" d={path(upper, false)} />
    </g>
  );
}

export function DopplerArtDefs({ id }: { id: string }) {
  return (
    <>
      <linearGradient id={`${id}-metal`} x1="0" x2="1" y1="0" y2="0">
        <stop className="doppler-metal-dark" offset="0" />
        <stop className="doppler-metal-mid" offset=".23" />
        <stop className="doppler-metal-light" offset=".43" />
        <stop className="doppler-metal-mid" offset=".67" />
        <stop className="doppler-metal-dark" offset="1" />
      </linearGradient>
      <linearGradient id={`${id}-cone`} x1="0" x2=".85" y1="0" y2="1">
        <stop className="doppler-cone-light" offset="0" />
        <stop className="doppler-cone-dark" offset=".6" />
        <stop className="doppler-cone-mid" offset="1" />
      </linearGradient>
      <filter id={`${id}-contact`} x="-30%" y="-100%" width="160%" height="300%">
        <feGaussianBlur stdDeviation="3" />
      </filter>
    </>
  );
}

const BED_ART = (
  <g key="bed">
    {[68, 625].flatMap((x) => [5, 35].map((y) => (
      <g key={`${x}-${y}`}>
        <Block className="doppler-rubber" x={x} y={y} z={-30} w={22} d={11} h={4} />
        <Block x={x + 3} y={y + 1} z={-26} w={16} d={9} h={10} />
      </g>
    )))}
    <Block className="doppler-bed-casting" x={41} y={0} z={-16} w={626} d={47} h={16}>
      <path className="doppler-bed-seam" d={path([[41, 0, -6], [667, 0, -6], [667, 47, -6]], false)} />
    </Block>
    <Block className="doppler-deck" x={49} y={4} z={0} w={609} d={38} h={1} />
    {[57, 649].flatMap((x) => [8, 37].map((y) => <Screw key={`${x}-${y}`} x={x} y={y} z={1} top />))}
    {[77, 621].flatMap((x) => [7, 31].map((y) => (
      <Block key={`${x}-${y}`} x={x} y={y} z={1} w={17} d={9} h={3} />
    )))}
    {[10, 34].map((y) => (
      <Block key={y} className="doppler-guide-rail" x={78} y={y} z={4} w={558} d={4} h={7}>
        <path className="doppler-rail-glint" d={path([[78, y, 10], [636, y, 10]], false)} />
      </Block>
    ))}
    {[75, 631].map((x) => (
      <Block key={x} x={x} y={6} z={4} w={7} d={35} h={13}>
        {[12, 34].map((y) => <Screw key={y} x={x + 3.5} y={y} z={17} top small />)}
      </Block>
    ))}
    <Block className="doppler-ruler-strip" x={103} y={0} z={-12} w={506} d={0.8} h={7}>
      {Array.from({ length: 63 }, (_, index) => (
        <path key={index} className="doppler-ruler-tick" d={path([[108 + index * 8, 0, -12], [108 + index * 8, 0, index % 5 === 0 ? -6 : -9]], false)} />
      ))}
      {[105, 606].map((x) => <Screw key={x} x={x} y={0} z={-8.5} small />)}
    </Block>
  </g>
);

export function DopplerBench({ highlighted, id }: { highlighted: boolean; id: string }) {
  const centreX = (BED_FOOT[0][0] + BED_FOOT[2][0]) / 2;
  const centreY = (BED_FOOT[0][1] + BED_FOOT[2][1]) / 2;
  const radiusX = Math.abs(BED_FOOT[2][0] - BED_FOOT[0][0]) / 2;
  const radiusY = Math.abs(BED_FOOT[2][1] - BED_FOOT[0][1]) / 2;
  return (
    <g className="doppler-assembly doppler-medium-assembly" data-assembly="medium" data-highlighted={highlighted}>
      <ellipse className="doppler-bench-shadow" cx={centreX} cy={centreY + 4} rx={radiusX} ry={radiusY + 3} filter={`url(#${id}-contact)`} />
      <ellipse className="doppler-contact-light" cx={centreX} cy={centreY - 6} rx={radiusX - 18} ry={radiusY} filter={`url(#${id}-contact)`} />
      {BED_ART}
    </g>
  );
}

function Carriage({ x, top }: { x: number; top: number }) {
  return (
    <>
      {[-25, 17].flatMap((offset) => [8, 31].map((y) => (
        <Block key={`${offset}-${y}`} x={x + offset} y={y} z={11} w={10} d={8} h={5}>
          <Screw x={x + offset + 5} y={y + 4} z={16} top small />
        </Block>
      )))}
      <Block x={x - 30} y={5} z={16} w={60} d={35} h={8}>
        <path className="doppler-carriage-seam" d={path([[x - 27, 8, 24], [x + 27, 8, 24], [x + 27, 37, 24], [x - 27, 37, 24]])} />
        {[-24, 24].flatMap((offset) => [10, 34].map((y) => <Screw key={`${offset}-${y}`} x={x + offset} y={y} z={24} top small />))}
      </Block>
      <Block x={x - 2} y={1} z={10} w={4} d={4} h={14} />
      <Block className="doppler-brake" x={x + 18} y={2} z={22} w={9} d={7} h={5} />
      <Cylinder x={x} y={DEPTH} z={24} r={10} h={5} />
      <Cylinder x={x} y={DEPTH} z={29} r={3.6} h={top - 29} />
      <Block x={x - 8} y={14} z={48} w={16} d={16} h={9}>
        <path className="doppler-clamp-split" d={path([[x, 14, 48], [x, 14, 57], [x, 30, 57]], false)} />
        <Screw x={x - 4.5} y={14} z={52.5} small />
      </Block>
      <Block x={x + 8} y={18} z={50} w={5} d={6} h={4} />
      <Cylinder x={x + 15} y={DEPTH} z={47} r={5} h={9} knurled />
      <Cylinder x={x + 15} y={DEPTH} z={56} r={4.1} h={1} />
      <Cylinder x={x} y={DEPTH} z={top - 6} r={6} h={6} />
      <Block x={x - 10} y={8} z={top} w={20} d={28} h={6} />
    </>
  );
}

function Speaker() {
  const back = sourceX - 38;
  const bottom = SENSOR_Z - 36;
  const stand = sourceX - 19;
  return (
    <>
      <Carriage x={stand} top={bottom - 6} />
      <Block x={stand - 13} y={32} z={bottom} w={26} d={5} h={16} />
      <Block className="doppler-speaker-cabinet" x={back} y={-14} z={bottom} w={38} d={72} h={72}>
        <path className="doppler-cabinet-seam" d={path([[back + 5, -14, bottom], [back + 5, -14, bottom + 72], [back + 5, 58, bottom + 72]], false)} />
        <g className="doppler-service-cover" transform={`translate(${back + 7 + DX * -14} ${BED_Y - DY * -14 - bottom - 58})`}>
          <rect width="22" height="44" rx="2" />
          {[8, 14, 20, 26, 32].map((y) => <rect className="doppler-vent-slot" key={y} x="5" y={y} width="12" height="2" rx="1" />)}
          {[4, 40].map((y) => <circle className="doppler-cover-screw" key={y} cx="11" cy={y} r="1" />)}
        </g>
      </Block>
      <g className="doppler-speaker-baffle" transform="matrix(.6 -.3 0 1 273 142)">
        <rect className="doppler-speaker-face" x="-33" y="-33" width="66" height="66" rx="3" />
        <circle className="doppler-speaker-flange" r="29" />
        <circle className="doppler-speaker-surround" r="25.5" />
        <circle className="doppler-speaker-cone" r="21" />
        <circle className="doppler-speaker-cone-seam" r="13" />
        <circle className="doppler-speaker-dustcap" r="7" data-source-centre="true" />
        {[-28, 28].flatMap((x) => [-28, 28].map((y) => (
          <g key={`${x}-${y}`} className="doppler-fastener" transform={`translate(${x} ${y})`}>
            <circle r="2" /><path d="M-1 0 H1" />
          </g>
        )))}
        {[-12, 12].map((x) => (
          <g key={x}>
            <path className="doppler-grille-shadow" d={`M${x + 1.5} -25 V25`} />
            <path className="doppler-speaker-grille" d={`M${x} -25 V25`} />
            {[-25, 25].map((y) => <circle key={y} className="doppler-grille-mount" cx={x} cy={y} r="1.8" />)}
          </g>
        ))}
      </g>
      <Block x={stand - 13} y={6} z={bottom} w={26} d={5} h={12}>
        <Screw x={stand} y={6} z={bottom + 6} />
      </Block>
    </>
  );
}

function Microphone() {
  const x = observerX;
  return (
    <>
      <Carriage x={x} top={87} />
      <Cylinder x={x} y={DEPTH} z={93} r={7} h={3} className="doppler-rubber" />
      <Block x={x - 10} y={29} z={94} w={20} d={4} h={13} />
      <Cylinder x={x} y={DEPTH} z={96} r={8.5} h={5} />
      <Cylinder x={x} y={DEPTH} z={101} r={8} h={5} />
      <Cylinder x={x} y={DEPTH} z={106} r={10.5} h={27} className="doppler-microphone-grille" />
      {Array.from({ length: 7 }, (_, index) => (
        <path key={index} className="doppler-grille-wire" d={path(circleAt(x, DEPTH, 108 + index * 3.5, 10.6, Math.atan(DX) + Math.PI, Math.atan(DX) + Math.PI * 2), false)} />
      ))}
      {Array.from({ length: 7 }, (_, index) => {
        const angle = Math.atan(DX) + Math.PI + (index + 1) / 8 * Math.PI;
        const px = x + 10.6 * Math.cos(angle);
        const py = DEPTH + 10.6 * Math.sin(angle);
        return <path key={index} className="doppler-grille-wire doppler-grille-longitudinal" d={path([[px, py, 106], [px, py, 133]], false)} />;
      })}
      <Cylinder x={x} y={DEPTH} z={106} r={11} h={1.5} />
      <Cylinder x={x} y={DEPTH} z={132} r={11} h={2} />
      <Cylinder x={x} y={DEPTH} z={134} r={9} h={2} />
      <Block x={x - 10} y={11} z={94} w={20} d={4} h={10}>
        <Screw x={x} y={11} z={99} />
      </Block>
      <Cylinder x={x} y={DEPTH} z={87} r={8.5} h={3} />
    </>
  );
}

const SOURCE_ART = <Speaker key="speaker" />;
const OBSERVER_ART = <Microphone key="microphone" />;

export function DopplerInstrument({ source, highlighted, id }: { source: boolean; highlighted: boolean; id: string }) {
  const carriage = source ? sourceX - 19 : observerX;
  const foot = [project([carriage - 30, 5, 16] as Point), project([carriage + 30, 5, 16] as Point),
    project([carriage + 30, 40, 16] as Point), project([carriage - 30, 40, 16] as Point)] as const;
  const shadowX = (foot[0][0] + foot[2][0]) / 2;
  const shadowY = (foot[0][1] + foot[2][1]) / 2;
  const shadowRx = Math.abs(foot[2][0] - foot[0][0]) / 2;
  const shadowRy = Math.abs(foot[2][1] - foot[0][1]) / 2;
  return (
    <g
      className={`doppler-assembly doppler-${source ? 'source' : 'observer'}-assembly`}
      data-assembly={source ? 'source' : 'observer'}
      data-highlighted={highlighted}
      data-position-x={source ? 273 : 510}
      data-position-y="142"
    >
      <ellipse className="doppler-contact-shadow" cx={shadowX} cy={shadowY + 3} rx={shadowRx} ry={shadowRy} filter={`url(#${id}-contact)`} />
      <ellipse className="doppler-contact-light" cx={shadowX} cy={shadowY - 4} rx={shadowRx + 7} ry={shadowRy + 2} filter={`url(#${id}-contact)`} />
      {source ? SOURCE_ART : OBSERVER_ART}
    </g>
  );
}
