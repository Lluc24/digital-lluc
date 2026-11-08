import json
import wave
from dataclasses import asdict, dataclass
from io import BytesIO
from pathlib import Path

from loguru import logger
from vercel.blob import BlobError, put_blob

from digital_lluc.domain import RecordingStoreError, SessionAudio, SessionRecording

_PCM16_SAMPLE_WIDTH_BYTES = 2


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


def _recording_files(recording: SessionRecording) -> dict[str, tuple[bytes, str]]:
    prefix = f"sessions/{recording.request.session_id}"
    files = {f"{prefix}/session.json": (encode_session_json(recording), "application/json")}
    if recording.audio is not None:
        files[f"{prefix}/audio.wav"] = (encode_wav(recording.audio), "audio/wav")
    return files


@dataclass(frozen=True)
class VercelBlobRecordingStore:
    """Pre: BLOB_READ_WRITE_TOKEN is set for a private store; vercel.blob reads it itself."""

    async def save(self, recording: SessionRecording) -> None:
        for pathname, (content, content_type) in _recording_files(recording).items():
            try:
                await put_blob(pathname, content, access="private", content_type=content_type)
            except BlobError as error:
                raise RecordingStoreError(f"Vercel Blob could not store {pathname}") from error
            logger.info(f"📦 stored {pathname} ({len(content)} bytes)")


@dataclass(frozen=True)
class LocalDirectoryRecordingStore:
    root: Path

    async def save(self, recording: SessionRecording) -> None:
        for pathname, (content, _) in _recording_files(recording).items():
            path = self.root / pathname
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
            logger.info(f"📦 wrote {path} ({len(content)} bytes)")
