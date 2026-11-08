from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from typing import NewType

import httpx
from pydantic import BaseModel, Field, HttpUrl, ValidationError

from digital_lluc.domain import AgentUnavailableError, LocalWebrtcOffer, SessionRequest, UserId

_TIMEOUT_SECONDS = 10

LocalRunnerClient = NewType("LocalRunnerClient", httpx.AsyncClient)


class _StartResponse(BaseModel):
    session_id: str = Field(alias="sessionId")


def create_local_runner_client(runner_url: HttpUrl) -> LocalRunnerClient:
    return LocalRunnerClient(
        httpx.AsyncClient(base_url=str(runner_url).rstrip("/"), timeout=_TIMEOUT_SECONDS)
    )


@dataclass
class InMemoryUsageCounter:
    """Local development stand-in for Upstash; counts reset when the process restarts."""

    counts: Counter[tuple[UserId, date]] = field(default_factory=Counter)

    async def increment(self, user_id: UserId, day: date) -> int:
        self.counts[user_id, day] += 1
        return self.counts[user_id, day]

    async def decrement(self, user_id: UserId, day: date) -> None:
        self.counts[user_id, day] -= 1


@dataclass(frozen=True)
class LocalRunnerLauncher:
    """Registers a session with the local Pipecat runner, which mirrors Pipecat Cloud's /start.

    The runner keeps the request body and hands it to the bot when the browser's offer arrives.
    """

    client: LocalRunnerClient

    async def launch(self, request: SessionRequest) -> LocalWebrtcOffer:
        try:
            response = await self.client.post(
                "/start",
                json={
                    "transport": "webrtc",
                    "body": {"session_id": request.session_id, "user_id": request.user_id},
                },
            )
            response.raise_for_status()
            started = _StartResponse.model_validate_json(response.content)
        except httpx.HTTPError as error:
            raise AgentUnavailableError(
                f"the local runner at {self.client.base_url} could not start a session; is `make dev-bot` running?"
            ) from error
        except ValidationError as error:
            raise AgentUnavailableError(
                f"expected a sessionId from the local runner, got {response.content!r}"
            ) from error
        return LocalWebrtcOffer(
            offer_url=f"{self.client.base_url}/sessions/{started.session_id}/api/offer"
        )
