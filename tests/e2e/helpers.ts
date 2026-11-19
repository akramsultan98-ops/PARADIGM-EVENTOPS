import { expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.DEMO_PASSWORD ?? "EventOps!2026";

export async function login(page: Page, who: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(`${who}@demo.eventops.local`);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.locator('button[type="submit"]').click()]);
}

/** Input/select/textarea that follows a Field label (labels are visual spans in the design system). */
export function field(page: Page, label: string, scope?: string) {
  const root = scope ? page.locator(scope) : page;
  return root.locator(`xpath=.//span[contains(@class,"field-label")][normalize-space(text())="${label}"]/following-sibling::*[1]`).first();
}

export async function expectToast(page: Page, text: RegExp | string) {
  await expect(page.locator('[aria-live="polite"]')).toContainText(text);
}
