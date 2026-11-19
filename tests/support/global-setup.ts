import { execSync } from "node:child_process";

/** Integration tests run against TEST_DATABASE_URL: migrate from scratch and load the demo seed. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://eventops:eventops_dev@localhost:5432/eventops_test?schema=public";
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" }); // non-destructive; the dev-only seed truncates and reloads demo data
  execSync("npx tsx --conditions=react-server prisma/seed.ts", { env, stdio: "pipe" });
}
