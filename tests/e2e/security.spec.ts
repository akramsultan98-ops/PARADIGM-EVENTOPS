import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("unauthenticated access is redirected / rejected", async ({ page, request }) => {
  await page.context().clearCookies();
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login\?next=%2Fprojects/);
  const r = await request.get("/api/audit.csv", { headers: { cookie: "" } });
  expect(r.status()).toBe(401);
});

test("server-side permissions: viewer cannot export, member cannot manage users", async ({ page }) => {
  await login(page, "viewer");
  const projects = await page.request.get("/api/audit.csv");
  expect(projects.status()).toBe(403);
  await login(page, "production.member");
  await page.goto("/users");
  await expect(page).toHaveURL(/\/forbidden\?need=users.manage/);
  await expect(page.getByText("Access denied")).toBeVisible();
});

test("tampered session cookie is rejected", async ({ page, context }) => {
  await context.addCookies([{ name: "peo_session", value: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4IiwiY2lkIjoieCIsInN2IjoxfQ.invalid", url: "http://localhost:3000" }]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("security headers: CSP, HSTS, framing and sniffing protections (P3)", async ({ request }) => {
  const r = await request.get("/login");
  const h = r.headers();
  expect(h["content-security-policy"]).toMatch(/default-src 'self'/);
  expect(h["content-security-policy"]).toMatch(/frame-ancestors 'none'/);
  expect(h["content-security-policy"]).toMatch(/object-src 'none'/);
  expect(h["strict-transport-security"]).toMatch(/max-age=\d+/);
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
});
