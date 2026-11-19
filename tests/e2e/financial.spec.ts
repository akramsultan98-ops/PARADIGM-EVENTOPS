import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

/** P1-2 in the real browser: budget pages, tab and money on the overview depend on budget.read (server-enforced). */
async function aswanUrl(page: Page) {
  await page.goto("/projects?q=DEMO-ASW-2612");
  const href = await page.getByRole("link", { name: "Aswan Corporate Conference" }).first().getAttribute("href");
  expect(href).toMatch(/^\/projects\/[a-z0-9]+$/);
  return href!;
}

const MATRIX = [
  { who: "viewer", fin: false },
  { who: "production.member", fin: false },
  { who: "production", fin: false },
  { who: "av", fin: false },
  { who: "pm", fin: true },
  { who: "finance", fin: true },
];

for (const { who, fin } of MATRIX) {
  test(`budget access for ${who}: ${fin ? "allowed" : "denied"}`, async ({ page }) => {
    await login(page, who);
    const url = await aswanUrl(page);
    // the tab link is only cosmetic — the server decides
    await expect(page.locator(`a[href="${url}/budget"]`)).toHaveCount(0);
    await page.goto(url);
    await expect(page.locator(`nav[aria-label="Project sections"] a[href="${url}/budget"]`)).toHaveCount(fin ? 1 : 0);
    await expect(page.getByText("Planned cost", { exact: true })).toHaveCount(fin ? 1 : 0);

    await page.goto(`${url}/budget`);
    if (fin) await expect(page.getByText("Entered costs, quotations & actuals")).toBeVisible();
    else await expect(page).toHaveURL(/\/forbidden\?need=budget\.read/);

    await page.goto("/budget");
    if (fin) await expect(page).toHaveURL(/\/budget$/);
    else await expect(page).toHaveURL(/\/forbidden\?need=budget\.read/);
  });
}
