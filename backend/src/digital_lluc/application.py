from datetime import date, datetime
from typing import Protocol

from loguru import logger

from digital_lluc.domain import (
    AgentConnection,
    AgentUnavailableError,
    DailyCapExceededError,
    SessionRecording,
    SessionRequest,
    UserId,
    is_within_daily_cap,
    usage_day,
)


class UsageCounter(Protocol):
    async def increment(self, user_id: UserId, day: date) -> int:
        """Post: returns the user's session count for the day, including this one."""
        ...

    async def decrement(self, user_id: UserId, day: date) -> None: ...


class AgentLauncher(Protocol):
    async def launch(self, request: SessionRequest) -> AgentConnection: ...


async def start_session(
    request: SessionRequest,
    now: datetime,
    sessions_per_day: int,
    usage_counter: UsageCounter,
    agent_launcher: AgentLauncher,
) -> AgentConnection:
    """Counts the session against the user's daily cap, then launches the agent.

    A launch failure gives the session back, so an outage does not use up the cap.
    """
    day = usage_day(now)
    sessions_started_today = await usage_counter.increment(request.user_id, day)
    logger.info(
        f"📊 {request.user_id} at {sessions_started_today}/{sessions_per_day} sessions on {day}"
    )
    if is_within_daily_cap(sessions_started_today, sessions_per_day):
        try:
            connection = await agent_launcher.launch(request)
        except AgentUnavailableError:
            await usage_counter.decrement(request.user_id, day)
            logger.warning(f"↩️ refunded session {request.session_id} after a failed launch")
            raise
        logger.info(f"🚀 launched session {request.session_id} for {request.user_id}")
        return connection
    raise DailyCapExceededError(sessions_started_today, sessions_per_day)


class RecordingStore(Protocol):
    async def save(self, recording: SessionRecording) -> None: ...
