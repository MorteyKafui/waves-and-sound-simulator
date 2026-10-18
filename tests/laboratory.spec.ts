import { test, expect, type Page } from "./lab-fixture";

async function setRange(page: Page, name: string, value: number) {
  const slider = page.getByRole("slider", { name, exact: true });
  const minimum = Number(await slider.getAttribute("min"));
  await slider.focus();
  await slider.press("Home");
  const step = Number(await slider.getAttribute("step"));
  for (let index = 0; index < Math.round((value - minimum) / step); index++) await slider.press("ArrowRight");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A space to make waves." })).toBeVisible();
  await page.getByRole("tab", { name: /Interference/ }).click();
});

test("renders a working, responsive lab without browser errors", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.locator(".tank-stage").scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await expect(page.locator(".scene-clock span")).not.toHaveText("0.00 s");
  await page.getByRole("button", { name: "Pause simulation", exact: true }).click();
  const atPause = await page.locator(".scene-clock span").textContent();
  await page.waitForTimeout(200);
  await expect(page.locator(".scene-clock span")).toHaveText(atPause!);
  await expect(page.locator(".tank-canvas")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `screenshots/${testInfo.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("all four experiments and scientific controls update the model", async ({ page }) => {
  for (const name of ["Reflection", "Refraction", "Diffraction", "Interference"]) {
    await page.getByRole("tab", { name: new RegExp(name) }).click();
    await expect(page.getByRole("tabpanel").getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(page.locator(".measurement-strip")).not.toContainText("NaN");
  }
  const oldWavelength = await page.locator(".measurement strong").first().textContent();
  await setRange(page, "Frequency f", 4);
  await expect(page.getByRole("slider", { name: "Frequency f", exact: true })).toHaveValue("4");
  await expect(page.locator(".measurement strong").first()).not.toHaveText(oldWavelength!);
  await page.getByRole("button", { name: "Out of phase", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Relative phase Δφ", exact: true })).toHaveValue("180");
  await expect(page.locator(".scene-probe strong")).toHaveText(/^[+-]?0\.000 mm$/);
  await page.getByRole("tab", { name: /Refraction/ }).click();
  await page.getByRole("button", { name: "Total reflection", exact: true }).click();
  await expect(page.locator(".measurement").last()).toContainText("TIR");
});

test("playback, frame step, views, envelope, grid and keyboard probe work", async ({ page }) => {
  await page.getByRole("button", { name: "Pause simulation", exact: true }).click();
  await page.getByRole("button", { name: "Reset experiment", exact: true }).click();
  await expect(page.locator(".scene-clock span")).toHaveText("0.00 s");
  await page.getByRole("button", { name: "Advance one frame", exact: true }).click();
  await page.getByRole("button", { name: "Advance one frame", exact: true }).click();
  await expect(page.locator(".scene-clock span")).toHaveText("0.01 s");
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  await expect(page.locator(".tank-container")).toHaveClass(/is-top/);
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await expect(page.getByRole("button", { name: "Grid", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Envelope", exact: true }).click();
  await expect(page.getByRole("button", { name: "Envelope", exact: true })).toHaveAttribute("aria-pressed", "true");
  const tank = page.getByRole("group", { name: /ripple tank/ });
  await tank.focus(); await tank.press("ArrowRight"); await tank.press("ArrowDown");
  await expect(page.locator(".probe-coordinates")).toHaveText("105, 5 mm");
});

test("guided investigations progress and sandbox can record a note", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Find a quiet line" })).toBeVisible();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shift the phase" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Relative phase Δφ", exact: true })).toHaveValue("180");
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Change the spacing" })).toBeVisible();
  await page.getByRole("button", { name: "Complete investigation", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("Investigation complete");
  await page.getByRole("button", { name: "Sandbox", exact: true }).click();
  await page.getByLabel("What did you notice?").fill("The centerline cancels at 180 degrees.");
  await page.getByRole("button", { name: "Save observation", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("Observation saved");
});

test("notebook persists, edits, exports, restores and deletes observations", async ({ page }) => {
  await page.getByRole("button", { name: "Pause simulation", exact: true }).click();
  await setRange(page, "Frequency f", 5);
  await page.getByRole("button", { name: "Save observation", exact: true }).click();
  await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name: /Lab notebook/ }).click();
  await expect(page.locator(".observation-card")).toHaveCount(1);
  await expect(page.locator(".observation-stats")).toContainText("5 Hz");
  const notes = page.getByRole("textbox", { name: "Notes for observation 1" });
  await notes.fill("Comparison at 5 Hz"); await notes.blur();
  await page.reload();
  await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name: /Lab notebook/ }).click();
  await expect(page.getByRole("textbox", { name: "Notes for observation 1" })).toHaveValue("Comparison at 5 Hz");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("wavelab-observations.csv");
  await page.getByRole("button", { name: "Restore conditions", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Frequency f", exact: true })).toHaveValue("5");
  await expect(page.getByRole("button", { name: "Play simulation", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name: /Lab notebook/ }).click();
  await page.getByRole("button", { name: "Delete observation 1", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Every discovery starts somewhere." })).toBeVisible();
});

test("field guide, modal help and theme switch are functional", async ({ page }) => {
  await page.getByRole("button", { name: "Open help", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Let’s make waves", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Choose theme", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name: "Field guide", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A little field guide." })).toBeVisible();
  await expect(page.locator(".dispersion-equation")).toContainText("tanh");
  await page.getByRole("button", { name: /02 Refraction/ }).click();
  await expect(page.getByRole("tabpanel").getByRole("heading", { name: "Refraction", exact: true })).toBeVisible();
});

test("reduced motion is still, but explicit frame stepping remains available", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.getByRole("tab", { name: /Interference/ }).click();
  await expect(page.locator(".simulation-status")).toContainText("Reduced motion");
  const before = await page.locator(".scene-clock span").textContent();
  await page.waitForTimeout(400);
  await expect(page.locator(".scene-clock span")).toHaveText(before!);
  await page.getByRole("button", { name: "Advance one frame", exact: true }).click();
  await page.getByRole("button", { name: "Advance one frame", exact: true }).click();
  await expect(page.locator(".scene-clock span")).toHaveText("0.01 s");
});

test("scientific views remain readable in multiple experiment states", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop-only visual close-ups");
  await page.getByRole("button", { name: "Pause simulation", exact: true }).click();
  for (const name of ["Reflection", "Refraction", "Diffraction"]) {
    await page.getByRole("tab", { name: new RegExp(name) }).click();
    await page.screenshot({ path: `screenshots/${name.toLowerCase()}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  await page.getByRole("button", { name: "Envelope", exact: true }).click();
  await page.locator(".simulation-card").screenshot({ path: "screenshots/top-view.png" });
  await page.getByRole("button", { name: "Choose theme", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await page.waitForTimeout(750);
  await page.screenshot({ path: "screenshots/dark.png", fullPage: true });
});
