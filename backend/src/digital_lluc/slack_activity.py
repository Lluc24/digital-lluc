import asyncio

import httpx
import sentry_sdk
from loguru import logger
from pydantic import HttpUrl, Secret

from digital_lluc.domain import UserId

_WEBHOOK_TIMEOUT_SECONDS = 2.0


def _escape_slack_text(text: str) -> str:
    """Reference: docs.slack.dev/messaging/formatting-message-text#escaping"""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


async def notify_session_started(webhook_url: Secret[HttpUrl] | None, user_id: UserId) -> None:
    """Post: Slack received a message naming user_id, or nothing was sent when webhook_url is
    None. Raises nothing, so a missed notification never ends a session. Failures are reported
    without user_id, which goes only to Slack."""
    if webhook_url is None:
        return
    try:
        # trust_env=False: proxy and CA env vars would make the constructor raise outside
        # HTTPError; with a validated URL, post raises only HTTPError and the timeout TimeoutError.
        async with (
            asyncio.timeout(_WEBHOOK_TIMEOUT_SECONDS),
            httpx.AsyncClient(trust_env=False) as client,
        ):
            response = await client.post(
                str(webhook_url.get_secret_value()),
                json={"text": f"Digital Lluc conversation started: {_escape_slack_text(user_id)}"},
            )
    except (httpx.HTTPError, TimeoutError) as error:
        logger.warning(f"📣 Slack activity notification failed: {type(error).__name__}")
        sentry_sdk.capture_exception(error)
        return
    if response.is_error:
        # Not raise_for_status: its message holds the URL, which is the webhook's credential.
        logger.warning(f"📣 Slack activity webhook answered {response.status_code}")
        sentry_sdk.capture_message(f"Slack activity webhook answered {response.status_code}")
