from dataclasses import dataclass
from typing import NewType

import httpx
from pydantic import BaseModel, Field, SecretStr, ValidationError

from digital_lluc.domain import AgentUnavailableError, DailyRoom, SessionRequest

_BASE_URL = "https://api.pipecat.daily.co/v1/public"
# Starting an agent includes creating its Daily room, which can take several seconds on a cold start.
_TIMEOUT_SECONDS = 30

PipecatCloudClient = NewType("PipecatCloudClient", httpx.AsyncClient)


class _StartResponse(BaseModel):
    daily_room: str = Field(alias="dailyRoom")
    daily_token: str = Field(alias="dailyToken")


def create_pipecat_cloud_client(api_key: SecretStr) -> PipecatCloudClient:
    return PipecatCloudClient(
        httpx.AsyncClient(
            base_url=_BASE_URL,
            headers={"authorization": f"Bearer {api_key.get_secret_value()}"},
            timeout=_TIMEOUT_SECONDS,
        )
    )


@dataclass(frozen=True)
class PipecatCloudLauncher:
    client: PipecatCloudClient
    agent_name: str

    async def launch(self, request: SessionRequest) -> DailyRoom:
        try:
            response = await self.client.post(
                f"/{self.agent_name}/start",
                json={
                    "createDailyRoom": True,
                    "body": {"session_id": request.session_id, "user_id": request.user_id},
                },
            )
            response.raise_for_status()
            started = _StartResponse.model_validate_json(response.content)
        except httpx.HTTPError as error:
            raise AgentUnavailableError(
                f"Pipecat Cloud could not start {self.agent_name}"
            ) from error
        except ValidationError as error:
            raise AgentUnavailableError(
                f"expected dailyRoom and dailyToken from Pipecat Cloud, got {response.content!r}"
            ) from error
        return DailyRoom(room_url=started.daily_room, token=started.daily_token)
