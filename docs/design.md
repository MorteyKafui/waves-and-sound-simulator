# Wavelab — concept and model

## Scope: Figure

One detailed, 400 × 300 mm ripple tank becomes four university-level experiments. Two driven dippers create coherent interference; interchangeable inserts provide a rigid wall, a depth step, or an adjustable aperture. The visible water is the elevation field from the same pure model used by the equations, probe and measurements. No decorative animation pretends to be a simulation.

## Parts (76 main solids, before screws)

- Base: bed plate, recessed tray floor, four rubber foot pads, four leveling collars, four feet, four support brackets, two reinforcing runners (20).
- Tank: four retaining walls, four aluminum rim strips, four corner blocks, four corner washers, four countersunk screws, drain cover, drain fastener (22).
- Structure: two rear mounting shoes, two uprights, two post caps, two collars, bridge beam, bridge cover, two end plates, two carriage rails (14).
- Mechanism: two slider shoes, two clamp blocks, two motor housings, two motor caps, two dipper stems, two dipper tips (12).
- Controls and calibration: controller housing, faceplate, adjustment dial, dial ring, dial hub, ruler strip, identification plate, power indicator (8).
- Additional purposeful details: knurling on the adjustment dial, ruled scales rooted on ruler-strip edges, closed ventilation slots, screw rings and center dots, housing seams, rail end stops, rim bevels. All small marks belong to their host.
- Interchangeable subject: reflection wall, two aperture leaves, or depth-step plate. Interference instead uses the two dipper assemblies.

## World and painting

World coordinates use mm: x ∈ [-200, 200], y ∈ [-150, 150], water elevation z = 0. Camera azimuth 38°, elevation 42°. The original Anatomy kit produces the solids, bevels and four facing tones. The opaque static floor and far walls are below a Canvas 2D water plane; inserts, dippers, near rim and scale paint above it. Canvas and SVG share the exact projection. No WebGL is required. The water has a still SVG fallback.

## Scientific contract

The field is monochromatic and linear, not a time-stepped Navier–Stokes fluid. Full finite-depth capillary–gravity dispersion sets wavelength and speed. Reflection satisfies a rigid-wall boundary. Refraction preserves frequency and tangential wavenumber, with explicitly approximate single-mode depth-step matching. Diffraction uses a 21-point, normalized one-way Huygens aperture integral. Interference sums regularized coherent cylindrical sources. See `MODEL_NOTES` in `src/lib/wave-physics.ts` for assumptions and limitations.

Physical time advances at the selected playback rate (default 0.1× for observation); source frequency and readouts remain physical values. Changing parameters replaces the steady-state solution, not a causal startup transient. Reduced motion renders a still solution; explicit frame-step remains available. Offscreen and hidden-page animation stops.

## Interaction

Four experiment tabs, guided and sandbox modes, experiment-specific sliders, presets, pause/play, single-frame stepping, reset, top/isometric view, grid, elevation/envelope display, draggable/clickable surface probe, keyboard-accessible probe positioning, measurements and a persistent local notebook with CSV export. Guided experiments pair predictions, procedures and quantitative checks. No account, API key or server-side persistence is needed.

## Figures

Two drawing engines, chosen for the job.

**The Anatomy kit** (`src/components/iso/iso-kit.ts`) draws the ripple tank, the
measuring bench and the acoustic bench. Muted paper tones, four facing tones
per solid, hairline ink, one accented subject per figure. Its camera is fixed:
azimuth and elevation are chosen once and the figure is composed for that view.

**The colour engine** (`src/components/colorfigures/`) draws the wave bench.
It owns a turnable camera (drag or arrow keys), shades every convex solid with
three flat tones by the way its face meets a light that turns with the viewer,
draws a heavy ink silhouette with finer inner lines inside it, and throws a
flat blue cast shadow from the lamp onto the floor. See-through fades the case
so the mechanism inside is visible; labels name the parts on the drawing.
A figure script is a pure function of `(model, time)` returning convex solids
in world units; the engine sorts, projects and draws them, so a moving part
costs one geometry rebuild per frame.

World units are metres on the wave bench: the guide rail spans the same 0–10 m
window as the calibrated scope, and the markers stand at the model's
displacement at their own station. The bench is honest about what it is — the
sliders are set to the model, and the drive's needle shows the phase.

## Labels

Words stay out of the isometric drawings. Each of those figures carries a
keyed legend under its card, and the tank adds an apparatus legend whose
buttons pick a part out of the scene. The colour figure is the exception: it
is the only figure the reader can turn round, so it names its own parts on the
drawing, where a name can be followed as the object turns.
