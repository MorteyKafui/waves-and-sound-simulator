"use client";

import { useId, useState, type ReactNode } from "react";
import {
  GAS_CONSTANT, GAS_PRESETS, LIQUID_PRESETS, SOLID_PRESETS,
  calculateSoundSpeed, calculateStringSpeed, calculateWaveSpeed,
  celsiusToKelvin, parseNumericInput,
  transitTime, waveAtSpeed,
  type SoundMedium, type SoundSpeedInput, type WaveSpeedTopic,
} from "@/lib/wave-speed";
import { SpeedBenchArt, type SpeedBenchKind } from "./speed-bench-art";
import { FigureLegend, type FigureKey } from "./iso/legend";

// CSS is deliberately separate: the host imports wave-speed-lab.css globally.
type Calculation<T> = { ok: true; value: T } | { ok: false; error: string };
type Metric = { label: string; value: number; unit: string; detail: string };

function evaluate<T,>(calculate: () => T): Calculation<T> {
  try { return { ok: true, value: calculate() }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Check the input values." }; }
}

function format(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value !== 0 && (Math.abs(value) < 0.001 || Math.abs(value) >= 1e6)) return value.toExponential(3);
  return new Intl.NumberFormat("en", { maximumSignificantDigits: 5 }).format(value);
}

function useFields<T extends Record<string, string>>(initial: T) {
  const [fields, setFields] = useState(initial);
  function update(key: keyof T, value: string) { setFields(previous => ({ ...previous, [key]: value })); }
  return [fields, update, setFields] as const;
}

function NumberField({ label, symbol, unit, value, onChange, step = 1, hint, minimum = 0 }: {
  label: string; symbol: string; unit: string; value: string; onChange: (value: string) => void;
  step?: number; hint?: string; minimum?: number;
}) {
  const id = useId();
  const parsed = evaluate(() => parseNumericInput(value, label));
  const invalid = !parsed.ok || parsed.value <= minimum;
  function increment(direction: number) {
    const current = parsed.ok ? parsed.value : 0;
    const next = Math.max(minimum + step, current + direction * step);
    if (Number.isFinite(next)) onChange(String(Number(next.toPrecision(12))));
  }
  return <div className="speed-field">
    <label className="speed-field-label" htmlFor={id}>{label} <span>{symbol} ({unit})</span></label>
    <div className="speed-number-control">
      <button className="speed-stepper" type="button" aria-label={`Decrease ${label.toLowerCase()}`} onClick={() => increment(-1)}>−</button>
      <input className="speed-number" id={id} type="number" inputMode="decimal" step="any" min={minimum}
        value={value} onChange={event => onChange(event.target.value)} required aria-invalid={invalid}
        aria-describedby={`${id}-help`} />
      <button className="speed-stepper" type="button" aria-label={`Increase ${label.toLowerCase()}`} onClick={() => increment(1)}>+</button>
    </div>
    <p className={`speed-field-hint${invalid ? " speed-field-error" : ""}`} id={`${id}-help`}>
      {invalid ? `Enter a finite value greater than ${format(minimum)} ${unit}.` : hint || `Measured in ${unit}.`}
    </p>
  </div>;
}

