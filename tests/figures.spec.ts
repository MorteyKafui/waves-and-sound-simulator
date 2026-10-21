import { test, expect, type Page } from "./lab-fixture";

async function openTopic(page: Page, name: string) {
  await page.getByRole("tab", { name: new RegExp(name) }).click();
  await expect(page.getByRole("tabpanel")).toBeVisible();
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab")).toHaveCount(9);
});

test("the wave bench turns, opens and names its own parts", async ({ page }) => {
  const bench = page.locator(".colorfigure");
  await expect(bench).toBeVisible();
  const figure = bench.locator("svg");
  await expect(figure).toHaveAttribute("aria-label", /wave indicator bench/i);
  // The figure is drawn, not empty: solids, ink and the wave ribbon are present.
  await expect(figure.locator("path").first()).toBeVisible();
  const before = await figure.innerHTML();
  expect(before.length).toBeGreaterThan(2000);

  // Dragging turns the camera.
  const box = await figure.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 160, box!.y + box!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await figure.innerHTML()).length).toBeGreaterThan(0);
  const after = await figure.innerHTML();
  expect(after).not.toEqual(before);

  // See-through opens the drive unit; labels name the parts.
  await page.getByRole("button", { name: "See-through", exact: true }).click();
  await expect(page.getByRole("button", { name: "See-through", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Labels", exact: true }).click();
  await expect(figure.locator("text").first()).toBeVisible();
  await expectNoOverflow(page);
});

test("every figure carries a legend that names what is drawn", async ({ page }) => {
  await openTopic(page, "Wave speed");
  await expect(page.locator(".speed-figure .figure-keys li")).toHaveCount(4);
  await openTopic(page, "Wave on a string");
  await expect(page.locator(".speed-figure .figure-keys li")).toHaveCount(4);
  await openTopic(page, "Solids, liquids");
  await expect(page.locator(".speed-figure .figure-keys li")).toHaveCount(4);
  await openTopic(page, "Doppler effect");
  await expect(page.locator(".doppler-figure .figure-keys li")).toHaveCount(4);
  await expect(page.locator(".doppler-wavefront")).toHaveCount(9);
  await expectNoOverflow(page);
});

test("the tank names its apparatus and picks the part out of the scene", async ({ page }) => {
  await openTopic(page, "Diffraction");
  const legend = page.locator(".tank-apparatus");
  await expect(legend).toBeVisible();
  await expect(legend.getByRole("button")).toHaveCount(3);
  await expect(legend.getByText("Aperture", { exact: true })).toBeVisible();

  await legend.getByRole("button", { name: /Aperture/ }).click();
  await expect(legend.getByRole("button", { name: /Aperture/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.tank-container[data-inspect="aperture"]')).toBeVisible();
  await expect(page.locator('.tank-container [data-tank-part="aperture"]')).toHaveCount(1);
  await expect(legend.locator(".tank-apparatus-readout")).toContainText("opening");

  // Choosing again puts the tank back.
  await legend.getByRole("button", { name: /Aperture/ }).click();
  await expect(page.locator(".tank-container")).not.toHaveAttribute("data-inspect", "aperture");
  await expectNoOverflow(page);
});
