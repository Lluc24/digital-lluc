import pytest
from digital_lluc.bot import parse_session_request
from digital_lluc.domain import SessionId, SessionRequest, UserId
from pydantic import ValidationError

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
