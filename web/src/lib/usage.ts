import { Redis } from "@upstash/redis";
import {
  evaluateUsage,
  parseDailyCap,
  usageKey,
  type UsageGate,
} from "./quota";

export type { UsageGate };

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

/**
 * Counts sessions started per user per UTC day. Each session is also
 * hard-capped in duration by the bot itself, so sessions/day bounds the
 * worst-case spend.
 */
export async function checkAndCountSession(userId: string): Promise<UsageGate> {
  const cap = parseDailyCap(process.env.DAILY_SESSION_CAP);
  const client = redis();
  if (!client) {
    // No Redis configured (local dev): allow everything.
    console.warn("⚠️ usage: Upstash Redis not configured, skipping daily cap");
    return { allowed: true, used: 0, cap };
  }
  const key = usageKey(userId, new Date());
  // One round trip, and the TTL is set on every call, so a crash between
  // INCR and EXPIRE can no longer leave a counter without an expiry.
  const [used] = await client
    .pipeline()
    .incr(key)
    .expire(key, DAY_SECONDS)
    .exec<[number, number]>();
  console.info(`📊 usage: ${userId} at ${used}/${cap} sessions today`);
  return evaluateUsage(used, cap, key);
}

/**
 * Gives back a session that was counted but never started (for example the
 * agent provider failed), so an outage does not eat the user's daily quota.
 */
export async function refundSession(gate: UsageGate): Promise<void> {
  const client = redis();
  if (!client || !gate.key || !gate.allowed) return;
  try {
    await client.decr(gate.key);
  } catch (err) {
    console.error("❌ usage: refund failed", err);
  }
}
