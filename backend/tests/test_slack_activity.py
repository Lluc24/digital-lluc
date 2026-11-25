import asyncio
import json
from collections.abc import Callable, Coroutine

import httpx
import pytest
from digital_lluc import slack_activity
from digital_lluc.domain import UserId
from digital_lluc.slack_activity import notify_session_started
from pydantic import HttpUrl, Secret

_WEBHOOK_URL = Secret(HttpUrl("https://hooks.slack.test/services/secret"))
_USER_ID = UserId("a&b@example.com")


def _use_transport(
    monkeypatch: pytest.MonkeyPatch,
    handler: Callable[[httpx.Request], httpx.Response]
    | Callable[[httpx.Request], Coroutine[None, None, httpx.Response]],
) -> None:
    real_client = httpx.AsyncClient

    def client_with_mock_transport(*, trust_env: bool) -> httpx.AsyncClient:
        return real_client(trust_env=trust_env, transport=httpx.MockTransport(handler))

    monkeypatch.setattr(httpx, "AsyncClient", client_with_mock_transport)


def test_posts_the_user_id_to_the_webhook(monkeypatch: pytest.MonkeyPatch) -> None:
    requests: list[httpx.Request] = []

    def record(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, text="ok")

    _use_transport(monkeypatch, record)
    asyncio.run(notify_session_started(_WEBHOOK_URL, _USER_ID))
    [request] = requests
    assert request.method == "POST"
    assert str(request.url) == str(_WEBHOOK_URL.get_secret_value())
    assert json.loads(request.content) == {
        "text": "Digital Lluc conversation started: a&amp;b@example.com"
    }


def test_swallows_network_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("unreachable", request=request)

    _use_transport(monkeypatch, fail)
    asyncio.run(notify_session_started(_WEBHOOK_URL, _USER_ID))


def test_swallows_error_responses(monkeypatch: pytest.MonkeyPatch) -> None:
    _use_transport(monkeypatch, lambda _: httpx.Response(404, text="no_service"))
    asyncio.run(notify_session_started(_WEBHOOK_URL, _USER_ID))


def test_gives_up_after_the_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    async def hang(_: httpx.Request) -> httpx.Response:
        await asyncio.sleep(1)
        return httpx.Response(200)

    monkeypatch.setattr(slack_activity, "_WEBHOOK_TIMEOUT_SECONDS", 0.01)
    _use_transport(monkeypatch, hang)
    asyncio.run(notify_session_started(_WEBHOOK_URL, _USER_ID))
