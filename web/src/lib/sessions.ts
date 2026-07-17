import { Redis } from "@upstash/redis";

const SESSIONS_INDEX_KEY = "sessions:index";

function redis(): Redis | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  return Redis.fromEnv();
}

export type SessionRecord = {
  id: string;
  userId: string;
  startedAt: number;
  durationSecs: number;
  // Vercel Blob pathnames (not URLs) — the store is private, so reading
  // these requires @vercel/blob's get() with BLOB_READ_WRITE_TOKEN/OIDC,
  // not a direct fetch. See src/lib/blob.ts.
  audioPath: string;
  transcriptPath: string;
  promptTokens: number;
  completionTokens: number;
};

/** Lists recorded bot sessions, newest first. */
export async function listSessions(
  limit = 50,
): Promise<SessionRecord[]> {
  const client = redis();
  if (!client) {
    console.warn("⚠️ sessions: Upstash Redis not configured");
    return [];
  }

  const ids = await client.zrange<string[]>(SESSIONS_INDEX_KEY, 0, limit - 1, {
    rev: true,
  });
  if (ids.length === 0) return [];

  const records = await Promise.all(
    ids.map((id) => client.hgetall<Record<string, string>>(`session:${id}`)),
  );

  return ids
    .map((id, i) => toSessionRecord(id, records[i]))
    .filter((r): r is SessionRecord => r !== null);
}

/** Fetches a single recorded session by id. */
export async function getSession(id: string): Promise<SessionRecord | null> {
  const client = redis();
  if (!client) {
    console.warn("⚠️ sessions: Upstash Redis not configured");
    return null;
  }

  const record = await client.hgetall<Record<string, string>>(`session:${id}`);
  return toSessionRecord(id, record);
}

function toSessionRecord(
  id: string,
  record: Record<string, string> | null,
): SessionRecord | null {
  if (!record || !record.userId) return null;
  return {
    id,
    userId: record.userId,
    startedAt: Number(record.startedAt) * 1000,
    durationSecs: Number(record.durationSecs),
    audioPath: record.audioPath ?? "",
    transcriptPath: record.transcriptPath ?? "",
    promptTokens: Number(record.promptTokens ?? 0),
    completionTokens: Number(record.completionTokens ?? 0),
  };
}
