import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { requireAdmin } from "@/lib/admin";
import { getSession } from "@/lib/sessions";

/** Streams a session's recording from the private Blob store — audioPath is looked up
 * server-side from the session record, never taken from the request, so callers can't
 * probe arbitrary blob pathnames. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();

  const { id } = await params;
  const session = await getSession(id);
  if (!session?.audioPath) {
    return new NextResponse("Not found", { status: 404 });
  }

  const result = await get(session.audioPath, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    },
  });
}
