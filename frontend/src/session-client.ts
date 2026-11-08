import { type SessionStart, sessionStartSchema } from "./session";

export async function requestSession(): Promise<SessionStart> {
  const response = await fetch("/api/sessions", { method: "POST" });
  return sessionStartSchema.parse(await response.json());
}
