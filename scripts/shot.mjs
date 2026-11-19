// usage: node scripts/shot.mjs <email> <outdir> <path...>   (dev visual QA helper)
import { chromium } from "playwright";
const [email, out, ...paths] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3000";
const width = Number(process.env.W ?? 1440), height = Number(process.env.H ?? 900);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
if (process.env.LOCALE) await ctx.addCookies([{ name: "peo_locale", value: process.env.LOCALE, url: base }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
if (email !== "-") {
  await page.goto(`${base}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "EventOps!2026");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }), page.click('button[type="submit"]')]);
}
for (const p of paths) {
  errors.length = 0;
  const res = await page.goto(`${base}${p}`, { waitUntil: "load", timeout: 120000 });
  const name = p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root";
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: process.env.FULL === "1", caret: "initial" });
  await page.waitForTimeout(800); const overlay = await page.locator("[data-nextjs-dialog], [data-nextjs-toast-errors-parent]").count();
  console.log(`${res?.status()} ${p}${overlay ? " [next overlay]" : ""}`);
  const uniq = [...new Set(errors)];
  if (uniq.length) console.log("   ERR: " + uniq.map((e) => e.slice(0, 300).replace(/\s+/g, " ")).join("\n   ERR: "));
}
await browser.close();
