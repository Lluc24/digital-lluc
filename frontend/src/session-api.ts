import { SignJWT } from "jose";
import { z } from "zod";
import type { ServerEnv } from "./env";
import { type SessionStart, sessionConnectionSchema } from "./session";

const AUTH_TOKEN_AUDIENCE = "digital-lluc-api";
const AUTH_TOKEN_LIFETIME_SECONDS = 60;

const dailyCapExceededSchema = z.object({
  error: z.literal("daily_cap_exceeded"),
  sessions_per_day: z.int().positive(),
});

export async function mintAuthToken(
  userEmail: string,
  secret: string,
  now: Date,
): Promise<string> {
  const issuedAtSeconds = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userEmail)
    .setAudience(AUTH_TOKEN_AUDIENCE)
    .setIssuedAt(issuedAtSeconds)
    .setExpirationTime(issuedAtSeconds + AUTH_TOKEN_LIFETIME_SECONDS)
    .sign(new TextEncoder().encode(secret));
}

/** Asks the session API to start a session for a signed-in visitor. */
export async function startBackendSession(
  env: ServerEnv,
  userEmail: string,
  now: Date,
): Promise<SessionStart> {
  const response = await fetch(new URL("/v1/sessions", env.BACKEND_URL), {
    method: "POST",
    headers: {
      authorization: `Bearer ${await mintAuthToken(userEmail, env.AUTH_TOKEN_SECRET, now)}`,
    },
  });
  const body: unknown = await response.json();
  switch (response.status) {
    case 201:
      return {
        kind: "started",
        connection: sessionConnectionSchema.parse(body),
      };
    case 429:
      return {
        kind: "daily-cap-exceeded",
        sessionsPerDay: dailyCapExceededSchema.parse(body).sessions_per_day,
      };
    case 502:
    case 503:
      return { kind: "agent-unavailable" };
    default:
      throw new Error(
        `expected 201, 429, 502 or 503 from the session API, got ${response.status}: ${JSON.stringify(body)}`,
      );
  }
}
