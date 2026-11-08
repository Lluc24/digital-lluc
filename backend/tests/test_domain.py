from datetime import UTC, date, datetime, timedelta, timezone

from digital_lluc.domain import (
    NO_TOKEN_USAGE,
    SessionId,
    SessionRecording,
    SessionRequest,
    TokenUsage,
    UserId,
    is_within_daily_cap,
    usage_day,
)


def test_usage_day_is_the_utc_calendar_day() -> None:
    barcelona_summer = timezone(timedelta(hours=2))
    assert usage_day(datetime(2026, 10, 4, 1, 30, tzinfo=barcelona_summer)) == date(2026, 10, 3)
    assert usage_day(datetime(2026, 10, 3, 23, 59, 59, tzinfo=UTC)) == date(2026, 10, 3)
    assert usage_day(datetime(2026, 10, 4, 0, 0, tzinfo=UTC)) == date(2026, 10, 4)


def test_daily_cap_allows_up_to_the_cap_and_blocks_after_it() -> None:
    assert is_within_daily_cap(1, 5)
    assert is_within_daily_cap(5, 5)
    assert not is_within_daily_cap(6, 5)


def test_token_usage_adds_both_counts() -> None:
    assert TokenUsage(10, 2).plus(TokenUsage(5, 1)) == TokenUsage(15, 3)
    assert NO_TOKEN_USAGE.plus(TokenUsage(7, 3)) == TokenUsage(7, 3)


def test_recording_duration_rounds_to_whole_seconds() -> None:
    started_at = datetime(2026, 11, 8, 12, 0, tzinfo=UTC)
    recording = SessionRecording(
        request=SessionRequest(SessionId("s"), UserId("u")),
        started_at=started_at,
        ended_at=started_at + timedelta(seconds=61.6),
        token_usage=NO_TOKEN_USAGE,
        transcript=(),
        audio=None,
    )
    assert recording.duration_seconds == 62
