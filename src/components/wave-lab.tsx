"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icon, type IconName } from "./icon";
import { WaveSpeedLab } from "./wave-speed-lab";
import { DopplerLab } from "./doppler-lab";
import { WavePropertiesLab } from "./wave-properties-lab";
import { SmallScreenNotice } from "./small-screen-notice";
import { ThemeSwitcher } from "./theme-switcher";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tank, type ProbePoint } from "./tank/tank";
import type { TankArtwork } from "./tank/art";
import { deriveWave, MODEL_NOTES, type Experiment, type WaveParameters } from "@/lib/wave-physics";
import { EXPERIMENT_ORDER, EXPERIMENTS, experimentDefaults } from "@/lib/experiments";
import { createObservation, NOTEBOOK_KEY, observationsToCsv, parseObservations, type Observation } from "@/lib/notebook";

type Workspace = "laboratory" | "notebook" | "guide";
const ADDITIONAL_TOPICS = [
  { id: "wave-properties", name: "Wave properties", number: "05", icon: "waves", subtitle: "Amplitude, crests, troughs and timing.", description: "Simulate amplitude, frequency, period and wavelength on a calibrated travelling-wave graph." },
  { id: "wave-speed", name: "Wave speed", number: "06", icon: "speed", subtitle: "Measure distance. Count time.", description: "Determine wave speed from frequency and wavelength, counted cycles, or a pulse’s travel time." },
  { id: "string-speed", name: "Wave on a string", number: "07", icon: "string", subtitle: "Tension meets linear density.", description: "Explore how tension and mass per unit length determine transverse wave speed." },
  { id: "sound-speed", name: "Solids, liquids & gases", number: "08", icon: "medium", subtitle: "Different materials. Different speeds.", description: "Calculate longitudinal sound speed using stiffness, density and gas temperature." },
  { id: "doppler", name: "Doppler effect", number: "09", icon: "doppler", subtitle: "Motion changes the arrival rate.", description: "Compare moving sources, moving observers and the general case with both in motion." },
] as const;
type AdditionalTopic = typeof ADDITIONAL_TOPICS[number]["id"];
type LabTopic = Experiment | AdditionalTopic;
const LAB_TOPICS: { id: LabTopic; name: string; number: string; icon: IconName; subtitle: string }[] = [
  ...EXPERIMENT_ORDER.map(id => ({ id, ...EXPERIMENTS[id], icon: id })),
  ...ADDITIONAL_TOPICS,
];
function isTankTopic(topic: LabTopic): topic is Experiment {
  return EXPERIMENT_ORDER.some(id => id === topic);
}
const fmt = (value: number, digits = 1) => value.toFixed(digits);
const subscribe = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener("wavelab-notebook", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("wavelab-notebook", callback); };
};
const readNotebook = () => { try { return localStorage.getItem(NOTEBOOK_KEY); } catch { return null; } };
const noNotebook = () => null;

function RangeControl({ label, symbol, value, min, max, step = 1, unit, onChange, digits = 0 }: {
  label: string; symbol: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (value: number) => void; digits?: number;
}) {
  const id = `control-${label.toLowerCase().replaceAll(/[^a-z0-9]/g, "-")}`;
  return <div className="range-control">
    <div className="range-heading"><label id={`${id}-label`} htmlFor={id}>{label} <span className="variable">{symbol}</span></label><output htmlFor={id}>{fmt(value, digits)} <span>{unit}</span></output></div>
    <Slider id={id} aria-labelledby={`${id}-label`} min={min} max={max} step={step} value={[value]} onValueChange={values => onChange(Array.isArray(values) ? values[0] : values)} />
    <div className="range-limits"><span>{min} {unit}</span><span>{max} {unit}</span></div>
  </div>;
}

