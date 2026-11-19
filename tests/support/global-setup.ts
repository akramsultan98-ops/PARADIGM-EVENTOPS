import { execSync } from "node:child_process";

/** Integration tests run against TEST_DATABASE_URL: migrate from scratch and load the demo seed. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://eventops:eventops_dev@localhost:5432/eventops_test?schema=public";
  // the dedicated TEST database is reset on every run by design (tests create non-demo users, e.g. cross-company
  // fixtures), so the seed's real-data guard is explicitly overridden here — and only here
  const env = { ...process.env, DATABASE_URL: url, SEED_FORCE_RESET: "true" };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" }); // non-destructive; the dev-only seed truncates and reloads demo data
  execSync("npx tsx --conditions=react-server prisma/seed.ts", { env, stdio: "pipe" });
}
