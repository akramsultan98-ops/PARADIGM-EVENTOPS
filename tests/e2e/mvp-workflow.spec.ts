import { test, expect } from "@playwright/test";
import { expectToast, field, login } from "./helpers";

/**
 * Complete MVP workflow (spec §38): create event → departments submit → missing information
 * identified and completed → calculations → plan → conflicts → approvals → workbook → execution
 * → actual vs planned. Uses the real UI with role-based demo accounts.
 */
test("event from brief to actual-vs-planned", async ({ page }) => {
  const name = `E2E Conference ${Date.now().toString().slice(-6)}`;
  let projectId = "";

  await test.step("1–2. Account Manager creates the event and assigns departments", async () => {
    await login(page, "account");
    await page.goto("/projects/new");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await field(page, "Project name").fill(name);
    await field(page, "Client").fill("E2E Client");
    await field(page, "Participants").fill("120");
    await page.getByRole("button", { name: /^Next/ }).click();
    await field(page, "Location (city)").fill("Aswan");
    await field(page, "Venue").selectOption({ label: "Demo Aswan Conference Hall — Aswan" });
    await field(page, "Setup starts").fill("2027-02-10T07:00");
    await field(page, "Setup ends").fill("2027-02-11T22:00");
    await field(page, "Event starts").fill("2027-02-12T09:00");
    await field(page, "Event ends").fill("2027-02-12T18:00");
    await field(page, "Venue hand-back").fill("2027-02-13T12:00");
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByText("Participating departments", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Next/ }).click();
    await field(page, "Budget").fill("900000");
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByRole("button", { name: "Create project" }).click();
    await page.waitForURL(/\/projects\/[a-z0-9]{20,}$/);
    projectId = page.url().split("/").pop()!;
    await expect(page.getByRole("heading", { name })).toBeVisible();
  });

  // four-eyes principle: inputs are entered by one person and technically approved by another (the department manager)
  await test.step("3. Production engineer submits structured requirements (10-step form)", async () => {
    await login(page, "production.member");
    await page.goto(`/production/new?project=${projectId}`);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`/production/new?project=${projectId}`);
    await page.getByRole("button", { name: /^Next/ }).click(); // project
    await page.getByRole("button", { name: "Backdrop", exact: true }).click();
    await page.getByRole("button", { name: /^Next/ }).click();
    await field(page, "Item code").fill("BKD-E2E");
    await field(page, "Item name").fill("E2E backdrop 6 × 3 m");
    await field(page, "Width (m)").fill("6");
    await field(page, "Height (m)").fill("3");
    await field(page, "Depth (m)").fill("0.3");
    await field(page, "Packed transport volume (m³)").fill("4");
    await page.getByRole("button", { name: /^Next/ }).click();
    await field(page, "Main board material").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Add" }).first().click();
    await page.getByPlaceholder("Label").first().fill("Face panel 2.0×1.0");
    await page.getByPlaceholder("L m").first().fill("2");
    await page.getByPlaceholder("W m").first().fill("1");
    await page.getByPlaceholder("Qty").first().fill("9");
    await page.getByRole("button", { name: /^Next/ }).click();
    await field(page, "Construction method").fill("Timber stud frame clad with MDF");
    await page.getByRole("button", { name: "Add" }).first().click();
    const member = page.locator("div.grid.rounded-md.border").last();
    await member.getByPlaceholder("Label").fill("Stud 3.0 m");
    await member.locator("select").selectOption({ label: "TMB-50" });
    await member.getByPlaceholder("L m").fill("3");
    await member.getByPlaceholder("Qty").fill("7");
    await page.getByRole("button", { name: /^Next/ }).click();
    await field(page, "Finishing").fill("Painted matte black");
    await field(page, "Default paint coats").fill("2");
    await page.getByRole("button", { name: /^Next/ }).click(); // drawings (none — components entered from drawing)
    await page.getByRole("button", { name: /^Next/ }).click();
    await field(page, "Installation setup day").fill("1");
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByText("Review extracted information", { exact: false }).first()).toBeVisible();
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByRole("button", { name: "Submit for planning", exact: true }).click();
    await page.waitForURL(/\/inputs\?submission=/);
    await expect(page.getByText("BKD-E2E E2E backdrop")).toBeVisible();
  });

  await test.step("4. AV requirements entered by the PM coordinator (the AV manager approves them)", async () => {
    await login(page, "pm");
    await page.goto(`/av/new?project=${projectId}`);
    await field(page, "Inventory model").selectOption({ label: "LED-P39 — LED cabinet P3.9 500×500" });
    await field(page, "Qty").fill("24");
    await field(page, "Backup").fill("2");
    await page.getByRole("button", { name: "Submit for approval" }).click();
    await page.waitForURL(`**/projects/${projectId}/av`);
    await expect(page.getByText("LED cabinet P3.9 500×500").first()).toBeVisible();
  });

  await test.step("5. Logistics adds cargo", async () => {
    await login(page, "logistics");
    await page.goto(`/projects/${projectId}/logistics`);
    await page.getByRole("button", { name: "Add cargo" }).click();
    const dlg = page.getByRole("dialog");
    await field(page, "Item", '[role="dialog"]').fill("Tool crate");
    await field(page, "Length m", '[role="dialog"]').fill("1.2");
    await field(page, "Width m", '[role="dialog"]').fill("0.8");
    await field(page, "Height m", '[role="dialog"]').fill("0.8");
    await field(page, "Weight kg / unit", '[role="dialog"]').fill("110");
    await dlg.getByRole("button", { name: "Add cargo" }).click();
    await expectToast(page, /Cargo added/);
  });

  await test.step("6. Accommodation adds a guest whose name is still unknown", async () => {
    await login(page, "accommodation");
    await page.goto(`/projects/${projectId}/accommodation`);
    await page.getByRole("button", { name: "Add guest" }).click();
    await field(page, "Job role", '[role="dialog"]').fill("Carpenter (name pending)");
    await field(page, "Check-in", '[role="dialog"]').fill("2027-02-09");
    await field(page, "Check-out", '[role="dialog"]').fill("2027-02-13");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expectToast(page, /Rooming list updated/);
  });

  await test.step("7–8. Plan generation identifies missing information; Production completes it conversationally", async () => {
    await login(page, "pm");
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: "Generate plan" }).click();
    await page.waitForURL(`**/projects/${projectId}/planning`);
    await expect(page.getByText("Clarification requests by department", { exact: true })).toBeVisible();
    await expect(page.getByText(/has no guest name/).first()).toBeVisible();

    await login(page, "production.member");
    await page.goto(`/projects/${projectId}/inputs`);
    await page.getByPlaceholder(/8-meter wide/).fill("We need a 2 meter wide, 1.1 meter high podium in MDF 18mm, painted white, installation on the second setup day.");
    await page.getByRole("button", { name: "Extract draft" }).click();
    await page.waitForURL(/submission=/);
    await expect(page.getByText("Follow-up questions", { exact: true })).toBeVisible();
    await field(page, "Code").fill("POD-E2E");
    await field(page, "Depth (m)").fill("0.5");
    await field(page, "Paint coats").fill("2");
    await field(page, "Board material").selectOption({ index: 1 });
    await page.getByTestId("drawing-upload").setInputFiles({ name: "POD-E2E-drawing.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF") });
    await expectToast(page, /attached/);
    await page.getByRole("button", { name: "Confirm & submit" }).click();
    await expectToast(page, /Submitted for technical review/);
  });

  await test.step("9 & 16. Department managers give technical approval", async () => {
    for (const who of ["production", "av"]) {
      await login(page, who);
      await page.goto("/approvals");
      for (let i = 0; i < 5; i++) {
        const row = page.locator(".divide-y > div").filter({ hasText: name });
        if ((await row.count()) === 0) break;
        await row.first().getByRole("button", { name: "Approve" }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
        await expectToast(page, /Decision recorded/);
        await page.waitForTimeout(500);
        await page.reload();
      }
    }
  });

  await test.step("10–14 & 17. PM regenerates, reviews conflicts and approves the integrated plan", async () => {
    await login(page, "pm");
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: "Generate plan" }).click();
    await page.waitForURL(`**/projects/${projectId}/planning`);
    await expect(page.getByText("Plan version", { exact: true })).toBeVisible();
    await page.goto(`/projects/${projectId}/manpower`);
    await expect(page.getByText("Manpower requirement by trade", { exact: true })).toBeVisible();
    await page.goto(`/projects/${projectId}/procurement`);
    await expect(page.getByText("Procurement requirements from the plan", { exact: true })).toBeVisible();
    await page.goto(`/projects/${projectId}/risks`);
    await expect(page.getByText("Transport vehicle breakdown en route", { exact: true })).toBeVisible();
    await page.goto(`/projects/${projectId}/planning`);
    await page.getByRole("button", { name: "Approve" }).first().click();
    const ack = page.getByRole("dialog").locator('input[type="checkbox"]');
    if (await ack.count()) await ack.check();
    await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
    await expectToast(page, /Decision recorded/);
    await page.reload();
    await expect(page.locator("h1").locator("xpath=..")).toContainText("Approved");
  });

  await test.step("18. Master workbook export", async () => {
    const res = await page.request.get(`/api/projects/${projectId}/workbook`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toMatch(/PARADIGM_EVENTOPS_E2E_CONFERENCE_\d+_MASTER_PLAN\.xlsx/);
    expect((await res.body()).length).toBeGreaterThan(20000);
  });

  await test.step("19–21. Teams execute, record actuals; system compares actual vs planned", async () => {
    await login(page, "production");
    await page.goto(`/execution?project=${projectId}`);
    await page.getByRole("button", { name: "All", exact: true }).click();
    const card = page.locator("div.rounded-lg").filter({ has: page.getByRole("button", { name: "Start" }) }).first();
    await card.getByRole("button", { name: "Start" }).click();
    await expectToast(page, /Task updated/);
    await page.getByRole("button", { name: "Done" }).first().click();
    await expectToast(page, /Task updated/);
    await page.getByRole("button", { name: "Record actual" }).click();
    await field(page, "Actual quantity", '[role="dialog"]').fill("12");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expectToast(page, /Actual recorded/);
    await page.goto(`/execution/actual-vs-planned?project=${projectId}`);
    await expect(page.getByText("Planned vs actual quantities", { exact: true })).toBeVisible();
    await expect(page.locator("table.data-table").first()).toContainText("%");
  });
});
