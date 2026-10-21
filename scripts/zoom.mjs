/*
 * Close-up capture of one figure, for craft review.
 * Usage: node scripts/zoom.mjs <selector> <out.png> [width] [theme]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.SHOT_BASE ?? "http://127.0.0.1:3100";
const [selector = ".speed-bench", out = "screenshots/anatomy/zoom.png", width = "1440", theme = ""] = process.argv.slice(2);
const topic = process.env.SHOT_TOPIC ?? "";
mkdirSync("screenshots/anatomy", { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: Number(width), height: 1100 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.goto(BASE, { waitUntil: "networkidle" });
if (theme === "light" || theme === "dark") {
  await page.getByRole("button", { name: "Choose theme" }).click();
  await page.getByRole("menuitemradio", { name: theme === "light" ? "Light" : "Dark", exact: true }).click();
  await page.waitForTimeout(300);
}
if (topic) {
  await page.getByRole("tab", { name: new RegExp(topic) }).click();
  await page.waitForTimeout(800);
}
const target = page.locator(selector).first();
await target.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await target.screenshot({ path: out });
console.log(`captured ${out}`);
if (errors.length) console.log("PAGE ERRORS:\n" + errors.join("\n"));
await browser.close();
