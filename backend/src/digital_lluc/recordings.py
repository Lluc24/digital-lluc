from dataclasses import dataclass
from pathlib import Path

from loguru import logger
from vercel.blob import BlobError, put_blob

from digital_lluc.domain import RecordingStoreError, SessionRecording
from digital_lluc.recording_formats import encode_session_json, encode_wav


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
