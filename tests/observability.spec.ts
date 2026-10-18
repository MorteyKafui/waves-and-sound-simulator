import { test, expect } from "./lab-fixture";

test("Vercel integrations load once without interfering with the workspace", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  // Verify SDK injection without sending telemetry or requiring Vercel's intake locally.
  await page.route(/\/_vercel\/(?:insights|speed-insights)\/script\.js(?:\?.*)?$/, route =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: ";" }));

  await page.goto("/");
  const analytics = page.locator('head script[data-sdkn="@vercel/analytics/next"]');
  const speedInsights = page.locator('head script[data-sdkn="@vercel/speed-insights/next"]');
  for (const script of [analytics, speedInsights]) {
    await expect(script).toHaveCount(1);
    await expect(script).toHaveAttribute("defer", "");
  }
  await expect(speedInsights).toHaveAttribute("data-route", "/");
  await expect(page.getByTestId("wave-properties-lab")).toBeVisible();

  const workspace = page.getByRole("navigation", { name: "Workspace", exact: true });
  await workspace.getByRole("button", { name: "Field guide", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A little field guide." })).toBeVisible();
  await workspace.getByRole("button", { name: "Laboratory", exact: true }).click();
  await page.getByRole("tab", { name: /Doppler effect/ }).click();
  await expect(page.locator(".doppler-lab")).toBeVisible();
  await expect(analytics).toHaveCount(1);
  await expect(speedInsights).toHaveCount(1);
  expect(errors).toEqual([]);
});
