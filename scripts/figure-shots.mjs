/*
 * Capture a Colorfigures figure in each of its modes.
 * Usage: node scripts/figure-shots.mjs <selector> <topic> [outPrefix]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.SHOT_BASE ?? "http://127.0.0.1:3100";
const selector = process.env.SHOT_SELECTOR ?? ".properties-bench";
const topic = process.env.SHOT_TOPIC ?? "";
const prefix = process.env.SHOT_PREFIX ?? "figure";
mkdirSync("screenshots/anatomy", { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.goto(BASE, { waitUntil: "networkidle" });
if (topic) {
  await page.getByRole("tab", { name: new RegExp(topic) }).click();
  await page.waitForTimeout(900);
}
const figure = page.locator(selector).first();
await figure.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);

await figure.screenshot({ path: `screenshots/anatomy/${prefix}-closed.png` });

await page.getByRole("button", { name: "Labels", exact: true }).click();
await page.waitForTimeout(400);
await figure.screenshot({ path: `screenshots/anatomy/${prefix}-labels.png` });

await page.getByRole("button", { name: "See-through", exact: true }).click();
await page.waitForTimeout(400);
await figure.screenshot({ path: `screenshots/anatomy/${prefix}-see.png` });

await page.getByRole("button", { name: "Front", exact: true }).click();
await page.waitForTimeout(400);
await figure.screenshot({ path: `screenshots/anatomy/${prefix}-front.png` });

console.log(`captured ${prefix} modes`);
if (errors.length) console.log("PAGE ERRORS:\n" + errors.join("\n"));
await browser.close();
