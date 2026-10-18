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
    """Uploads bytes to a private Vercel Blob at `path`, returning its pathname.

    Returns None if Blob is unconfigured or the upload fails. A failed upload
    is logged, not raised, so one bad upload cannot stop the rest of the
    session from being saved.
    """
    if not _blob_configured():
        logger.warning("⚠️ storage: BLOB_READ_WRITE_TOKEN not set, skipping upload of " + path)
        return None

    try:
        result = await put_async(path, data, access="private", content_type=content_type)
    except Exception as exc:
        logger.error(f"❌ storage: upload of {path} failed: {exc!r}")
        return None
    logger.info(f"📦 storage: uploaded {path} ({len(data)} bytes)")
    return result.pathname


async def record_session(
    session_id: str, record: dict, *, client: httpx.AsyncClient | None = None
) -> bool:
    """Writes a session's metadata as a Redis hash and indexes it by time.

    Returns True once both writes succeeded. Returns False (no-op) if Redis is
    unconfigured, and False if a write fails. The index entry is only added
    after the hash is stored, so the admin list never points at a session with
    no data. Errors are logged, not raised, so a Redis outage does not crash
    session cleanup.
    """
    config = _redis_config()
    if not config:
        logger.warning(f"⚠️ storage: Upstash Redis not configured, skipping session record for {session_id}")
        return False
    url, token = config

    hset_fields: list[str] = []
    for key, value in record.items():
        hset_fields.extend([key, str(value)])

    headers = {"authorization": f"Bearer {token}"}
    owns_client = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=10.0)
    try:
        res = await client.post(url, headers=headers, json=["HSET", f"session:{session_id}", *hset_fields])
        res.raise_for_status()
        res = await client.post(
            url, headers=headers, json=["ZADD", SESSIONS_INDEX_KEY, str(time.time()), session_id]
        )
        res.raise_for_status()
    except httpx.HTTPError as exc:
        logger.error(f"❌ storage: recording session {session_id} failed: {exc!r}")
        return False
    finally:
        if owns_client:
            await client.aclose()
    logger.info(f"🗂️ storage: recorded session {session_id}")
    return True
