#!/usr/bin/env python3
from __future__ import annotations

import os
import tempfile
from pathlib import Path

if __package__ is None or __package__ == "":
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.common import (  # noqa: E402
    DedupeStore,
    TweetCandidate,
    attach_thread_context,
    classify_codex_reset,
    event_key_for_tweet,
    should_auto_alert,
)


def assert_true(value: bool, message: str) -> None:
    if not value:
        raise AssertionError(message)


def main() -> int:
    high = TweetCandidate(
        id="100",
        text="Heads up, we'll reset Codex usage limits later today.",
        raw={"id": "100", "text": "Heads up, we'll reset Codex usage limits later today.", "conversationId": "100"},
    )
    high_decision = classify_codex_reset(high)
    assert_true(high_decision.alert and should_auto_alert(high_decision), "high-confidence reset should auto-alert")

    false = TweetCandidate(
        id="101",
        text="git reset fixed my Codex branch",
        raw={"id": "101", "text": "git reset fixed my Codex branch", "conversationId": "101"},
    )
    false_decision = classify_codex_reset(false)
    assert_true(not false_decision.alert, "git reset should not alert")

    reply = TweetCandidate(
        id="200",
        text="yes, later today",
        raw={"id": "200", "text": "yes, later today", "isReply": True, "conversationId": "150", "inReplyToId": "150"},
    )
    reply = attach_thread_context(
        reply,
        [
            {"id": "150", "text": "Will you reset Codex usage limits for affected users?", "author": {"userName": "someone"}},
            {"id": "200", "text": "yes, later today", "author": {"userName": "target"}},
        ],
    )
    reply_decision = classify_codex_reset(reply)
    assert_true(reply_decision.alert and should_auto_alert(reply_decision), "reply with Codex reset context should auto-alert")

    with tempfile.TemporaryDirectory() as tmp:
        state_file = Path(tmp) / "state.json"
        store = DedupeStore(str(state_file))
        assert_true(store.mark_if_new("100"), "first mark_if_new should be true")
        assert_true(not store.mark_if_new("100"), "second mark_if_new should be false")
        key = event_key_for_tweet(reply)
        store.mark_event_reported(key, reply_decision.category, reply.id)
        suppressed, reason = store.should_suppress_event(key, reply_decision.category)
        assert_true(suppressed and bool(reason), "same event should be suppressed inside window")

    print("self_test passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
