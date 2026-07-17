import Link from "next/link";
import { notFound } from "next/navigation";
import { readJsonBlob } from "@/lib/blob";
import { requireAdmin } from "@/lib/admin";
import { getSession } from "@/lib/sessions";

type TranscriptMessage = { role: string; content: unknown };
type TranscriptPayload = {
  transcript: TranscriptMessage[];
  tokenUsage: { promptTokens: number; completionTokens: number };
};

function messageText(content: unknown): string {
  return typeof content === "string" ? content : JSON.stringify(content);
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const session = await getSession(id);
  if (!session) notFound();

  const transcript = session.transcriptPath
    ? await readJsonBlob<TranscriptPayload>(session.transcriptPath)
    : null;

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <p className="text-sm mb-6">
        <Link href="/admin/sessions" className="text-accent hover:underline">
          ~/admin/sessions
        </Link>
        /{session.id}
      </p>

      <div className="text-xs text-dim mb-6 space-y-1">
        <p>user: {session.userId}</p>
        <p>started: {new Date(session.startedAt).toLocaleString()}</p>
        <p>duration: {session.durationSecs}s</p>
        <p>
          tokens: {session.promptTokens} prompt / {session.completionTokens}{" "}
          completion
        </p>
      </div>

      {session.audioPath ? (
        <audio
          controls
          src={`/api/admin/sessions/${session.id}/audio`}
          className="w-full mb-8"
        />
      ) : (
        <p className="text-dim text-xs mb-8">no audio recorded for this session.</p>
      )}

      <div className="space-y-2 text-sm leading-relaxed">
        {transcript?.transcript.length ? (
          transcript.transcript.map((m, i) => (
            <p key={i} className="whitespace-pre-wrap wrap-break-word">
              <span className={m.role === "assistant" ? "text-accent" : "text-user"}>
                {m.role === "assistant" ? "lluc>" : "you>"}
              </span>{" "}
              {messageText(m.content)}
            </p>
          ))
        ) : (
          <p className="text-dim text-xs">no transcript recorded for this session.</p>
        )}
      </div>
    </main>
  );
}
