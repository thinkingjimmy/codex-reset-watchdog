#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Any

import requests

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.common import (  # noqa: E402
    DedupeStore,
    attach_thread_context,
    build_tweet_url,
    classify_codex_reset,
    env_bool,
    env_int,
    event_key_for_tweet,
    extract_tweets,
    format_decision_alert,
    is_reply_like,
    is_repost_like,
    pretty_json,
    require_api_key,
    send_notification,
    should_auto_alert,
    should_hydrate_reply_context,
    should_request_codex_llm_review,
)

LAST_TWEETS_URL = "https://api.twitterapi.io/twitter/user/last_tweets"
THREAD_CONTEXT_URL = "https://api.twitterapi.io/twitter/tweet/thread_context"
NETWORK_FAILURE_KEY = "twitterapi_network"


class TwitterAPITransientError(RuntimeError):
    def __init__(self, *, operation: str, url: str, attempts: int, exc: BaseException) -> None:
        super().__init__(str(exc))
        self.operation = operation
        self.url = url
        self.attempts = attempts
        self.exc = exc
        self.root_cause = _network_root_cause(exc)

    def to_summary(self) -> dict[str, Any]:
        return {
            "type": type(self.exc).__name__,
            "operation": self.operation,
            "url": self.url,
            "attempts": self.attempts,
            "root_cause": self.root_cause,
            "detail": _sanitize_exception(self.exc),
        }


def _bool_arg(value: str) -> bool:
    value = value.strip().lower()
    if value in {"1", "true", "yes", "y", "on"}:
        return True
    if value in {"0", "false", "no", "n", "off"}:
        return False
    raise argparse.ArgumentTypeError(f"Expected boolean, got {value!r}")


def _sanitize_exception(exc: BaseException) -> str:
    detail = " ".join(str(exc).split())
    max_chars = 500
    if len(detail) > max_chars:
        return detail[:max_chars].rstrip() + "..."
    return detail


def _network_root_cause(exc: BaseException) -> str:
    detail = str(exc).lower()
    dns_markers = [
        "nameresolutionerror",
        "nodename nor servname",
        "temporary failure in name resolution",
        "name or service not known",
        "getaddrinfo failed",
    ]
    if any(marker in detail for marker in dns_markers):
        return "dns_resolution_failure"
    if isinstance(exc, requests.exceptions.Timeout):
        return "timeout"
    return "connection_error"


def _retry_delay(attempt: int) -> int:
    base = max(env_int("TWITTERAPI_IO_RETRY_SLEEP_SECONDS", 5), 0)
    cap = max(env_int("TWITTERAPI_IO_RETRY_MAX_SLEEP_SECONDS", 30), 0)
    if base == 0 or cap == 0:
        return 0
    return min(cap, base * (2 ** max(attempt - 1, 0)))


def _get_json_with_retries(
    url: str,
    *,
    headers: dict[str, str],
    params: dict[str, Any],
    timeout: int,
    operation: str,
) -> dict[str, Any]:
    attempts = max(env_int("TWITTERAPI_IO_RETRY_ATTEMPTS", 3), 1)
    last_exc: BaseException | None = None
    for attempt in range(1, attempts + 1):
        try:
            response = requests.get(url, headers=headers, params=params, timeout=timeout)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise RuntimeError("TwitterAPI.io response is not a JSON object")
            return payload
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
            last_exc = exc
            if attempt >= attempts:
                break
            delay = _retry_delay(attempt)
            if delay:
                time.sleep(delay)
        except requests.exceptions.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else 0
            if status not in {429, 500, 502, 503, 504} or attempt >= attempts:
                raise
            delay = _retry_delay(attempt)
            if delay:
                time.sleep(delay)
    assert last_exc is not None
    raise TwitterAPITransientError(operation=operation, url=url, attempts=attempts, exc=last_exc)


