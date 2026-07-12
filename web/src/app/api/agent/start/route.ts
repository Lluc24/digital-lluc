import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkAndCountSession } from "@/lib/usage";

const PIPECAT_CLOUD_START_URL = "https://api.pipecat.daily.co/v1/public";

/**
 * Starts an agent session for the logged-in user.
 *
 * Production: checks the daily cap, then asks Pipecat Cloud to start the
 * agent and returns Daily transport credentials.
 * Local dev (no PIPECAT_CLOUD_* env): points the client at a locally
 * running bot over SmallWebRTC.
 */
export async function POST() {
  const devAnonymous = process.env.DEV_ALLOW_ANONYMOUS === "1";
  let userId: string | null = null;

  if (!devAnonymous) {
    const session = await auth();
    userId = session?.user?.email ?? null;
    if (!userId) {
      return NextResponse.json({ error: "auth_required" }, { status: 401 });
    }
    const gate = await checkAndCountSession(userId);
    if (!gate.allowed) {
      return NextResponse.json(
        { error: "cap_exceeded", used: gate.used, cap: gate.cap },
        { status: 429 },
      );
    }
  }

  const agentName = process.env.PIPECAT_CLOUD_AGENT_NAME;
  const apiKey = process.env.PIPECAT_CLOUD_API_KEY;

  if (!agentName || !apiKey) {
    // Local development: talk to a bot running on this machine.
    const webrtcUrl =
      process.env.LOCAL_BOT_WEBRTC_URL ?? "http://localhost:7080/api/offer";
    return NextResponse.json({ transport: "smallwebrtc", webrtc_url: webrtcUrl });
  }

  const res = await fetch(`${PIPECAT_CLOUD_START_URL}/${agentName}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      createDailyRoom: true,
      body: { user: userId },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("pipecat cloud start failed:", res.status, detail);
    return NextResponse.json({ error: "agent_unavailable" }, { status: 502 });
  }

  const data = (await res.json()) as { dailyRoom: string; dailyToken: string };
  return NextResponse.json({
    transport: "daily",
    room_url: data.dailyRoom,
    token: data.dailyToken,
  });
}
