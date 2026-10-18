import { test, expect } from "@playwright/test";

test("small screens get a recommendation without losing access to the lab", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Big waves. Better on a bigger screen." });
  await expect(dialog).toBeVisible();
  const proceed = dialog.getByRole("button", { name: "Continue on this device", exact: true });
  await expect(proceed).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await proceed.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("tabpanel").getByRole("heading", { name: "Wave properties", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "A space to make waves." })).toBeVisible();
  await expect(dialog).not.toBeVisible();
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(dialog).not.toBeVisible();
});

test("desktop opens directly and detects a later small viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Wave properties", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.setViewportSize({ width: 600, height: 700 });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Wave properties", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("notice can be dismissed when session storage is unavailable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("Storage blocked", "SecurityError"); } });
  });
  await page.goto("/");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss screen recommendation", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("tab", { name: /Doppler effect/ }).click();
  await expect(page.locator(".doppler-lab")).toBeVisible();
});
