import "server-only";

/**
 * Demo login is a development convenience. It is enabled only when ENABLE_DEMO_LOGIN="true" AND the
 * process is not a production build — unless a deployment explicitly opts in with
 * ALLOW_DEMO_LOGIN_IN_PRODUCTION="true" (e.g. a clearly labelled internal demo server).
 */
export function demoLoginEnabled(): boolean {
  if (process.env.ENABLE_DEMO_LOGIN !== "true") return false;
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_LOGIN_IN_PRODUCTION !== "true") return false;
  return true;
}

/** The documented development password, only ever sent to the client when demo login is enabled. */
export function demoPassword(): string {
  return process.env.DEMO_PASSWORD ?? "EventOps!2026";
}
