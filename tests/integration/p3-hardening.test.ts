import { beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, chmodSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { demo } from "../support/session";

/**
 * P3 hardening — real session handling (no session mock: the cookie store is the only stand-in), duplicate
 * approvals at the database level, project-code races and the encrypted backup script against PostgreSQL.
 */
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined), set: (k: string, v: string) => { jar.set(k, v); }, delete: (k: string) => { jar.delete(k); } }),
  headers: async () => new Headers(),
}));

process.env.AUTH_SECRET ??= "integration-test-secret-integration-test-secret";
const db = new PrismaClient();
let companyId = "";

async function signIn(email: string) {
  const { signSession, SESSION_COOKIE } = await import("@/lib/auth/token");
  const u = await db.user.findUniqueOrThrow({ where: { email } });
  const token = await signSession({ uid: u.id, cid: u.companyId, sv: u.sessionVersion });
  jar.set(SESSION_COOKIE, token);
  return token;
}

beforeAll(async () => { companyId = (await db.company.findFirstOrThrow({ where: { slug: "paradigm" } })).id; });

describe("P3 password change revokes other sessions", () => {
  it("bumps the session version, keeps this session signed in, and rejects tokens issued before the change", async () => {
    const { changePasswordAction } = await import("@/server/actions/users");
    const { getCurrentUser } = await import("@/lib/auth/session");
    const { hashPassword } = await import("@/lib/auth/password");
    const { SESSION_COOKIE } = await import("@/lib/auth/token");
    const email = demo.logistics;
    await db.user.update({ where: { email }, data: { passwordHash: await hashPassword("Old-password-123") } });
    const otherDevice = await signIn(email);
    const before = (await db.user.findUniqueOrThrow({ where: { email } })).sessionVersion;
    const r = await changePasswordAction("Old-password-123", "New-password-456");
    expect(r.ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { email } })).sessionVersion).toBe(before + 1);
    const fresh = jar.get(SESSION_COOKIE)!;
    expect(fresh).not.toBe(otherDevice);
    expect((await getCurrentUser())?.email).toBe(email); // this browser stays signed in
    jar.set(SESSION_COOKIE, otherDevice);
    expect(await getCurrentUser()).toBeNull(); // the other session is revoked
  });

  it("limits attempts at the current password", async () => {
    const { changePasswordAction } = await import("@/server/actions/users");
    await signIn(demo.accommodation);
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await changePasswordAction("wrong-password-x", "Another-pass-789"));
    expect(results.slice(0, 5).every((r) => !r.ok && /incorrect/.test((r as { error: string }).error))).toBe(true);
    expect((results[5] as { error: string }).error).toMatch(/Too many attempts/);
  });
});

