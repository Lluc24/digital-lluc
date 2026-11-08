"use client";

import { RTVIEvent, type TransportState } from "@pipecat-ai/client-js";
import {
  type ConversationMessage,
  type ConversationMessagePart,
  isMessageEmpty,
  PipecatClientProvider,
  usePipecatClientAudioElement,
  usePipecatClientMicControl,
  usePipecatClientTransportState,
  usePipecatConversation,
  useRTVIClientEvent,
} from "@pipecat-ai/client-react";
import { signIn } from "next-auth/react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  accentButtonClassName,
  glassClassName,
  pressableClassName,
} from "./glass";
import { type SessionClient, useSessionClient } from "./useSessionClient";

// Keeps a message typed before sign-in across the OAuth redirect.
const UNSENT_MESSAGE_STORAGE_KEY = "digital-lluc-unsent-message";

const SUGGESTED_QUESTIONS = [
  "What do you work on?",
  "Why voice AI?",
  "What do you do for fun?",
] as const;

type ConnectionStatus = "idle" | "connecting" | "online";

const CONNECTION_STATUS_BY_TRANSPORT_STATE: Record<
  TransportState,
  ConnectionStatus
> = {
  disconnected: "idle",
  initializing: "connecting",
  initialized: "connecting",
  authenticating: "connecting",
  authenticated: "connecting",
  connecting: "connecting",
  connected: "connecting",
  ready: "online",
  disconnecting: "idle",
  error: "idle",
};

const STATUS_LABEL_BY_CONNECTION: Record<ConnectionStatus, string> = {
  idle: "Ready",
  connecting: "Connecting…",
  online: "Live",
};

const STATUS_DOT_CLASS_BY_CONNECTION: Record<ConnectionStatus, string> = {
  idle: "bg-night/30 dark:bg-white/40",
  connecting: "animate-pulse bg-amber-400",
  online: "bg-emerald-400 shadow-[0_0_10px_rgb(52_211_153/0.9)]",
};

const ICON_PATHS = {
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0m6 6v3",
  speaker:
    "M11 5 6 9H3v6h3l5 4V5Zm5.5 3.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  send: "M5 12h14m-6-6 6 6-6 6",
} as const;

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function VisitorBubble({
  children,
  isPending = false,
}: {
  children: ReactNode;
  isPending?: boolean;
}) {
  return (
    <li className={`flex justify-end ${isPending ? "opacity-60" : ""}`}>
      <p
        className={`max-w-[85%] rounded-3xl rounded-br-lg px-4 py-2.5 ${accentButtonClassName} font-normal`}
      >
        {children}
      </p>
    </li>
  );
}

function PartText({
  part,
  isVoiceOn,
}: {
  part: ConversationMessagePart;
  isVoiceOn: boolean;
}) {
  const { text } = part;
  const separator = part.needsSeparator ? " " : "";
  if (text !== null && typeof text === "object" && "spoken" in text) {
    // With voice on, text still to be spoken is dimmed; with voice off none of it is ever spoken.
    return (
      <>
        {separator}
        {text.spoken}
        <span className={isVoiceOn ? "opacity-60" : ""}>{text.unspoken}</span>
      </>
    );
  }
  return (
    <>
      {separator}
      {text}
    </>
  );
}

function MessageBubble({
  message,
  isVoiceOn,
}: {
  message: ConversationMessage;
  isVoiceOn: boolean;
}) {
  const parts = message.parts.map((part) => (
    <PartText
      key={`${part.createdAt}-${part.segment_id ?? ""}`}
      part={part}
      isVoiceOn={isVoiceOn}
    />
  ));
  switch (message.role) {
    case "user":
      return <VisitorBubble>{parts}</VisitorBubble>;
    case "assistant":
      return (
        <li className="flex justify-start">
          <p
            className={`max-w-[85%] rounded-3xl rounded-bl-lg px-4 py-2.5 ${glassClassName}`}
          >
            {parts}
          </p>
        </li>
      );
    case "system":
    case "function_call":
      return null;
  }
}

function ToggleButton({
  label,
  iconPath,
  isOn,
  onToggle,
}: {
  label: string;
  iconPath: string;
  isOn: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isOn}
      title={label}
      onClick={onToggle}
      className={`flex size-11 shrink-0 items-center justify-center rounded-full ${pressableClassName} ${isOn ? "bg-night text-white dark:bg-white dark:text-night" : "text-night/70 hover:bg-night/10 dark:text-white/70 dark:hover:bg-white/15"}`}
    >
      <Icon path={iconPath} />
    </button>
  );
}

