import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("mobile site-execution and navigation drawer", async ({ page }) => {
  await login(page, "production");
  await page.goto("/execution");
  await expect(page.getByRole("heading", { name: "Live Execution" })).toBeVisible();
  const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(w).toBeLessThanOrEqual(1); // no horizontal page scroll
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Production" })).toBeVisible();
});

test("Arabic RTL layout", async ({ page, context }) => {
  await login(page, "pm");
  await context.addCookies([{ name: "peo_locale", value: "ar", url: "http://localhost:3000" }]);
  await page.goto("/dashboard");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible();
});
