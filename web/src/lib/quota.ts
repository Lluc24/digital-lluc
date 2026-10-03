// Pure helpers for the daily session cap. No Redis or env access here, so
// they can be tested without network.

export const DEFAULT_DAILY_SESSION_CAP = 5;

export type UsageGate =
  | { allowed: true; used: number; cap: number; key?: string }
  | { allowed: false; used: number; cap: number; key?: string };

/**
 * Parses DAILY_SESSION_CAP. Anything that is not a positive whole number
 * falls back to the default. Before, `Number("abc")` gave NaN, and
 * `used > NaN` is always false, which silently removed the cap.
 */
export function parseDailyCap(
  raw: string | undefined,
  fallback = DEFAULT_DAILY_SESSION_CAP,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** One counter per user per UTC day. */
export function usageKey(userId: string, now: Date): string {
  return `usage:${userId}:${now.toISOString().slice(0, 10)}`;
}

/** Decides the gate once the counter has been incremented to `used`. */
export function evaluateUsage(used: number, cap: number, key?: string): UsageGate {
  return used > cap
    ? { allowed: false, used, cap, key }
    : { allowed: true, used, cap, key };
}