function Choices<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  return <div className="speed-choice-field">
    <span className="speed-control-label">{label}</span>
    <div className="speed-choices" role="group" aria-label={label}>
      {options.map(option => <button className="speed-choice" type="button" key={option.value}
        aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
    </div>
  </div>;
}

function Controls({ children }: { children: ReactNode }) {
  return <section className="speed-card speed-controls" aria-label="Experiment parameters">
    <header className="speed-card-heading"><span className="speed-kicker">THE INPUTS</span><h3>Make a measurement</h3></header>
    <div className="speed-controls-body">{children}</div>
  </section>;
}

function Readout({ result, formula, substitution, metrics }: {
  result: Calculation<{ speed: number }>; formula: string; substitution?: string; metrics: Metric[];
}) {
  return <section className="speed-card speed-readout" aria-label="Live calculation" aria-live="polite" aria-atomic="true">
    <div className="speed-result-heading"><span className="speed-kicker">CALCULATED WAVE SPEED</span>
      <output className="speed-result" aria-label="Calculated wave speed" data-testid="speed-result">
        {result.ok ? format(result.value.speed) : "—"}<span>m/s</span>
      </output>
    </div>
    <div className="speed-calculation"><p className="speed-formula">{formula}</p>
      {result.ok ? <p className="speed-substitution">{substitution}</p>
        : <p className="speed-error" role="status">{result.error} The trace is hidden until the inputs are valid.</p>}
    </div>
    {result.ok && <dl className="speed-metrics">{metrics.map(metric => <div className="speed-metric" key={metric.label}>
      <dt>{metric.label}</dt><dd>{format(metric.value)} <span>{metric.unit}</span></dd><p>{metric.detail}</p>
    </div>)}</dl>}
  </section>;
}

function LearningNotes({ title, children }: { title: string; children: ReactNode }) {
  return <section className="speed-card speed-notes"><span className="speed-kicker">READ THE PHYSICS</span>
    <h3>{title}</h3><div className="speed-notes-body">{children}</div></section>;
}

type SnapshotModel = { speed: number; wavelength?: number | null; period?: number | null; distance?: number; duration?: number };

/* One legend per bench, keyed to what the drawing actually shows. */
const BENCH_KEYS: Record<SpeedBenchKind, FigureKey[]> = {
  wave: [
    { mark: "lit", label: "The traced displacement" },
    { mark: "raised", label: "Chart reading head, at each end of the measured distance" },
    { mark: "flat", label: "The chart panel and its ruled scale" },
    { mark: "edge", label: "Index carriage, its pointer on a crest" },
  ],
  pulse: [
    { mark: "lit", label: "The travelling pulse crest" },
    { mark: "raised", label: "Chart reading head, at each end of the measured distance" },
    { mark: "flat", label: "The chart panel and its ruled scale" },
    { mark: "edge", label: "Index carriage, its pointer on the pulse" },
  ],
  string: [
    { mark: "lit", label: "The travelling string" },
    { mark: "raised", label: "Sliding jaw and tension screw" },
    { mark: "dotted", label: "The undisturbed rest line" },
    { mark: "flat", label: "Pointer rail, calibrated in metres" },
  ],
  sound: [
    { mark: "lit", label: "Compression band" },
    { mark: "raised", label: "Transducer, coupled to the specimen" },
    { mark: "raised", label: "The tracked particle, oscillating in place" },
    { mark: "flat", label: "Material section: solid, rod or fluid cell" },
  ],
};

function WaveFigure({ kind = "wave", model, caption, medium = "solid", solidMode = "bulk" }: {
  kind?: SpeedBenchKind; model: SnapshotModel | null; caption: string;
  medium?: SoundMedium; solidMode?: "bulk" | "rod";
}) {
  const [phase, setPhase] = useState(0);
  const id = useId();
  const duration = kind === "pulse" ? model?.duration : model?.period;
  return <figure className="speed-card speed-figure">
    <div className="speed-figure-top"><span className="speed-kicker">FIG. / THE MEASURING BENCH</span>
      <span className="speed-figure-state">{model ? "Live snapshot" : "Awaiting inputs"}</span></div>
    <SpeedBenchArt kind={kind} phase={phase} valid={model !== null} medium={medium} solidMode={solidMode}/>
    <FigureLegend keys={BENCH_KEYS[kind]}/>
    <div className="speed-figure-scale">{model ? kind === "pulse"
      ? <>Sensor separation: <strong>{format(model.distance!)} m</strong> · crest at {format(phase * model.distance!)} m</>
      : kind === "sound" ? <>Wavelength in the medium: <strong>λ = {format(model.wavelength!)} m</strong> · the particles stay put</>
      : <>Cursor spacing: <strong>λ = {format(model.wavelength!)} m</strong> · full ruler = 2λ</>
      : "Enter valid values to calibrate the ruler."}</div>

    <div className="speed-snapshot-controls">
      <div className="speed-snapshot-heading"><label htmlFor={id}>{kind === "pulse" ? "Pulse travel" : "Time through one period"}</label>
        <output htmlFor={id}>{model && duration ? `t = ${format(phase * duration)} s` : "t = —"}</output></div>
      <input className="speed-phase-range" id={id} type="range" min="0" max="1" step="0.01" value={phase}
        disabled={!model} onChange={event => setPhase(Number(event.target.value))}
        aria-valuetext={model && duration ? `${format(phase * duration)} seconds` : "Awaiting valid inputs"}/>
      <button className="speed-button speed-advance" type="button" disabled={!model}
        onClick={() => setPhase(previous => previous >= 1 ? 0 : Math.min(1, previous + 0.25))}>
        {phase >= 1 ? "Restart snapshot" : kind === "pulse" ? "Advance ¼ of transit" : "Advance ¼ period"}<span aria-hidden="true">→</span>
      </button>
    </div>
    <figcaption className="speed-figure-caption">{caption} Scrub the time control; there is no autoplay.</figcaption>
  </figure>;
}

function MeasurementLab() {
  const [method, setMethod] = useState<"frequency" | "cycles" | "transit">("frequency");
  const [fields, update] = useFields({ frequency: "5", wavelength: "0.8", cycles: "20", countingTime: "4", distance: "12", travelTime: "3" });
  const read = (key: keyof typeof fields, label: string) => parseNumericInput(fields[key], label);
  const result = evaluate(() => {
    const input = method === "transit"
      ? { method, distance: read("distance", "Travel distance"), time: read("travelTime", "Travel time") } as const
      : method === "cycles"
        ? { method, cycles: read("cycles", "Cycle count"), time: read("countingTime", "Counting time"), wavelength: read("wavelength", "Wavelength") } as const
        : { method, frequency: read("frequency", "Frequency"), wavelength: read("wavelength", "Wavelength") } as const;
    return { ...calculateWaveSpeed(input), input };
  });
  const value = result.ok ? result.value : null;
  const formula = method === "transit" ? "v = d / Δt" : method === "cycles" ? "f = N / Δt;  v = (N / Δt) × λ" : "v = f × λ";
  const substitution = value ? value.input.method === "transit"
    ? `${format(value.input.distance)} m / ${format(value.input.time)} s = ${format(value.speed)} m/s`
    : value.input.method === "cycles"
      ? `(${format(value.input.cycles)} cycles / ${format(value.input.time)} s) × ${format(value.wavelength!)} m = ${format(value.speed)} m/s`
      : `${format(value.frequency!)} Hz × ${format(value.wavelength!)} m = ${format(value.speed)} m/s` : undefined;
  const metrics: Metric[] = value && value.frequency !== null ? [
    { label: "Frequency", value: value.frequency, unit: "Hz", detail: method === "cycles" ? "Counted cycles ÷ counting time" : "Cycles passing a point per second" },
    { label: "Wavelength", value: value.wavelength!, unit: "m", detail: "Crest-to-crest spatial separation" },
    { label: "Period", value: value.period!, unit: "s", detail: "Time for one cycle: T = 1/f" },
  ] : value && value.input.method === "transit" ? [
    { label: "Travel distance", value: value.input.distance, unit: "m", detail: "Between the same two sensor positions" },
    { label: "Travel time", value: value.input.time, unit: "s", detail: "Time the same pulse crest takes" },
  ] : [];
  return <div className="speed-grid"><div className="speed-main-column">
    <WaveFigure key={method === "transit" ? "pulse" : "wave"} kind={method === "transit" ? "pulse" : "wave"}
      model={value ? { ...value, ...(value.input.method === "transit" ? { distance: value.input.distance, duration: value.input.time } : {}) } : null}
      caption={method === "transit" ? "Follow the same pulse crest from the first sensor to the second. The pulse width is illustrative."
        : "A spatial displacement trace over two wavelengths. The cursors mark neighbouring crests; vertical displacement is illustrative."}/>
    <Readout result={result} formula={formula} substitution={substitution} metrics={metrics}/>
    <LearningNotes title="Measure space and time separately">
      <p><strong>λ is a distance, not a height.</strong> Measure between adjacent crests at the same instant. Measure f by counting cycles passing one fixed point, or use f = N/Δt.</p>
      <p><strong>Keep units in SI.</strong> 1 Hz = 1 s⁻¹, so Hz × m = m/s. Convert centimetres to metres (÷100), and milliseconds to seconds (÷1000), before entering them.</p>
      <p>Distance/time gives the average speed of the tracked pulse. It matches fλ in a uniform, nondispersive medium. In dispersive media, pulse/group speed and crest/phase speed can differ. A particle does not travel with the crest.</p>
    </LearningNotes>
  </div><Controls>
    <Choices label="Measurement method" value={method} onChange={setMethod} options={[
      { value: "frequency", label: "f × λ" }, { value: "cycles", label: "Count cycles" }, { value: "transit", label: "Distance / time" },
    ]}/>
    {method === "frequency" && <NumberField label="Frequency" symbol="f" unit="Hz" value={fields.frequency} step={0.5}
      onChange={next => update("frequency", next)} hint="Cycles passing a fixed point each second."/>}
    {method === "cycles" && <>
      <NumberField label="Cycles counted" symbol="N" unit="cycles" value={fields.cycles} onChange={next => update("cycles", next)}/>
      <NumberField label="Counting time" symbol="Δt" unit="s" value={fields.countingTime} step={0.5} onChange={next => update("countingTime", next)}/>
    </>}
    {method !== "transit" ? <NumberField label="Wavelength" symbol="λ" unit="m" value={fields.wavelength} step={0.1}
      onChange={next => update("wavelength", next)} hint="Distance from one crest to the next, in metres."/> : <>
      <NumberField label="Travel distance" symbol="d" unit="m" value={fields.distance} onChange={next => update("distance", next)} hint="Separation of the two sensors, not round-trip distance."/>
      <NumberField label="Travel time" symbol="Δt" unit="s" value={fields.travelTime} step={0.1} onChange={next => update("travelTime", next)} hint="Time for the same pulse crest to travel that distance."/>
    </>}
    <p className="speed-control-note">These are measured inputs. Changing f at a fixed entered λ changes the calculated speed; it does not predict how a particular medium responds.</p>
  </Controls></div>;
}

function StringLab() {
  const [densityMode, setDensityMode] = useState<"direct" | "mass-length">("direct");
  const [fields, update] = useFields({ tension: "80", linearDensity: "0.005", mass: "0.01", length: "2", frequency: "50" });
  const read = (key: keyof typeof fields, label: string) => parseNumericInput(fields[key], label);
  const result = evaluate(() => {
    const common = { tension: read("tension", "Tension"), length: read("length", "String length"), frequency: read("frequency", "Frequency") };
    const input = densityMode === "direct" ? { ...common, densityMode, linearDensity: read("linearDensity", "Linear density") } as const
      : { ...common, densityMode, mass: read("mass", "String mass") } as const;
    return { ...calculateStringSpeed(input), input };
  });
  const value = result.ok ? result.value : null;
  const substitution = value ? `${value.input.densityMode === "mass-length" ? `μ = ${format(value.input.mass)} kg / ${format(value.input.length)} m = ${format(value.linearDensity)} kg/m; ` : ""}v = √(${format(value.input.tension)} N / ${format(value.linearDensity)} kg/m) = ${format(value.speed)} m/s` : undefined;
  return <div className="speed-grid"><div className="speed-main-column">
    <WaveFigure kind="string" model={value} caption="A travelling transverse displacement trace, not a standing-wave mode. The two-wavelength window is a spatial graph, not a drawing of the full string."/>
    <Readout result={result} formula="v = √(T / μ);  μ = m / L;  λ = v / f" substitution={substitution}
      metrics={value ? [
        { label: "Linear density", value: value.linearDensity, unit: "kg/m", detail: "Mass per unit length, not kg/m³" },
        { label: "Wavelength", value: value.wavelength, unit: "m", detail: `v / f at ${format(value.input.frequency)} Hz` },
        { label: "One-way travel time", value: value.travelTime, unit: "s", detail: `L / v over ${format(value.input.length)} m` },
      ] : []}/>
    <LearningNotes title="The string sets the speed; the driver sets f">
      <p>At fixed tension T and linear density μ, changing frequency <strong>does not change speed</strong>. It changes λ = v/f instead. Four times the tension gives twice the speed; four times μ gives half the speed.</p>
      <p>In mass/length mode, m is the mass of the uniform length L under tension. Changing L while keeping m fixed also changes μ. In direct-density mode, L only changes the end-to-end travel time.</p>
      <p>Assumptions: a uniform, taut, ideally flexible string with constant tension, small transverse slopes and negligible bending stiffness, stretching and damping. Large amplitudes or stiff strings can violate this linear, nondispersive model. No standing-wave boundary condition is imposed.</p>
    </LearningNotes>
  </div><Controls>
    <NumberField label="Tension" symbol="T" unit="N" value={fields.tension} step={5} onChange={next => update("tension", next)}/>
    <Choices label="Linear density input" value={densityMode} onChange={setDensityMode} options={[
      { value: "direct", label: "Enter μ" }, { value: "mass-length", label: "Mass / length" },
    ]}/>
    {densityMode === "direct" ? <NumberField label="Linear density" symbol="μ" unit="kg/m" value={fields.linearDensity} step={0.001}
      onChange={next => update("linearDensity", next)} hint="0.005 kg/m = 5 grams per metre."/>
      : <NumberField label="String mass" symbol="m" unit="kg" value={fields.mass} step={0.001}
        onChange={next => update("mass", next)} hint="Mass of the complete length L; 0.01 kg = 10 g."/>}
    <NumberField label="String length" symbol="L" unit="m" value={fields.length} step={0.1} onChange={next => update("length", next)}/>
    <NumberField label="Driving frequency" symbol="f" unit="Hz" value={fields.frequency} step={5} onChange={next => update("frequency", next)}
      hint="Changes wavelength, not speed, at fixed T and μ."/>
    <p className="speed-control-note">The unit check: N / (kg/m) = m²/s². Taking the square root gives m/s. This μ is linear density; it is not the volume density ρ used for sound.</p>
  </Controls></div>;
}

function SoundLab() {
  const [medium, setMedium] = useState<SoundMedium>("solid");
  const [solidMode, setSolidMode] = useState<"bulk" | "rod">("bulk");
  const [solid, updateSolid, setSolid] = useFields({ density: "7850", bulk: "160", shear: "79", young: "200" });
  const [liquid, updateLiquid, setLiquid] = useFields({ density: "998", bulk: "2.2" });
  const [gas, updateGas, setGas] = useFields({ gamma: "1.4", molarMass: "0.02897", temperature: "20" });
  const [frequency, setFrequency] = useState("1000");
  const result = evaluate(() => {
    let input: SoundSpeedInput;
    let kelvin: number | null = null;
    if (medium === "solid") {
      const density = parseNumericInput(solid.density, "Volume density");
      input = solidMode === "bulk" ? { medium, mode: solidMode, density,
        bulkModulus: parseNumericInput(solid.bulk, "Bulk modulus") * 1e9,
        shearModulus: parseNumericInput(solid.shear, "Shear modulus") * 1e9 }
        : { medium, mode: solidMode, density, youngModulus: parseNumericInput(solid.young, "Young’s modulus") * 1e9 };
    } else if (medium === "liquid") {
      input = { medium, density: parseNumericInput(liquid.density, "Volume density"), bulkModulus: parseNumericInput(liquid.bulk, "Bulk modulus") * 1e9 };
    } else {
      kelvin = celsiusToKelvin(parseNumericInput(gas.temperature, "Temperature"));
      input = { medium, temperatureKelvin: kelvin, gamma: parseNumericInput(gas.gamma, "Heat capacity ratio"), molarMass: parseNumericInput(gas.molarMass, "Molar mass") };
    }
    const speed = calculateSoundSpeed(input);
    const sourceFrequency = parseNumericInput(frequency, "Source frequency");
    return { speed, ...waveAtSpeed(speed, sourceFrequency), travelTime: transitTime(1, speed), kelvin, input, sourceFrequency };
  });
  const value = result.ok ? result.value : null;
  const formula = medium === "solid" ? solidMode === "bulk" ? "cL = √[(K + 4G/3) / ρ]" : "crod = √(E / ρ)"
    : medium === "liquid" ? "c = √(K / ρ)" : "c = √(γ R TK / M)";
  let substitution: string | undefined;
  if (value) {
    const input = value.input;
    const expression = input.medium === "gas" ? `√[${format(input.gamma)} × ${format(GAS_CONSTANT)} × ${format(input.temperatureKelvin)} / ${format(input.molarMass)}]`
      : input.medium === "solid" && input.mode === "rod" ? `√[(${format(input.youngModulus / 1e9)} × 10⁹ Pa) / ${format(input.density)} kg/m³]`
        : input.medium === "solid" ? `√[(${format(input.bulkModulus / 1e9)} + 4 × ${format(input.shearModulus / 1e9)} / 3) × 10⁹ Pa / ${format(input.density)} kg/m³]`
          : `√[(${format(input.bulkModulus / 1e9)} × 10⁹ Pa) / ${format(input.density)} kg/m³]`;
    substitution = `${expression} = ${format(value.speed)} m/s${value.kelvin !== null ? `; TK = ${format(value.kelvin)} K` : ""}`;
  }
  return <div className="speed-grid"><div className="speed-main-column">
    <WaveFigure kind="sound" model={value} medium={medium} solidMode={solidMode} caption="Longitudinal sound: compression bands travel while material particles oscillate parallel to that direction. The highlighted particle stays near its rest position; displacement and spacing are schematic."/>
    <Readout result={result} formula={formula} substitution={substitution} metrics={value ? [
      { label: "Wavelength", value: value.wavelength, unit: "m", detail: `c / f at ${format(value.sourceFrequency)} Hz` },
      { label: "Time over 1 metre", value: value.travelTime, unit: "s", detail: "One-way travel time: 1 m / c" },
      ...(value.kelvin !== null ? [{ label: "Absolute temperature", value: value.kelvin, unit: "K", detail: "TK = temperature in °C + 273.15" }]
        : [{ label: "Wave period", value: value.period, unit: "s", detail: "Source period: 1 / f" }]),
    ] : []}/>
    <LearningNotes title={medium === "solid" ? "Bulk solid and thin rod are different experiments" : medium === "liquid" ? "Compression travels through the liquid" : "Use absolute temperature, not Celsius"}>
      {medium === "solid" ? <>
        <p><strong>Bulk longitudinal:</strong> cL = √[(K + 4G/3)/ρ] for a homogeneous, isotropic elastic solid, with wavelengths small compared with its transverse dimensions. K is bulk modulus; G is shear modulus.</p>
        <p><strong>Thin rod:</strong> crod = √(E/ρ) for a long, slender rod with traction-free sides and wavelengths much larger than its diameter. The rod can contract laterally; E is Young’s modulus. Do not substitute E for K + 4G/3 in the bulk formula.</p>
        <p>Only the active model’s moduli are used. Real solids can be anisotropic and support other wave modes. These are small-strain, longitudinal, lossless approximations, not transverse string waves.</p>
      </> : medium === "liquid" ? <>
        <p>Sound is a <strong>longitudinal pressure disturbance</strong>, not a surface ripple. K is the adiabatic bulk modulus (resistance to compression), and ρ is mass per unit volume.</p>
        <p>A larger K increases c; a larger ρ at fixed K decreases it. A simple liquid does not sustain static shear stress, so this model has no shear-modulus term.</p>
        <p>Assume a uniform, bubble-free, small-amplitude liquid with negligible loss. Presets are approximate near 20 °C; pressure, temperature and dissolved gas can change the actual material properties.</p>
      </> : <>
        <p><strong>TK = °C + 273.15.</strong> Absolute temperature must be above 0 K. At fixed composition and constant γ, quadrupling TK doubles the sound speed; quadrupling Celsius does not.</p>
        <p>γ = Cp/Cv is dimensionless; M is in <strong>kg/mol</strong>, not g/mol. R = 8.314462618 J/(mol·K). Adiabatic compression gives c = √(γRTK/M), equivalent to √(γp/ρ) for an ideal gas.</p>
        <p>Assume a dilute, ideal gas, a small sound amplitude and constant γ, away from phase changes. Pressure cancels at fixed temperature and composition in this model. Changing source frequency changes λ, not c.</p>
      </>}
    </LearningNotes>
  </div><Controls>
    <Choices label="Sound medium" value={medium} onChange={setMedium} options={[
      { value: "solid", label: "Solid" }, { value: "liquid", label: "Liquid" }, { value: "gas", label: "Gas" },
    ]}/>
    {medium === "solid" && <Choices label="Solid propagation model" value={solidMode} onChange={setSolidMode} options={[
      { value: "bulk", label: "Bulk longitudinal" }, { value: "rod", label: "Thin rod" },
    ]}/>}
    <div className="speed-preset-group"><span className="speed-control-label">Load reference properties</span><div className="speed-presets">
      {medium === "solid" ? SOLID_PRESETS.map(preset => <button className="speed-button" type="button" key={preset.id}
        onClick={() => setSolid({ density: String(preset.density), bulk: String(preset.bulkModulus / 1e9), shear: String(preset.shearModulus / 1e9), young: String(preset.youngModulus / 1e9) })}>{preset.name}</button>)
        : medium === "liquid" ? LIQUID_PRESETS.map(preset => <button className="speed-button" type="button" key={preset.id}
          onClick={() => setLiquid({ density: String(preset.density), bulk: String(preset.bulkModulus / 1e9) })}>{preset.name}</button>)
          : GAS_PRESETS.map(preset => <button className="speed-button" type="button" key={preset.id}
            onClick={() => setGas(previous => ({ ...previous, gamma: String(preset.gamma), molarMass: String(preset.molarMass) }))}>{preset.name}</button>)}
    </div><p className="speed-field-hint">{medium === "gas" ? "Loads gas composition; keeps your temperature." : "Approximate properties near 20 °C. All values below remain editable."}</p></div>
    {medium === "gas" ? <>
      <NumberField label="Temperature" symbol="θ" unit="°C" value={gas.temperature} step={5} minimum={-273.15}
        onChange={next => updateGas("temperature", next)} hint="Converted to Kelvin before calculation: TK = θ + 273.15."/>
      <NumberField label="Heat capacity ratio" symbol="γ" unit="dimensionless" value={gas.gamma} step={0.01} minimum={1}
        onChange={next => updateGas("gamma", next)} hint="Cp / Cv; greater than one for this ideal-gas model."/>
      <NumberField label="Molar mass" symbol="M" unit="kg/mol" value={gas.molarMass} step={0.001}
        onChange={next => updateGas("molarMass", next)} hint="Dry air: 28.97 g/mol = 0.02897 kg/mol."/>
    </> : <>
      <NumberField label="Volume density" symbol="ρ" unit="kg/m³" value={medium === "solid" ? solid.density : liquid.density} step={50}
        onChange={next => medium === "solid" ? updateSolid("density", next) : updateLiquid("density", next)}/>
      {medium === "solid" && solidMode === "rod" ? <NumberField label="Young’s modulus" symbol="E" unit="GPa" value={solid.young} step={5}
        onChange={next => updateSolid("young", next)} hint="Axial stiffness for a thin rod with free sides."/> : <>
        <NumberField label="Bulk modulus" symbol="K" unit="GPa" value={medium === "solid" ? solid.bulk : liquid.bulk} step={medium === "solid" ? 5 : 0.1}
          onChange={next => medium === "solid" ? updateSolid("bulk", next) : updateLiquid("bulk", next)} hint="Resistance to volume change; use the adiabatic modulus."/>
        {medium === "solid" && <NumberField label="Shear modulus" symbol="G" unit="GPa" value={solid.shear} step={5}
          onChange={next => updateSolid("shear", next)} hint="Bulk longitudinal waves include the 4G/3 contribution."/>}
      </>}
      <p className="speed-control-note">Moduli are entered in GPa: 1 GPa = 10⁹ Pa. The calculation converts to pascals, so Pa / (kg/m³) = m²/s². No automatic temperature correction is applied to these material values.</p>
    </>}
    <div className="speed-control-divider"/>
    <NumberField label="Source frequency" symbol="f" unit="Hz" value={frequency} step={100} onChange={setFrequency}
      hint="Used for λ = c/f and the snapshot period, not to set c."/>
  </Controls></div>;
}

const TOPIC_INFO = {
  "wave-speed": { title: "Determining wave speed", badge: "MEASURE & CALCULATE", description: "Track a crest, count cycles, or time a pulse. Connect a measurable distance to a measurable time." },
  "string-speed": { title: "Wave speed on a string", badge: "TRANSVERSE WAVES", description: "Explore how tension and mass per unit length set the speed of a small disturbance along a string." },
  "sound-speed": { title: "Sound speed in solids, liquids & gases", badge: "LONGITUDINAL SOUND", description: "Choose a material and the right compression model. Stiffness, density and absolute temperature tell the story." },
} satisfies Record<WaveSpeedTopic, { title: string; badge: string; description: string }>;

export function WaveSpeedLab({ topic }: { topic: "wave-speed" | "string-speed" | "sound-speed" }) {
  const [resetKey, setResetKey] = useState(0);
  const id = useId();
  const info = TOPIC_INFO[topic];
  return <section className="speed-lab" aria-labelledby={id}>
    <header className="speed-heading"><div><span className="speed-topic-badge">{info.badge}</span><h2 id={id}>{info.title}</h2><p>{info.description}</p></div>
      <button className="speed-button speed-reset" type="button" onClick={() => setResetKey(previous => previous + 1)}>Reset experiment <span aria-hidden="true">↺</span></button>
    </header>
    <div className="speed-workspace" key={`${topic}-${resetKey}`}>
      {topic === "wave-speed" ? <MeasurementLab/> : topic === "string-speed" ? <StringLab/> : <SoundLab/>}
    </div>
  </section>;
}
