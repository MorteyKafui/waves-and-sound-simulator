import { test as base } from "@playwright/test";

export { expect, type Page } from "@playwright/test";

// Dedicated notice tests cover the first-visit dialog; other suites exercise the lab.
export const test = base.extend<{ acknowledgeScreenNotice: void }>({
  acknowledgeScreenNotice: [async ({ page }, use) => {
    await page.addInitScript(() => sessionStorage.setItem("wavelab-small-screen-dismissed", "1"));
    await use();
  }, { auto: true }],
});
