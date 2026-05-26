from __future__ import annotations

from collections.abc import Iterable
from dataclasses import replace
from typing import Any

from .config import env_int
from .models import TweetCandidate


def event_key_for_tweet(tweet: TweetCandidate) -> str:
    """Return a stable event key used to avoid duplicate alerts within one thread."""
    raw = tweet.raw or {}
    key = raw.get("conversationId") or raw.get("conversation_id") or raw.get("inReplyToId") or raw.get("in_reply_to_status_id") or tweet.id
    return str(key or tweet.id)


def build_tweet_url(tweet: TweetCandidate) -> str | None:
    if tweet.url:
        return tweet.url
    if tweet.author_username and tweet.id:
        return f"https://x.com/{tweet.author_username}/status/{tweet.id}"
    if tweet.id:
        return f"https://x.com/i/web/status/{tweet.id}"
    return None


def is_repost_like(raw: dict[str, Any]) -> bool:
    tweet_type = str(raw.get("type") or raw.get("tweet_type") or "").lower()
    if tweet_type in {"retweet", "repost"}:
        return True
    if raw.get("retweeted_tweet"):
        return True
    text = str(raw.get("text") or "")
    return text.startswith("RT @")


def is_reply_like(raw: dict[str, Any] | None) -> bool:
    if not raw:
        return False
    value = raw.get("isReply")
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().lower() in {"1", "true", "yes"}:
        return True
    return bool(raw.get("inReplyToId") or raw.get("in_reply_to_status_id") or raw.get("inReplyToUsername"))


def build_thread_context_text(
    context_tweets: Iterable[dict[str, Any]],
    *,
    current_tweet_id: str,
    max_chars: int = 2400,
) -> str:
    """Create compact parent-thread context for reply-aware classification."""
    parts: list[str] = []
    current_int = _tweet_id_as_int(current_tweet_id)
    sorted_context = sorted(context_tweets, key=lambda raw: _tweet_id_as_int(str(raw.get("id") or raw.get("id_str") or "")) or 0)
    for raw in sorted_context:
        tweet_id = str(raw.get("id") or raw.get("id_str") or "")
        if tweet_id and tweet_id == str(current_tweet_id):
            continue
        tweet_int = _tweet_id_as_int(tweet_id)
        if current_int is not None and tweet_int is not None and tweet_int > current_int:
            continue
        text = str(raw.get("text") or raw.get("full_text") or "").strip()
        if not text:
            continue
        author = extract_author_username(raw) or "unknown"
        parts.append(f"@{author}: {text}")
    max_tweets = env_int("THREAD_CONTEXT_MAX_TWEETS", 8)
    if max_tweets > 0:
        parts = parts[-max_tweets:]
    value = "\n".join(parts)
    if len(value) > max_chars:
        return value[: max_chars - 20].rstrip() + " …[truncated]"
    return value


def _tweet_id_as_int(tweet_id: str | None) -> int | None:
    if not tweet_id:
        return None
    try:
        return int(str(tweet_id))
    except (TypeError, ValueError):
        return None


def attach_thread_context(tweet: TweetCandidate, context_tweets: Iterable[dict[str, Any]]) -> TweetCandidate:
    raw_context = [item for item in context_tweets if isinstance(item, dict)]
    max_chars = env_int("THREAD_CONTEXT_MAX_CHARS", env_int("REPLY_CONTEXT_MAX_CHARS", 2400))
    context_text = build_thread_context_text(raw_context, current_tweet_id=tweet.id, max_chars=max_chars)
    raw = dict(tweet.raw or {})
    raw["_thread_context"] = raw_context
    return replace(tweet, context_text=context_text, context_tweets=tuple(raw_context), raw=raw)


def extract_author_username(raw: dict[str, Any]) -> str | None:
    author = raw.get("author") or {}
    if isinstance(author, dict):
        return (
            author.get("userName")
            or author.get("username")
            or author.get("screen_name")
            or raw.get("screen_name")
        )
    return raw.get("screen_name")


def extract_author_name(raw: dict[str, Any]) -> str | None:
    author = raw.get("author") or {}
    if isinstance(author, dict):
        return author.get("name") or author.get("display_name") or raw.get("display_name")
    return raw.get("display_name")


def extract_tweets(payload: dict[str, Any]) -> list[TweetCandidate]:
    """Normalize TwitterAPI.io payload variants into tweet candidates."""
    items: list[dict[str, Any]] = []

    if isinstance(payload.get("tweet"), dict):
        items.append(payload["tweet"])

    tweets = payload.get("tweets")
    if isinstance(tweets, list):
        items.extend(item for item in tweets if isinstance(item, dict))

    replies = payload.get("replies")
    if isinstance(replies, list):
        items.extend(item for item in replies if isinstance(item, dict))

    if not items and payload.get("id") and payload.get("text") is not None:
        items.append(payload)

    result: list[TweetCandidate] = []
    for raw in items:
        tweet_id = str(raw.get("id") or raw.get("id_str") or "").strip()
        text = str(raw.get("text") or raw.get("full_text") or "")
        if not tweet_id or text == "":
            continue
        result.append(
            TweetCandidate(
                id=tweet_id,
                text=text,
                author_username=extract_author_username(raw),
                author_name=extract_author_name(raw),
                url=raw.get("url"),
                created_at=(
                    raw.get("createdAt")
                    or raw.get("created_at")
                    or raw.get("created_ms")
                    or raw.get("snowflake_created_ms")
                ),
                raw=raw,
            )
        )
    return result
