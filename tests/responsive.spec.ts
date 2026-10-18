import { test, expect, type Page } from "./lab-fixture";

const viewports = [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 768, height: 600 },
  { width: 1024, height: 600 },
  { width: 1440, height: 900 },
];

async function expectNoOverflow(page: Page) {
  const geometry = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    overflowing: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 10).map(element => ({ tag: element.tagName, className: element.getAttribute("class"), right: element.getBoundingClientRect().right })),
  }));
  expect(geometry.documentWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewportWidth + 1);
}

async function expectTabsFit(page: Page) {
  const list = page.locator(".experiment-tabs");
  const geometry = await list.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return {
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
      tabs: [...element.querySelectorAll<HTMLElement>("[role=tab]")].map(tab => {
        const rect = tab.getBoundingClientRect();
        const text = document.createRange();
        text.selectNodeContents(tab);
        const textFits = [...text.getClientRects()].every(line =>
          line.left >= rect.left - 1 && line.right <= rect.right + 1 &&
          line.top >= rect.top - 1 && line.bottom <= rect.bottom + 1);
        return {
          name: tab.textContent,
          enclosed: rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 &&
            rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1,
          height: rect.height,
          textFits,
        };
      }),
    };
  });
  expect(geometry.columns).toBe(page.viewportSize()!.width > 1190 ? 4 : 2);
  for (const tab of geometry.tabs) {
    expect(tab.enclosed, `${tab.name} must stay inside the tab bar`).toBe(true);
    expect(tab.height, `${tab.name} touch target`).toBeGreaterThanOrEqual(44);
    expect(tab.textFits, `${tab.name} label must not spill out`).toBe(true);
  }
}

async function expectControlsFit(page: Page) {
  const controls = page.locator(".controls-card:visible");
  if (!await controls.count()) return;

  const problems = await controls.evaluateAll(cards => cards.flatMap(card => {
    const errors: string[] = [];
    for (const heading of card.querySelectorAll<HTMLElement>(".range-heading")) {
      const label = heading.querySelector("label")!;
      const output = heading.querySelector("output")!;
      const labelBounds = label.getBoundingClientRect();
      const outputBounds = output.getBoundingClientRect();
      const bounds = heading.getBoundingClientRect();
      if (labelBounds.right > outputBounds.left + 1 || outputBounds.right > bounds.right + 1) {
        errors.push(`${label.textContent}: label and output overlap or escape their row`);
      }
      for (const element of [label, output]) {
        if (parseFloat(getComputedStyle(element).fontSize) < 12 || element.scrollWidth > element.clientWidth + 1) {
          errors.push(`${element.textContent}: font ${getComputedStyle(element).fontSize}, content width ${element.scrollWidth}, available width ${element.clientWidth}`);
        }
      }
    }
    for (const button of card.querySelectorAll<HTMLButtonElement>("button")) {
      if (button.getBoundingClientRect().height < 44) errors.push(`${button.textContent}: touch target under 44px`);
      if (button.scrollWidth > button.clientWidth + 1) errors.push(`${button.textContent}: button text overflows`);
    }
    return errors;
  }));
  expect(problems).toEqual([]);
}

for (const viewport of viewports) {
  test(`topics and controls fit at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const tabs = page.locator(".experiment-tabs").getByRole("tab");
    await expect(tabs.first()).toBeVisible();
    const count = await tabs.count();
    expect(count).toBe(9);
    for (const name of ["Reflection", "Refraction", "Diffraction", "Interference"]) {
      await expect(tabs.filter({ hasText: name })).toHaveCount(1);
    }
    if (count === 9) {
      for (const name of ["Wave properties", "Wave speed", "Wave on a string", "Solids, liquids & gases", "Doppler effect"]) {
        await expect(tabs.filter({ hasText: name })).toHaveCount(1);
      }
    }

    await expectTabsFit(page);
    for (let index = 0; index < count; index++) {
      const tab = tabs.nth(index);
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tabpanel")).toBeVisible();
      await expectTabsFit(page);
      await expectControlsFit(page);
      await expectNoOverflow(page);
    }

    if (viewport.width <= 1190) {
      await tabs.filter({ hasText: "Interference" }).click();
      const visualization = await page.locator(".visualization-column").boundingBox();
      const controls = await page.locator(".controls-card").boundingBox();
      expect(controls!.y).toBeGreaterThanOrEqual(visualization!.y + visualization!.height);
    }
  });
}

test("short landscape keeps every sidebar experiment reachable", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 420 });
  await page.goto("/");
  const sidebar = page.locator(".sidebar");
  await expect(sidebar.getByRole("navigation", { name: "Choose an experiment" })).toBeVisible();
  const geometry = await sidebar.evaluate(element => ({
    height: element.clientHeight,
    content: element.scrollHeight,
    overflow: getComputedStyle(element).overflowY,
  }));
  expect(geometry.height).toBeLessThanOrEqual(420);
  expect(geometry.content).toBeGreaterThan(geometry.height);
  expect(geometry.overflow).toBe("auto");

  const experiments = sidebar.locator(".experiment-nav button");
  for (let index = 0; index < await experiments.count(); index++) {
    const experiment = experiments.nth(index);
    await experiment.click();
    await expect(experiment).toBeInViewport();
    await expect(experiment).toHaveClass(/selected/);
  }
  await expectNoOverflow(page);
});
