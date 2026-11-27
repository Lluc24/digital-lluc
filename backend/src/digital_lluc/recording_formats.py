import json
import wave
from dataclasses import asdict
from io import BytesIO
from types import MappingProxyType

from digital_lluc.domain import SessionAudio, SessionRecording, TranscriptTurn

_PCM16_SAMPLE_WIDTH_BYTES = 2
_TRANSCRIPT_SPEAKERS = MappingProxyType({"user": "Visitor", "assistant": "Bot"})


def encode_wav(audio: SessionAudio) -> bytes:
    buffer = BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(audio.channel_count)
        wav_file.setsampwidth(_PCM16_SAMPLE_WIDTH_BYTES)
        wav_file.setframerate(audio.sample_rate_hz)
        wav_file.writeframes(audio.pcm16_frames)
    return buffer.getvalue()


def encode_session_json(recording: SessionRecording) -> bytes:
    return json.dumps(
        {
            "session_id": recording.request.session_id,
            "user_id": recording.request.user_id,
            "started_at": recording.started_at.isoformat(),
            "duration_seconds": recording.duration_seconds,
            "token_usage": asdict(recording.token_usage),
            "transcript": [asdict(turn) for turn in recording.transcript],
        },
        ensure_ascii=False,
        indent=2,
    ).encode()


def _spoken_turns(transcript: tuple[TranscriptTurn, ...]) -> tuple[TranscriptTurn, ...]:
    """Post: the visitor's and the bot's turns; developer and system instructions are left out."""
    return tuple(turn for turn in transcript if turn.role in _TRANSCRIPT_SPEAKERS)


def has_spoken_turns(transcript: tuple[TranscriptTurn, ...]) -> bool:
    return bool(_spoken_turns(transcript))


def encode_transcript_text(recording: SessionRecording) -> bytes:
    """Post: a header with session id, start time and duration, then one "Visitor:" or "Bot:" line
    per spoken turn."""
    header = (
        f"Session: {recording.request.session_id}",
        f"Started: {recording.started_at.isoformat()}",
        f"Duration: {recording.duration_seconds}s",
    )
    lines = tuple(
        f"{_TRANSCRIPT_SPEAKERS[turn.role]}: {turn.text}"
        for turn in _spoken_turns(recording.transcript)
    )
    return "\n".join((*header, "", *lines, "")).encode()
