from dataclasses import dataclass
from datetime import date, timedelta
from typing import NewType

import httpx
from pydantic import BaseModel, HttpUrl, SecretStr, TypeAdapter, ValidationError

from digital_lluc.domain import UsageStoreError, UserId

_TIMEOUT_SECONDS = 5
_COUNTER_TTL = timedelta(days=1)

UpstashClient = NewType("UpstashClient", httpx.AsyncClient)


class _IntegerResult(BaseModel):
    result: int


_PIPELINE_RESULTS = TypeAdapter(tuple[_IntegerResult, _IntegerResult])


def create_upstash_client(rest_url: HttpUrl, rest_token: SecretStr) -> UpstashClient:
    return UpstashClient(
        httpx.AsyncClient(
            base_url=str(rest_url).rstrip("/"),
            headers={"authorization": f"Bearer {rest_token.get_secret_value()}"},
            timeout=_TIMEOUT_SECONDS,
        )
    )


def _counter_key(user_id: UserId, day: date) -> str:
    return f"usage:{user_id}:{day.isoformat()}"


async def _post(client: UpstashClient, path: str, commands: list[list[str]]) -> bytes:
    try:
        response = await client.post(path, json=commands)
        response.raise_for_status()
    except httpx.HTTPError as error:
        raise UsageStoreError(f"Upstash could not run {path}") from error
    return response.content


@dataclass(frozen=True)
class UpstashUsageCounter:
    client: UpstashClient

    async def increment(self, user_id: UserId, day: date) -> int:
        key = _counter_key(user_id, day)
        ttl_seconds = str(int(_COUNTER_TTL.total_seconds()))
        content = await _post(
            self.client, "/pipeline", [["INCR", key], ["EXPIRE", key, ttl_seconds]]
        )
        try:
            incremented, _ = _PIPELINE_RESULTS.validate_json(content)
        except ValidationError as error:
            raise UsageStoreError(
                f"expected two integer results from Upstash, got {content!r}"
            ) from error
        return incremented.result

    async def decrement(self, user_id: UserId, day: date) -> None:
        await _post(self.client, "/pipeline", [["DECR", _counter_key(user_id, day)]])
