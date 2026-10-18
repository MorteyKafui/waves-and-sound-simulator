import { test, expect, type Page } from "./lab-fixture";

type ColorScheme = "light" | "dark";
type ThemePreference = ColorScheme | "system";

const storageKey = "wavelab-theme";
const labels: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System preference",
};

async function expectAppReady(page: Page) {
  await expect(page.getByRole("heading", { name: "A space to make waves.", exact: true })).toBeVisible();
}

async function openLab(page: Page, colorScheme: ColorScheme) {
  await page.emulateMedia({ colorScheme });
  await page.goto("/");
  await expectAppReady(page);
}

async function expectTheme(page: Page, colorScheme: ColorScheme) {
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
  await expect(page.locator("html")).toHaveCSS("color-scheme", colorScheme);
}

async function expectStoredPreference(page: Page, preference: ThemePreference | null) {
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(preference);
}

async function chooseTheme(page: Page, preference: ThemePreference) {
  await page.getByRole("button", { name: "Choose theme", exact: true }).click();
  await page.getByRole("menuitemradio", { name: labels[preference], exact: true }).click();
  await expect(page.getByRole("menu")).not.toBeVisible();
  await expectStoredPreference(page, preference);
}

async function expectSelectedPreference(page: Page, preference: ThemePreference) {
  await page.getByRole("button", { name: "Choose theme", exact: true }).click();
  for (const value of ["light", "dark", "system"] as const) {
    await expect(page.getByRole("menuitemradio", { name: labels[value], exact: true }))
      .toHaveAttribute("aria-checked", String(value === preference));
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).not.toBeVisible();
}

test.describe("Theme preference", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`defaults to the system's ${colorScheme} theme`, async ({ page }) => {
      await openLab(page, colorScheme);
      await expectTheme(page, colorScheme);
      await expectStoredPreference(page, null);
      await expectSelectedPreference(page, "system");
    });
  }

  test("follows system changes without a saved override", async ({ page }) => {
    await openLab(page, "light");
    await expectTheme(page, "light");

    await page.emulateMedia({ colorScheme: "dark" });
    await expectTheme(page, "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expectTheme(page, "light");

    await expectStoredPreference(page, null);
    await expectSelectedPreference(page, "system");
  });

  for (const preference of ["light", "dark"] as const) {
    const opposite = preference === "light" ? "dark" : "light";

    test(`${preference} override persists across reload and ignores the system`, async ({ page }) => {
      await openLab(page, opposite);
      await expectTheme(page, opposite);
      await chooseTheme(page, preference);
      await expectTheme(page, preference);

      await page.reload();
      await expectAppReady(page);
      await expectTheme(page, preference);
      await expectStoredPreference(page, preference);
      await expectSelectedPreference(page, preference);

      await page.emulateMedia({ colorScheme: preference });
      await expectTheme(page, preference);
      await page.emulateMedia({ colorScheme: opposite });
      await expectTheme(page, preference);
      await expectSelectedPreference(page, preference);
    });

    test(`returning from ${preference} to System preference restores following`, async ({ page }) => {
      await openLab(page, opposite);
      await chooseTheme(page, preference);
      await expectTheme(page, preference);

      await chooseTheme(page, "system");
      await expectTheme(page, opposite);
      await expectSelectedPreference(page, "system");

      await page.emulateMedia({ colorScheme: preference });
      await expectTheme(page, preference);
      await page.emulateMedia({ colorScheme: opposite });
      await expectTheme(page, opposite);

      await page.reload();
      await expectAppReady(page);
      await expectTheme(page, opposite);
      await expectStoredPreference(page, "system");
      await expectSelectedPreference(page, "system");
      await page.emulateMedia({ colorScheme: preference });
      await expectTheme(page, preference);
    });
  }
});
