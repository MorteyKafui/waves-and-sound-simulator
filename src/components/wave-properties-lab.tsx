"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_WAVE_PROPERTIES, WAVE_PROPERTY_LIMITS, WAVE_PROPERTY_WINDOW, WAVE_PROBE_POSITION,
  advanceWaveTime, createWavePropertyFrame, formatWaveProperty, parseWaveProperty,
  quarterPeriodWaveTime, resolveWaveProperties, updateWaveProperty, wavePlotCoordinates,
  type WaveProperties, type WavePropertiesDraft, type WaveProperty,
} from "@/lib/wave-properties";
import "./wave-properties-lab.css";

const INITIAL_WIDTH = 640;
const INITIAL_MODEL = resolveWaveProperties({ ...DEFAULT_WAVE_PROPERTIES }).model!;
const INITIAL_FRAME = createWavePropertyFrame(INITIAL_MODEL, 0, INITIAL_WIDTH);
const FIELDS = ["amplitude", "frequency", "period", "wavelength"] as const;
const FIELD_HINTS: Record<WaveProperty, string> = {
  amplitude: "Changes height, not speed. Zero gives a flat trace.",
  frequency: "Oscillations per second; T = 1/f updates with this value.",
  period: "Seconds per oscillation; f = 1/T updates with this value.",
  wavelength: "Distance between adjacent crests. Shorter means more cycles in view.",
};

type Motion = "playing" | "paused" | "reduced-motion" | "offscreen" | "hidden" | "invalid";
type Runtime = {
  model: WaveProperties | null; time: number; width: number; requested: boolean;
  reduced: boolean; visible: boolean; hidden: boolean; frame: number | null; previous: number | null;
};

function motionOf(state: Runtime): Motion {
  if (!state.model) return "invalid";
  if (state.reduced) return "reduced-motion";
  if (state.hidden) return "hidden";
  if (!state.visible) return "offscreen";
  return state.requested ? "playing" : "paused";
}

function PropertyControl({ property, value, error, onChange }: {
  property: WaveProperty; value: string; error?: string;
  onChange: (property: WaveProperty, value: string) => void;
}) {
  const id = useId();
  const limit = WAVE_PROPERTY_LIMITS[property];
  let numeric: number | null = null;
  try { numeric = parseWaveProperty(value, property); } catch { /* Keep an incomplete edit blank. */ }
  return <div className="properties-field" data-property={property}>
    <div className="properties-field-heading">
      <label htmlFor={id}>{limit.label} <span>{limit.symbol}</span></label>
      <span className="properties-unit">{limit.unit}</span>
    </div>
    <input className="properties-number" id={id} type="number" inputMode="decimal"
      aria-label={`${limit.label} (${limit.unit})`} min={limit.min} max={limit.max} step="any"
      value={value} required aria-invalid={numeric === null}
      aria-describedby={`${id}-hint ${id}-bounds${error ? ` ${id}-error` : ""}`}
      onChange={event => onChange(property, event.target.value)} />
    <input className="properties-range" type="range" min={limit.min} max={limit.max} step="any"
      aria-label={`${limit.label} slider (${limit.unit})`} value={numeric ?? limit.min}
      disabled={numeric === null} aria-describedby={`${id}-bounds ${id}-hint`}
      aria-valuetext={numeric === null ? "Enter a valid number first" : `${formatWaveProperty(numeric, 6)} ${limit.unit}`}
      onChange={event => onChange(property, event.target.value)} />
    <p className="properties-bounds" id={`${id}-bounds`}>
      <span>{limit.min} {limit.unit}</span><span>{limit.max} {limit.unit}</span>
    </p>
    <p className="properties-field-hint" id={`${id}-hint`}>{numeric === null && !error
          ? "Linked value unavailable. Enter a valid frequency or period." : FIELD_HINTS[property]}</p>
    {error && <p className="properties-field-error" id={`${id}-error`}>{error}</p>}
  </div>;
}

