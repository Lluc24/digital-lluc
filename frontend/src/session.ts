import { z } from "zod";

export const sessionConnectionSchema = z.discriminatedUnion("transport", [
  z.object({
    transport: z.literal("daily"),
    room_url: z.url(),
    token: z.string().min(1),
  }),
  z.object({ transport: z.literal("smallwebrtc"), offer_url: z.url() }),
]);

export type SessionConnection = z.infer<typeof sessionConnectionSchema>;

export const sessionStartSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("started"), connection: sessionConnectionSchema }),
  z.object({ kind: z.literal("sign-in-required") }),
  z.object({
    kind: z.literal("daily-cap-exceeded"),
    sessionsPerDay: z.int().positive(),
  }),
  z.object({ kind: z.literal("agent-unavailable") }),
]);

export type SessionStart = z.infer<typeof sessionStartSchema>;

export const HTTP_STATUS_BY_SESSION_START: Record<
  SessionStart["kind"],
  number
> = {
  started: 201,
  "sign-in-required": 401,
  "daily-cap-exceeded": 429,
  "agent-unavailable": 502,
};
