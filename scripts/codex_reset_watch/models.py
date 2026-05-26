from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TweetCandidate:
    id: str
    text: str
    author_username: str | None = None
    author_name: str | None = None
    url: str | None = None
    created_at: str | None = None
    raw: dict[str, Any] | None = None
    context_text: str | None = None
    context_tweets: tuple[dict[str, Any], ...] = ()


@dataclass(frozen=True)
class MatchDecision:
    alert: bool
    confidence: str
    category: str
    score: int
    matched_terms: list[str]
    negative_terms: list[str]
    rationale: str
