from pathlib import Path

import pytest
from digital_lluc.bot import (
    _TRANSPORT_PARAMS,
    LocalBotSettings,
    load_settings,
    load_system_prompt,
    parse_session_request,
    recording_store,
)
from digital_lluc.domain import SessionId, SessionRequest, UserId
from digital_lluc.recordings import LocalDirectoryRecordingStore
from pipecat.transports.base_transport import TransportParams
from pydantic import ValidationError

_PROFILE_DIR = Path(__file__).resolve().parents[2] / "profile"

_LEGACY_SESSION_ID = SessionId("generated")


def test_parse_session_request_reads_the_session_api_body() -> None:
    body = {"session_id": "s", "user_id": "u"}
    assert parse_session_request(body, _LEGACY_SESSION_ID) == SessionRequest(
        SessionId("s"), UserId("u")
    )


def test_parse_session_request_gives_a_legacy_body_the_generated_session_id() -> None:
    body = {"user": "visitor@example.com"}
    assert parse_session_request(body, _LEGACY_SESSION_ID) == SessionRequest(
        _LEGACY_SESSION_ID, UserId("visitor@example.com")
    )


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"user": None},
        {"user": ""},
        {"session_id": "s"},
        {"user": "u", "session_id": "s"},
    ],
)
def test_parse_session_request_rejects_other_bodies(body: object) -> None:
    with pytest.raises(ValidationError):
        parse_session_request(body, _LEGACY_SESSION_ID)


def test_parse_session_request_keeps_the_email_out_of_the_error() -> None:
    with pytest.raises(ValidationError) as error:
        parse_session_request({"user": "visitor@example.com", "extra": 1}, _LEGACY_SESSION_ID)
    assert "visitor@example.com" not in str(error.value)


def test_local_bot_settings_load_from_dummy_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEPLOYMENT", "local")
    monkeypatch.setenv("DEEPGRAM_API_KEY", "dummy")
    monkeypatch.setenv("OPENAI_API_KEY", "dummy")
    monkeypatch.setenv("CARTESIA_API_KEY", "dummy")
    monkeypatch.setenv("PROFILE_DIR", str(_PROFILE_DIR))

    settings = load_settings()

    assert isinstance(settings, LocalBotSettings)
    assert isinstance(recording_store(settings), LocalDirectoryRecordingStore)
    assert load_system_prompt(settings.profile_dir)
    assert "eval" in _TRANSPORT_PARAMS
    for transport_params in _TRANSPORT_PARAMS.values():
        assert isinstance(transport_params(), TransportParams)
