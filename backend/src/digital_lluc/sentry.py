import asyncio
import re
from typing import TYPE_CHECKING, cast  # noqa: TID251 sentry_sdk: before_send must return its Event TypedDict

import sentry_sdk
from pydantic import SecretStr
from starlette.types import ASGIApp, Receive, Scope, Send

if TYPE_CHECKING:
    from sentry_sdk._types import Breadcrumb, BreadcrumbHint, Event, Hint

_FLUSH_TIMEOUT_SECONDS = 2.0
# User ids are login emails and session ids are UUIDs (see auth_token.py and api.py).
_IDENTIFIER_PATTERN = re.compile(
    r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"
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
        case list() | tuple():
            return [scrub_identifiers(item) for item in value]
        case _:
            return value


def _scrub_event(event: "Event", _hint: "Hint") -> "Event":
    return cast("Event", scrub_identifiers(event))


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
    )


class FlushSentryMiddleware:
    """Sends queued events before the request ends, because Vercel freezes the function once it
    responds and the background sender would never run."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            await self.app(scope, receive, send)
        except Exception as error:
            # Unhandled errors are otherwise captured only above this middleware, after the flush.
            # Sentry's dedupe drops that second capture of the same exception.
            sentry_sdk.capture_exception(error)
            raise
        finally:
            await asyncio.to_thread(sentry_sdk.flush, _FLUSH_TIMEOUT_SECONDS)
