import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "peo_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
}

export interface SessionClaims { uid: string; cid: string; sv: number }

export async function signSession(c: SessionClaims) {
  return new SignJWT({ cid: c.cid, sv: c.sv }).setProtectedHeader({ alg: "HS256" }).setSubject(c.uid).setIssuedAt().setExpirationTime(`${SESSION_TTL_SECONDS}s`).sign(secret());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.cid !== "string" || typeof payload.sv !== "number") return null;
    return { uid: payload.sub, cid: payload.cid, sv: payload.sv };
  } catch {
    return null;
  }
}
