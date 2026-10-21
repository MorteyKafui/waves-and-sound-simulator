/*
 * Figure capture harness for the Anatomy work.
 * Usage: bun run shots -- [topic] [--light] [--mobile]
 * Writes PNGs into screenshots/anatomy/.
 */
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.SHOT_BASE ?? "http://127.0.0.1:3100";
const OUT = "screenshots/anatomy";
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const only = args.find(a => !a.startsWith("--"));
const light = args.includes("--light");
const mobile = args.includes("--mobile");

const TOPICS = [
  { id: "wave-properties", name: "Wave properties" },
  { id: "reflection", name: "Reflection" },
  { id: "refraction", name: "Refraction" },
  { id: "diffraction", name: "Diffraction" },
  { id: "interference", name: "Interference" },
  { id: "wave-speed", name: "Wave speed" },
  { id: "string-speed", name: "Wave on a string" },
  { id: "sound-speed", name: "Solids, liquids & gases" },
  { id: "doppler", name: "Doppler effect" },
];

const browser = await chromium.launch();
const context = await browser.newContext(
  mobile ? { ...devices["iPhone 13"], defaultBrowserType: "chromium" } : { viewport: { width: 1440, height: 1100 } },
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

await page.goto(BASE, { waitUntil: "networkidle" });
if (light) {
  await page.getByRole("button", { name: "Choose theme" }).click();
  await page.getByRole("menuitemradio", { name: "Light", exact: true }).click();
  await page.waitForTimeout(300);
}

for (const topic of TOPICS) {
  if (only && only !== topic.id) continue;
  await page.getByRole("tab", { name: new RegExp(topic.name) }).click();
  await page.waitForTimeout(700);
  const slug = `${topic.id}${light ? "-light" : ""}${mobile ? "-mobile" : ""}`;
  await page.screenshot({ path: `${OUT}/${slug}.png`, fullPage: true });
  console.log(`captured ${slug}`);
}

if (errors.length) console.log("PAGE ERRORS:\n" + errors.join("\n"));
await browser.close();