/** A fixed SI window: resizing changes pixels per metre, never the physical axes. */
export function WavePropertiesLab() {
  const id = useId();
  const [draft, setDraft] = useState<WavePropertiesDraft>(() => ({ ...DEFAULT_WAVE_PROPERTIES }));
  const [width, setWidth] = useState(INITIAL_WIDTH);
  const { model, errors } = useMemo(() => resolveWaveProperties(draft), [draft]);
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const trace = useRef<SVGPathElement>(null);
  const crest = useRef<SVGGElement>(null);
  const nextCrest = useRef<SVGGElement>(null);
  const trough = useRef<SVGGElement>(null);
  const crestLabel = useRef<SVGTextElement>(null);
  const troughLabel = useRef<SVGTextElement>(null);
  const amplitudeMeasure = useRef<SVGPathElement>(null);
  const wavelengthMeasure = useRef<SVGPathElement>(null);
  const wavelengthLabel = useRef<SVGTextElement>(null);
  const particle = useRef<SVGGElement>(null);
  const timeReadout = useRef<HTMLOutputElement>(null);
  const particleReadout = useRef<HTMLOutputElement>(null);
  const playButton = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLSpanElement>(null);
  const announcement = useRef<HTMLParagraphElement>(null);
  const sync = useRef<(() => void) | null>(null);
  const runtime = useRef<Runtime>({
    model: INITIAL_MODEL, time: 0, width: INITIAL_WIDTH, requested: true,
    reduced: false, visible: false, hidden: false, frame: null, previous: null,
  });

  const paint = useCallback(() => {
    const state = runtime.current;
    const current = state.model;
    root.current?.setAttribute("data-time", String(state.time));
    if (timeReadout.current) timeReadout.current.textContent = current ? `${state.time.toFixed(3)} s` : "—";
    if (!current) {
      trace.current?.setAttribute("d", "");
      if (particleReadout.current) particleReadout.current.textContent = "—";
      return;
    }
    const frame = createWavePropertyFrame(current, state.time, state.width);
    trace.current?.setAttribute("d", frame.trace);
    const place = (element: SVGGElement | null, point: { x: number; y: number } | null) => {
      if (point) element?.setAttribute("transform", `translate(${point.x} ${point.y})`);
    };
    place(crest.current, frame.crest);
    place(nextCrest.current, frame.nextCrest);
    place(trough.current, frame.trough);
    place(particle.current, frame.probe);
    amplitudeMeasure.current?.setAttribute("d", frame.amplitudeMeasure);
    wavelengthMeasure.current?.setAttribute("d", frame.wavelengthMeasure);
    if (frame.crest && frame.nextCrest && frame.trough) {
      crestLabel.current?.setAttribute("x", String(Math.max(63, Math.min(state.width - 38, frame.crest.x))));
      crestLabel.current?.setAttribute("y", String(frame.crest.y + (current.amplitude < 0.25 ? -15 : 20)));
      troughLabel.current?.setAttribute("x", String(Math.max(65, Math.min(state.width - 40, frame.trough.x))));
      troughLabel.current?.setAttribute("y", String(frame.trough.y + 20));
      wavelengthLabel.current?.setAttribute("x", String((frame.crest.x + frame.nextCrest.x) / 2));
      wavelengthLabel.current?.setAttribute("y", String(wavePlotCoordinates(state.width).y(2.3) - 8));
    }
    if (particleReadout.current) particleReadout.current.textContent = `${formatWaveProperty(frame.probeDisplacement)} m`;
  }, []);

  useLayoutEffect(() => {
    runtime.current.model = model;
    runtime.current.width = width;
    paint();
    sync.current?.();
  }, [model, width, paint]);

  useEffect(() => {
    const node = root.current;
    const plot = stage.current;
    if (!node || !plot) return;
    const state = runtime.current;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    state.reduced = media.matches;
    state.hidden = document.hidden;
    // Wait for an actual intersection before starting; no offscreen mount animation.
    state.visible = typeof IntersectionObserver === "undefined";
    let disposed = false;

    function synchronize() {
      if (disposed) return;
      const motion = motionOf(state);
      node!.dataset.motion = motion;
      node!.dataset.playing = String(motion === "playing");
      node!.dataset.reducedMotion = String(state.reduced);
      if (playButton.current) {
        const label = state.requested && !state.reduced && state.model ? "Pause wave" : "Play wave";
        playButton.current.textContent = label;
        playButton.current.setAttribute("aria-label", label);
        playButton.current.disabled = !state.model || state.reduced;
      }
      if (status.current) status.current.textContent = {
        playing: "Running · rightward travel", paused: "Paused", invalid: "Awaiting valid inputs",
        "reduced-motion": "Reduced motion · step to explore", offscreen: "Paused · outside view", hidden: "Paused · tab hidden",
      }[motion];
      if (motion === "playing") {
        if (state.frame === null) state.frame = requestAnimationFrame(tick);
      } else {
        if (state.frame !== null) cancelAnimationFrame(state.frame);
        state.frame = null;
        state.previous = null;
      }
    }

    function tick(now: number) {
      state.frame = null;
      if (disposed) return;
      if (motionOf(state) !== "playing") { synchronize(); return; }
      const delta = state.previous === null ? 0 : Math.max(0, (now - state.previous) / 1000);
      state.previous = now;
      state.time = advanceWaveTime(state.time, delta);
      paint();
      state.frame = requestAnimationFrame(tick);
    }

    const visibilityChanged = () => { state.hidden = document.hidden; synchronize(); };
    const preferenceChanged = () => {
      state.reduced = media.matches;
      // Leaving reduced motion must not unexpectedly start a previously still instrument.
      state.requested = false;
      synchronize();
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      const latest = entries[entries.length - 1];
      if (latest) { state.visible = latest.isIntersecting; synchronize(); }
    }, { threshold: 0 });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(entries => {
      const latest = entries[entries.length - 1];
      if (latest && latest.contentRect.width > 60) setWidth(Math.max(61, Math.round(latest.contentRect.width)));
    });
    observer?.observe(plot);
    resize?.observe(plot);
    media.addEventListener("change", preferenceChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    sync.current = synchronize;
    synchronize();
    paint();
    return () => {
      disposed = true;
      if (state.frame !== null) cancelAnimationFrame(state.frame);
      state.frame = null;
      state.previous = null;
      observer?.disconnect();
      resize?.disconnect();
      media.removeEventListener("change", preferenceChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
      sync.current = null;
    };
  }, [paint]);

  function update(property: WaveProperty, text: string) {
    const next = updateWaveProperty(draft, property, text);
    runtime.current.model = resolveWaveProperties(next).model;
    runtime.current.time = 0;
    runtime.current.previous = null;
    runtime.current.requested = false;
    setDraft(next);
    paint();
    sync.current?.();
  }

  function togglePlayback() {
    const state = runtime.current;
    if (!state.model || state.reduced) return;
    state.requested = !state.requested;
    sync.current?.();
    if (announcement.current) announcement.current.textContent = state.requested ? "Wave playing." : `Wave paused at ${formatWaveProperty(state.time)} seconds.`;
  }

  function reset() {
    const state = runtime.current;
    state.model = INITIAL_MODEL;
    state.time = 0;
    state.previous = null;
    state.requested = false;
    setDraft({ ...DEFAULT_WAVE_PROPERTIES });
    paint();
    sync.current?.();
    if (announcement.current) announcement.current.textContent = "Default settings restored. Wave paused at zero seconds.";
  }

  function step() {
    const state = runtime.current;
    if (!state.model) return;
    state.requested = false;
    state.time = quarterPeriodWaveTime(state.model, state.time);
    paint();
    sync.current?.();
    if (announcement.current) announcement.current.textContent = `Advanced one quarter period. Time ${formatWaveProperty(state.time)} seconds.`;
  }

  const { x, y, plotWidth, plotHeight } = wavePlotCoordinates(width);
  const valid = model !== null;
  const hasExtrema = valid && model.amplitude > 0;
  const metric = (value: number | undefined, unit: string) => value === undefined ? "—" : `${formatWaveProperty(value)} ${unit}`;
  return <section ref={root} className="properties-lab" aria-labelledby={`${id}-title`}
    data-testid="wave-properties-lab" data-wave-properties-lab="" data-valid={String(valid)}
    data-motion="paused" data-playing="false" data-reduced-motion="false" data-time="0"
    data-amplitude={model?.amplitude} data-frequency={model?.frequency} data-period={model?.period}
    data-wavelength={model?.wavelength} data-speed={model?.speed} data-probe-x={WAVE_PROBE_POSITION}>
    <header className="properties-heading">
      <span className="properties-kicker">WAVE ANATOMY / TRAVELLING SINE</span>
      <h2 id={`${id}-title`}>Wave properties</h2>
      <p>Change the height, spacing and rhythm. Watch a wave travel while one particle stays at the same horizontal position.</p>
    </header>

    <div className="properties-workspace">
      <div className="properties-main">
        <figure className="properties-card properties-instrument" aria-labelledby={`${id}-figure-title`}>
          <div className="properties-instrument-heading">
            <h3 id={`${id}-figure-title`}>Calibrated wave scope</h3>
            <span ref={status} className="properties-status" aria-live="off">Paused</span>
          </div>
          <div className="properties-scale"><span>Position x: 0–10 m</span><span>Displacement y: −2.5–+2.5 m</span></div>
          <div ref={stage} className="properties-stage">
            <svg className="properties-scope" width={width} height={WAVE_PROPERTY_WINDOW.height}
              viewBox={`0 0 ${width} ${WAVE_PROPERTY_WINDOW.height}`} role="img"
              aria-labelledby={`${id}-plot-title ${id}-plot-description`} data-testid="wave-properties-plot">
              <title id={`${id}-plot-title`}>Travelling sine wave on fixed metre axes</title>
              <desc id={`${id}-plot-description`}>{!valid ? "Trace withheld until every input is valid."
                : !hasExtrema ? "Zero amplitude: every point is at equilibrium, with no distinct crests or troughs."
                  : "The wave travels to the right. Filled circles mark two adjacent crests; a square marks a trough. The A bracket measures equilibrium to crest. The lambda bracket measures crest to crest. A hollow diamond oscillates vertically at x equals 2 metres."}</desc>
              <rect className="properties-plot-ground" x={x(0)} y={y(2.5)} width={plotWidth} height={plotHeight} />
              {Array.from({ length: 11 }, (_, i) => <line className="properties-grid-line" key={`x${i}`} x1={x(i)} x2={x(i)} y1={y(2.5)} y2={y(-2.5)} />)}
              {[-2, -1, 0, 1, 2].map(value => <g key={`y${value}`}>
                <line className={value === 0 ? "properties-equilibrium" : "properties-grid-line"} x1={x(0)} x2={x(10)} y1={y(value)} y2={y(value)} />
                <text className="properties-axis-text" x={x(0) - 9} y={y(value) + 4} textAnchor="end">{value > 0 ? `+${value}` : value}</text>
              </g>)}
              {[0, 2, 4, 6, 8, 10].map(value => <text className="properties-axis-text" key={value} x={x(value)} y={y(-2.5) + 20}
                textAnchor={value === 0 ? "start" : value === 10 ? "end" : "middle"}>{value}</text>)}
              <text className="properties-axis-text" x="10" y="13">y / m</text>
              <text className="properties-axis-text" x={x(10)} y={WAVE_PROPERTY_WINDOW.height - 1} textAnchor="end">x / m</text>
              <g visibility={valid ? "visible" : "hidden"}>
                <line className="properties-probe-guide" x1={x(WAVE_PROBE_POSITION)} x2={x(WAVE_PROBE_POSITION)} y1={y(2.5)} y2={y(-2.5)} />
                <path ref={trace} className="properties-trace" d={INITIAL_FRAME.trace} data-testid="wave-properties-trace" />
                <g visibility={hasExtrema ? "visible" : "hidden"} data-testid="wave-properties-extrema">
                  <path ref={amplitudeMeasure} className="properties-amplitude-measure" d={INITIAL_FRAME.amplitudeMeasure} />
                  <path ref={wavelengthMeasure} className="properties-wavelength-measure" d={INITIAL_FRAME.wavelengthMeasure} />
                  <text ref={wavelengthLabel} className="properties-measure-label" textAnchor="middle">λ</text>
                  <g ref={crest}><circle className="properties-crest" r="4.5" /><text className="properties-measure-label" x="10" y="-8">A</text></g>
                  <g ref={nextCrest}><circle className="properties-crest" r="4.5" /></g>
                  <g ref={trough}><rect className="properties-trough" x="-4.5" y="-4.5" width="9" height="9" /></g>
                  <text ref={crestLabel} className="properties-feature-label" textAnchor="middle">Crest</text>
                  <text ref={troughLabel} className="properties-feature-label" textAnchor="middle">Trough</text>
                </g>
                <g ref={particle} data-testid="wave-properties-particle"><path className="properties-particle" d="M0,-7 L7,0 L0,7 L-7,0 Z" /></g>
              </g>
              {!valid && <text className="properties-empty-text" x={x(5)} y={y(0) - 16} textAnchor="middle">Awaiting valid inputs</text>}
            </svg>
          </div>
          <div className="properties-transport" role="group" aria-label="Wave playback">
            <button className="properties-button properties-play" type="button" ref={playButton} aria-label="Play wave" onClick={togglePlayback}>Play wave</button>
            <button className="properties-button" type="button" onClick={step} disabled={!valid}>Advance ¼ period</button>
            <button className="properties-button" type="button" onClick={reset}>Reset wave</button>
          </div>
          <div className="properties-live-readouts">
            <div><span>Elapsed time</span><output ref={timeReadout} aria-label="Elapsed time" aria-live="off" data-testid="wave-properties-time">0.000 s</output></div>
            <div><span>Particle at x = 2 m</span><output ref={particleReadout} aria-label="Particle displacement" aria-live="off">0 m</output></div>
          </div>
          <figcaption className="properties-caption" id={`${id}-caption`}>
            <p>Fixed axes, never auto-scaled. The trace travels right; the diamond only moves up and down.</p>
            <p className="properties-reduced-note">Reduced motion is on. Continuous playback is disabled; use Advance ¼ period to explore.</p>
            {!valid && <p className="properties-error" role="status">Correct the marked inputs. The trace and calculated outputs are withheld, not frozen at old values.</p>}
            {valid && !hasExtrema && <p className="properties-flat-note">A = 0: a flat equilibrium line, with no distinct crest or trough. f, T, λ and v describe the nominal wave settings; no displacement propagates.</p>}
          </figcaption>
        </figure>

        <section className="properties-card properties-legend" aria-label="Wave diagram legend">
          <h3>Read the trace</h3>
          <dl>
            <div><dt><span className="properties-key properties-key-crest" aria-hidden="true" />Crest</dt><dd>Highest point: +A above equilibrium.</dd></div>
            <div><dt><span className="properties-key properties-key-trough" aria-hidden="true" />Trough</dt><dd>Lowest point: −A below equilibrium.</dd></div>
            <div><dt><span className="properties-key properties-key-axis" aria-hidden="true" />Equilibrium</dt><dd>The y = 0 line; undisturbed position.</dd></div>
            <div><dt><span className="properties-key properties-key-particle" aria-hidden="true" />Particle</dt><dd>Fixed x = 2 m. Oscillation, not drift.</dd></div>
            <div><dt>Amplitude · A</dt><dd>Vertical distance from equilibrium to a crest, not peak-to-peak.</dd></div>
            <div><dt>Wavelength · λ</dt><dd>Horizontal bracket between two adjacent crests, at the same instant.</dd></div>
          </dl>
        </section>
      </div>

      <section className="properties-card properties-controls" aria-labelledby={`${id}-controls-title`}>
        <div className="properties-card-heading"><span className="properties-kicker">THE INPUTS / SI UNITS</span><h3 id={`${id}-controls-title`}>Shape the wave</h3></div>
        <div className="properties-fields">{FIELDS.map(property => <PropertyControl key={property} property={property} value={draft[property]} error={errors[property]} onChange={update} />)}</div>
        <p className="properties-control-note">Frequency and period are reciprocal controls, not independent inputs. Editing either updates the other without rounding the model. Every edit pauses and returns t to 0; reset restores the defaults.</p>
      </section>
    </div>

    <section className="properties-card properties-results" aria-labelledby={`${id}-results-title`}>
      <div className="properties-card-heading"><span className="properties-kicker">ONE MODEL / ALL READOUTS</span><h3 id={`${id}-results-title`}>Measure the effects</h3></div>
      <dl className="properties-metrics">
        <div><dt>Amplitude · A</dt><dd><output aria-label="Wave amplitude">{metric(model?.amplitude, "m")}</output></dd><p>Maximum displacement</p></div>
        <div><dt>Crest / trough</dt><dd><output aria-label="Crest and trough displacement">{!valid ? "—" : !hasExtrema ? "No distinct extrema" : `+${formatWaveProperty(model.amplitude)} / −${formatWaveProperty(model.amplitude)} m`}</output></dd><p>{metric(model?.peakToPeak, "m")} peak-to-peak</p></div>
        <div><dt>Frequency · f</dt><dd><output aria-label="Wave frequency">{metric(model?.frequency, "Hz")}</output></dd><p>Cycles each second</p></div>
        <div><dt>Period · T = 1/f</dt><dd><output aria-label="Wave period">{metric(model?.period, "s")}</output></dd><p>One complete oscillation</p></div>
        <div><dt>Wavelength · λ</dt><dd><output aria-label="Wave wavelength">{metric(model?.wavelength, "m")}</output></dd><p>{model ? formatWaveProperty(10 / model.wavelength) : "—"} cycles in the 10 m window</p></div>
        <div><dt>Speed · v = fλ</dt><dd><output aria-label="Wave speed" data-testid="wave-properties-speed">{metric(model?.speed, "m/s")}</output></dd><p>Rightward phase speed</p></div>
      </dl>
      <p className="properties-equation" aria-label="Travelling wave equation">y(x,t) = A sin[2π(x/λ − ft)]</p>
    </section>

    <section className="properties-card properties-notes" aria-labelledby={`${id}-notes-title`}>
      <span className="properties-kicker">WHAT CHANGES / WHAT DOES NOT</span>
      <h3 id={`${id}-notes-title`}>A wave is a travelling pattern, not travelling matter.</h3>
      <div className="properties-note-grid">
        <p><strong>Amplitude sets height.</strong> Increasing A increases the maximum displacement and the peak-to-peak height (2A). In this ideal model, it changes neither period nor phase speed.</p>
        <p><strong>Frequency sets the rhythm.</strong> At fixed λ, increasing f makes the particle oscillate faster, shortens T = 1/f, and makes the pattern travel faster because v = fλ.</p>
        <p><strong>Wavelength sets spacing.</strong> At fixed f, increasing λ puts fewer crests in the same window and increases v. Every quarter-period step shifts the pattern right by λ/4.</p>
        <p><strong>This is an independently specified wave.</strong> Here f and λ are independent, so their product determines speed. In a fixed nondispersive medium, speed v is set by that medium: changing f instead requires λ = v/f. Individual particles oscillate about equilibrium; they do not drift with the crests.</p>
      </div>
    </section>
    <p ref={announcement} className="properties-sr-only" role="status" aria-live="polite" aria-atomic="true" />
  </section>;
}
