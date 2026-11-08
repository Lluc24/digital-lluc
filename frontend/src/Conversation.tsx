"use client";

import { signIn } from "next-auth/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  accentButtonClassName,
  glassClassName,
  pressableClassName,
} from "./glass";
import type { Turn } from "./transcript";
import { type ConnectionStatus, useConversation } from "./useConversation";

// Keeps a message typed before sign-in across the OAuth redirect.
const UNSENT_MESSAGE_STORAGE_KEY = "digital-lluc-unsent-message";

const SUGGESTED_QUESTIONS = [
  "What do you work on?",
  "Why voice AI?",
  "What do you do for fun?",
] as const;

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

function TurnBubble({ turn }: { turn: Turn }) {
  switch (turn.speaker) {
    case "visitor":
      return (
        <li className="flex justify-end">
          <p
            className={`max-w-[85%] rounded-3xl rounded-br-lg px-4 py-2.5 ${accentButtonClassName} font-normal`}
          >
            {turn.text}
          </p>
        </li>
      );
    case "lluc":
      return (
        <li className="flex justify-start">
          <p
            className={`max-w-[85%] rounded-3xl rounded-bl-lg px-4 py-2.5 ${glassClassName}`}
          >
            {turn.text}
          </p>
        </li>
      );
    case "notice":
      return (
        <li className="text-center text-night/60 text-sm dark:text-white/60">
          {turn.text}
        </li>
      );
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

export function Conversation() {
  const botAudio = useRef<HTMLAudioElement>(null);
  const transcriptEnd = useRef<HTMLLIElement>(null);
  const conversation = useConversation(botAudio);
  const [draft, setDraft] = useState("");
  const [lastSentMessage, setLastSentMessage] = useState("");
  const { turns } = conversation.transcript;

  useEffect(() => {
    const unsentMessage = sessionStorage.getItem(UNSENT_MESSAGE_STORAGE_KEY);
    if (unsentMessage) {
      sessionStorage.removeItem(UNSENT_MESSAGE_STORAGE_KEY);
      setDraft(unsentMessage);
    }
  }, []);

  useEffect(() => {
    if (turns.length > 0) {
      transcriptEnd.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [turns]);

  function send(text: string) {
    const message = text.trim();
    if (message) {
      setDraft("");
      setLastSentMessage(message);
      void conversation.sendText(message);
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
            className={`size-2 rounded-full ${STATUS_DOT_CLASS_BY_CONNECTION[conversation.connectionStatus]}`}
          />
          {STATUS_LABEL_BY_CONNECTION[conversation.connectionStatus]}
        </span>
      </div>

      <ol
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-5 sm:px-6"
        aria-live="polite"
      >
        {turns.length === 0 && (
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
        {turns.map((turn) => (
          <TurnBubble key={turn.id} turn={turn} />
        ))}
        <li ref={transcriptEnd} aria-hidden="true" />
      </ol>

      <div className="flex flex-col gap-3 p-3 sm:p-4">
        {conversation.isSignInRequired && (
          <SignInPanel unsentMessage={lastSentMessage} />
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
                conversation.isMicOn
                  ? "Speak, or type…"
                  : "Say hi to digital-lluc…"
              }
              enterKeyHint="send"
              className="w-full bg-transparent py-2 text-base outline-none placeholder:text-night/40 dark:placeholder:text-white/40"
            />
          </label>
          <ToggleButton
            label={
              conversation.isMicOn
                ? "Turn microphone off"
                : "Turn microphone on"
            }
            iconPath={ICON_PATHS.mic}
            isOn={conversation.isMicOn}
            onToggle={() => void conversation.toggleMic()}
          />
          <ToggleButton
            label={
              conversation.isVoiceOn
                ? "Mute digital-lluc's voice"
                : "Hear digital-lluc's voice"
            }
            iconPath={ICON_PATHS.speaker}
            isOn={conversation.isVoiceOn}
            onToggle={conversation.toggleVoice}
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={draft.trim() === ""}
            className={`flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40 ${accentButtonClassName} ${pressableClassName}`}
          >
            <Icon path={ICON_PATHS.send} />
          </button>
        </form>
      </div>
      {/* biome-ignore lint/a11y/useMediaCaption: live synthesized speech; the transcript above is its caption. */}
      <audio ref={botAudio} autoPlay />
    </section>
  );
}
