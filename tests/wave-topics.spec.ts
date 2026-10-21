import { test, expect, type Page } from "./lab-fixture";

async function openTopic(page: Page, name: string) {
  await page.getByRole("tab", { name: new RegExp(name) }).click();
  await expect(page.getByRole("tabpanel")).toBeVisible();
}

const speedResult = (page: Page) => page.getByTestId("speed-result");
const observed = (page: Page) => page.getByLabel("Observed frequency", { exact: true });

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab")).toHaveCount(9);
});

test("wave properties is the visible entry point and simulates all core quantities", async ({ page }, testInfo) => {
  const lab = page.getByTestId("wave-properties-lab");
  await expect(lab).toBeVisible();
  await expect(page.getByRole("tab", { name: /Wave properties/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("spinbutton", { name: "Amplitude (m)", exact: true }).fill("2");
  await expect(lab).toHaveAttribute("data-amplitude", "2");
  await expect(page.getByLabel("Crest and trough displacement", { exact: true })).toHaveText("+2 / −2 m");
  await page.getByRole("spinbutton", { name: "Frequency (Hz)", exact: true }).fill("2");
  await expect(page.getByRole("spinbutton", { name: "Period (s)", exact: true })).toHaveValue("0.5");
  await page.getByRole("spinbutton", { name: "Period (s)", exact: true }).fill("4");
  await expect(page.getByRole("spinbutton", { name: "Frequency (Hz)", exact: true })).toHaveValue("0.25");
  await page.getByRole("spinbutton", { name: "Wavelength (m)", exact: true }).fill("2");
  await expect(page.getByTestId("wave-properties-speed")).toHaveText("0.5 m/s");
  await page.getByRole("button", { name: "Advance ¼ period", exact: true }).click();
  await expect(page.getByTestId("wave-properties-time")).toHaveText("1.000 s");
  await expect(page.getByLabel("Particle displacement", { exact: true })).toHaveText("-2 m");
  await page.locator(".properties-stage").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Play wave", exact: true }).click();
  await expect(page.getByTestId("wave-properties-time")).not.toHaveText("1.000 s");
  await page.getByRole("button", { name: "Pause wave", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Amplitude (m)", exact: true }).fill("0");
  await expect(page.locator(".properties-flat-note")).toContainText("no distinct crest or trough");
  await page.getByRole("spinbutton", { name: "Period (s)", exact: true }).fill("");
  await expect(lab).toHaveAttribute("data-valid", "false");
  await expect(page.getByTestId("wave-properties-speed")).toHaveText("—");
  await page.getByRole("button", { name: "Reset wave", exact: true }).click();
  await expect(lab).toHaveAttribute("data-valid", "true");
  await expect(page.getByTestId("wave-properties-speed")).toHaveText("2 m/s");
  await expectNoOverflow(page);
  await page.screenshot({ path: `screenshots/properties-${testInfo.project.name}.png`, fullPage: true });
});

test("wave properties respects reduced motion while allowing deliberate stepping", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const lab = page.getByTestId("wave-properties-lab");
  await lab.scrollIntoViewIfNeeded();
  await expect(lab).toHaveAttribute("data-reduced-motion", "true");
  await expect(page.getByRole("button", { name: "Play wave", exact: true })).toBeDisabled();
  await page.waitForTimeout(200);
  await expect(page.getByTestId("wave-properties-time")).toHaveText("0.000 s");
  await page.getByRole("button", { name: "Advance ¼ period", exact: true }).click();
  await expect(page.getByTestId("wave-properties-time")).toHaveText("0.500 s");
});

test("footer scales readably and theme changes preserve natural tank water", async ({ page }) => {
  const sizes: number[] = [];
  for (const width of [390, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const footer = page.locator(".app-footer");
    const font = await footer.locator(":scope > span:last-child").evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    expect(font).toBeGreaterThanOrEqual(12);
    sizes.push(font);
    await expect(footer.locator(".footer-credit")).toHaveText("made with love by Dr. Isaac Kwesi Acquah & Mortey Kafui");
    await expectNoOverflow(page);
  }
  expect(sizes[2]).toBeGreaterThan(sizes[0]);
  await openTopic(page, "Interference");
  await page.getByRole("button", { name: "Pause simulation", exact: true }).click();
  const before = await page.locator(".tank-canvas").evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
  await page.getByRole("button", { name: "Choose theme", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(57, 56, 53)");
  const after = await page.locator(".tank-canvas").evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
  expect(after).toBe(before);
});

test("determines speed by frequency, counted cycles, and pulse transit", async ({ page }) => {
  await openTopic(page, "Wave speed");
  await expect(page.getByRole("heading", { name: "Determining wave speed" })).toBeVisible();
  await expect(speedResult(page)).toHaveText("4m/s");
  await page.getByRole("spinbutton", { name: /^Frequency / }).fill("10");
  await expect(speedResult(page)).toHaveText("8m/s");
  await page.getByRole("button", { name: "Count cycles", exact: true }).click();
  await page.getByRole("spinbutton", { name: /^Cycles counted / }).fill("30");
  await expect(speedResult(page)).toHaveText("6m/s");
  await page.getByRole("button", { name: "Distance / time", exact: true }).click();
  await page.getByRole("spinbutton", { name: /^Travel distance / }).fill("30");
  await expect(speedResult(page)).toHaveText("10m/s");
  await page.getByRole("button", { name: "Advance ¼ of transit" }).click();
  await expect(page.locator(".speed-snapshot-heading output")).toHaveText("t = 0.75 s");
  await page.getByRole("spinbutton", { name: /^Travel time / }).fill("0");
  await expect(speedResult(page)).toHaveText("—m/s");
  await expect(page.locator(".speed-error")).toContainText("greater than zero");
  await page.getByRole("button", { name: "Reset experiment" }).click();
  await expect(speedResult(page)).toHaveText("4m/s");
  await expectNoOverflow(page);
});

test("string speed depends on tension and linear density, not driving frequency", async ({ page }) => {
  await openTopic(page, "Wave on a string");
  const original = await speedResult(page).textContent();
  const wavelength = page.locator(".speed-metric").filter({ has: page.getByText("Wavelength", { exact: true }) });
  const originalWavelength = await wavelength.locator("dd").textContent();
  await page.getByRole("spinbutton", { name: /^Driving frequency / }).fill("100");
  await expect(speedResult(page)).toHaveText(original!);
  await expect(wavelength.locator("dd")).not.toHaveText(originalWavelength!);
  await page.getByRole("spinbutton", { name: /^Tension / }).fill("20");
  await expect(speedResult(page)).toHaveText("63.246m/s");
  await page.getByRole("button", { name: "Mass / length", exact: true }).click();
  await expect(speedResult(page)).toHaveText("63.246m/s");
  await page.getByRole("spinbutton", { name: /^String mass / }).fill("");
  await expect(speedResult(page)).toHaveText("—m/s");
  await expect(page.getByRole("spinbutton", { name: /^String mass / })).toHaveAttribute("aria-invalid", "true");
  await expectNoOverflow(page);
});

test("sound speed covers bulk solids, thin rods, liquids and temperature-dependent gases", async ({ page }) => {
  await openTopic(page, "Solids, liquids & gases");
  await expect(speedResult(page)).toHaveText("5,813.8m/s");
  await page.getByRole("button", { name: "Thin rod", exact: true }).click();
  await expect(speedResult(page)).toHaveText("5,047.5m/s");
  await page.getByRole("button", { name: "Liquid", exact: true }).click();
  await expect(speedResult(page)).toHaveText("1,484.7m/s");
  await page.getByRole("button", { name: "Gas", exact: true }).click();
  await expect(speedResult(page)).toHaveText("343.2m/s");
  await page.getByRole("spinbutton", { name: /^Temperature / }).fill("40");
  await expect(speedResult(page)).toHaveText("354.72m/s");
  await page.getByRole("button", { name: "Helium", exact: true }).click();
  await expect(speedResult(page)).toHaveText("1,041.2m/s");
  await page.getByRole("spinbutton", { name: /^Temperature / }).fill("-273.15");
  await expect(speedResult(page)).toHaveText("—m/s");
  await expect(page.locator(".speed-error")).toContainText("Absolute temperature");
  await expectNoOverflow(page);
});

test("all five Doppler cases agree with the signed-velocity formula", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openTopic(page, "Doppler effect");
  const cases = [
    { name: "Source toward observer", value: "552.82 Hz" },
    { name: "Source away from observer", value: "365.42 Hz" },
    { name: "Observer toward source", value: "529.80 Hz" },
    { name: "Observer away from source", value: "350.20 Hz" },
    { name: "Both moving", value: "550.74 Hz" },
  ];
  for (const entry of cases) {
    await page.getByRole("button", { name: entry.name, exact: true }).click();
    await expect(observed(page)).toHaveText(entry.value);
    await expect(page.locator(".doppler-wavefront")).toHaveCount(9);
    await expectNoOverflow(page);
  }
  await page.getByRole("spinbutton", { name: "Source velocity (m/s)", exact: true }).fill("50");
  await page.getByRole("spinbutton", { name: "Observer velocity (m/s)", exact: true }).fill("50");
  await expect(observed(page)).toHaveText("440.00 Hz");
  await expect(page.locator(".doppler-results-heading")).toContainText("No frequency shift");
  await page.getByRole("spinbutton", { name: "Source velocity (m/s)", exact: true }).fill("343");
  await expect(observed(page)).toHaveText("Unavailable");
  await expect(page.locator(".doppler-lab").getByRole("alert")).toBeVisible();
  await expect(page.locator(".doppler-wavefront")).toHaveCount(0);
  await page.getByRole("button", { name: "Reset case", exact: true }).click();
  await expect(observed(page)).toHaveText("550.74 Hz");
  await page.getByRole("button", { name: "Choose theme", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

test("field guide links reach every new topic and water-wave notebook still restores", async ({ page }) => {
  await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name: "Field guide", exact: true }).click();
  await expect(page.locator(".guide-experiment")).toHaveCount(9);
  await page.getByRole("button", { name: /09 Doppler effect/ }).click();
  await expect(page.locator(".doppler-lab")).toBeVisible();
  await openTopic(page, "Interference");
  await page.getByRole("button", { name: "Save observation", exact: true }).click();
  await openTopic(page, "Wave speed");
  await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name: /Lab notebook/ }).click();
  await page.getByRole("button", { name: "Restore conditions", exact: true }).click();
  await expect(page.getByRole("tab", { name: /Interference/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".tank-canvas")).toBeVisible();
});
