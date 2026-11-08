"use client";

import {
  type BotOutputData,
  type Participant,
  PipecatClient,
  type TransportState,
  type UserInputData,
} from "@pipecat-ai/client-js";
import { DailyTransport } from "@pipecat-ai/daily-transport";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import {
  type RefObject,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import type { SessionConnection } from "./session";
import { requestSession } from "./session-client";
import {
  applyTranscriptEvent,
  EMPTY_TRANSCRIPT,
  type Transcript,
} from "./transcript";

export type ConnectionStatus = "idle" | "connecting" | "online";

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

const LIVE_TRANSPORT_STATES: ReadonlySet<TransportState> = new Set([
  "initializing",
  "initialized",
  "authenticating",
  "authenticated",
  "connecting",
  "connected",
  "ready",
]);

export type Conversation = {
  readonly transcript: Transcript;
  readonly connectionStatus: ConnectionStatus;
  readonly isMicOn: boolean;
  readonly isVoiceOn: boolean;
  readonly isSignInRequired: boolean;
  readonly sendText: (text: string) => Promise<void>;
  readonly toggleMic: () => Promise<void>;
  readonly toggleVoice: () => void;
};

function isBotAudioTrack(
  track: MediaStreamTrack,
  participant: Participant | undefined,
): boolean {
  return track.kind === "audio" && participant?.local !== true;
}

function isFreshBotText(data: BotOutputData): boolean {
  // In-progress and completed ticks repeat the text a "new" message already carried.
  return data.spoken_status === undefined || data.spoken_status === "new";
}

async function connectClient(
  client: PipecatClient,
  connection: SessionConnection,
): Promise<void> {
  switch (connection.transport) {
    case "daily":
      await client.connect({
        url: connection.room_url,
        token: connection.token,
      });
      return;
    case "smallwebrtc":
      await client.connect({
        webrtcRequestParams: { endpoint: connection.offer_url },
      });
      return;
  }
}

export function useConversation(
  botAudio: RefObject<HTMLAudioElement | null>,
): Conversation {
  const [transcript, dispatch] = useReducer(
    applyTranscriptEvent,
    EMPTY_TRANSCRIPT,
  );
  const [transportState, setTransportState] =
    useState<TransportState>("disconnected");
  const [isMicOn, setIsMicOn] = useState(false);
  const [isVoiceOn, setIsVoiceOn] = useState(false);
  const [isSignInRequired, setIsSignInRequired] = useState(false);
  const clientRef = useRef<PipecatClient | null>(null);
  const pendingConnectionRef = useRef<Promise<PipecatClient | null> | null>(
    null,
  );

  useEffect(() => {
    if (botAudio.current) {
      botAudio.current.muted = !isVoiceOn;
    }
  }, [botAudio, isVoiceOn]);

  useEffect(() => () => void clientRef.current?.disconnect(), []);

  const startClient = useCallback(
    async (withMic: boolean): Promise<PipecatClient | null> => {
      console.info("🚀 requesting a session");
      const sessionStart = await requestSession();
      switch (sessionStart.kind) {
        case "sign-in-required":
          console.warn("🔒 sign-in required");
          setIsSignInRequired(true);
          return null;
        case "daily-cap-exceeded":
          console.warn("🚫 daily cap reached");
          dispatch({
            kind: "notice",
            text: `Daily limit reached (${sessionStart.sessionsPerDay} sessions a day): digital-lluc runs on real tokens. Come back tomorrow, or email the analog version.`,
          });
          return null;
        case "agent-unavailable":
          console.error("❌ agent unavailable");
          dispatch({
            kind: "notice",
            text: "digital-lluc is unavailable right now. Try again in a minute.",
          });
          return null;
        case "started": {
          const client = new PipecatClient({
            transport:
              sessionStart.connection.transport === "daily"
                ? new DailyTransport()
                : new SmallWebRTCTransport(),
            enableMic: withMic,
            enableCam: false,
            callbacks: {
              onTransportStateChanged: (state) => {
                console.info(`🔄 transport ${state}`);
                setTransportState(state);
              },
              onBotReady: () => console.info("✅ bot ready"),
              onTrackStarted: (track, participant) => {
                if (isBotAudioTrack(track, participant) && botAudio.current) {
                  botAudio.current.srcObject = new MediaStream([track]);
                }
              },
              onUserInput: (data: UserInputData) => {
                if (data.input_type === "transcription" && data.final) {
                  console.info(`🗣️ visitor: ${data.text}`);
                  dispatch({ kind: "visitor-said", text: data.text });
                }
              },
              onBotLlmStarted: () => dispatch({ kind: "lluc-turn-started" }),
              onBotOutput: (data) => {
                if (isFreshBotText(data)) {
                  dispatch({ kind: "lluc-said", text: data.text });
                }
              },
              onError: () => {
                console.error("❌ transport error, session closed");
                dispatch({
                  kind: "notice",
                  text: "Connection lost. Send a message to start again.",
                });
              },
              onDisconnected: () => console.info("👋 disconnected"),
            },
          });
          clientRef.current = client;
          await connectClient(client, sessionStart.connection);
          return client;
        }
      }
    },
    [botAudio],
  );

  const liveClient = useCallback(
    async (withMic: boolean): Promise<PipecatClient | null> => {
      const client = clientRef.current;
      if (client && LIVE_TRANSPORT_STATES.has(client.state)) {
        return client;
      }
      // The hook is the layer that can act on a failed connection: it tells the visitor and lets the next message retry.
      pendingConnectionRef.current ??= startClient(withMic)
        .catch((error: unknown) => {
          console.error("❌ could not connect", error);
          clientRef.current = null;
          dispatch({
            kind: "notice",
            text: "Couldn't connect to digital-lluc. Check your connection and try again.",
          });
          return null;
        })
        .finally(() => {
          pendingConnectionRef.current = null;
        });
      return pendingConnectionRef.current;
    },
    [startClient],
  );

  const sendText = useCallback(
    async (text: string) => {
      dispatch({ kind: "visitor-said", text });
      const client = await liveClient(isMicOn);
      await client?.sendText(text, { audio_response: isVoiceOn });
    },
    [liveClient, isMicOn, isVoiceOn],
  );

  const toggleMic = useCallback(async () => {
    if (isMicOn) {
      clientRef.current?.enableMic(false);
      setIsMicOn(false);
    } else {
      const client = await liveClient(true);
      client?.enableMic(true);
      setIsMicOn(client !== null);
      setIsVoiceOn((wasVoiceOn) => wasVoiceOn || client !== null);
    }
  }, [isMicOn, liveClient]);

  const toggleVoice = useCallback(
    () => setIsVoiceOn((wasVoiceOn) => !wasVoiceOn),
    [],
  );

  return {
    transcript,
    connectionStatus: CONNECTION_STATUS_BY_TRANSPORT_STATE[transportState],
    isMicOn,
    isVoiceOn,
    isSignInRequired,
    sendText,
    toggleMic,
    toggleVoice,
  };
}
