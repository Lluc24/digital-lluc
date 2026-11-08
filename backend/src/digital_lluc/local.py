from collections import Counter
from dataclasses import dataclass, field
from datetime import date

from digital_lluc.domain import LocalWebrtcOffer, SessionRequest, UserId


@dataclass
class InMemoryUsageCounter:
    """Local development stand-in for Upstash; counts reset when the process restarts."""

    counts: Counter[tuple[UserId, date]] = field(default_factory=Counter)

    async def increment(self, user_id: UserId, day: date) -> int:
        self.counts[user_id, day] += 1
        return self.counts[user_id, day]

    async def decrement(self, user_id: UserId, day: date) -> None:
        self.counts[user_id, day] -= 1


@dataclass(frozen=True)
class LocalBotLauncher:
    """Points the browser at a bot running on this machine, which starts when the offer arrives."""

    offer_url: str

    async def launch(self, request: SessionRequest) -> LocalWebrtcOffer:
        return LocalWebrtcOffer(offer_url=self.offer_url, request=request)
