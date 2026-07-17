import { get } from "@vercel/blob";

/** Reads and parses a JSON blob from the private store; null if missing/unconfigured. */
export async function readJsonBlob<T>(pathname: string): Promise<T | null> {
  if (!pathname || !process.env.BLOB_READ_WRITE_TOKEN) return null;
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text) as T;
}
