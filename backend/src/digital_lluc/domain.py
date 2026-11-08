from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import NewType

UserId = NewType("UserId", str)
SessionId = NewType("SessionId", str)


@dataclass(frozen=True)
class SessionRequest:
    session_id: SessionId
    user_id: UserId


@dataclass(frozen=True)
class DailyRoom:
    room_url: str
    token: str


@dataclass(frozen=True)
class LocalWebrtcOffer:
    offer_url: str


type AgentConnection = DailyRoom | LocalWebrtcOffer


class InvalidAuthTokenError(Exception):
    pass


class AgentUnavailableError(Exception):
    pass


class UsageStoreError(Exception):
    pass


class DailyCapExceededError(Exception):
    def __init__(self, sessions_started_today: int, sessions_per_day: int) -> None:
        super().__init__(
            f"{sessions_started_today} sessions started today, the cap is {sessions_per_day}"
        )
        self.sessions_started_today = sessions_started_today
        self.sessions_per_day = sessions_per_day


def usage_day(now: datetime) -> date:
    """Pre: now is timezone-aware. Post: the UTC calendar day the daily cap counts against."""
    return now.astimezone(UTC).date()


def is_within_daily_cap(sessions_started_today: int, sessions_per_day: int) -> bool:
    """Pre: sessions_started_today already counts the session being started."""
    return sessions_started_today <= sessions_per_day


class RecordingStoreError(Exception):
    pass


@dataclass(frozen=True)
class TokenUsage:
    prompt_tokens: int
    completion_tokens: int

    def plus(self, other: "TokenUsage") -> "TokenUsage":
        return TokenUsage(
            prompt_tokens=self.prompt_tokens + other.prompt_tokens,
            completion_tokens=self.completion_tokens + other.completion_tokens,
        )


NO_TOKEN_USAGE = TokenUsage(prompt_tokens=0, completion_tokens=0)


@dataclass(frozen=True)
class TranscriptTurn:
    role: str
    text: str


@dataclass(frozen=True)
class SessionAudio:
    pcm16_frames: bytes
    sample_rate_hz: int
    channel_count: int


@dataclass(frozen=True)
class SessionRecording:
    request: SessionRequest
    started_at: datetime
    ended_at: datetime
    token_usage: TokenUsage
    transcript: tuple[TranscriptTurn, ...]
    audio: SessionAudio | None
    """None for a text-only session, where no audio ever reached the recorder."""

    @property
    def duration_seconds(self) -> int:
        return round((self.ended_at - self.started_at).total_seconds())
