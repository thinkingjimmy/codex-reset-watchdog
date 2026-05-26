from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any

from .classifier import classify_codex_reset, should_auto_alert, should_request_codex_llm_review
from .config import env_bool
from .models import MatchDecision, TweetCandidate
from .state import DedupeStore
from .tweets import build_tweet_url, extract_tweets, is_reply_like, is_repost_like


def format_decision_alert(tweet: TweetCandidate, decision: MatchDecision) -> str:
    handle = f"@{tweet.author_username}" if tweet.author_username else "unknown author"
    url = build_tweet_url(tweet) or ""
    matched = ", ".join(dict.fromkeys(decision.matched_terms)) or "codex reset"
    negative = f"\nIgnored/negative terms: {', '.join(decision.negative_terms)}" if decision.negative_terms else ""
    created = f"\nCreated: {tweet.created_at}" if tweet.created_at else ""
    is_reply_note = "\nKind: reply" if is_reply_like(tweet.raw) else ""
    context = ""
    if tweet.context_text:
        snippet = re.sub(r"\s+", " ", tweet.context_text).strip()
        if len(snippet) > 600:
            snippet = snippet[:580].rstrip() + " …"
        context = f"\nReply context: {snippet}"
    return (
        "Codex reset watchdog alert\n"
        f"Type: {decision.category}\n"
        f"Confidence: {decision.confidence} (score {decision.score})\n"
        f"Author: {handle}{created}{is_reply_note}\n"
        f"Matched: {matched}{negative}\n"
        f"Rationale: {decision.rationale}\n"
        f"Tweet: {tweet.text}{context}\n"
        f"URL: {url}"
    ).strip()


def format_alert(tweet: TweetCandidate, matched_terms: Iterable[str]) -> str:
    decision = MatchDecision(
        alert=True,
        confidence="medium",
        category="codex_reset",
        score=0,
        matched_terms=list(matched_terms),
        negative_terms=[],
        rationale="Matched configured terms.",
    )
    return format_decision_alert(tweet, decision)


def send_notification(message: str, tweet: TweetCandidate | None = None) -> list[str]:
    """Codex Automation-only notification shim."""
    return ["codex_automation_triage"]


def process_payload(payload: dict[str, Any], store: DedupeStore | None = None) -> list[dict[str, Any]]:
    store = store or DedupeStore()
    include_reposts = env_bool("INCLUDE_REPOSTS", False)
    results: list[dict[str, Any]] = []

    for tweet in extract_tweets(payload):
        if tweet.raw and is_repost_like(tweet.raw) and not include_reposts:
            results.append({"tweet_id": tweet.id, "status": "ignored_repost"})
            continue

        decision = classify_codex_reset(tweet)
        if not should_auto_alert(decision):
            results.append(
                {
                    "tweet_id": tweet.id,
                    "status": "needs_llm_review" if should_request_codex_llm_review(tweet, decision) else "no_alert",
                    "category": decision.category,
                    "confidence": decision.confidence,
                    "score": decision.score,
                    "matched_terms": decision.matched_terms,
                    "negative_terms": decision.negative_terms,
                }
            )
            continue

        if not store.mark_if_new(tweet.id):
            results.append({"tweet_id": tweet.id, "status": "duplicate"})
            continue

        message = format_decision_alert(tweet, decision)
        send_notification(message, tweet=tweet)
        results.append(
            {
                "tweet_id": tweet.id,
                "status": "codex_finding",
                "surface": "codex_automation_triage",
                "category": decision.category,
                "confidence": decision.confidence,
                "score": decision.score,
            }
        )

    return results
