# Review scripts

Small Playwright helpers used to look at the figures the way a reader would.
They run against a server you already have running.

```sh
# everything, at 1440px
bun run shots

# one topic, or with --light / --mobile
bun run shots -- wave-speed
bun run shots -- --light
bun run shots -- --mobile

# a close-up of one element, at 2x
SHOT_TOPIC="Wave on a string" node scripts/zoom.mjs .speed-figure shots/string.png 1440 light

# a Colorfigures figure in each of its modes
SHOT_TOPIC="Wave properties" node scripts/figure-shots.mjs
```

`SHOT_BASE` points them at a server; it defaults to `http://127.0.0.1:3100`.
PNGs land in `screenshots/anatomy/`, which is not tracked.

Note: `next dev` and `next build` share `.next`. Stop the dev server before a
production build, or the build and the running server will disagree.