def fetch_last_tweets(
    *,
    handle: str | None,
    user_id: str | None,
    include_replies: bool,
    max_pages: int,
    timeout: int = 20,
) -> list[dict[str, Any]]:
    if not handle and not user_id:
        raise RuntimeError("Either --handle/TARGET_X_HANDLE or --user-id/TARGET_X_USER_ID is required")

    headers = {"X-API-Key": require_api_key()}
    params: dict[str, Any] = {"includeReplies": str(include_replies).lower()}
    if user_id:
        params["userId"] = user_id
    else:
        params["userName"] = str(handle).lstrip("@")

    tweets: list[dict[str, Any]] = []
    cursor = ""
    for _ in range(max_pages):
        page_params = dict(params)
        if cursor:
            page_params["cursor"] = cursor
        payload = _get_json_with_retries(
            LAST_TWEETS_URL,
            headers=headers,
            params=page_params,
            timeout=timeout,
            operation="last_tweets",
        )
        if payload.get("status") == "error":
            raise RuntimeError(payload.get("message") or "TwitterAPI.io returned error status")
        page_tweets = payload.get("tweets") or []
        if not isinstance(page_tweets, list):
            raise RuntimeError("Unexpected TwitterAPI.io response: tweets is not a list")
        tweets.extend(item for item in page_tweets if isinstance(item, dict))
        if not payload.get("has_next_page"):
            break
        cursor = str(payload.get("next_cursor") or "")
        if not cursor:
            break
    return tweets


def fetch_thread_context(tweet_id: str, *, max_pages: int, timeout: int = 20) -> list[dict[str, Any]]:
    """Fetch thread context for a reply tweet so terse answers can be classified."""
    headers = {"X-API-Key": require_api_key()}
    context: list[dict[str, Any]] = []
    cursor = ""
    for _ in range(max_pages):
        params: dict[str, Any] = {"tweetId": tweet_id}
        if cursor:
            params["cursor"] = cursor
        payload = _get_json_with_retries(
            THREAD_CONTEXT_URL,
            headers=headers,
            params=params,
            timeout=timeout,
            operation="thread_context",
        )
        if payload.get("status") == "error":
            raise RuntimeError(payload.get("message") or "TwitterAPI.io thread_context returned error status")
        page_items = payload.get("replies") or payload.get("tweets") or []
        if not isinstance(page_items, list):
            raise RuntimeError("Unexpected TwitterAPI.io response: thread context is not a list")
        context.extend(item for item in page_items if isinstance(item, dict))
        if not payload.get("has_next_page"):
            break
        cursor = str(payload.get("next_cursor") or "")
        if not cursor:
            break
    return context


def tweet_sort_key(raw: dict[str, Any]) -> tuple[int, str]:
    tweet_id = str(raw.get("id") or raw.get("id_str") or "")
    try:
        return (int(tweet_id), tweet_id)
    except ValueError:
        return (0, str(raw.get("createdAt") or raw.get("created_at") or tweet_id))


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="One-shot TwitterAPI.io check for Codex reset announcement tweets/replies. Emits Codex Automation findings only."
    )
    parser.add_argument("--handle", default=os.getenv("TARGET_X_HANDLE", "").strip(), help="Target X handle")
    parser.add_argument("--user-id", default=os.getenv("TARGET_X_USER_ID", "").strip(), help="Target X user ID")
    parser.add_argument(
        "--include-replies",
        type=_bool_arg,
        default=env_bool("INCLUDE_REPLIES", True),
        help="Whether to include replies. Default comes from INCLUDE_REPLIES, true in this skill.",
    )
    parser.add_argument("--max-pages", type=int, default=env_int("CHECK_ONCE_MAX_PAGES", 2))
    parser.add_argument(
        "--hydrate-reply-context",
        "--enrich-reply-context",
        dest="hydrate_reply_context",
        type=_bool_arg,
        default=env_bool("HYDRATE_REPLY_CONTEXT", env_bool("ENRICH_REPLY_CONTEXT", True)),
        help="Fetch thread context for new replies so terse replies can inherit Codex/reset context.",
    )
    parser.add_argument(
        "--thread-context-max-pages",
        "--reply-context-max-pages",
        dest="thread_context_max_pages",
        type=int,
        default=env_int("THREAD_CONTEXT_MAX_PAGES", env_int("REPLY_CONTEXT_MAX_PAGES", 1)),
    )
    parser.add_argument(
        "--thread-context-max-fetches",
        "--reply-context-max-fetches",
        dest="thread_context_max_fetches",
        type=int,
        default=env_int("THREAD_CONTEXT_MAX_FETCHES", env_int("REPLY_CONTEXT_MAX_FETCHES", 12)),
        help="Maximum thread-context lookups per run. Set lower to reduce API calls.",
    )
    parser.add_argument(
        "--alert-on-first-run",
        action="store_true",
        default=env_bool("ALERT_ON_FIRST_RUN", False),
        help="Alert on matching tweets found before the state file has been primed.",
    )
    parser.add_argument(
        "--prime-state",
        action="store_true",
        help="Mark fetched tweets as seen and send no notifications. Useful during setup.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Classify only; do not update seen state. JSON still includes any would-be Codex finding.")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON summary.")
    return parser


