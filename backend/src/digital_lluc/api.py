from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated, Literal, assert_never
from uuid import uuid4

import httpx
from fastapi import FastAPI, Header, Request, status
from fastapi.responses import JSONResponse
from loguru import logger
from pydantic import BaseModel, Field, HttpUrl, PositiveInt, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from digital_lluc.application import AgentLauncher, UsageCounter, start_session
from digital_lluc.auth_token import verify_auth_token
from digital_lluc.domain import (
    AgentUnavailableError,
    DailyCapExceededError,
    DailyRoom,
    InvalidAuthTokenError,
    LocalWebrtcOffer,
    SessionId,
    SessionRequest,
    UsageStoreError,
)
from digital_lluc.local import InMemoryUsageCounter, LocalBotLauncher
from digital_lluc.pipecat_cloud import PipecatCloudLauncher, create_pipecat_cloud_client
from digital_lluc.upstash import UpstashUsageCounter, create_upstash_client

_BEARER_PREFIX = "Bearer "


class _BaseApiSettings(BaseSettings):
    # Validation errors would otherwise echo the raw settings, secrets included, into the logs.
    model_config = SettingsConfigDict(hide_input_in_errors=True, env_ignore_empty=True)

    auth_token_secret: SecretStr = Field(min_length=32)
    daily_session_cap: PositiveInt = 5


class CloudApiSettings(_BaseApiSettings):
    deployment: Literal["cloud"]
    pipecat_cloud_agent_name: str = Field(pattern="^[a-z0-9][a-z0-9-]*$")
    pipecat_cloud_api_key: SecretStr
    upstash_redis_rest_url: HttpUrl
    upstash_redis_rest_token: SecretStr


class LocalApiSettings(_BaseApiSettings):
    deployment: Literal["local"]
    local_bot_offer_url: HttpUrl = HttpUrl("http://localhost:7080/api/offer")


class _DeploymentSettings(BaseSettings):
    deployment: Literal["cloud", "local"]


def load_settings() -> CloudApiSettings | LocalApiSettings:
    match _DeploymentSettings().deployment:
        case "cloud":
            return CloudApiSettings(deployment="cloud")
        case "local":
            return LocalApiSettings(deployment="local")


class SessionRequestBody(BaseModel):
    session_id: str
    user_id: str


class DailySessionResponse(BaseModel):
    transport: Literal["daily"] = "daily"
    room_url: str
    token: str


class LocalWebrtcSessionResponse(BaseModel):
    transport: Literal["smallwebrtc"] = "smallwebrtc"
    offer_url: str
    request_data: SessionRequestBody


class DailyCapExceededResponse(BaseModel):
    error: Literal["daily_cap_exceeded"] = "daily_cap_exceeded"
    sessions_started_today: int
    sessions_per_day: int


class ErrorResponse(BaseModel):
    error: Literal["invalid_auth_token", "agent_unavailable", "usage_store_unavailable"]


def _to_response(
    connection: DailyRoom | LocalWebrtcOffer,
) -> DailySessionResponse | LocalWebrtcSessionResponse:
    match connection:
        case DailyRoom(room_url=room_url, token=token):
            return DailySessionResponse(room_url=room_url, token=token)
        case LocalWebrtcOffer(offer_url=offer_url, request=request):
            return LocalWebrtcSessionResponse(
                offer_url=offer_url,
                request_data=SessionRequestBody(
                    session_id=request.session_id, user_id=request.user_id
                ),
            )
        case _:
            assert_never(connection)


def _bearer_token(authorization: str) -> str:
    if authorization.startswith(_BEARER_PREFIX):
        return authorization.removeprefix(_BEARER_PREFIX)
    raise InvalidAuthTokenError("expected an Authorization header of the form 'Bearer <token>'")


def _adapters(
    settings: CloudApiSettings | LocalApiSettings,
) -> tuple[UsageCounter, AgentLauncher, list[httpx.AsyncClient]]:
    match settings:
        case CloudApiSettings():
            upstash_client = create_upstash_client(
                settings.upstash_redis_rest_url, settings.upstash_redis_rest_token
            )
            pipecat_cloud_client = create_pipecat_cloud_client(settings.pipecat_cloud_api_key)
            return (
                UpstashUsageCounter(upstash_client),
                PipecatCloudLauncher(pipecat_cloud_client, settings.pipecat_cloud_agent_name),
                [upstash_client, pipecat_cloud_client],
            )
        case LocalApiSettings():
            return (
                InMemoryUsageCounter(),
                LocalBotLauncher(str(settings.local_bot_offer_url)),
                [],
            )
        case _:
            assert_never(settings)


def create_app(settings: CloudApiSettings | LocalApiSettings) -> FastAPI:
    usage_counter, agent_launcher, http_clients = _adapters(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        logger.info(f"🟢 session API up ({settings.deployment})")
        yield
        for client in http_clients:
            await client.aclose()
        logger.info("🔴 session API down")

    app = FastAPI(title="digital-lluc", lifespan=lifespan)

    @app.exception_handler(InvalidAuthTokenError)
    async def invalid_auth_token(_: Request, error: InvalidAuthTokenError) -> JSONResponse:
        logger.warning(f"🔒 rejected auth token: {error}")
        return JSONResponse(
            ErrorResponse(error="invalid_auth_token").model_dump(),
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    @app.exception_handler(DailyCapExceededError)
    async def daily_cap_exceeded(_: Request, error: DailyCapExceededError) -> JSONResponse:
        logger.warning(f"🚫 {error}")
        return JSONResponse(
            DailyCapExceededResponse(
                sessions_started_today=error.sessions_started_today,
                sessions_per_day=error.sessions_per_day,
            ).model_dump(),
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    @app.exception_handler(AgentUnavailableError)
    async def agent_unavailable(_: Request, error: AgentUnavailableError) -> JSONResponse:
        logger.error(f"❌ {error}")
        return JSONResponse(
            ErrorResponse(error="agent_unavailable").model_dump(),
            status_code=status.HTTP_502_BAD_GATEWAY,
        )

    @app.exception_handler(UsageStoreError)
    async def usage_store_unavailable(_: Request, error: UsageStoreError) -> JSONResponse:
        logger.error(f"❌ {error}")
        return JSONResponse(
            ErrorResponse(error="usage_store_unavailable").model_dump(),
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    @app.post(
        "/v1/sessions",
        status_code=status.HTTP_201_CREATED,
        responses={
            401: {"model": ErrorResponse},
            429: {"model": DailyCapExceededResponse},
            502: {"model": ErrorResponse},
            503: {"model": ErrorResponse},
        },
    )
    async def create_session(
        authorization: Annotated[str, Header()],
    ) -> DailySessionResponse | LocalWebrtcSessionResponse:
        now = datetime.now(UTC)
        user_id = verify_auth_token(_bearer_token(authorization), settings.auth_token_secret, now)
        request = SessionRequest(session_id=SessionId(str(uuid4())), user_id=user_id)
        connection = await start_session(
            request, now, settings.daily_session_cap, usage_counter, agent_launcher
        )
        return _to_response(connection)

    return app


app = create_app(load_settings())