function SignInPanel({ unsentMessage }: { unsentMessage: string }) {
  function signInWith(provider: "google" | "github") {
    sessionStorage.setItem(UNSENT_MESSAGE_STORAGE_KEY, unsentMessage);
    void signIn(provider);
  }
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-3xl px-5 py-4 text-center ${glassClassName}`}
    >
      <p className="text-night/80 text-sm dark:text-white/80">
        digital-lluc runs on real tokens, so sign in to talk. Free, capped per
        day, no spam ever.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {(["google", "github"] as const).map((provider) => (
          <button
            key={provider}
            type="button"
            onClick={() => signInWith(provider)}
            className={`rounded-full px-5 py-2.5 text-sm ${glassClassName} ${pressableClassName}`}
          >
            Continue with {provider === "google" ? "Google" : "GitHub"}
          </button>
        ))}
      </div>
    </div>
  );
}

type PanelProps = {
  readonly session: SessionClient;
  readonly connectionStatus: ConnectionStatus;
  readonly messages: readonly ConversationMessage[];
  readonly pendingText: string | null;
  readonly isMicOn: boolean;
  readonly isVoiceOn: boolean;
  readonly onSend: (text: string) => void;
  readonly onToggleMic: () => void;
  readonly onToggleVoice: () => void;
  readonly children?: ReactNode;
};

function Panel({
  session,
  connectionStatus,
  messages,
  pendingText,
  isMicOn,
  isVoiceOn,
  onSend,
  onToggleMic,
  onToggleVoice,
  children,
}: PanelProps) {
  const transcriptEnd = useRef<HTMLLIElement>(null);
  const [draft, setDraft] = useState("");
  const visibleMessages = messages.filter(
    (message) => !isMessageEmpty(message),
  );
  const isEmpty =
    visibleMessages.length === 0 && pendingText === null && !session.notice;

  useEffect(() => {
    const unsentMessage = sessionStorage.getItem(UNSENT_MESSAGE_STORAGE_KEY);
    if (unsentMessage) {
      sessionStorage.removeItem(UNSENT_MESSAGE_STORAGE_KEY);
      setDraft(unsentMessage);
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0 || pendingText !== null) {
      transcriptEnd.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [messages, pendingText]);

  function send(text: string) {
    const message = text.trim();
    if (message) {
      setDraft("");
      onSend(message);
    }
  }

  function submitDraft(event: FormEvent) {
    event.preventDefault();
    send(draft);
  }

  return (
    <section
      aria-label="Conversation with digital-lluc"
      className={`flex min-h-[60vh] w-full flex-col overflow-hidden rounded-[32px] ${glassClassName}`}
    >
      <div className="flex items-center justify-between px-5 pt-4 text-night/70 text-sm dark:text-white/70">
        <span className="font-semibold">digital-lluc</span>
        <span className="flex items-center gap-2" role="status">
          <span
            className={`size-2 rounded-full ${STATUS_DOT_CLASS_BY_CONNECTION[connectionStatus]}`}
          />
          {STATUS_LABEL_BY_CONNECTION[connectionStatus]}
        </span>
      </div>

      <ol
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-5 sm:px-6"
        aria-live="polite"
      >
        {isEmpty && (
          <li className="m-auto flex max-w-md flex-col items-center gap-4 text-center">
            <p className="text-night/70 dark:text-white/70">
              Hi, I'm an AI version of Lluc. Ask me about his work, his
              projects, or what he does off the clock. Type below, or turn on
              the mic to talk.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => send(question)}
                  className={`rounded-full px-4 py-2 text-sm ${glassClassName} ${pressableClassName}`}
                >
                  {question}
                </button>
              ))}
            </div>
          </li>
        )}
        {visibleMessages.map((message) => (
          <MessageBubble
            key={message.createdAt}
            message={message}
            isVoiceOn={isVoiceOn}
          />
        ))}
        {pendingText !== null && !session.isSignInRequired && (
          <VisitorBubble isPending>{pendingText}</VisitorBubble>
        )}
        {session.notice && (
          <li className="text-center text-night/60 text-sm dark:text-white/60">
            {session.notice}
          </li>
        )}
        <li ref={transcriptEnd} aria-hidden="true" />
      </ol>

      <div className="flex flex-col gap-3 p-3 sm:p-4">
        {session.isSignInRequired && (
          <SignInPanel unsentMessage={pendingText ?? ""} />
        )}
        <form
          onSubmit={submitDraft}
          className={`flex items-center gap-1 rounded-full p-1.5 pl-5 focus-within:ring-2 focus-within:ring-night/30 dark:focus-within:ring-white/40 ${glassClassName}`}
        >
          <label className="flex min-w-0 flex-1">
            <span className="sr-only">Message digital-lluc</span>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={
                isMicOn ? "Speak, or type…" : "Say hi to digital-lluc…"
              }
              enterKeyHint="send"
              className="w-full bg-transparent py-2 text-base outline-none placeholder:text-night/40 dark:placeholder:text-white/40"
            />
          </label>
          <ToggleButton
            label={isMicOn ? "Turn microphone off" : "Turn microphone on"}
            iconPath={ICON_PATHS.mic}
            isOn={isMicOn}
            onToggle={onToggleMic}
          />
          <ToggleButton
            label={
              isVoiceOn
                ? "Mute digital-lluc's voice"
                : "Hear digital-lluc's voice"
            }
            iconPath={ICON_PATHS.speaker}
            isOn={isVoiceOn}
            onToggle={onToggleVoice}
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={draft.trim() === "" || connectionStatus === "connecting"}
            className={`flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40 ${accentButtonClassName} ${pressableClassName}`}
          >
            <Icon path={ICON_PATHS.send} />
          </button>
        </form>
      </div>
      {children}
    </section>
  );
}

function BotAudio({ isMuted }: { isMuted: boolean }) {
  const audioRef = usePipecatClientAudioElement();
  return <audio ref={audioRef} autoPlay muted={isMuted} />;
}

type ConversationState = {
  readonly session: SessionClient;
  readonly pendingText: string | null;
  readonly isVoiceOn: boolean;
  readonly startWithText: (text: string) => void;
  readonly queueText: (text: string) => void;
  readonly startWithMic: () => void;
  readonly clearPendingText: () => void;
  readonly toggleVoice: () => void;
};

/** Rendered under PipecatClientProvider: Pipecat's own hooks hold the transcript, audio, mic and connection state. */
function LivePanel({ state }: { state: ConversationState }) {
  const transportState = usePipecatClientTransportState();
  const { messages, sendText } = usePipecatConversation();
  const { enableMic, isMicEnabled } = usePipecatClientMicControl();
  const { pendingText, isVoiceOn, clearPendingText } = state;
  const isReady = transportState === "ready";
  const [hasBotOpened, setHasBotOpened] = useState(false);

  // A message sent while the bot's greeting is starting is dropped, so the queued one waits for that first turn.
  useRTVIClientEvent(
    RTVIEvent.BotLlmStopped,
    useCallback(() => setHasBotOpened(true), []),
  );

  useEffect(() => {
    if (isReady && hasBotOpened && pendingText !== null) {
      clearPendingText();
      void sendText(pendingText, { audio_response: isVoiceOn });
    }
  }, [
    isReady,
    hasBotOpened,
    pendingText,
    isVoiceOn,
    sendText,
    clearPendingText,
  ]);

  function send(text: string) {
    if (isReady && hasBotOpened) {
      void sendText(text, { audio_response: isVoiceOn });
    } else if (
      CONNECTION_STATUS_BY_TRANSPORT_STATE[transportState] === "idle"
    ) {
      state.startWithText(text);
    } else {
      state.queueText(text);
    }
  }

  function toggleMic() {
    if (!isReady) {
      state.startWithMic();
    } else {
      enableMic(!isMicEnabled);
      if (!isMicEnabled && !isVoiceOn) {
        state.toggleVoice();
      }
    }
  }

  return (
    <Panel
      session={state.session}
      connectionStatus={CONNECTION_STATUS_BY_TRANSPORT_STATE[transportState]}
      messages={messages}
      pendingText={pendingText}
      isMicOn={isReady && isMicEnabled}
      isVoiceOn={isVoiceOn}
      onSend={send}
      onToggleMic={toggleMic}
      onToggleVoice={state.toggleVoice}
    >
      <BotAudio isMuted={!isVoiceOn} />
    </Panel>
  );
}

export function Conversation() {
  const session = useSessionClient();
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [isVoiceOn, setIsVoiceOn] = useState(false);
  const { start } = session;
  const clearPendingText = useCallback(() => setPendingText(null), []);

  const state: ConversationState = {
    session,
    pendingText,
    isVoiceOn,
    startWithText: (text) => {
      setPendingText(text);
      void start(false);
    },
    queueText: setPendingText,
    startWithMic: () => {
      void start(true).then((isConnected) => {
        if (isConnected) {
          setIsVoiceOn(true);
        }
      });
    },
    clearPendingText,
    toggleVoice: () => setIsVoiceOn((wasVoiceOn) => !wasVoiceOn),
  };

  if (session.client === null) {
    return (
      <Panel
        session={session}
        connectionStatus={
          pendingText !== null && !session.isSignInRequired && !session.notice
            ? "connecting"
            : "idle"
        }
        messages={[]}
        pendingText={pendingText}
        isMicOn={false}
        isVoiceOn={isVoiceOn}
        onSend={state.startWithText}
        onToggleMic={state.startWithMic}
        onToggleVoice={state.toggleVoice}
      />
    );
  }
  return (
    // Keyed by client so per-session state, like whether the bot has opened, starts fresh.
    <PipecatClientProvider key={session.clientId} client={session.client}>
      <LivePanel state={state} />
    </PipecatClientProvider>
  );
}
