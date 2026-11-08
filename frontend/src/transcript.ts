export type Speaker = "visitor" | "lluc" | "notice";

export type Turn = {
  readonly id: number;
  readonly speaker: Speaker;
  readonly text: string;
};

export type Transcript = {
  readonly turns: readonly Turn[];
  readonly isLlucTurnOpen: boolean;
};

export type TranscriptEvent =
  | { readonly kind: "visitor-said"; readonly text: string }
  | { readonly kind: "lluc-said"; readonly text: string }
  | { readonly kind: "lluc-turn-started" }
  | { readonly kind: "notice"; readonly text: string };

export const EMPTY_TRANSCRIPT: Transcript = {
  turns: [],
  isLlucTurnOpen: false,
};

function appended(
  transcript: Transcript,
  speaker: Speaker,
  text: string,
): readonly Turn[] {
  return [...transcript.turns, { id: transcript.turns.length, speaker, text }];
}

/** Post: a new event's text joins the open lluc turn, so streamed sentences read as one reply. */
export function applyTranscriptEvent(
  transcript: Transcript,
  event: TranscriptEvent,
): Transcript {
  switch (event.kind) {
    case "visitor-said":
      return {
        turns: appended(transcript, "visitor", event.text),
        isLlucTurnOpen: false,
      };
    case "notice":
      return {
        turns: appended(transcript, "notice", event.text),
        isLlucTurnOpen: false,
      };
    case "lluc-turn-started":
      return { ...transcript, isLlucTurnOpen: false };
    case "lluc-said": {
      const lastTurn = transcript.turns.at(-1);
      if (transcript.isLlucTurnOpen && lastTurn?.speaker === "lluc") {
        return {
          turns: [
            ...transcript.turns.slice(0, -1),
            { ...lastTurn, text: `${lastTurn.text} ${event.text}` },
          ],
          isLlucTurnOpen: true,
        };
      }
      return {
        turns: appended(transcript, "lluc", event.text),
        isLlucTurnOpen: true,
      };
    }
  }
}
