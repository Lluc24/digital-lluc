"""Persists session recordings/transcripts/metrics to Vercel Blob (private) + Upstash Redis.

Blob uploads go through the official `vercel` PyPI package (private-storage
support requires it — the raw REST protocol for private access isn't
publicly documented). Redis talks plain REST since Upstash's protocol is a
single well-documented JSON-command POST. Both are graceful no-ops when the
relevant env vars aren't set, matching web/src/lib/usage.ts's behavior for
local dev without Redis configured.
"""

import os
import time

import httpx
from loguru import logger
from vercel.blob import put_async

SESSIONS_INDEX_KEY = "sessions:index"


def _blob_configured() -> bool:
    return bool(os.environ.get("BLOB_READ_WRITE_TOKEN"))


def _redis_config() -> tuple[str, str] | None:
    url = os.environ.get("UPSTASH_REDIS_REST_URL")
    token = os.environ.get("UPSTASH_REDIS_REST_TOKEN")
    if not url or not token:
        return None
    return url, token


async def upload_blob(path: str, data: bytes, content_type: str) -> str | None:
    """Uploads bytes to a private Vercel Blob at `path`, returning its pathname (or None if unconfigured)."""
    if not _blob_configured():
        logger.warning("⚠️ storage: BLOB_READ_WRITE_TOKEN not set, skipping upload of " + path)
        return None

    result = await put_async(path, data, access="private", content_type=content_type)
    logger.info(f"📦 storage: uploaded {path} ({len(data)} bytes)")
    return result.pathname


async def record_session(session_id: str, record: dict) -> None:
    """Writes a session's metadata as a Redis hash and indexes it by time (no-op if Redis unconfigured)."""
    config = _redis_config()
    if not config:
        logger.warning(f"⚠️ storage: Upstash Redis not configured, skipping session record for {session_id}")
        return
    url, token = config

    hset_fields: list[str] = []
    for key, value in record.items():
        hset_fields.extend([key, str(value)])

    async with httpx.AsyncClient() as client:
        headers = {"authorization": f"Bearer {token}"}
        await client.post(url, headers=headers, json=["HSET", f"session:{session_id}", *hset_fields])
        await client.post(
            url, headers=headers, json=["ZADD", SESSIONS_INDEX_KEY, str(time.time()), session_id]
        )
    logger.info(f"🗂️ storage: recorded session {session_id}")
