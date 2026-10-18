'use client';

import { useId, useState } from 'react';
import {
  calculateDoppler,
  DOPPLER_PRESETS,
  dopplerWavefronts,
  validateDoppler,
  type DopplerField,
  type DopplerParameters,
  type DopplerPreset,
  type DopplerResult,
  type DopplerWavefront,
} from '../lib/doppler';

// The parent imports doppler-lab.css alongside its other laboratory styles.
type Draft = Record<DopplerField, string>;

function draftFrom(parameters: Readonly<DopplerParameters>): Draft {
  return { fs: String(parameters.fs), c: String(parameters.c), vs: String(parameters.vs), vo: String(parameters.vo) };
}

function readNumber(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

function format(value: number, digits = 2): string {
  if (value !== 0 && (Math.abs(value) < 10 ** -digits || Math.abs(value) >= 1e7)) {
    return value.toExponential(3);
  }
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${format(value)}`;
}

interface ControlProps {
  id: string;
  field: DopplerField;
  label: string;
  symbol: string;
  unit: string;
  hint: string;
  value: string;
  error?: string;
  min: number;
  max: number;
  inputMin?: number;
  inputMax?: number;
  sliderUnavailable?: boolean;
  onChange: (field: DopplerField, value: string) => void;
}

function Control({ id, field, label, symbol, unit, hint, value, error, min, max, inputMin, inputMax, sliderUnavailable, onChange }: ControlProps) {
  const disabled = sliderUnavailable || Boolean(error) || !Number.isFinite(readNumber(value)) || max <= min;
  const description = `${id}-hint${error ? ` ${id}-error` : ''}`;
  return (
    <div className="doppler-control">
      <label className="doppler-control-label" htmlFor={id}>{label} <span>{symbol}</span></label>
      <div className="doppler-number-wrap">
        <input
          id={id}
          type="number"
          step="any"
          inputMode={field === 'vs' || field === 'vo' ? 'text' : 'decimal'}
          value={value}
          min={inputMin}
          max={inputMax}
          aria-label={`${label} (${unit})`}
          aria-invalid={Boolean(error)}
          aria-describedby={description}
          onChange={(event) => onChange(field, event.target.value)}
        />
        <span aria-hidden="true">{unit}</span>
      </div>
      <input
        className="doppler-slider"
        type="range"
        min={min}
        max={max}
        step="any"
        value={disabled ? min : readNumber(value)}
        disabled={disabled}
        aria-label={`${label} slider`}
        aria-valuetext={disabled ? 'Unavailable until the number input is valid' : `${signed(readNumber(value))} ${unit}`}
        aria-describedby={description}
        onChange={(event) => onChange(field, event.target.value)}
      />
      <p id={`${id}-hint`} className="doppler-hint">{hint}</p>
      {error && <p id={`${id}-error`} className="doppler-field-error">{error}</p>}
    </div>
  );
}

function Reading({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) {
  return (
    <div className={`doppler-reading${prominent ? ' doppler-reading-primary' : ''}`}>
      <dt>{label}</dt>
      <dd><output aria-label={label}>{value}</output></dd>
    </div>
  );
}

/** Small, solid bench parts; x/y locate the near bottom edge, d recedes into the drawing. */
function BenchBlock({ x, y, w, d, h, accent = false }: { x: number; y: number; w: number; d: number; h: number; accent?: boolean }) {
  const dx = d * 0.48;
  const dy = d * 0.34;
  return (
    <g className={`doppler-solid${accent ? ' doppler-solid-accent' : ''}`}>
      <path className="doppler-solid-side" d={`M${x + w},${y} l${dx},${-dy} v${-h} l${-dx},${dy} Z`} />
      <path className="doppler-solid-front" d={`M${x},${y} h${w} v${-h} h${-w} Z`} />
      <path className="doppler-solid-top" d={`M${x},${y - h} l${dx},${-dy} h${w} l${-dx},${dy} Z`} />
      <path className="doppler-solid-bevel" d={`M${x + 1},${y - h + 1} h${w - 2}`} />
    </g>
  );
}

function Fastener({ x, y }: { x: number; y: number }) {
  return <g className="doppler-fastener"><circle cx={x} cy={y} r="2.3" /><path d={`M${x - 1},${y} h2`} /></g>;
}

function Instrument({ x, source }: { x: number; source: boolean }) {
  return (
    <g>
      <BenchBlock x={x - 30} y={251} w={58} d={30} h={8} />
      {[-23, 18].flatMap((offset) => [0, -8].map((dy) => (
        <BenchBlock key={`${offset}-${dy}`} x={x + offset} y={254 + dy} w={8} d={6} h={5} />
      )))}
      {[-23, 23].map((offset) => <Fastener key={offset} x={x + offset} y={239} />)}
      <BenchBlock x={x - 10} y={243} w={20} d={12} h={6} />
      <BenchBlock x={x - 3} y={237} w={6} d={6} h={source ? 66 : 74} />
      <BenchBlock x={x - 8} y={220} w={16} d={9} h={7} />
      <Fastener x={x} y={216} />
      <BenchBlock x={x - 8} y={source ? 177 : 169} w={16} d={9} h={7} />
      {source ? (
        <>
          <BenchBlock x={x - 29} y={171} w={58} d={18} h={58} />
          <rect className="doppler-speaker-face" x={x - 25} y="117" width="50" height="50" rx="5" />
          <circle className="doppler-speaker-rim" cx={x} cy="142" r="20" />
          <circle className="doppler-speaker-cone" cx={x} cy="142" r="16" />
          <circle className="doppler-speaker-dustcap" cx={x} cy="142" r="7" />
          {[-21, 21].flatMap((dx) => [121, 163].map((y) => <Fastener key={`${dx}-${y}`} x={x + dx} y={y} />))}
        </>
      ) : (
        <>
          <BenchBlock x={x - 9} y={163} w={18} d={12} h={39} />
          <rect className="doppler-microphone-grille" x={x - 9} y="124" width="18" height="30" rx="8" />
          {[130, 135, 140, 145, 150].map((y) => <path className="doppler-grille-slot" key={y} d={`M${x - 5},${y} h10`} />)}
          <BenchBlock x={x - 10} y={163} w={20} d={12} h={6} />
          <circle className="doppler-microphone-port" cx={x} cy="159" r="1.7" />
        </>
      )}
    </g>
  );
}

function WavefrontFigure({ id, parameters, result, fronts }: { id: string; parameters: DopplerParameters; result: DopplerResult | null; fronts: DopplerWavefront[] }) {
  const direction = (value: number) => value === 0 ? 'stationary' : value > 0 ? '→ rightward' : '← leftward';
  return (
    <figure className="doppler-figure" aria-labelledby={`${id}-figure-title`}>
      <div className="doppler-figure-heading">
        <span className="doppler-kicker">Fig. D · stationary medium</span>
        <h3 id={`${id}-figure-title`}>Wavefront snapshot</h3>
      </div>
      <svg className="doppler-bench" viewBox="0 0 720 316" role="img" aria-labelledby={`${id}-svg-title ${id}-svg-description`}>
        <title id={`${id}-svg-title`}>Speaker and observer in a stationary-medium acoustic bench</title>
        <desc id={`${id}-svg-description`}>
          {result
            ? `Nine recent wavefronts expand from their original emission positions at ${parameters.c} metres per second in the medium. Source velocity ${parameters.vs}, observer velocity ${parameters.vo} metres per second. Observer-side spacing ${result.wavelengthAheadM} metres; opposite-side spacing ${result.wavelengthBehindM} metres. The drawing is static and auto-scaled.`
            : 'The bench is shown without wavefronts because one or more inputs are invalid.'}
        </desc>
        <defs><clipPath id={`${id}-wave-clip`}><rect x="20" y="15" width="680" height="218" rx="12" /></clipPath></defs>
        <g aria-hidden="true">
          <ellipse className="doppler-bench-shadow" cx="366" cy="284" rx="317" ry="22" />
          <g clipPath={`url(#${id}-wave-clip)`}>
            {fronts.toReversed().map((front) => (
              <g key={front.periodsAgo}>
                <circle
                  className="doppler-wavefront"
                  cx={273 + front.centerXM / result!.restWavelengthM * 36}
                  cy="142"
                  r={front.radiusM / result!.restWavelengthM * 36}
                  opacity={1 - front.periodsAgo / 15}
                  data-periods-ago={front.periodsAgo}
                  data-center-x-m={front.centerXM}
                  data-radius-m={front.radiusM}
                />
                <circle className="doppler-emission-mark" cx={273 + front.centerXM / result!.restWavelengthM * 36} cy="142" r="2" />
              </g>
            ))}
          </g>
          {[70, 627].flatMap((x) => [275, 297].map((y) => <BenchBlock key={`${x}-${y}`} x={x} y={y} w={20} d={16} h={16} />))}
          <BenchBlock x={41} y={282} w={626} d={47} h={18} />
          <BenchBlock x={49} y={263} w={604} d={31} h={1} />
          {[58, 643].flatMap((x) => [248, 260].map((y) => <Fastener key={`${x}-${y}`} x={x} y={y} />))}
          {[251, 263].map((y) => <BenchBlock key={y} x={77} y={y} w={554} d={5} h={8} />)}
          {[75, 627].map((x) => <BenchBlock key={x} x={x} y={255} w={8} d={30} h={13} />)}
          <rect className="doppler-ruler" x="104" y="270" width="502" height="7" rx="1" />
          {Array.from({ length: 63 }, (_, index) => (
            <path key={index} className="doppler-ruler-tick" d={`M${108 + index * 8},277 v${index % 5 === 0 ? -6 : -3}`} />
          ))}
          <Instrument x={273} source />
          <Instrument x={510} source={false} />
        </g>
      </svg>
      <div className="doppler-instrument-legend">
        <p><strong>Source · speaker</strong><span>{result ? `${direction(parameters.vs)} · ${signed(parameters.vs)} m/s` : 'Velocity unavailable'}</span></p>
        <p><strong>Observer · microphone</strong><span>{result ? `${direction(parameters.vo)} · ${signed(parameters.vo)} m/s` : 'Velocity unavailable'}</span></p>
      </div>
      <figcaption className="doppler-figure-caption">
        {result ? (
          <>
            <p><span className="doppler-legend-key" aria-hidden="true" />Crests travel at <strong>{format(parameters.c)} m/s</strong> in the medium, not at the source speed.</p>
            <p>Each circle is one emission period older; its centre stays where it was emitted. Nine recent crests are shown; older ones continue beyond this snapshot.</p>
            <p>Auto-scaled by λ₀ = c/fₛ = <strong>{format(result.restWavelengthM, 4)} m</strong>. Instrument sizes and separation are schematic. Very close crests may be unresolved. Static by design; no animation.</p>
          </>
        ) : <p>Wavefronts and numerical readouts are withheld until all inputs are valid.</p>}
      </figcaption>
    </figure>
  );
}

export function DopplerLab() {
  const id = useId();
  const [preset, setPreset] = useState<DopplerPreset>(DOPPLER_PRESETS[0]);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(DOPPLER_PRESETS[0].parameters));
  const parameters: DopplerParameters = { fs: readNumber(draft.fs), c: readNumber(draft.c), vs: readNumber(draft.vs), vo: readNumber(draft.vo) };
  const errors = validateDoppler(parameters);
  const sourceOnly = preset.id === 'source-toward' || preset.id === 'source-away';
  const observerOnly = preset.id === 'observer-toward' || preset.id === 'observer-away';
  const general = preset.id === 'both-moving';
  const positiveSource = preset.id === 'source-toward';
  const negativeObserver = preset.id === 'observer-toward';

  if (sourceOnly && !errors.vs && ((positiveSource && parameters.vs < 0) || (!positiveSource && parameters.vs > 0))) {
    errors.vs = `Use a ${positiveSource ? 'nonnegative' : 'nonpositive'} source velocity for this case, or choose Both moving.`;
  }
  if (observerOnly && !errors.vo && ((negativeObserver && parameters.vo > 0) || (!negativeObserver && parameters.vo < 0))) {
    errors.vo = `Use a ${negativeObserver ? 'nonpositive' : 'nonnegative'} observer velocity for this case, or choose Both moving.`;
  }

  let result: DopplerResult | null = null;
  let fronts: DopplerWavefront[] = [];
  let calculationError = '';
  if (Object.keys(errors).length === 0) {
    try {
      const calculated = calculateDoppler(parameters);
      fronts = dopplerWavefronts(parameters);
      result = calculated;
    } catch (error) {
      calculationError = error instanceof Error ? error.message : 'The calculation is unavailable. Check the input values.';
    }
  }
  const validC = Number.isFinite(parameters.c) && parameters.c > 0;
  const velocityExtent = validC ? Math.max(
    parameters.c * 0.95,
    ...[parameters.vs, parameters.vo].filter((value) => Number.isFinite(value) && Math.abs(value) < parameters.c).map(Math.abs),
  ) : 1;
  const selectPreset = (next: DopplerPreset) => { setPreset(next); setDraft(draftFrom(next.parameters)); };
  const update = (field: DopplerField, value: string) => setDraft((previous) => ({ ...previous, [field]: value }));
  const status = result ? result.shiftHz > 0 ? 'Higher pitch' : result.shiftHz < 0 ? 'Lower pitch' : 'No frequency shift' : 'Check inputs';
  const reading = (value: number | undefined, unit: string, digits = 2, withSign = false) => value === undefined ? 'Unavailable' : `${withSign ? signed(value) : format(value, digits)} ${unit}`;

  return (
    <section className="doppler-lab" aria-labelledby={`${id}-title`} data-doppler-case={preset.id} data-doppler-state={result ? 'valid' : 'invalid'}>
      <header className="doppler-intro">
        <div>
          <p className="doppler-kicker">Sound · classical Doppler effect</p>
          <h2 id={`${id}-title`}>Motion changes what you hear.</h2>
          <p>Separate the source squeezing wavefronts from the observer meeting them faster. All velocities are measured in the stationary medium.</p>
        </div>
        <span className="doppler-domain-badge">Subsonic · 1D · no wind</span>
      </header>

      <div className="doppler-case-picker" role="group" aria-label="Doppler cases">
        {DOPPLER_PRESETS.map((entry, index) => (
          <button key={entry.id} type="button" aria-pressed={preset.id === entry.id} onClick={() => selectPreset(entry)}>
            <span aria-hidden="true">0{index + 1}</span>{entry.label}
          </button>
        ))}
      </div>
      <p className="doppler-case-description">{preset.description} Selecting a case loads its starting values.</p>
      <p className="doppler-axis-note"><strong>Sign convention:</strong> +x points from the source (left) to the observer (right). Positive velocities point right; negative velocities point left. Both require |v| &lt; c.</p>

      <div className="doppler-workspace">
        <div className="doppler-visual-column">
          <WavefrontFigure id={id} parameters={parameters} result={result} fronts={fronts} />
          <div className="doppler-results" role="status" aria-live="polite" aria-atomic="true">
            <div className="doppler-results-heading"><h3>Frequency &amp; spacing</h3><span>{status}</span></div>
            <dl className="doppler-readings">
              <Reading label="Emitted frequency" value={reading(result?.emittedHz, 'Hz')} />
              <Reading label="Observed frequency" value={reading(result?.observedHz, 'Hz')} prominent />
              <Reading label="Frequency shift" value={reading(result?.shiftHz, 'Hz', 2, true)} />
              <Reading label="Percentage shift" value={reading(result?.shiftPercent, '%', 2, true)} />
              <Reading label="Wavelength ahead (+x)" value={reading(result?.wavelengthAheadM, 'm', 4)} />
              <Reading label="Wavelength behind (−x)" value={reading(result?.wavelengthBehindM, 'm', 4)} />
            </dl>
            <p className="doppler-hint">“Ahead” means +x toward the observer; “behind” means −x, not necessarily the source’s direction of travel. Spacing is measured in the medium.</p>
          </div>
        </div>

        <section className="doppler-controls" aria-labelledby={`${id}-controls-title`}>
          <div className="doppler-controls-heading"><h3 id={`${id}-controls-title`}>Set the experiment</h3><button type="button" onClick={() => selectPreset(preset)}>Reset case</button></div>
          <div className="doppler-controls-body">
            <p className="doppler-hint">Drag a slider or type a number. Typed values can extend the slider range; sound speed and frequency must stay positive.</p>
            <Control id={`${id}-fs`} field="fs" label="Emitted frequency" symbol="fₛ" unit="Hz" hint="Cycles emitted each second. The slider starts at 20–2000 Hz." value={draft.fs} error={errors.fs} min={Math.min(20, Number.isFinite(parameters.fs) && parameters.fs > 0 ? parameters.fs : 20)} max={Math.max(2000, Number.isFinite(parameters.fs) ? parameters.fs : 2000)} inputMin={0} onChange={update} />
            <Control id={`${id}-c`} field="c" label="Sound speed" symbol="c" unit="m/s" hint="Wave speed relative to the medium; 343 m/s is typical for air near 20 °C." value={draft.c} error={errors.c} min={Math.min(100, validC ? parameters.c : 100)} max={Math.max(1600, validC ? parameters.c : 1600)} inputMin={0} onChange={update} />
            {(sourceOnly || general) && <Control id={`${id}-vs`} field="vs" label="Source velocity" symbol="vₛ" unit="m/s" hint={general ? 'Signed independently: + toward observer; − away. Require |vₛ| < c.' : `${positiveSource ? 'Positive or zero: toward' : 'Negative or zero: away from'} the stationary observer. Require |vₛ| < c.`} value={draft.vs} error={errors.vs} min={positiveSource ? 0 : -velocityExtent} max={sourceOnly && !positiveSource ? 0 : velocityExtent} inputMin={positiveSource ? 0 : validC ? -parameters.c : undefined} inputMax={sourceOnly && !positiveSource ? 0 : validC ? parameters.c : undefined} sliderUnavailable={!validC} onChange={update} />}
            {(observerOnly || general) && <Control id={`${id}-vo`} field="vo" label="Observer velocity" symbol="vₒ" unit="m/s" hint={general ? 'Signed independently: − toward source; + away. Require |vₒ| < c.' : `${negativeObserver ? 'Negative or zero: toward' : 'Positive or zero: away from'} the stationary source. Require |vₒ| < c.`} value={draft.vo} error={errors.vo} min={observerOnly && !negativeObserver ? 0 : -velocityExtent} max={negativeObserver ? 0 : velocityExtent} inputMin={observerOnly && !negativeObserver ? 0 : validC ? -parameters.c : undefined} inputMax={negativeObserver ? 0 : validC ? parameters.c : undefined} sliderUnavailable={!validC} onChange={update} />}
            {!general && <p className="doppler-fixed-velocity">{sourceOnly ? 'Observer velocity fixed: vₒ = 0 m/s.' : 'Source velocity fixed: vₛ = 0 m/s.'} Choose Both moving to change it.</p>}
            {!result && <div className="doppler-error-summary" role="alert">{calculationError || 'Check the highlighted inputs. Results and wavefronts are unavailable until every value is valid.'}</div>}
          </div>
        </section>
      </div>

      <section className="doppler-explanation" aria-labelledby={`${id}-formula-title`}>
        <div className="doppler-formula-panel">
          <p className="doppler-kicker">One equation · five cases</p>
          <h3 id={`${id}-formula-title`}>Count crests as they arrive.</h3>
          <p className="doppler-equation" aria-label="Observed frequency equals emitted frequency times c minus observer velocity divided by c minus source velocity">fₒᵦₛ = fₛ × (c − vₒ) / (c − vₛ)</p>
          <output className="doppler-substitution" aria-label="Doppler formula substitution">
            {result ? `${parameters.fs} Hz × [(${parameters.c} − (${parameters.vo})) m/s / (${parameters.c} − (${parameters.vs})) m/s] = ${format(result.observedHz)} Hz` : 'Enter valid inputs to see the numerical substitution.'}
          </output>
          <p className="doppler-interception">fₒᵦₛ = (c − vₒ) / λ₊{result && <> = {format(result.encounterSpeedMps)} m/s ÷ {format(result.wavelengthAheadM, 4)} m = {format(result.observedHz)} Hz</>}</p>
          <p className="doppler-hint">Values shown are rounded; calculations use full precision. Hz = s⁻¹; wavelengths are in metres and velocities in m/s.</p>
        </div>
        <div className="doppler-learning-notes">
          <article><h4>Moving source → different spacing</h4><p>During each period 1/fₛ, the source shifts by vₛ/fₛ. On the observer side, λ₊ = (c − vₛ)/fₛ; on the other side, λ₋ = (c + vₛ)/fₛ. A rightward source compresses +x crests and expands −x crests; a leftward source reverses that pattern.</p></article>
          <article><h4>Moving observer → different interception</h4><p>The observer does not reshape the waves. Right-going crests meet it at c − vₒ, so a negative vₒ increases the arrival rate. With vₛ = 0, both spacings remain c/fₛ.</p></article>
          <article><h4>Same closing speed ≠ same shift</h4><p>A source approaching at speed u gives fₛc/(c − u); an observer approaching at u gives fₛ(c + u)/c. They agree only approximately when u ≪ c. Use separate medium-frame velocities, not closing speed alone. If vₛ = vₒ, there is no shift, even though a moving source still changes the spacing.</p></article>
        </div>
      </section>
      <p className="doppler-model-note"><strong>Model boundary:</strong> constant, collinear, strictly subsonic motion in a uniform stationary medium; the observer remains to the right of the source, before they pass. No wind, echoes, startup transients, sonic shocks, or relativistic corrections. The point-source wavefront overlay is a schematic, not an audio playback or timed animation.</p>
    </section>
  );
}
