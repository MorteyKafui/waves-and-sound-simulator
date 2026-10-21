"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { createWaveSampler, type Experiment, type WaveParameters } from "@/lib/wave-physics";
import { at, planeMatrix, worldAt, PROJECTION, TOP_PROJECTION, TANK, VIEW_HEIGHT, VIEW_WIDTH } from "./view";
import { lineOnTop, planOutline, slabOf, solidSvg, translateAlong } from "@/components/iso/iso-kit";
import type { TankArtwork } from "./art";

export interface ProbePoint { x: number; y: number }
export interface TankProps {
  art: TankArtwork; experiment: Experiment; parameters: WaveParameters;
  playing: boolean; speed: number; display: "elevation" | "envelope";
  grid: boolean; top: boolean; resetKey: number; stepKey: number;
  probe: ProbePoint; onProbeChange: (point: ProbePoint) => void;
  clockRef: RefObject<number>;
  /** Which assembly the reader is inspecting; empty means none. */
  inspect: string;
  onInspect: (part: string) => void;
}
const NX = 256;
const NY = 192;

/* The apparatus legend: what each part of the bench is and what it does. */
const APPARATUS: Record<Experiment, { id: string; label: string; description: string; readout: string }[]> = {
  reflection: [
    { id: "sources", label: "Dipper", description: "A ball on a stem, driven up and down at the set frequency.", readout: "The dipper is the only thing making waves. Change the frequency and the whole field changes with it." },
    { id: "barrier", label: "Rigid wall", description: "A solid barrier standing across the tank.", readout: "A rigid wall cannot move, so a crest returns as a crest: no phase inversion, and a node at the wall." },
  ],
  refraction: [
    { id: "sources", label: "Dipper", description: "A ball on a stem, driven up and down at the set frequency.", readout: "The dipper sets the frequency. Frequency never changes when the wave crosses into the shallower water." },
    { id: "depth", label: "Depth step", description: "A change of water depth halfway along the tank.", readout: "The step changes the phase speed, so the wavefront bends while its frequency stays the same." },
  ],
  diffraction: [
    { id: "sources", label: "Dipper", description: "A ball on a stem, driven up and down at the set frequency.", readout: "The dipper sets the frequency. A narrow gap then radiates almost like a point source." },
    { id: "aperture", label: "Aperture", description: "Two jaws leaving a gap of the set width.", readout: "Every point in the opening radiates. The ratio of gap width to wavelength decides how far the wave spreads." },
  ],
  interference: [
    { id: "sources", label: "Dipper A and B", description: "Two driven balls, at the set separation and relative phase.", readout: "Two coherent sources add. Equal phase reinforces; half a cycle out of phase cancels." },
  ],
};
const PROBE_PART = {
  id: "probe", label: "Probe",
  description: "A pointer you drag over the water to read the local elevation.",
  readout: "The probe reads the elevation at one point, in millimetres. It never moves the water.",
};

function apparatus(experiment: Experiment, parameters: WaveParameters, top: boolean) {
  const P = top ? TOP_PROJECTION : PROJECTION;
  const box = (x: number, y: number, w: number, d: number, z: number, h: number, cls: string) =>
    solidSvg(slabOf({ x, y, w, d, r: 1 }, z, h, P, 4, 0.5), { tone: "hi", className: cls });
  switch (experiment) {
    case "reflection": return box(100, -150, 7, 300, 0, 11, "barrier");
    case "diffraction": {
      const gap = parameters.slitWidth;
      return box(-43.5, -150, 7, 150 - gap / 2, 0, 10, "barrier")
        + box(-43.5, gap / 2, 7, 150 - gap / 2, 0, 10, "barrier");
    }
    case "refraction": return `<path class="depth-step" d="${planOutline({ x: 0, y: -150, w: 200, d: 300, r: 0 }, 0, P)}"/>`
      + `<path class="step-boundary" d="${lineOnTop([0, -150], [0, 150], 0.3, P)}"/>`;
    default: return "";
  }
}