describe("P3 duplicate approvals", () => {
  it("only one pending approval per entity — in the action and in the database", async () => {
    const { requestBudgetApprovalAction } = await import("@/server/actions/approvals");
    const p = await db.project.findFirstOrThrow({ where: { code: "DEMO-HRG-2703" } });
    await signIn(demo.pm);
    const first = await requestBudgetApprovalAction(p.id);
    const second = await requestBudgetApprovalAction(p.id);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    const pending = await db.approval.findMany({ where: { projectId: p.id, entityType: "BUDGET", status: "PENDING" } });
    expect(pending).toHaveLength(1);
    // even code that bypasses the action cannot create a second pending approval
    await expect(db.approval.create({ data: { companyId, projectId: p.id, entityType: "BUDGET", entityId: pending[0].entityId, title: "dup", requiredRole: "FINANCE" } })).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("P3 project code collisions", () => {
  it("concurrent creations in the same city/month get distinct codes instead of failing", async () => {
    const { createProjectAction } = await import("@/server/actions/projects");
    await signIn(demo.pm);
    const input = { name: "Race project", client: "Race client", category: "Test", participants: 10, location: "Zarzis", eventStart: "2027-09-10T09:00", eventEnd: "2027-09-10T18:00", setupStart: "2027-09-08T07:00", setupEnd: "2027-09-09T20:00", currency: "EGP", departments: [], requirements: [] };
    const settled = await Promise.allSettled([createProjectAction(input), createProjectAction(input), createProjectAction(input)]);
    // success ends in redirect(); any non-redirect error is a failure
    for (const s of settled) if (s.status === "rejected") expect(String((s.reason as { digest?: string }).digest ?? s.reason)).toMatch(/NEXT_REDIRECT/);
    else expect(s.value.ok).toBe(true);
    const codes = (await db.project.findMany({ where: { location: "Zarzis" }, select: { code: true } })).map((x) => x.code);
    expect(codes).toHaveLength(3);
    expect(new Set(codes).size).toBe(3);
  });
});

describe("P3 encrypted backups without credential exposure", () => {
  const script = path.resolve("scripts/backup.sh");
  const url = process.env.DATABASE_URL!;

  it("refuses to write unencrypted backups unless explicitly allowed", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "bk-"));
    const r = spawnSync("bash", [script, dir], { env: { ...process.env, DATABASE_URL: url, BACKUP_PASSPHRASE_FILE: "", STORAGE_LOCAL_DIR: dir }, encoding: "utf8" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/Refusing to write unencrypted backups/);
  });

  it("never passes the password on the command line (pg_dump argv inspected)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "bk-"));
    const bin = mkdtempSync(path.join(tmpdir(), "bin-"));
    writeFileSync(path.join(bin, "pg_dump"), `#!/usr/bin/env bash\necho "ARGV:$*" > "${dir}/argv.txt"\necho "PGPASSWORD_SET:\${PGPASSWORD:+yes}" >> "${dir}/argv.txt"\necho dump`);
    chmodSync(path.join(bin, "pg_dump"), 0o755);
    const pass = path.join(dir, "pass"); writeFileSync(pass, "test-passphrase", { mode: 0o600 });
    execFileSync("bash", [script, path.join(dir, "out")], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DATABASE_URL: "postgresql://eventops:S3cret%21pw@localhost:5432/eventops_test", BACKUP_PASSPHRASE_FILE: pass, STORAGE_LOCAL_DIR: dir } });
    const seen = readFileSync(path.join(dir, "argv.txt"), "utf8");
    expect(seen).not.toMatch(/S3cret/);
    expect(seen).not.toMatch(/postgresql:\/\//);
    expect(seen).toMatch(/PGPASSWORD_SET:yes/);
  });

  it("writes encrypted, owner-only dumps of the real database that decrypt to a valid pg_dump archive", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "bk-"));
    const uploads = mkdtempSync(path.join(tmpdir(), "up-")); writeFileSync(path.join(uploads, "a.txt"), "hello");
    const pass = path.join(dir, "pass"); writeFileSync(pass, "test-passphrase", { mode: 0o600 });
    execFileSync("bash", [script, path.join(dir, "out")], { env: { ...process.env, DATABASE_URL: url, BACKUP_PASSPHRASE_FILE: pass, STORAGE_LOCAL_DIR: uploads } });
    const files = readdirSync(path.join(dir, "out"));
    const dump = files.find((f) => f.endsWith(".dump.enc"))!;
    expect(dump).toBeTruthy();
    expect(files.some((f) => f.endsWith(".tar.gz.enc"))).toBe(true);
    const raw = readFileSync(path.join(dir, "out", dump));
    expect(raw.subarray(0, 5).toString()).not.toBe("PGDMP"); // not plaintext
    expect(statSync(path.join(dir, "out", dump)).mode & 0o077).toBe(0); // owner-only
    const plain = execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-pass", `file:${pass}`, "-in", path.join(dir, "out", dump)]);
    expect(plain.subarray(0, 5).toString()).toBe("PGDMP");
  });
});
