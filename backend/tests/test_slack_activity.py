import asyncio
import json
from collections.abc import Callable

import httpx
import pytest
from digital_lluc.domain import UserId
from digital_lluc.slack_activity import notify_session_started
from pydantic import SecretStr

_WEBHOOK_URL = SecretStr("https://hooks.slack.test/services/secret")
_USER_ID = UserId("a&b@example.com")


def _use_transport(
    monkeypatch: pytest.MonkeyPatch, handler: Callable[[httpx.Request], httpx.Response]
) -> None:
    real_client = httpx.AsyncClient

    def client_with_mock_transport() -> httpx.AsyncClient:
        return real_client(transport=httpx.MockTransport(handler))

    monkeypatch.setattr(httpx, "AsyncClient", client_with_mock_transport)


def test_sends_nothing_without_a_webhook_url(monkeypatch: pytest.MonkeyPatch) -> None:
    requests: list[httpx.Request] = []

    def record(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200)

    _use_transport(monkeypatch, record)
    asyncio.run(notify_session_started(None, _USER_ID))
    assert requests == []


def test_posts_the_user_id_to_the_webhook(monkeypatch: pytest.MonkeyPatch) -> None:
    requests: list[httpx.Request] = []

    def record(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, text="ok")

    _use_transport(monkeypatch, record)
    asyncio.run(notify_session_started(_WEBHOOK_URL, _USER_ID))
    [request] = requests
    assert request.method == "POST"
    assert str(request.url) == _WEBHOOK_URL.get_secret_value()
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
