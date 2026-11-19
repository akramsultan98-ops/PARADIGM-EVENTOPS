import { beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { demo, loadUser } from "../support/session";

/**
 * P1-2 regression: financial data only for roles with budget.read — enforced on the server
 * (route handlers, plan loaders, workbook, assistant, BudgetTab), checked per role against the test DB.
 */
const S = vi.hoisted(() => ({ user: null as unknown as import("@/lib/auth/session").AuthUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: vi.fn(async () => S.user), getCurrentUser: vi.fn(async () => S.user) }));

const db = new PrismaClient();
let projectId = "", rfqId = "";
const as = async (email: string) => { S.user = await loadUser(email); };
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const ROLES = [
  { email: demo.viewer, role: "VIEWER", fin: false, export: false },
  { email: demo.member, role: "DEPARTMENT_MEMBER", fin: false, export: false },
  { email: demo.production, role: "PRODUCTION_MANAGER", fin: false, export: true },
  { email: demo.av, role: "AV_MANAGER", fin: false, export: true },
  { email: demo.pm, role: "PROJECT_MANAGER", fin: true, export: true },
  { email: demo.finance, role: "FINANCE", fin: true, export: true },
] as const;

const MONEY_HEADER = /^(Amount|Cost impact|Cost|Daily cost|Est\. cost|Rental cost|Unit cost|Unit price|Rate)$/;

async function sheetsOf(res: Response) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
  const headers = new Set<string>();
  const overview: string[] = [];
  wb.worksheets.forEach((ws) => ws.eachRow((row) => row.eachCell((c) => { const v = String(c.value ?? ""); headers.add(v); if (ws.name.startsWith("01_")) overview.push(v); })));
  return { names: wb.worksheets.map((w) => w.name), headers, overview };
}

beforeAll(async () => {
  const p = await db.project.findFirstOrThrow({ where: { code: "DEMO-ASW-2612" } });
  projectId = p.id;
  rfqId = (await db.procurementRequest.findFirstOrThrow({ where: { projectId, code: "MAT:PLY-18" } })).id;
  expect(Number(p.budgetAmount)).toBeGreaterThan(0); // the project really has a budget to leak
});

describe("P1-2 financial confidentiality by role", () => {
  for (const r of ROLES) {
    describe(r.role, () => {
      it(`workbook export: ${r.export ? (r.fin ? "full, with financials" : "allowed WITHOUT any financial data") : "forbidden"}`, async () => {
        const { GET } = await import("@/app/api/projects/[id]/workbook/route");
        await as(r.email);
        const res = await GET(new Request(`http://t/api/projects/${projectId}/workbook`), params(projectId));
        if (!r.export) { expect(res.status).toBe(403); return; }
        expect(res.status).toBe(200);
        const wb = await sheetsOf(res);
        expect(wb.names.some((n) => n.startsWith("16_"))).toBe(r.fin);
        expect([...wb.headers].some((h) => MONEY_HEADER.test(h))).toBe(r.fin);
        expect(wb.overview.includes("Budget")).toBe(r.fin);
        const budgetOnly = await GET(new Request(`http://t/api/projects/${projectId}/workbook?sheets=budget`), params(projectId));
        expect(budgetOnly.status).toBe(r.fin ? 200 : 403);
      });

      it(`plan loader ${r.fin ? "returns" : "redacts"} costs`, async () => {
        const { getPlan } = await import("@/server/queries/plans");
        await as(r.email);
        const pl = await getPlan(projectId);
        expect(pl).not.toBeNull();
        expect(pl!.plan.budget.byCurrency.length > 0).toBe(r.fin);
        expect(pl!.plan.production.boq.some((b) => b.cost != null)).toBe(r.fin);
        expect(pl!.plan.procurement.some((b) => b.unitPrice != null)).toBe(r.fin);
      });

      it(`project budget tab is ${r.fin ? "served" : "refused on the server"}`, async () => {
        const { BudgetTab } = await import("@/components/project/tab-plan");
        await as(r.email);
        if (r.fin) await expect(BudgetTab({ id: projectId })).resolves.toBeTruthy();
        else await expect(BudgetTab({ id: projectId })).rejects.toThrow(/NEXT_REDIRECT/);
      });

      it(`project context ${r.fin ? "includes" : "omits"} the budget figure`, async () => {
        const { projectContext } = await import("@/server/queries/project");
        await as(r.email);
        const ctx = await projectContext(projectId);
        expect(ctx.project.budgetAmount != null).toBe(r.fin);
      });

      it(`assistant ${r.fin ? "answers" : "refuses"} budget questions and overview ${r.fin ? "includes" : "omits"} budget`, async () => {
        const { assistantRespond } = await import("@/ai/assistant");
        const u = await loadUser(r.email);
        const reply = await assistantRespond(u, projectId, [], "What is the budget and planned cost?");
        if (r.fin) expect(reply.text).toMatch(/Planned cost/);
        else { expect(reply.text).toMatch(/requires the budget\.read permission/); expect(reply.text).not.toMatch(/\d{3},\d{3}/); }
      });

      it(`RFQ PDF is ${r.role === "PROJECT_MANAGER" ? "available" : "forbidden"} (procurement.manage)`, async () => {
        const { GET } = await import("@/app/api/procurement/[id]/rfq/route");
        await as(r.email);
        const res = await GET(new Request("http://t"), params(rfqId));
        expect(res.status).toBe(r.role === "PROJECT_MANAGER" ? 200 : 403);
      });

      it(`plan report PDF ${r.export ? (r.fin ? "includes" : "omits") + " the budget line" : "is forbidden"}`, async () => {
        const { GET } = await import("@/app/api/projects/[id]/report/route");
        await as(r.email);
        const res = await GET(new Request("http://t"), params(projectId));
        if (!r.export) { expect(res.status).toBe(403); return; }
        expect(res.status).toBe(200);
        const { extractText, getDocumentProxy } = await import("unpdf");
        const { text } = await extractText(await getDocumentProxy(new Uint8Array(await res.arrayBuffer())), { mergePages: true });
        expect(String(text).includes("Budget:")).toBe(r.fin);
        expect(String(text).includes("1,500,000")).toBe(r.fin); // the demo budget figure itself
      });
    });
  }

  it("procurement manager (budget.read) can use RFQs; assistant what-if needs plan.review", async () => {
    const { GET } = await import("@/app/api/procurement/[id]/rfq/route");
    await as(demo.procurement);
    expect((await GET(new Request("http://t"), params(rfqId))).status).toBe(200);
    const { assistantRespond } = await import("@/ai/assistant");
    const reply = await assistantRespond(await loadUser(demo.member), projectId, [], "What if the main truck breaks down?");
    expect(reply.text).toMatch(/requires the plan\.review permission/);
  });
});
