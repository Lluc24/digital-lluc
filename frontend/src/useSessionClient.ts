"use client";

import { PipecatClient } from "@pipecat-ai/client-js";
import { DailyTransport } from "@pipecat-ai/daily-transport";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionConnection } from "./session";
import { requestSession } from "./session-client";

export type SessionClient = {
  /** One client per session: the session response decides the transport. */
  readonly client: PipecatClient | null;
  /** Changes with every new client. */
  readonly clientId: number;
  readonly notice: string | null;
  readonly isSignInRequired: boolean;
  /** Post: resolves true once connected; otherwise `notice` or `isSignInRequired` says why not. */
  readonly start: (withMic: boolean) => Promise<boolean>;
};

function createClient(
  connection: SessionConnection,
  withMic: boolean,
  onError: () => void,
): PipecatClient {
  return new PipecatClient({
    transport:
      connection.transport === "daily"
        ? new DailyTransport()
        : new SmallWebRTCTransport(),
    enableMic: withMic,
    enableCam: false,
    callbacks: {
      onTransportStateChanged: (state) => console.info(`🔄 transport ${state}`),
      onBotReady: () => console.info("✅ bot ready"),
      onError,
      onDisconnected: () => console.info("👋 disconnected"),
    },
  });
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

export function useSessionClient(): SessionClient {
  const [client, setClient] = useState<PipecatClient | null>(null);
  const [clientId, setClientId] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSignInRequired, setIsSignInRequired] = useState(false);
  const pendingStartRef = useRef<Promise<boolean> | null>(null);
  const clientRef = useRef<PipecatClient | null>(null);

  useEffect(() => () => void clientRef.current?.disconnect(), []);

  const startSession = useCallback(async (withMic: boolean) => {
    setNotice(null);
    console.info("🚀 requesting a session");
    const sessionStart = await requestSession();
    switch (sessionStart.kind) {
      case "sign-in-required":
        console.warn("🔒 sign-in required");
        setIsSignInRequired(true);
        return false;
      case "daily-cap-exceeded":
        console.warn("🚫 daily cap reached");
        setNotice(
          `Daily limit reached (${sessionStart.sessionsPerDay} sessions a day): digital-lluc runs on real tokens. Come back tomorrow, or email the analog version.`,
        );
        return false;
      case "agent-unavailable":
        console.error("❌ agent unavailable");
        setNotice(
          "digital-lluc is unavailable right now. Try again in a minute.",
        );
        return false;
      case "started": {
        await clientRef.current?.disconnect();
        const sessionClient = createClient(
          sessionStart.connection,
          withMic,
          () => {
            console.error("❌ transport error, session closed");
            setNotice("Connection lost. Send a message to start again.");
          },
        );
        clientRef.current = sessionClient;
        setClient(sessionClient);
        setClientId((previousId) => previousId + 1);
        await connectClient(sessionClient, sessionStart.connection);
        return true;
      }
    }
  }, []);

  const start = useCallback(
    (withMic: boolean) => {
      // This hook is the layer that can act on a failed connection: it tells the visitor and lets the next message retry.
      pendingStartRef.current ??= startSession(withMic)
        .catch((error: unknown) => {
          console.error("❌ could not connect", error);
          setNotice(
            "Couldn't connect to digital-lluc. Check your connection and try again.",
          );
          return false;
        })
        .finally(() => {
          pendingStartRef.current = null;
        });
      return pendingStartRef.current;
    },
    [startSession],
  );

  return { client, clientId, notice, isSignInRequired, start };
}
