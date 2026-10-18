import { DEFAULT_PARAMETERS, type Experiment, type WaveParameters } from "./wave-physics";

export interface InvestigationStep {
  title: string;
  instruction: string;
  question: string;
  patch: Partial<WaveParameters>;
}
export interface ExperimentInfo {
  name: string; number: string; subtitle: string; description: string; equation: string;
  explanation: string; tip: string; steps: InvestigationStep[];
  presets: { name: string; patch: Partial<WaveParameters> }[];
}
export const EXPERIMENT_ORDER: Experiment[] = ["reflection", "refraction", "diffraction", "interference"];
export const EXPERIMENTS: Record<Experiment, ExperimentInfo> = {
  reflection: {
    name: "Reflection", number: "01", subtitle: "A change of direction.",
    description: "Meet a boundary. Watch incident and reflected waves superpose against a rigid wall.",
    equation: "θᵢ = θᵣ", explanation: "The tangential wavenumber is conserved. At a rigid wall the normal fluid velocity vanishes, so surface elevation reflects without a phase inversion. The sum creates stationary nodes and antinodes normal to the wall.",
    tip: "Try normal incidence. Neighboring nodes are separated by half a wavelength.",
    presets: [{ name: "Normal incidence", patch: { angle: 0, frequency: 6 } }, { name: "Oblique incidence", patch: { angle: 40, frequency: 8 } }],
    steps: [
      { title: "Meet the boundary", instruction: "Start at normal incidence. Pause the tank and compare the spacing of adjacent nodes with the reported wavelength.", question: "Why does the elevation have an antinode, rather than a node, at a rigid wall?", patch: { angle: 0, frequency: 6 } },
      { title: "Change the angle", instruction: "Set the incidence angle to 40°. Switch to top view and follow the crests approaching the wall.", question: "Which component of the wavevector changes sign upon reflection?", patch: { angle: 40 } },
      { title: "Test the relation", instruction: "Vary frequency from 4 to 10 Hz. Keep depth fixed. Record two measurements and compare λ/(2 cos θᵢ), the normal nodal spacing.", question: "Does changing frequency alter the law of reflection or only the spatial pattern?", patch: {} },
    ],
  },
  refraction: {
    name: "Refraction", number: "02", subtitle: "New depths. New directions.",
    description: "Cross a depth step. Discover how a change in phase speed bends a wavefront.",
    equation: "sin θ₁ / c₁ = sin θ₂ / c₂", explanation: "Frequency and tangential wavenumber stay continuous across the depth step. Wavelength changes with phase speed. Here the interface uses approximate single-mode elevation and volume-flux matching; it is not an exact finite-depth scattering solution.",
    tip: "Swap the depths and raise the angle to look for total internal reflection.",
    presets: [{ name: "Deep → shallow", patch: { depth: 12, secondDepth: 3, angle: 35, frequency: 4 } }, { name: "Total reflection", patch: { depth: 2, secondDepth: 20, angle: 65, frequency: 3 } }],
    steps: [
      { title: "Cross into shallow water", instruction: "Compare 12 mm and 3 mm depths at 4 Hz. Notice the wavelength change on each side of the step.", question: "Why does frequency stay the same even though wavelength changes?", patch: { depth: 12, secondDepth: 3, angle: 35, frequency: 4 } },
      { title: "Follow Snell’s law", instruction: "Change incidence angle from 10° to 55°. Compare sin θ₁/c₁ with sin θ₂/c₂ using the measured phase speeds.", question: "Does the shallower region bend the transmitted ray toward or away from the normal?", patch: { angle: 45 } },
      { title: "Find a critical angle", instruction: "Use the shallow-to-deep preset. Increase the angle through the critical angle and inspect the decaying field beyond the step.", question: "Why is an evanescent field possible when there is no propagating transmitted ray?", patch: { depth: 2, secondDepth: 20, frequency: 3, angle: 65 } },
    ],
  },
  diffraction: {
    name: "Diffraction", number: "03", subtitle: "Beyond the straight and narrow.",
    description: "Send a plane wave through an aperture. Watch a new wavefront emerge from the gap.",
    equation: "a sin θₘ = mλ", explanation: "Every point of the opening contributes a coherent cylindrical wave. The tank sums 21 aperture samples using Simpson quadrature. The equation describes normal-incidence far-field minima; the near-field visualization uses the spatial integral instead.",
    tip: "The ratio a/λ matters more than aperture width alone. Try a gap about one wavelength wide.",
    presets: [{ name: "Narrow aperture", patch: { slitWidth: 18, frequency: 6 } }, { name: "Wide aperture", patch: { slitWidth: 90, frequency: 6 } }],
    steps: [
      { title: "Open a narrow gap", instruction: "Start with an 18 mm aperture. Compare its width with the wavelength and observe how strongly the outgoing crests curve.", question: "Why does a narrow opening behave approximately like a single source?", patch: { slitWidth: 18, frequency: 6 } },
      { title: "Widen the aperture", instruction: "Increase the gap to 90 mm without changing frequency. Compare the forward lobe and side structure in envelope view.", question: "What happens to angular spreading as the ratio a/λ increases?", patch: { slitWidth: 90 } },
      { title: "Separate near and far", instruction: "Move the probe away from the aperture. Compare the field with the far-field estimate θ₁ = asin(λ/a), when a ≥ λ.", question: "Why is the Fraunhofer minimum only an estimate inside a finite ripple tank?", patch: {} },
    ],
  },
  interference: {
    name: "Interference", number: "04", subtitle: "Two sources. Endless possibilities.",
    description: "Let two coherent sources overlap. Find the quiet lines hidden between the ripples.",
    equation: "η = η₁ + η₂", explanation: "Surface displacements add linearly. Equal-phase contributions reinforce; contributions π out of phase cancel. With equal sources, constant path-difference curves form hyperbolae. Cylindrical spreading is included, with a regularized source core.",
    tip: "Shift the phase by 180°. The central line changes from constructive to destructive interference.",
    presets: [{ name: "In phase", patch: { phase: 0, separation: 60 } }, { name: "Out of phase", patch: { phase: 180, separation: 60 } }],
    steps: [
      { title: "Find a quiet line", instruction: "Begin with two in-phase sources. Switch to envelope view and move the probe across a low-amplitude line.", question: "What path difference produces destructive interference for in-phase sources?", patch: { phase: 0, separation: 60 } },
      { title: "Shift the phase", instruction: "Change relative phase to 180°. Probe the centerline y = 0 and compare with your first observation.", question: "Why does the whole centerline cancel even though the two waves keep moving?", patch: { phase: 180 } },
      { title: "Change the spacing", instruction: "Restore zero phase. Increase source separation from 30 to 120 mm and compare the far-field fringe-spacing estimate at L = 300 mm.", question: "How does fringe spacing depend on source separation, and when is the estimate valid?", patch: { phase: 0, separation: 100 } },
    ],
  },
};

export function experimentDefaults(experiment: Experiment): WaveParameters {
  return { ...DEFAULT_PARAMETERS[experiment], ...(experiment === "interference" ? { separation: 60 } : {}) };
}