/** Static SVG hardware surrounds a registered Canvas 2D water plane. */
export function Tank(props: TankProps) {
  const { art, experiment, parameters, playing, speed, display, grid, top, probe, onProbeChange, clockRef, resetKey, stepKey, inspect, onInspect } = props;
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const sourceA = useRef<SVGGElement>(null);
  const sourceB = useRef<SVGGElement>(null);
  const repaintRef = useRef<(() => void) | null>(null);
  const dragRef = useRef(false);
  const probeRef = useRef(probe);
  const lastReset = useRef(resetKey);
  const lastStep = useRef(stepKey);
  const field = useMemo(() => {
    const sampler = createWaveSampler(experiment, parameters);
    const real = new Float32Array(NX * NY);
    const imag = new Float32Array(NX * NY);
    for (let y = 0; y < NY; y++) {
      for (let x = 0; x < NX; x++) {
        const sample = sampler.samplePhasor(-200 + (x + 0.5) * 400 / NX, -150 + (y + 0.5) * 300 / NY);
        real[y * NX + x] = sample.real;
        imag[y * NX + x] = sample.imag;
      }
    }
    return { sampler, real, imag };
  }, [experiment, parameters]);
  const insert = useMemo(() => apparatus(experiment, parameters, top), [experiment, parameters, top]);

  useEffect(() => {
    probeRef.current = probe;
    repaintRef.current?.();
  }, [probe]);

  useEffect(() => {
    if (lastReset.current !== resetKey) {
      clockRef.current = 0;
      lastReset.current = resetKey;
      repaintRef.current?.();
    }
  }, [resetKey, clockRef]);

  useEffect(() => {
    if (lastStep.current !== stepKey) {
      clockRef.current += 1 / 240;
      lastStep.current = stepKey;
      repaintRef.current?.();
    }
  }, [stepKey, clockRef]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return; // The SVG still-water plane and apparatus remain readable.
    const texture = document.createElement("canvas");
    texture.width = NX; texture.height = NY;
    const tx = texture.getContext("2d");
    if (!tx) return;
    const image = tx.createImageData(NX, NY);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = 0;
    let lastPaint = 0;
    let visible = true;
    let disposed = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = VIEW_WIDTH * dpr;
    canvas.height = VIEW_HEIGHT * dpr;


    function draw() {
      if (!context || !tx || !canvas) return;
      const t = clockRef.current;
      const cos = Math.cos(field.sampler.omega * t);
      const sin = Math.sin(field.sampler.omega * t);
      const ink = image.data;
      for (let i = 0; i < NX * NY; i++) {
        const re = field.real[i], im = field.imag[i];
        const value = display === "envelope" ? Math.hypot(re, im) : re * cos + im * sin;
        // Qualitative, contrast-enhanced ink. Only the probe claims elevation units.
        const level = Math.tanh(value * parameters.amplitude * 5);
        const positive = Math.max(0, level), negative = Math.max(0, -level);
        const offset = i * 4;
        // Preserve the water's blue-green optical contrast independently of the UI theme.
        ink[offset] = 219 - positive * 105 + negative * 25;
        ink[offset + 1] = 235 - positive * 61 + negative * 13;
        ink[offset + 2] = 237 - positive * 51 + negative * 9;
        ink[offset + 3] = 255;
      }
      tx.putImageData(image, 0, 0);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      const [a, b, c, d, e, f] = planeMatrix(top);
      context.transform(a, b, c, d, e, f);
      context.drawImage(texture, -200, -150, 400, 300);
      if (grid) {
        context.strokeStyle = "rgba(49,96,103,.17)";
        context.lineWidth = 0.5;
        context.beginPath();
        for (let x = -200; x <= 200; x += 25) { context.moveTo(x, -150); context.lineTo(x, 150); }
        for (let y = -150; y <= 150; y += 25) { context.moveTo(-200, y); context.lineTo(200, y); }
        context.stroke();
      }
      if (timeRef.current) timeRef.current.textContent = `${t.toFixed(2)} s`;
      const p = probeRef.current;
      const local = field.sampler.height(p.x, p.y, t);
      if (valueRef.current) valueRef.current.textContent = `${local >= 0 ? "+" : ""}${local.toFixed(3)} mm`;
      const moveSource = (node: SVGGElement | null, y: number, phase: number) => {
        if (node) node.setAttribute("transform", translateAlong(PROJECTION, [0, y, Math.sin(field.sampler.omega * t - phase) * parameters.amplitude]));
      };
      moveSource(sourceA.current, -parameters.separation / 2, 0);
      moveSource(sourceB.current, parameters.separation / 2, parameters.phase * Math.PI / 180);
    }
    const run = () => {
      if (disposed || frame || !visible || document.hidden || !playing || reduced.matches) return;
      previous = 0;
      frame = requestAnimationFrame(tick);
    };
    function tick(now: number) {
      frame = 0;
      if (disposed || !visible || document.hidden || !playing || reduced.matches) return;
      const dt = previous ? Math.min((now - previous) / 1000, 1 / 15) : 0;
      previous = now;
      clockRef.current += dt * speed;
      if (now - lastPaint > 1000 / 45) { draw(); lastPaint = now; }
      frame = requestAnimationFrame(tick);
    }
    const stopAndResume = () => {
      cancelAnimationFrame(frame); frame = 0; previous = 0;
      draw(); run();
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      stopAndResume();
    }, { rootMargin: "80px" });
    observer.observe(stage);

    document.addEventListener("visibilitychange", stopAndResume);
    reduced.addEventListener("change", stopAndResume);
    repaintRef.current = draw;
    draw(); run();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();

      document.removeEventListener("visibilitychange", stopAndResume);
      reduced.removeEventListener("change", stopAndResume);
      repaintRef.current = null;
    };
  }, [field, playing, speed, display, grid, top, parameters, clockRef]);

  function setProbe(clientX: number, clientY: number) {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const sx = (clientX - bounds.left) * VIEW_WIDTH / bounds.width;
    const sy = (clientY - bounds.top) * VIEW_HEIGHT / bounds.height;
    const [x, y] = worldAt(sx, sy, top);
    if (!dragRef.current && (Math.abs(x) > 200 || Math.abs(y) > 150)) return;
    onProbeChange({ x: Math.round(Math.max(-195, Math.min(experiment === "reflection" ? 95 : 195, x))), y: Math.round(Math.max(-145, Math.min(145, y))) });
  }
  const point = at(probe.x, probe.y, 0, top);
  const currentP = top ? TOP_PROJECTION : PROJECTION;
  const parts = [...APPARATUS[experiment], PROBE_PART];

  return <>
  <div className={`tank-container${top ? " is-top" : ""}`} data-inspect={inspect || undefined}>
    <div className="tank-viewport">
    <div className="tank-stage iso" ref={stageRef} tabIndex={0} role="group"
      aria-label={`${experiment} ripple tank. Click or drag the water to place the probe. Arrow keys move the probe by 5 millimeters; Shift moves by 25.`}
      onKeyDown={(event) => {
        const delta = event.shiftKey ? 25 : 5;
        const moves: Record<string, [number, number]> = { ArrowRight: [delta, 0], ArrowLeft: [-delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] };
        const move = moves[event.key];
        if (move) { event.preventDefault(); onProbeChange({ x: Math.max(-195, Math.min(experiment === "reflection" ? 95 : 195, probe.x + move[0])), y: Math.max(-145, Math.min(145, probe.y + move[1])) }); }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        setProbe(event.clientX, event.clientY);
        dragRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => { if (dragRef.current) setProbe(event.clientX, event.clientY); }}
      onPointerUp={(event) => { dragRef.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { dragRef.current = false; }}>
      <svg className="tank-svg tank-back iso-svg" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} role="img" aria-label="A precision ripple tank with an aluminum frame, driven wave sources and interchangeable experiment inserts">
        <g key="tank-back" dangerouslySetInnerHTML={{ __html: top ? art.top : art.back }}/>
        <defs><clipPath id="still-water-clip"><path d={planOutline(TANK, 0, currentP)}/></clipPath></defs>
                <g clipPath="url(#still-water-clip)"><g className="still-wave-fallback" transform={`matrix(${planeMatrix(top).join(" ")})`}> 
          {[24, 48, 72, 96, 120, 144, 168, 192].map(r => <ellipse key={r} cx="-100" cy="0" rx={r} ry={r} fill="none" stroke="currentColor" opacity={0.14} strokeWidth="0.6"/>)}
        </g></g>
      </svg>
      <canvas className="tank-canvas" ref={canvasRef} aria-hidden="true"/>
      <svg className="tank-svg tank-front iso-svg" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} aria-hidden="true">

        {experiment !== "interference" && !top && <g data-tank-part="sources" dangerouslySetInnerHTML={{ __html: art.paddle }}/>}
        <g data-tank-part={experiment === "reflection" ? "barrier" : experiment === "refraction" ? "depth" : experiment === "diffraction" ? "aperture" : undefined}
          dangerouslySetInnerHTML={{ __html: insert }}/>
        {!top && <g key="tank-front" dangerouslySetInnerHTML={{ __html: art.front }}/>}
        {experiment === "interference" && !top && <>
          <g ref={sourceA} data-tank-part="sources" transform={translateAlong(PROJECTION, [0, -parameters.separation / 2, 0])} dangerouslySetInnerHTML={{ __html: art.source }}/>
          <g ref={sourceB} data-tank-part="sources" transform={translateAlong(PROJECTION, [0, parameters.separation / 2, 0])} dangerouslySetInnerHTML={{ __html: art.source }}/>
        </>}
        {experiment === "interference" && top && [-1, 1].map(sign => {
          const [x, y] = at(-100, sign * parameters.separation / 2, 0, true);
          return <g key={sign}><circle cx={x} cy={y} r="7" className="source-top"/><circle cx={x} cy={y} r="2" fill="var(--primary-foreground)"/></g>;
        })}
        <g transform={`translate(${point[0]} ${point[1]})`} className="water-probe" data-tank-part="probe">
          <circle r="9"/><path d="M-14 0h8M6 0h8M0-14v8M0 6v8"/><circle r="2" className="probe-center"/>
        </g>
      </svg>
    </div>
    <div className="scene-probe"><span className="probe-status"/><span>PROBE</span><span className="probe-coordinates">{probe.x}, {probe.y} mm</span><strong ref={valueRef}>0.000 mm</strong></div>
    <div className="scene-clock">t <span ref={timeRef}>0.00 s</span></div>
    </div>
  </div>
  <div className="tank-apparatus">
    <div className="tank-apparatus-heading">
      <h3>What you are looking at</h3>
      <p>Choose a part to pick it out in the tank.</p>
    </div>
    <div className="tank-apparatus-keys">
      {parts.map((part) => <button key={part.id} type="button" className="tank-apparatus-key"
        data-active={inspect === part.id} aria-pressed={inspect === part.id}
        onClick={() => onInspect(inspect === part.id ? "" : part.id)}>
        <span className="tank-apparatus-mark" aria-hidden="true"/>
        <span><strong>{part.label}</strong><span className="tank-apparatus-description">{part.description}</span></span>
      </button>)}
    </div>
    <p className="tank-apparatus-readout">{inspect ? parts.find(part => part.id === inspect)?.readout : "The water is the elevation field from the same model as every number on this page."}</p>
  </div>
  </>;
}
