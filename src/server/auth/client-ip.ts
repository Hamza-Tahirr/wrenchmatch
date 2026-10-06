import "server-only";

import { headers } from "next/headers";

const MAX_IP_LENGTH = 64;

/**
 * Best-effort client address for the per-IP limits (failed logins, sign-ups): the first
 * X-Forwarded-For entry, else X-Real-IP, else "unknown".
 *
 * It is only as trustworthy as the proxy in front of the app. Next.js fills in
 * X-Forwarded-For from the socket only when the request arrives without one (base-server.js
 * assigns it with `??=`), so a header the client sent reaches this code unchanged, and a
 * Server Action has no other way to see the socket address (headers are all it gets). A
 * TRUST_PROXY-style switch could not make the value trustworthy, so there is none on
 * purpose. X-Real-IP is consulted only when X-Forwarded-For is empty and is no safer.
 *
 * Production must run behind a reverse proxy that overwrites X-Forwarded-For with the
 * address it accepted the connection from (see .env.example); Vercel's edge network does
 * this for the hosted pilot, so the per-IP limits hold there. Without one, a client can
 * choose its own address (to dodge the per-IP limit, or to spend another address's
 * allowance), so the per-email and per-user limits remain the main protection.
 */
export async function getClientIp(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || list.get("x-real-ip")?.trim() || "";
  return candidate.length > 0 && candidate.length <= MAX_IP_LENGTH ? candidate : "unknown";
}
