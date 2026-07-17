import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { listSessions } from "@/lib/sessions";

export default async function SessionsPage() {
  await requireAdmin();
  const sessions = await listSessions();

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <p className="text-sm mb-6 text-dim">~/admin/sessions</p>
      <h1 className="text-xl font-bold mb-6">recorded sessions</h1>

      {sessions.length === 0 ? (
        <p className="text-dim text-sm">no sessions recorded yet.</p>
      ) : (
        <div className="border border-edge rounded-lg overflow-hidden text-sm">
          <table className="w-full text-left">
            <thead className="bg-panel text-dim text-xs uppercase">
              <tr>
                <th className="px-3 py-2">date</th>
                <th className="px-3 py-2">user</th>
                <th className="px-3 py-2">duration</th>
                <th className="px-3 py-2">tokens</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-t border-edge hover:bg-panel">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/sessions/${s.id}`}
                      className="text-accent hover:underline"
                    >
                      {new Date(s.startedAt).toLocaleString()}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{s.userId}</td>
                  <td className="px-3 py-2">{s.durationSecs}s</td>
                  <td className="px-3 py-2">
                    {s.promptTokens + s.completionTokens}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
