from datetime import UTC, date, datetime, timedelta, timezone

from digital_lluc.domain import is_within_daily_cap, usage_day


def test_usage_day_is_the_utc_calendar_day() -> None:
    barcelona_summer = timezone(timedelta(hours=2))
    assert usage_day(datetime(2026, 10, 4, 1, 30, tzinfo=barcelona_summer)) == date(2026, 10, 3)
    assert usage_day(datetime(2026, 10, 3, 23, 59, 59, tzinfo=UTC)) == date(2026, 10, 3)
    assert usage_day(datetime(2026, 10, 4, 0, 0, tzinfo=UTC)) == date(2026, 10, 4)


def test_daily_cap_allows_up_to_the_cap_and_blocks_after_it() -> None:
    assert is_within_daily_cap(1, 5)
    assert is_within_daily_cap(5, 5)
    assert not is_within_daily_cap(6, 5)