def main() -> int:
    args = build_arg_parser().parse_args()
    handle = args.handle.lstrip("@") if args.handle else ""
    user_id = args.user_id or ""
    store = DedupeStore()

    try:
        raw_tweets = fetch_last_tweets(
            handle=handle or None,
            user_id=user_id or None,
            include_replies=args.include_replies,
            max_pages=max(args.max_pages, 1),
        )
        store.clear_operational_failure(NETWORK_FAILURE_KEY)
    except TwitterAPITransientError as exc:
        failure = store.record_operational_failure(NETWORK_FAILURE_KEY, exc.to_summary())
        threshold = max(env_int("OPERATIONAL_ERROR_REPORT_THRESHOLD", 3), 1)
        summary = {
            "status": "transient_network_error",
            "target": user_id or f"@{handle}",
            "alerts": 0,
            "has_finding": False,
            "finding_markdown": None,
            "llm_review_count": 0,
            "has_llm_review_candidates": False,
            "llm_review_candidates": [],
            "notification_surface": "codex_automation_triage",
            "dry_run": bool(args.dry_run),
            "operational_error": {
                **exc.to_summary(),
                "consecutive_failures": int(failure["count"]),
                "report_to_triage": int(failure["count"]) >= threshold,
                "report_threshold": threshold,
                "retry_next_run": True,
                "message": "Transient TwitterAPI.io network failure; keep automation active and retry on the next run.",
            },
            "results": [],
        }
        if args.json:
            print(pretty_json(summary))
        else:
            print(f"Transient TwitterAPI.io network error after {exc.attempts} attempt(s): {exc.root_cause}")
        return 0 if env_bool("TRANSIENT_NETWORK_ERRORS_EXIT_ZERO", True) else 75

    candidates = extract_tweets({"tweets": sorted(raw_tweets, key=tweet_sort_key)})

    initial_run = store.count() == 0
    if args.prime_state or (initial_run and not args.alert_on_first_run and not args.dry_run):
        for tweet in candidates:
            store.mark_seen(tweet.id)
        summary = {
            "status": "primed" if initial_run else "state_updated",
            "fetched": len(candidates),
            "marked_seen": len(candidates),
            "alerts": 0,
            "note": "First run baseline: no old tweets were reported. Set ALERT_ON_FIRST_RUN=true to scan historical tweets.",
        }
        print(pretty_json(summary) if args.json else f"Primed {len(candidates)} tweets; no alerts sent.")
        return 0

    include_reposts = env_bool("INCLUDE_REPOSTS", False)
    results: list[dict[str, Any]] = []
    alert_messages: list[str] = []
    llm_review_candidates: list[dict[str, Any]] = []
    alerts = 0
    context_fetches = 0

    for tweet in candidates:
        if store.is_seen(tweet.id):
            results.append({"tweet_id": tweet.id, "status": "already_seen"})
            continue

        if tweet.raw and is_repost_like(tweet.raw) and not include_reposts:
            if not args.dry_run:
                store.mark_seen(tweet.id)
            results.append({"tweet_id": tweet.id, "status": "ignored_repost", "is_reply": is_reply_like(tweet.raw)})
            continue

        context_status = "not_reply" if not is_reply_like(tweet.raw) else "disabled"
        context_items = 0
        context_error = None
        tweet_for_decision = tweet
        if args.hydrate_reply_context and should_hydrate_reply_context(tweet):
            if context_fetches < max(args.thread_context_max_fetches, 0):
                context_fetches += 1
                try:
                    context_tweets = fetch_thread_context(tweet.id, max_pages=max(args.thread_context_max_pages, 1))
                    tweet_for_decision = attach_thread_context(tweet, context_tweets)
                    context_items = len(context_tweets)
                    context_status = "used" if tweet_for_decision.context_text else "empty"
                except Exception as exc:
                    if env_bool("THREAD_CONTEXT_STRICT", False):
                        raise
                    context_status = "error"
                    context_error = str(exc)
            else:
                context_status = "skipped_limit"

        decision = classify_codex_reset(tweet_for_decision)
        event_key = event_key_for_tweet(tweet_for_decision)
        auto_alert = should_auto_alert(decision)
        needs_llm_review = should_request_codex_llm_review(tweet_for_decision, decision)
        if not args.dry_run:
            store.mark_seen(tweet.id)
        row: dict[str, Any] = {
            "tweet_id": tweet.id,
            "event_key": event_key,
            "url": build_tweet_url(tweet_for_decision) or tweet.url,
            "created_at": tweet.created_at,
            "is_reply": is_reply_like(tweet.raw),
            "in_reply_to_id": (tweet.raw or {}).get("inReplyToId") if tweet.raw else None,
            "in_reply_to_username": (tweet.raw or {}).get("inReplyToUsername") if tweet.raw else None,
            "context_status": context_status,
            "context_items": context_items,
            "category": decision.category,
            "confidence": decision.confidence,
            "score": decision.score,
            "matched_terms": decision.matched_terms,
            "negative_terms": decision.negative_terms,
            "auto_alert": auto_alert,
            "needs_codex_llm_review": needs_llm_review,
        }
        if context_error:
            row["context_error"] = context_error
        if auto_alert:
            suppressed = False
            suppress_reason = None
            if not args.dry_run:
                suppressed, suppress_reason = store.should_suppress_event(event_key, decision.category)
            if suppressed:
                row["status"] = "suppressed_duplicate_event"
                row["suppress_reason"] = suppress_reason
            else:
                alerts += 1
                message = format_decision_alert(tweet_for_decision, decision)
                alert_messages.append(message)
                row["message"] = message
                if args.dry_run:
                    row["status"] = "would_report_to_codex"
                    row["surface"] = "codex_automation_triage"
                else:
                    store.mark_event_reported(event_key, decision.category, tweet.id)
                    row["status"] = "codex_finding"
                    row["surface"] = send_notification(message, tweet=tweet_for_decision)[0]
        elif needs_llm_review:
            review_candidate = {
                "tweet_id": tweet.id,
                "event_key": event_key,
                "url": build_tweet_url(tweet_for_decision) or tweet.url,
                "created_at": tweet.created_at,
                "author": tweet.author_username,
                "is_reply": is_reply_like(tweet.raw),
                "tweet_text": tweet.text,
                "reply_context": tweet_for_decision.context_text,
                "context_status": context_status,
                "category": decision.category,
                "confidence": decision.confidence,
                "score": decision.score,
                "matched_terms": decision.matched_terms,
                "negative_terms": decision.negative_terms,
                "rationale": decision.rationale,
                "finding_markdown_if_promoted": format_decision_alert(tweet_for_decision, decision),
            }
            llm_review_candidates.append(review_candidate)
            row["status"] = "needs_codex_llm_review"
        else:
            row["status"] = "no_alert"
        results.append(row)

    finding_markdown = ""
    if alert_messages:
        joined = "\n\n---\n\n".join(alert_messages)
        finding_markdown = (
            f"## Codex reset watchdog finding\n\n"
            f"Detected {alerts} new likely Codex reset-related tweet/reply.\n\n"
            f"{joined}"
        )

    summary = {
        "status": "ok",
        "target": user_id or f"@{handle}",
        "fetched": len(candidates),
        "new_items": sum(1 for r in results if r.get("status") != "already_seen"),
        "reply_context_fetches": context_fetches,
        "alerts": alerts,
        "has_finding": alerts > 0,
        "finding_markdown": finding_markdown if alert_messages else None,
        "llm_review_count": len(llm_review_candidates),
        "has_llm_review_candidates": bool(llm_review_candidates),
        "llm_review_candidates": llm_review_candidates,
        "llm_review_instruction": "Use the skill rubric to promote a review candidate to a Codex Triage finding only when it probably announces a Codex usage/quota/rate-limit reset, refill, restored allowance, or remediation. Otherwise archive without finding.",
        "notification_surface": "codex_automation_triage",
        "dry_run": bool(args.dry_run),
        "results": results,
    }

    if args.json:
        print(pretty_json(summary))
    else:
        print(f"Checked {summary['target']}: {summary['new_items']} new tweets/replies, {alerts} Codex finding(s), {len(llm_review_candidates)} LLM review candidate(s).")
        for row in results:
            if row.get("status") in {"codex_finding", "would_report_to_codex", "needs_codex_llm_review"}:
                print(f"- {row['status']}: {row.get('url') or row['tweet_id']} ({row['category']}, {row['confidence']}, score {row['score']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
