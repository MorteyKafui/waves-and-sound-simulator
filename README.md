# Wavelab

An interactive wave-physics laboratory built with Next.js, React and Tailwind CSS.

## Explore

The lab opens on **Wave properties**: an animated travelling wave with editable
amplitude, frequency, period and wavelength; labeled crests and troughs; a fixed
particle probe; and linked speed measurements. Frequency and period are reciprocal.
Changing an input pauses the wave and returns its clock to zero.

Nine topics are available from the experiment tabs, sidebar and field guide:

- Reflection, refraction, diffraction and interference in a live ripple tank
- Wave properties and the effects of changing wave parameters
- Determining speed with `v = fλ`, counted cycles, or pulse travel distance/time
- Transverse string waves with `v = √(T/μ)` and `μ = m/L`
- Longitudinal sound in bulk solids, thin rods, liquids and ideal gases
- Five classical Doppler cases: source toward/away, observer toward/away,
  and independently moving source and observer

Calculators show units, formulas and numerical substitutions. Invalid inputs
withhold results rather than showing stale values, NaN or infinity. Model
assumptions and limits are described alongside each experiment. Only ripple-tank
observations are stored in the local notebook.

## Responsive design and themes

The interface uses cream `#F2E8DC` and charcoal `#393835` / `#41403C` through
Tailwind semantic theme tokens. Light, dark and system preferences are supported.
The tank intentionally retains blue-green, contrast-enhanced water in both themes;
its colors are illustrative, not a calibrated height map.

At viewport widths of 720px or less, a dismissible dialog recommends a larger
screen while allowing access to every topic. Dismissal is remembered in session
storage for the current tab; a memory fallback works if storage is unavailable.
Controls and navigation reflow for smaller screens, and footer type scales with
viewport width. Reduced motion disables autoplay while keeping deliberate frame
stepping available.

## Development

Requires Node.js and Bun (the package manager pinned in `package.json`).

```sh
bun install
bun run dev
```

Open `http://localhost:3000`.

```sh
bun run typecheck
bun run lint
bun test ./src/lib
bun run build
bun run test:e2e
```

Build before running Playwright: its configuration starts the production server
on `127.0.0.1:3100`. Browser tests cover desktop/mobile layouts, physics controls,
all topics, themes, notebook persistence and the small-screen notice.
