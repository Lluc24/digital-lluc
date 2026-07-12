import { Redis } from "@upstash/redis";

const DAY_SECONDS = 60 * 60 * 24;

function redis(): Redis | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  return Redis.fromEnv();
}

export type UsageGate =
  | { allowed: true; used: number; cap: number }
  | { allowed: false; used: number; cap: number };

/**
 * Counts sessions started per user per UTC day. Each session is also
 * hard-capped in duration by the bot itself, so sessions/day bounds the
 * worst-case spend.
 */
export async function checkAndCountSession(userId: string): Promise<UsageGate> {
  const cap = Number(process.env.DAILY_SESSION_CAP ?? 5);
  const client = redis();
  if (!client) {
    // No Redis configured (local dev): allow everything.
    console.warn("usage: Upstash Redis not configured, skipping daily cap");
    return { allowed: true, used: 0, cap };
  }
  const day = new Date().toISOString().slice(0, 10);
  const key = `usage:${userId}:${day}`;
  const used = await client.incr(key);
  if (used === 1) {
    await client.expire(key, DAY_SECONDS);
  }
  if (used > cap) {
    return { allowed: false, used, cap };
  }
  return { allowed: true, used, cap };
}
