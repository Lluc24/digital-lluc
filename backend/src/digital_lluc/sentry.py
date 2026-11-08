import asyncio

import sentry_sdk
from pydantic import SecretStr
from starlette.types import ASGIApp, Receive, Scope, Send

_FLUSH_TIMEOUT_SECONDS = 2.0


def init_sentry(dsn: SecretStr) -> None:
    """Post: Sentry reports errors for this process; later calls are no-ops, so the bot can call
    it per session without leaking a client each time."""
    if sentry_sdk.is_initialized():
        return
    sentry_sdk.init(
        dsn=dsn.get_secret_value(),
        send_default_pii=False,
        traces_sample_rate=0.0,
        profiles_sample_rate=0.0,
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
