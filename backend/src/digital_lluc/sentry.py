import sentry_sdk
from pydantic import SecretStr


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
