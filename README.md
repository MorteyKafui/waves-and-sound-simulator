# Wavelab

An interactive wave-physics laboratory built with Next.js, React and Tailwind CSS.

## Explore

The lab opens on **Wave properties**: a wave-indicator bench whose thirteen
markers carry the travelling wave, followed by a calibrated scope on fixed
metre axes with editable amplitude, frequency, period and wavelength; labeled
crests and troughs; a fixed particle probe; and linked speed measurements.
Frequency and period are reciprocal. Changing an input pauses the wave and
returns its clock to zero.

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

## Figures and labels

Every experiment is drawn as a real machine rather than a diagram, and every
figure carries a legend that names what is on it.

- **The ripple tank** (topics 01–04) is an isometric bench: bed plate, levelling
  feet, retaining walls, a gantry bridge, driven dippers and a controller with
  a knurled dial. Under the tank, an *apparatus legend* lists the parts of the
  current experiment — dipper, rigid wall, depth step, aperture, probe — and
  choosing one picks it out in the scene and explains what it does.
- **The wave bench** (topic 05) is a colour figure: a guide rail carrying
  thirteen markers, a drive unit with a phase disc, a fixed probe at x = 2 m and
  a blue cast shadow. Drag it to turn it, open it in *see-through* to find the
  motor, the worm wheel and the shaft, and switch *Labels* on to name the parts.
  The calibrated scope stays below it as the precise graph view.
- **The measuring bench** (topics 06–08) is an isometric optical bench that
  accepts three interchangeable subjects: a vertical chart panel that records a
  travelling wave and a pulse, a suspended string, and a sectioned acoustic
  specimen. The index carriages' pointers rise to the crests they mark.
- **The acoustic bench** (topic 09) carries a speaker and a microphone on
  carriages, with the wavefronts lying flat in the medium plane above them, so
  a moving source visibly bunches its crests ahead and spreads them behind.

Two engines draw these. `src/components/iso/iso-kit.ts` is the Anatomy kit:
muted paper tones, four facing tones per solid and hairline ink. It draws the
ripple tank, the measuring bench and the acoustic bench. `src/components/
colorfigures/` is a colour engine: three flat tones by the way a face meets a
light that turns with the viewer, a heavy ink silhouette with finer inner
lines, a flat blue cast shadow, and a turnable camera. It draws the wave bench.
The labels for the isometric figures live in a keyed legend under the card; the
colour figure names its own parts on the drawing, because that is the only
figure the reader can turn round.

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

## Vercel Analytics and Speed Insights

The root App Router layout mounts `Analytics` from `@vercel/analytics/next` and
`SpeedInsights` from `@vercel/speed-insights/next` once, after the application
providers. The layout remains a Server Component; no API keys or extra provider
are required for a standard Vercel deployment.

To activate and verify collection:

1. In the Vercel project dashboard, open **Analytics** and enable Web Analytics.
2. Open **Speed Insights** and complete any setup shown for the project. Review
   the current plan, included usage and optional paid features before enabling
   upgrades.
3. Deploy these changes to Vercel after enabling the services.
4. Visit the deployed site, use the lab and check the corresponding dashboards.
   In the browser Network panel, verify that the injected scripts and collection
   requests succeed. Version 2 can use generated intake paths; do not assume every
   request must start with `/_vercel/`.

These services send page-view and browser performance measurements to Vercel.
Notebook notes, saved observations and calculator inputs are not sent as custom
analytics events. Topic changes currently use React state rather than URL routes,
so they are not separate page views. Follow Vercel's privacy guidance and avoid
placing sensitive information in URLs. Local development does not prove that
production collection or dashboard activation is working.

Official documentation:
- [Web Analytics quickstart](https://vercel.com/docs/analytics/quickstart)
- [Speed Insights quickstart](https://vercel.com/docs/speed-insights/quickstart)
- [Web Analytics privacy](https://vercel.com/docs/analytics/privacy-policy)
- [Speed Insights privacy](https://vercel.com/docs/speed-insights/privacy-policy)

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
