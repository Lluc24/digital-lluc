"use client";

import {
  type ComponentProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { signIn, useSession } from "next-auth/react";
import {
  PipecatClient,
  type BotOutputData,
  type TranscriptData,
  type TransportState,
} from "@pipecat-ai/client-js";
import { DailyTransport } from "@pipecat-ai/daily-transport";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import {
  PipecatClientAudio,
  PipecatClientProvider,
} from "@pipecat-ai/client-react";

type Role = "user" | "bot" | "system";

interface Message {
  id: number;
  role: Role;
  text: string;
}

const BANNER = String.raw`  o'')}____//   lluc-code v1.0
   ` + "`" + String.raw`_/      )   digital-lluc · session open
   (_(_/-(_/    cwd: ~/lluc`;

const BOOT_LINES = [
  "> /wake digital-lluc",
  "● Loading persona from BACKGROUND.yaml… done.",
  "● Hi — I'm an AI version of Lluc. Ask me about his work, his projects, or what he does off the clock.",
  "● Type below, or enable [mic] to talk out loud.",
];

const PENDING_KEY = "digital-lluc-pending-msg";

// Local dev only: skip the client-side login gate. The server route stays
// the source of truth — it still returns 401 unless DEV_ALLOW_ANONYMOUS=1
// is also set there. Inlined at build time, so restart `next dev` after
// changing .env.local.
const DEV_ANONYMOUS = process.env.NEXT_PUBLIC_DEV_ALLOW_ANONYMOUS === "1";

let nextId = 1;

export default function Console() {
  const { status: authStatus } = useSession();
  const [bootCount, setBootCount] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [micOn, setMicOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [transportState, setTransportState] =
    useState<TransportState>("disconnected");
  const [client, setClient] = useState<PipecatClient | null>(null);

  const clientRef = useRef<PipecatClient | null>(null);
  const connectingRef = useRef<Promise<PipecatClient> | null>(null);
  const speakerOnRef = useRef(speakerOn);
  const botSegmentOpenRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    speakerOnRef.current = speakerOn;
  }, [speakerOn]);

  // Boot sequence: reveal lines one by one.
  useEffect(() => {
    if (bootCount >= BOOT_LINES.length) return;
    const t = setTimeout(() => setBootCount((c) => c + 1), 450);
    return () => clearTimeout(t);
  }, [bootCount]);

  // Restore a message typed before an OAuth redirect. Adjusting state in
  // response to a prop change during render (rather than in an effect)
  // avoids an extra render pass; see https://react.dev/learn/you-might-not-need-an-effect
  const [restoredForAuthStatus, setRestoredForAuthStatus] = useState<
    typeof authStatus | null
  >(null);
  if (authStatus === "authenticated" && restoredForAuthStatus !== authStatus) {
    setRestoredForAuthStatus(authStatus);
    const pending = sessionStorage.getItem(PENDING_KEY);
    if (pending) {
      sessionStorage.removeItem(PENDING_KEY);
      setInput(pending);
    }
  }

  useEffect(() => {
    if (restoredForAuthStatus === "authenticated") {
      inputRef.current?.focus();
    }
  }, [restoredForAuthStatus]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, bootCount, showLogin]);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  const append = useCallback((role: Role, text: string) => {
    setMessages((m) => [...m, { id: nextId++, role, text }]);
  }, []);

  const appendBotChunk = useCallback((text: string) => {
    setMessages((m) => {
      const last = m[m.length - 1];
      if (botSegmentOpenRef.current && last?.role === "bot") {
        return [
          ...m.slice(0, -1),
          { ...last, text: last.text + (last.text ? " " : "") + text },
        ];
      }
      botSegmentOpenRef.current = true;
      return [...m, { id: nextId++, role: "bot", text }];
    });
  }, []);

  const connectSession = useCallback(
    async (withMic: boolean): Promise<PipecatClient> => {
      const existing = clientRef.current;
      if (
        existing &&
        !["disconnected", "error"].includes(existing.state)
      ) {
        return existing;
      }
      if (connectingRef.current) return connectingRef.current;

      const doConnect = async (): Promise<PipecatClient> => {
        console.info("🚀 connecting session…");
        const res = await fetch("/api/agent/start", { method: "POST" });
        if (res.status === 401) {
          console.warn("🔒 connect: auth required");
          setShowLogin(true);
          throw new Error("auth_required");
        }
        if (res.status === 429) {
          const d = await res.json();
          console.warn(`🚫 connect: daily cap reached (${d.used}/${d.cap})`);
          append(
            "system",
            `Daily limit reached (${d.cap} sessions/day) — digital-lluc runs on real tokens. Come back tomorrow, or email the analog version.`,
          );
          throw new Error("cap_exceeded");
        }
        if (!res.ok) {
          console.error(`❌ connect: agent unavailable (${res.status})`);
          append("system", "Agent unavailable right now. Try again in a minute.");
          throw new Error("agent_unavailable");
        }
        const info = await res.json();
        const transport =
          info.transport === "daily"
            ? new DailyTransport()
            : new SmallWebRTCTransport();
        const c = new PipecatClient({
          transport,
          enableMic: withMic,
          enableCam: false,
          callbacks: {
            onTransportStateChanged: (s: TransportState) => {
              console.info(`🔄 transport state: ${s}`);
              setTransportState(s);
            },
            onBotReady: () => {
              console.info("✅ bot ready");
              append("system", "● connected — digital-lluc is listening.");
            },
            onUserTranscript: (data: TranscriptData) => {
              if (data.final) {
                console.info(`🗣️ user transcript: ${data.text}`);
                botSegmentOpenRef.current = false;
                append("user", data.text);
              }
            },
            onBotOutput: (data: BotOutputData) => {
              // spoken_status ticks (in-progress/completed) repeat the same full text; only "new" is fresh content.
              if (data.spoken_status && data.spoken_status !== "new") return;
              console.info(`🤖 bot output: ${data.text}`);
              appendBotChunk(data.text);
            },
            onBotLlmStarted: () => {
              console.info("🧠 LLM started");
              botSegmentOpenRef.current = false;
            },
            onBotLlmStopped: () => {
              console.info("🧠 LLM stopped");
              botSegmentOpenRef.current = false;
            },
            onError: () => {
              console.error("❌ transport error — session closed");
              append("system", "Connection error — session closed.");
            },
            onDisconnected: () => {
              console.info("👋 disconnected");
              setTransportState("disconnected");
            },
          },
        });
        clientRef.current = c;
        setClient(c);
        await c.connect(
          info.transport === "daily"
            ? { url: info.room_url, token: info.token }
            : { webrtcUrl: info.webrtc_url },
        );
        return c;
      };

      connectingRef.current = doConnect().finally(() => {
        connectingRef.current = null;
      });
      return connectingRef.current;
    },
    [append, appendBotChunk],
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    if (!DEV_ANONYMOUS && authStatus !== "authenticated") {
      sessionStorage.setItem(PENDING_KEY, text);
      setShowLogin(true);
      return;
    }
    setInput("");
    botSegmentOpenRef.current = false;
    append("user", text);
    try {
      const c = await connectSession(micOn);
      await c.sendText(text, { audio_response: speakerOnRef.current });
    } catch {
      // connectSession already surfaced the reason in the transcript
    }
  }, [input, authStatus, micOn, append, connectSession]);

  const toggleMic = useCallback(async () => {
    if (micOn) {
      clientRef.current?.enableMic(false);
      setMicOn(false);
      return;
    }
    if (!DEV_ANONYMOUS && authStatus !== "authenticated") {
      setShowLogin(true);
      return;
    }
    setMicOn(true);
    // Voice replies only make sense if you can hear them.
    setSpeakerOn(true);
    try {
      const c = await connectSession(true);
      c.enableMic(true);
    } catch {
      setMicOn(false);
    }
  }, [micOn, authStatus, connectSession]);

  const connected = ["connected", "ready"].includes(transportState);
  const connecting = ["initializing", "initialized", "authenticating", "connecting"].includes(
    transportState,
  );

  const statusLabel = connected
    ? "online"
    : connecting
      ? "connecting…"
      : "idle";

  return (
    <section className="w-full max-w-3xl flex flex-col flex-1 min-h-[70vh] rounded-lg border border-edge bg-panel overflow-hidden shadow-lg">
      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-edge text-xs text-dim">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5">
            <i className="w-2.5 h-2.5 rounded-full bg-danger inline-block" />
            <i className="w-2.5 h-2.5 rounded-full bg-amber inline-block" />
            <i className="w-2.5 h-2.5 rounded-full bg-accent-dim inline-block" />
          </span>
          <span className="ml-2">digital-lluc — pipecat session</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full inline-block ${
              connected
                ? "bg-accent"
                : connecting
                  ? "bg-amber pulse-dot"
                  : "bg-dim"
            }`}
          />
          <span>{statusLabel}</span>
        </div>
      </div>

      {/* Transcript */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed space-y-2"
      >
        <pre className="text-accent text-xs sm:text-sm mb-3 overflow-x-auto">
          {BANNER}
        </pre>
        {BOOT_LINES.slice(0, bootCount).map((line, i) => (
          <p
            key={i}
            className={
              line.startsWith(">") ? "text-amber" : "text-dim"
            }
          >
            {line}
          </p>
        ))}
        {messages.map((m) => (
          <p key={m.id} className="whitespace-pre-wrap wrap-break-word">
            {m.role === "user" && (
              <>
                <span className="text-user">you&gt;</span>{" "}
                <span>{m.text}</span>
              </>
            )}
            {m.role === "bot" && (
              <>
                <span className="text-accent">lluc&gt;</span>{" "}
                <span>{m.text}</span>
              </>
            )}
            {m.role === "system" && (
              <span className="text-dim">{m.text}</span>
            )}
          </p>
        ))}
        {showLogin && authStatus !== "authenticated" && (
          <div className="border border-edge rounded-md p-3 mt-2 space-y-2">
            <p className="text-dim">
              digital-lluc runs on real tokens — sign in to talk. Free, capped
              per day, no spam ever.
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => signIn("google")}
                className="border border-accent text-accent rounded px-3 py-1 text-sm hover:bg-accent hover:text-background transition-colors"
              >
                [ sign in with Google ]
              </button>
              <button
                onClick={() => signIn("github")}
                className="border border-accent text-accent rounded px-3 py-1 text-sm hover:bg-accent hover:text-background transition-colors"
              >
                [ sign in with GitHub ]
              </button>
            </div>
          </div>
        )}
        {bootCount >= BOOT_LINES.length && messages.length === 0 && !showLogin && (
          <p className="text-dim cursor-blink" />
        )}
      </div>

      {/* Input row */}
      <div className="border-t border-edge px-3 py-2 flex items-center gap-2">
        <span className="text-user text-sm shrink-0">you&gt;</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSend();
          }}
          placeholder={
            micOn ? "speak, or type…" : "say hi to digital-lluc…"
          }
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-dim/60 min-w-0"
          autoFocus
        />
        <button
          onClick={toggleMic}
          title={micOn ? "disable microphone" : "enable microphone (voice in)"}
          className={`text-xs border rounded px-2 py-1 transition-colors shrink-0 ${
            micOn
              ? "border-accent text-accent"
              : "border-edge text-dim hover:text-foreground"
          }`}
        >
          {micOn ? "mic:on" : "mic:off"}
        </button>
        <button
          onClick={() => setSpeakerOn((s) => !s)}
          title={
            speakerOn
              ? "disable voice output (text only)"
              : "enable voice output"
          }
          className={`text-xs border rounded px-2 py-1 transition-colors shrink-0 ${
            speakerOn
              ? "border-accent text-accent"
              : "border-edge text-dim hover:text-foreground"
          }`}
        >
          {speakerOn ? "voice:on" : "voice:off"}
        </button>
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="text-xs border border-edge rounded px-2 py-1 text-dim hover:text-foreground disabled:opacity-40 shrink-0"
        >
          send ⏎
        </button>
      </div>

      {client && (
        // client-react bundles its own copy of the client-js types, so the
        // same class arrives as two nominal types; cast at the boundary.
        <PipecatClientProvider
          client={
            client as unknown as ComponentProps<
              typeof PipecatClientProvider
            >["client"]
          }
        >
          {speakerOn && <PipecatClientAudio />}
        </PipecatClientProvider>
      )}
    </section>
  );
}
