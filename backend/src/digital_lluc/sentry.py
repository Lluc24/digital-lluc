import asyncio
import re
from typing import TYPE_CHECKING, cast

import sentry_sdk
from pydantic import SecretStr
from sentry_sdk.integrations.httpx import HttpxIntegration
from sentry_sdk.utils import event_from_exception
from starlette.types import ASGIApp, Message, Receive, Scope, Send

if TYPE_CHECKING:
    from sentry_sdk._types import Breadcrumb, BreadcrumbHint, Event, Hint

_FLUSH_TIMEOUT_SECONDS = 2.0
# User ids are login emails and session ids are UUIDs (see auth_token.py and api.py).
_IDENTIFIER_PATTERN = re.compile(
    r"[^\s@\"<>(),;:\[\]{}]+@[^\s@\"'<>(),;:\[\]{}]+"
    r"|[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}"
)
_REDACTED = "[redacted]"


def scrub_identifiers(value: object) -> object:
    """Post: a copy of value with every email and UUID in its strings, keys included, redacted."""
    match value:
        case str():
            return _IDENTIFIER_PATTERN.sub(_REDACTED, value)
        case dict():
            return {scrub_identifiers(key): scrub_identifiers(item) for key, item in value.items()}
        case list():
            return [scrub_identifiers(item) for item in value]
        case tuple():
            return tuple(scrub_identifiers(item) for item in value)
        case _:
            return value


def _scrub_event(event: "Event", _hint: "Hint") -> "Event":
    return cast("Event", scrub_identifiers(event))  # sentry_sdk: Event TypedDict, shape kept


def _scrub_breadcrumb(breadcrumb: "Breadcrumb", _hint: "BreadcrumbHint") -> "Breadcrumb":
    return {key: scrub_identifiers(item) for key, item in breadcrumb.items()}


def init_sentry(dsn: SecretStr) -> None:
    """Post: Sentry reports errors for this process with no user identifier in them; later calls
    are no-ops, so the bot can call it per session without leaking a client each time."""
    if sentry_sdk.is_initialized():
        return
    sentry_sdk.init(
        dsn=dsn.get_secret_value(),
        send_default_pii=False,
        # Frame locals hold requests, Redis keys and transcripts.
        include_local_variables=False,
        traces_sample_rate=0.0,
        profiles_sample_rate=0.0,
        before_send=_scrub_event,
        before_breadcrumb=_scrub_breadcrumb,
        # Its breadcrumbs carry request URLs, and the Slack webhook URL is itself the credential.
        disabled_integrations=[HttpxIntegration()],
    )


async def _flush() -> None:
    await asyncio.to_thread(sentry_sdk.flush, _FLUSH_TIMEOUT_SECONDS)


def _capture_unhandled(error: Exception) -> None:
    event, hint = event_from_exception(
        error,
        client_options=sentry_sdk.get_client().options,
        mechanism={"type": "asgi", "handled": False},
    )
    sentry_sdk.capture_event(event, hint=hint)


class FlushSentryMiddleware:
    """Sends queued events before the response finishes, because Vercel freezes the function once
    it responds and the background sender would never run."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        async def flush_then_send(message: Message) -> None:
            if message["type"] == "http.response.body" and not message.get("more_body", False):
                await _flush()
            await send(message)

        try:
            await self.app(scope, receive, flush_then_send)
        except Exception as error:
            # Sentry's own capture sits above this middleware, after the 500 is sent; its dedupe
            # drops that second capture of the same exception.
            _capture_unhandled(error)
            await _flush()
            raise