function SmallWave({ variant = "interference" }: { variant?: Experiment }) {
  return <svg className="mini-wave" viewBox="0 0 100 60" fill="none" aria-hidden="true">
    {variant === "interference" ? <>{[10, 19, 28, 37].map(r => <g key={r}><circle cx="38" cy="30" r={r}/><circle cx="62" cy="30" r={r}/></g>)}</> :
      variant === "reflection" ? <><path d="M77 5v50"/>{[13, 25, 37, 49, 61].map(x => <path key={x} d={`M${x} 10v40`}/>)}</> :
      variant === "refraction" ? <><path d="M50 3v54"/>{[8, 23, 38].map(x => <path key={x} d={`M${x} 3l20 54`}/>)}{[57, 66, 75, 84].map(x => <path key={x} d={`M${x} 3l8 54`}/>)}</> :
      <><path d="M38 3v20m0 14v20"/>{[8, 18, 28].map(x => <path key={x} d={`M${x} 6v48`}/>)}{[12, 24, 36, 48].map(r => <path key={r} d={`M${38 + r * .45} ${30 - r * .86}a${r} ${r} 0 0 1 0 ${r * 1.72}`}/>)}</>}
  </svg>;
}

export function WaveLab({ art }: { art: TankArtwork }) {
  const [topic, setTopic] = useState<LabTopic>("wave-properties");
  const [experiment, setExperiment] = useState<Experiment>("interference");
  const [parameters, setParameters] = useState<WaveParameters>(() => experimentDefaults("interference"));
  const [workspace, setWorkspace] = useState<Workspace>("laboratory");
  const [mode, setMode] = useState<"guided" | "sandbox">("guided");
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(0.1);
  const [display, setDisplay] = useState<"elevation" | "envelope">("elevation");
  const [grid, setGrid] = useState(false);
  const [top, setTop] = useState(false);

  const [resetKey, setResetKey] = useState(0);
  const [stepKey, setStepKey] = useState(0);
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);
  const [probe, setProbe] = useState<ProbePoint>({ x: 100, y: 0 });
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const rawNotebook = useSyncExternalStore(subscribe, readNotebook, noNotebook);
  const records = useMemo(() => parseObservations(rawNotebook), [rawNotebook]);
  const clock = useRef(0);

  const theoryRef = useRef<HTMLDivElement>(null);
  const guidedRef = useRef<HTMLDivElement>(null);
  const derived = useMemo(() => deriveWave(parameters), [parameters]);
  const info = EXPERIMENTS[experiment];
  const currentStep = info.steps[step];
  const steepness = derived.k * parameters.amplitude / 1000;
  const depthRatio = parameters.amplitude / Math.min(parameters.depth, experiment === "refraction" ? parameters.secondDepth : parameters.depth);
  const linearWarning = steepness > 0.2 || depthRatio > 0.1;
  const isReduced = useSyncExternalStore(
    callback => { const mq = matchMedia("(prefers-reduced-motion: reduce)"); mq.addEventListener("change", callback); return () => mq.removeEventListener("change", callback); },
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);


  function update(patch: Partial<WaveParameters>) { setParameters(previous => ({ ...previous, ...patch })); }
  function chooseTopic(next: LabTopic) {
    if (isTankTopic(next)) chooseExperiment(next);
    else { setTopic(next); setWorkspace("laboratory"); }
  }
  function chooseExperiment(next: Experiment) {
    setTopic(next);
    clock.current = 0;
    setExperiment(next); setParameters({ ...experimentDefaults(next), ...(mode === "guided" ? EXPERIMENTS[next].steps[0].patch : {}) }); setStep(0); setResetKey(key => key + 1);
    setProbe({ x: next === "reflection" ? 60 : 100, y: 0 }); setWorkspace("laboratory");
  }
  function reset() {
    clock.current = 0;
    setParameters({ ...experimentDefaults(experiment), ...(mode === "guided" ? EXPERIMENTS[experiment].steps[0].patch : {}) }); setStep(0); setResetKey(key => key + 1); setProbe({ x: experiment === "reflection" ? 60 : 100, y: 0 });
    setToast("Experiment reset to its starting conditions.");
  }
  function store(next: Observation[]) {
    try { localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(next.slice(0, 100))); window.dispatchEvent(new Event("wavelab-notebook")); return true; }
    catch { setToast("Your browser could not save the notebook. Check local storage permissions."); return false; }
  }
  function saveObservation() {
    const record = createObservation(experiment, parameters, probe, clock.current, note);
    if (store([record, ...records])) { setNote(""); setToast("Observation saved to your lab notebook."); }
  }
  function exportCsv() {
    const url = URL.createObjectURL(new Blob(["\uFEFF", observationsToCsv(records)], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = "wavelab-observations.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Notebook exported as CSV.");
  }
  function applyStep(next: number) {
    setStep(next); update(info.steps[next].patch);
  }
  function completeStep() {
    const id = `${experiment}-${step}`;
    if (!completed.includes(id)) setCompleted(previous => [...previous, id]);
    if (step < info.steps.length - 1) applyStep(step + 1);
    else setToast("Investigation complete. Keep experimenting, or try another phenomenon.");
  }
  const specialMetric = experiment === "interference" ? { label: "Fringe spacing", value: fmt(derived.fringeSpacing), unit: "mm", foot: "Far-field estimate · L = 300 mm", symbol: "Δy" }
    : experiment === "reflection" ? { label: "Reflection angle", value: fmt(parameters.angle), unit: "°", foot: "Measured from the wall normal", symbol: "θᵣ" }
    : experiment === "refraction" ? { label: "Refraction angle", value: derived.refractedAngle === null ? "TIR" : fmt(derived.refractedAngle), unit: derived.refractedAngle === null ? "" : "°", foot: derived.refractedAngle === null ? "Evanescent transmitted field" : "Frequency remains unchanged", symbol: "θ₂" }
    : { label: "Aperture ratio", value: fmt(derived.slitRatio, 2), unit: "", foot: "Aperture width / wavelength", symbol: "a/λ" };

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to laboratory</a>
    <aside className="sidebar">
      <button className="brand" onClick={() => setWorkspace("laboratory")} aria-label="Wavelab home"><span className="brand-mark"><Icon name="waves" size={25}/></span><span>wavelab<span className="brand-period">.</span></span></button>
      <div className="sidebar-workspace"><span className="workspace-symbol"><Icon name="flask" size={19}/></span><span>Physics workspace<small>Your personal laboratory</small></span><Icon name="chevron" size={13}/></div>
      <span className="nav-caption">WORKSPACE</span>
      <nav className="workspace-nav" aria-label="Workspace">
        <button className={workspace === "laboratory" ? "active" : ""} onClick={() => setWorkspace("laboratory")}><Icon name="lab" size={18}/>Laboratory<span className="nav-active-dot"/></button>
        <button className={workspace === "notebook" ? "active" : ""} onClick={() => setWorkspace("notebook")}><Icon name="book" size={18}/>Lab notebook<span className="nav-count">{records.length.toString().padStart(2, "0")}</span></button>
        <button className={workspace === "guide" ? "active" : ""} onClick={() => setWorkspace("guide")}><Icon name="help" size={18}/>Field guide</button>
      </nav>
      <span className="nav-caption experiment-caption">EXPERIMENTS <span>09</span></span>
      <nav className="experiment-nav" aria-label="Choose an experiment">
        {LAB_TOPICS.map(item => <button key={item.id} className={topic === item.id && workspace === "laboratory" ? "selected" : ""} onClick={() => chooseTopic(item.id)}><Icon name={item.icon} size={19}/><span>{item.name}</span><span className="experiment-nav-number">{item.number}</span></button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="curiosity-card"><SmallWave/><span>A little curiosity goes a long way.</span><p>Change one thing.<br/>See what follows.</p><button onClick={() => { setWorkspace("laboratory"); setMode("guided"); setTimeout(() => guidedRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }}>Start an investigation <Icon name="arrow" size={15}/></button></div>
        <button className="sidebar-help" onClick={() => setShowHelp(true)}><Icon name="help" size={17}/>A hand getting started?<Icon name="external" size={13}/></button>
        <div className="sidebar-footer"><span className="avatar">W</span><span>Independent explorer<small>Learning, by doing.</small></span><span className="online-dot"/></div>
      </div>
    </aside>

    <div className="main-shell min-w-0 flex-1">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={12}/><strong>{workspace === "laboratory" ? "Wave physics" : workspace === "notebook" ? "Lab notebook" : "Field guide"}</strong></div><div className="topbar-right"><span className="local-badge"><span/>All experiments. No equipment.</span><ThemeSwitcher /><button className="icon-button" aria-label="Open help" onClick={() => setShowHelp(true)}><Icon name="help" size={18}/></button></div></header>
      <main id="main-content" className="main-content mx-auto w-full">
        {workspace === "laboratory" && <>
          <section className="page-intro"><div><div className="eyebrow"><span className="tiny-wave">≈</span> AN INTERACTIVE PHYSICS LABORATORY</div><h1>A space to make <span>waves.</span></h1><p>Change a variable. Measure a wave. Explore water, strings, sound and motion.</p></div><Button variant="outline" className="intro-guide h-9 text-[10px]" onClick={() => setWorkspace("guide")}><Icon name="book" size={16}/>A quick field guide<Icon name="arrow" size={15}/></Button></section>
          <Tabs value={topic} onValueChange={value => chooseTopic(value as LabTopic)} className="gap-0">
          <TabsList className="experiment-tabs" aria-label="Wave phenomena">
            {LAB_TOPICS.map(item => <TabsTrigger key={item.id} value={item.id} className={`experiment-tab${topic === item.id ? " active" : ""}`}><span className="tab-number">{item.number}</span><Icon name={item.icon} size={19}/>{item.name}<span className="tab-arrow"><Icon name="arrow" size={15}/></span></TabsTrigger>)}
          </TabsList>
          <TabsContent key={topic} value={topic} className="experiment-panel">
            {isTankTopic(topic) ? <>
            <div className="experiment-heading"><div><div className="experiment-title-row"><h2>{info.name}</h2><Badge variant="outline" className="water-badge">WATER WAVES</Badge></div><p>{info.description}</p></div><div className="mode-switch" aria-label="Experiment mode"><Button variant="ghost" size="sm" className={mode === "guided" ? "active" : ""} aria-pressed={mode === "guided"} onClick={() => { setMode("guided"); applyStep(step); }}><Icon name="book" size={14}/>Guided</Button><Button variant="ghost" size="sm" className={mode === "sandbox" ? "active" : ""} aria-pressed={mode === "sandbox"} onClick={() => setMode("sandbox")}><Icon name="settings" size={14}/>Sandbox</Button></div></div>
            <div className="lab-grid">
              <div className="visualization-column">
                <figure className="simulation-card iso-plate">
                  <div className="simulation-topline"><span className="figure-index">FIG. {info.number} <span>/</span> THE RIPPLE TANK</span><span className="simulation-status"><span className={playing && !isReduced ? "status-dot running" : "status-dot"}/>{isReduced ? "Reduced motion" : playing ? "Simulation running" : "Simulation paused"}</span></div>
                  <div className="scene-view-controls"><button aria-label="Isometric view" aria-pressed={!top} className={!top ? "active" : ""} onClick={() => setTop(false)}>Isometric</button><button aria-label="Top view" aria-pressed={top} className={top ? "active" : ""} onClick={() => setTop(true)}>Top view</button></div>
                  <Tank art={art} experiment={experiment} parameters={parameters} playing={playing} speed={speed} display={display} grid={grid} top={top} resetKey={resetKey} stepKey={stepKey} probe={probe} onProbeChange={setProbe} clockRef={clock}/>
                  <div className="scene-bottomline"><span><Icon name="target" size={13}/>Click the water to move the probe</span><span>400 × 300 mm <span className="legend-line"/> {display === "envelope" ? "Amplitude envelope" : "Surface elevation"}</span></div>
                  <div className="simulation-toolbar"><div className="playback-controls"><Button size="icon-sm" aria-label={playing ? "Pause simulation" : "Play simulation"} title={playing ? "Pause" : "Play"} onClick={() => setPlaying(value => !value)}><Icon name={playing ? "pause" : "play"} size={16}/></Button><Button variant="ghost" size="icon-sm" aria-label="Advance one frame" title="Pause and advance 1/240 s" onClick={() => { setPlaying(false); setStepKey(key => key + 1); }}><Icon name="step" size={17}/></Button><Button variant="ghost" size="icon-sm" aria-label="Reset experiment" title="Reset experiment" onClick={reset}><Icon name="reset" size={17}/></Button><span className="toolbar-separator"/><div className="speed-label"><span className="hidden sm:inline">Speed</span><Select value={String(speed)} onValueChange={value => setSpeed(Number(value))}><SelectTrigger aria-label="Playback speed" size="sm" className="h-7 min-w-14 gap-1 px-1.5 text-[10px]"><SelectValue>{speed}×</SelectValue></SelectTrigger><SelectContent alignItemWithTrigger={false} className="min-w-24">{[0.05, 0.1, 0.25, 0.5, 1].map(value => <SelectItem key={value} value={String(value)}>{value}×</SelectItem>)}</SelectContent></Select></div></div><div className="display-controls"><button className={`toolbar-option${grid ? " active" : ""}`} aria-label="Grid" aria-pressed={grid} onClick={() => setGrid(value => !value)}><Icon name="grid" size={15}/><span>Grid</span></button><button className={`toolbar-option${display === "envelope" ? " active" : ""}`} aria-label="Envelope" aria-pressed={display === "envelope"} onClick={() => setDisplay(value => value === "elevation" ? "envelope" : "elevation")}><Icon name="layers" size={16}/><span>Envelope</span></button></div></div>
                </figure>
                <Card className="measurement-strip grid grid-cols-3 gap-0 ring-0" aria-label="Live wave measurements">
                  <div className="measurement"><span className="measurement-label">Wavelength <span>λ</span></span><strong>{fmt(derived.wavelength)}<small>mm</small></strong><span className="measurement-foot">From the dispersion relation</span></div>
                  <div className="measurement"><span className="measurement-label">Phase speed <span>c</span></span><strong>{fmt(derived.phaseSpeed, 3)}<small>m/s</small></strong><span className="measurement-foot">Frequency × wavelength</span></div>
                  <div className="measurement"><span className="measurement-label">{specialMetric.label}<span>{specialMetric.symbol}</span></span><strong>{specialMetric.value}<small>{specialMetric.unit}</small></strong><span className="measurement-foot">{specialMetric.foot}</span></div>
                </Card>
              </div>
              <Card className="controls-card gap-0 py-0 ring-0" role="complementary" aria-label="Experiment parameters"><div className="controls-title"><span><Icon name="settings" size={17}/>Make it your experiment</span><button className="icon-button" onClick={reset} aria-label="Reset parameters" title="Reset parameters"><Icon name="reset" size={15}/></button></div><div className="controls-body">
                <div className="controls-section-label">THE WAVE</div>
                <RangeControl label="Frequency" symbol="f" value={parameters.frequency} min={2} max={12} step={0.5} unit="Hz" digits={1} onChange={frequency => update({ frequency })}/>
                <RangeControl label="Amplitude" symbol="a₀" value={parameters.amplitude} min={0} max={0.8} step={0.05} unit="mm" digits={2} onChange={amplitude => update({ amplitude })}/>
                <RangeControl label={experiment === "refraction" ? "Incident depth" : "Water depth"} symbol="h" value={parameters.depth} min={2} max={25} unit="mm" onChange={depth => update({ depth })}/>
                <div className="controls-divider"/>
                <div className="controls-section-label">{experiment === "interference" ? "THE SOURCES" : experiment === "refraction" ? "THE DEPTH STEP" : experiment === "diffraction" ? "THE APERTURE" : "THE BOUNDARY"}</div>
                {experiment === "interference" && <><RangeControl label="Source separation" symbol="d" value={parameters.separation} min={20} max={140} unit="mm" onChange={separation => update({ separation })}/><RangeControl label="Relative phase" symbol="Δφ" value={parameters.phase} min={0} max={360} step={5} unit="°" onChange={phase => update({ phase })}/></>}
                {(experiment === "reflection" || experiment === "refraction") && <RangeControl label="Incidence angle" symbol="θᵢ" value={parameters.angle} min={0} max={75} unit="°" onChange={angle => update({ angle })}/>}
                {experiment === "refraction" && <RangeControl label="Transmitted depth" symbol="h₂" value={parameters.secondDepth} min={2} max={25} unit="mm" onChange={secondDepth => update({ secondDepth })}/>}
                {experiment === "diffraction" && <RangeControl label="Aperture width" symbol="a" value={parameters.slitWidth} min={8} max={120} unit="mm" onChange={slitWidth => update({ slitWidth })}/>}
                <div className="preset-row"><span>Try a preset</span><div>{info.presets.map(preset => <Button key={preset.name} variant="outline" size="xs" className="h-6 gap-1 px-1.5 text-[8px]" onClick={() => update(preset.patch)}>{preset.name}<Icon name="arrow" size={11}/></Button>)}</div></div>
                {linearWarning && <p className="model-warning"><Icon name="info" size={14}/>Small-amplitude limits are strained. Treat the linear solution qualitatively.</p>}
                <Button className="save-observation h-auto w-full" onClick={saveObservation}><Icon name="plus" size={16}/>Save observation<Icon name="arrow" size={15}/></Button>
                <span className="saved-locally"><span/>Saved only in this browser</span>
              </div></Card>
            </div>
            </> : topic === "wave-properties" ? <WavePropertiesLab/> : topic === "doppler" ? <DopplerLab/> : <WaveSpeedLab topic={topic}/>}
          </TabsContent>
          </Tabs>
          {isTankTopic(topic) && <>
          <div className="learning-grid">
            <Card className="investigation-card gap-0 ring-0" ref={guidedRef}>
              {mode === "guided" ? <><div className="section-topline"><span className="section-eyebrow"><Icon name="flask" size={15}/>THE INVESTIGATION</span><span className="step-counter">STEP {step + 1} OF 3</span></div><div className="investigation-content"><div className="step-indicator">{(step + 1).toString().padStart(2, "0")}<span/></div><div><h3>{currentStep.title}</h3><p>{currentStep.instruction}</p><div className="question"><span>THINK ABOUT IT</span>{currentStep.question}</div></div></div><div className="investigation-footer"><div className="step-dots" aria-label="Investigation steps">{info.steps.map((s, index) => <button key={s.title} onClick={() => applyStep(index)} aria-label={`Step ${index + 1}: ${s.title}`} aria-current={step === index ? "step" : undefined} className={step === index ? "active" : completed.includes(`${experiment}-${index}`) ? "complete" : ""}>{completed.includes(`${experiment}-${index}`) ? <Icon name="check" size={10}/> : index + 1}</button>)}</div><button onClick={completeStep} className="text-button">{step === 2 ? "Complete investigation" : "Next step"}<Icon name={step === 2 ? "check" : "arrow"} size={15}/></button></div></> : <><div className="section-topline"><span className="section-eyebrow"><Icon name="settings" size={15}/>YOUR SANDBOX</span><span className="step-counter">NO WRONG TURNS</span></div><h3>Follow your own question.</h3><p>Try a preset or change one parameter at a time. Use the probe to measure the field and save the conditions you want to compare.</p><label className="note-label" htmlFor="observation-note">What did you notice?</label><Textarea id="observation-note" placeholder="Make a prediction, note a pattern, or record a question…" value={note} maxLength={4096} onChange={event => setNote(event.target.value)}/><div className="sandbox-footer"><span>Saved with your next observation</span><button className="text-button" onClick={saveObservation}>Add to notebook<Icon name="plus" size={15}/></button></div></>}
            </Card>
            <Card className="theory-card gap-0 ring-0" ref={theoryRef}><div className="section-topline"><span className="section-eyebrow"><Icon name="book" size={15}/>BENEATH THE SURFACE</span><span className="theory-symbol">ƒ</span></div><h3>The principle, in a nutshell.</h3><div className="equation">{info.equation}</div><p>{info.explanation}</p><div className="theory-tip"><Icon name="info" size={15}/><span>{info.tip}</span></div><button className="text-button" onClick={() => setWorkspace("guide")}>Explore the model<Icon name="arrow" size={14}/></button></Card>
          </div>
          <div className="lab-footnote"><span><span className="status-dot"/>Linear capillary–gravity model <span className="footnote-dot">·</span> Steady-state waves <span className="footnote-dot">·</span> Contrast-enhanced elevation</span><span>Built for a deeper understanding.</span></div>
          </>}
        </>}

        {workspace === "notebook" && <>
          <section className="page-intro"><div><div className="eyebrow">YOUR OBSERVATIONS, ALL TOGETHER</div><h1>The lab <span>notebook.</span></h1><p>A record of your curiosity. Saved locally in this browser, ready to compare.</p></div><Button variant="outline" className="h-9 text-[10px]" disabled={!records.length} onClick={exportCsv}><Icon name="download" size={16}/>Export CSV</Button></section>
          <div className="notebook-summary"><span><Icon name="book" size={18}/>{records.length} {records.length === 1 ? "observation" : "observations"}</span><span>Up to 100 observations · no account required</span>{records.length > 0 && <button className="text-button danger" onClick={() => setClearConfirm(true)}>Clear notebook</button>}</div>
          {clearConfirm && <div className="clear-confirm" role="alert"><span>Delete every saved observation? This cannot be undone.</span><button className="secondary-button" onClick={() => setClearConfirm(false)}>Cancel</button><button className="danger-button" onClick={() => { if (store([])) setClearConfirm(false); }}>Delete observations</button></div>}
          {!records.length ? <section className="notebook-empty"><div className="empty-illustration"><SmallWave/><Icon name="book" size={32}/></div><h2>Every discovery starts somewhere.</h2><p>Save an observation from the tank to record its settings, probe reading, and your notes.</p><Button className="mt-6 h-10" onClick={() => setWorkspace("laboratory")}>Back to the laboratory<Icon name="arrow" size={17}/></Button></section> : <div className="notebook-grid">{records.map((record, index) => <article className="observation-card" key={record.id}><div className="observation-heading"><span><Icon name={record.experiment} size={19}/>{EXPERIMENTS[record.experiment].name}</span><span className="observation-number">OBS. {(records.length - index).toString().padStart(2, "0")}</span><button className="icon-button" aria-label={`Delete observation ${records.length - index}`} onClick={() => store(records.filter(item => item.id !== record.id))}><Icon name="close" size={15}/></button></div><div className="observation-stats"><div><small>Frequency</small><strong>{record.parameters.frequency} Hz</strong></div><div><small>Depth</small><strong>{record.parameters.depth} mm</strong></div><div><small>Probe elevation</small><strong>{fmt(record.elevation, 3)} mm</strong></div></div><p className="observation-location">Probe ({record.probe.x}, {record.probe.y}) mm · t = {fmt(record.time, 3)} s</p><Textarea aria-label={`Notes for observation ${records.length - index}`} placeholder="Add a note to this observation…" defaultValue={record.note} maxLength={4096} onBlur={event => { if (event.target.value !== record.note) store(records.map(item => item.id === record.id ? { ...item, note: event.target.value } : item)); }}/><div className="observation-footer"><time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time><button className="text-button" onClick={() => { setTopic(record.experiment); setExperiment(record.experiment); setParameters({ ...record.parameters }); setProbe({ ...record.probe }); clock.current = record.time; setPlaying(false); setWorkspace("laboratory"); setMode("sandbox"); setToast("Saved conditions restored. Simulation paused at the recorded time."); }}>Restore conditions<Icon name="arrow" size={13}/></button></div></article>)}</div>}
        </>}

        {workspace === "guide" && <>
          <section className="page-intro"><div><div className="eyebrow">A COMPANION FOR YOUR CURIOSITY</div><h1>A little <span>field guide.</span></h1><p>The physics, the controls, and what this little tank can—and cannot—tell you.</p></div><Button variant="outline" className="h-9 text-[10px]" onClick={() => setWorkspace("laboratory")}>Back to the tank<Icon name="arrow" size={16}/></Button></section>
          <section className="guide-intro"><div><span className="section-eyebrow">START WITH A QUESTION</span><h2>Nine topics. One wave laboratory.</h2><p>Predict a result, vary one parameter, and compare your measurements with a model. Explore four water-wave phenomena in the ripple tank, identify crests and troughs in Wave properties, then measure wave speed, investigate strings and materials, and compare five Doppler cases. Every numerical readout comes from the same model as its figure.</p><button className="text-button" onClick={() => setShowHelp(true)}>How to use the tank<Icon name="arrow" size={15}/></button></div><SmallWave/></section>
          <div className="guide-experiments">{LAB_TOPICS.map(item => <button className="guide-experiment" key={item.id} onClick={() => chooseTopic(item.id)}><div className="guide-card-top"><span>{item.number}</span><Icon name={item.icon} size={24}/></div>{isTankTopic(item.id) ? <SmallWave variant={item.id}/> : <Icon name={item.icon} size={64} className="mini-wave"/>}<h3>{item.name}</h3><p>{item.subtitle}</p><span className="text-button">Open experiment<Icon name="arrow" size={14}/></span></button>)}</div>
          <section className="guide-model"><div className="section-eyebrow">THE MATHEMATICAL MODEL</div><h2>Simple enough to explore. Honest about its limits.</h2><div className="dispersion-equation">ω² = (gk + σk³/ρ) tanh(kh)</div><p>Wavenumber k is solved numerically from the full linear finite-depth capillary–gravity relation, not from the shallow-water approximation. Phase speed is c = ω/k; group speed is c<sub>g</sub> = dω/dk. They are different quantities in a dispersive medium.</p><div className="model-values"><span>g = 9.81 m/s²</span><span>ρ = 998 kg/m³</span><span>σ = 0.0728 N/m</span></div><details open><summary>Assumptions and limitations<Icon name="chevron" size={16}/></summary><ul>{MODEL_NOTES.filter((_, index) => ![0, 1, 6, 14].includes(index)).map((text, index) => <li key={index}>{text}</li>)}</ul></details><details><summary>Units, measurement, and playback<Icon name="chevron" size={16}/></summary><p>{MODEL_NOTES[0]}</p><p>Playback defaults to 0.1× real time so physical 8 Hz waves can be inspected. The time readout shows simulated seconds. A frame step advances exactly 1/240 s. Changing parameters replaces the monochromatic steady-state solution: there is no causal startup transient. Color is contrast enhanced and not a calibrated height map; the probe and notebook contain quantitative elevations.</p><p>The grid spacing is 25 mm. In top view, x increases right and y increases downward. In isometric view, x points down-right and y down-left. The tank is 400 × 300 mm; distant boundaries are treated as nonreflecting.</p></details><details><summary>Useful checks for your experiment<Icon name="chevron" size={16}/></summary><ul><li>Verify fλ = c with wavelength converted from mm to m.</li><li>For linear validity check ka ≪ 1 and a/h ≪ 1. Controls warn above ka = 0.2 or a/h = 0.1; these thresholds are guides, not sharp boundaries.</li><li>For a rigid wall, verify normal nodal spacing λ/(2 cos θᵢ).</li><li>For refraction, test conservation of k sin θ across the interface.</li><li>For interference, compare the centerline at relative phases 0° and 180°.</li><li>The slit-minimum and fringe-spacing formulae are far-field estimates, not exact predictions for every point in this tank.</li></ul></details></section>
        </>}
      </main>
      <footer className="app-footer"><span><Icon name="waves" size={17}/>wavelab<span className="footer-divider"/>A playground for serious curiosity.</span><span className="footer-credit">made with love by Mortey Kafui ❤️</span></footer>
    </div>
    <SmallScreenNotice/>
    <div className={`toast${toast ? " visible" : ""}`} role="status" aria-live="polite"><span><Icon name="check" size={15}/></span>{toast}</div>
    <Dialog open={showHelp} onOpenChange={setShowHelp}><DialogContent showCloseButton={false} className="help-dialog max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-[530px]"><div className="help-dialog-content"><button className="icon-button dialog-close" aria-label="Close help" onClick={() => setShowHelp(false)}><Icon name="close"/></button><span className="dialog-icon"><Icon name="waves" size={30}/></span><div className="eyebrow">WELCOME TO YOUR RIPPLE TANK</div><DialogTitle className="font-heading text-3xl font-medium">Learn by making waves.</DialogTitle><DialogDescription className="mt-3 leading-relaxed">Pick a phenomenon and give yourself a question. The most useful experiments change one thing at a time.</DialogDescription><ol><li><strong>Choose your path.</strong> Guided mode has three investigations per phenomenon. Sandbox is open-ended.</li><li><strong>Turn the controls.</strong> Frequency, depth and geometry update the same physical model used for every readout.</li><li><strong>Look closer.</strong> Pause, step by 1/240 s, try top view, or reveal the amplitude envelope.</li><li><strong>Take a measurement.</strong> Click or drag the water to place the probe. Focus the tank and use arrow keys to move 5 mm; hold Shift for 25 mm.</li><li><strong>Keep your discoveries.</strong> Save observations, add notes, restore conditions, and export your notebook as CSV.</li></ol><p className="help-small">The model is linear and steady state. Playback is slowed to 0.1× by default. Notebook data stays on this device; clearing browser storage removes it.</p><Button className="mt-6 h-11 w-full" onClick={() => setShowHelp(false)}>Let’s make waves<Icon name="arrow" size={17}/></Button></div></DialogContent></Dialog>
  </div>;
}
