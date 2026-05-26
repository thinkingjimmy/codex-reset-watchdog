from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

from .config import env_bool, env_int


DEFAULT_STATE_FILE_PATH = "~/.cache/codex-reset-watch/state.json"


class DedupeStore:
    def __init__(self, path: str | None = None) -> None:
        self.path = Path(path or os.getenv("STATE_FILE_PATH", DEFAULT_STATE_FILE_PATH)).expanduser()
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def _empty_state(self) -> dict[str, Any]:
        return {"seen_tweets": {}, "reported_events": {}, "operational_failures": {}}

    def _load(self) -> dict[str, Any]:
        if not self.path.exists():
            return self._empty_state()
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"State file is unreadable: {self.path}") from exc
        if not isinstance(raw, dict):
            return self._empty_state()

        seen = raw.get("seen_tweets", {})
        if isinstance(seen, list):
            seen = {str(tweet_id): 0 for tweet_id in seen}
        elif not isinstance(seen, dict):
            seen = {}

        events = raw.get("reported_events", {})
        if not isinstance(events, dict):
            events = {}

        failures = raw.get("operational_failures", {})
        if not isinstance(failures, dict):
            failures = {}

        return {"seen_tweets": seen, "reported_events": events, "operational_failures": failures}

    def _save(self, state: dict[str, Any]) -> None:
        payload = json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        temp_path = self.path.with_name(f".{self.path.name}.{os.getpid()}.tmp")
        try:
            temp_path.write_text(payload, encoding="utf-8")
            os.replace(temp_path, self.path)
        finally:
            if temp_path.exists():
                temp_path.unlink()

    def count(self) -> int:
        state = self._load()
        return len(state["seen_tweets"])

    def is_seen(self, tweet_id: str) -> bool:
        state = self._load()
        return str(tweet_id) in state["seen_tweets"]

    def mark_seen(self, tweet_id: str) -> None:
        state = self._load()
        state["seen_tweets"].setdefault(str(tweet_id), int(time.time()))
        self._save(state)

    def mark_if_new(self, tweet_id: str) -> bool:
        state = self._load()
        key = str(tweet_id)
        if key in state["seen_tweets"]:
            return False
        state["seen_tweets"][key] = int(time.time())
        self._save(state)
        return True

    def get_reported_event(self, event_key: str) -> dict[str, Any] | None:
        state = self._load()
        event = state["reported_events"].get(str(event_key))
        if not isinstance(event, dict):
            return None
        return {
            "event_key": str(event_key),
            "category": str(event.get("category") or ""),
            "last_tweet_id": str(event.get("last_tweet_id") or ""),
            "reported_at": int(event.get("reported_at") or 0),
        }

    def should_suppress_event(self, event_key: str, category: str, *, now: int | None = None) -> tuple[bool, str | None]:
        """Return whether a new alert should be suppressed as same-thread noise."""
        if not env_bool("EVENT_DEDUPE_ENABLED", True):
            return False, None
        prior = self.get_reported_event(event_key)
        if not prior:
            return False, None
        now = now or int(time.time())
        window_hours = env_int("EVENT_DEDUPE_WINDOW_HOURS", 24)
        if window_hours <= 0:
            return False, None
        age_seconds = now - int(prior["reported_at"])
        if age_seconds > window_hours * 3600:
            return False, None
        allow_phase_updates = env_bool("EVENT_DEDUPE_ALLOW_PHASE_UPDATES", True)
        prior_category = str(prior.get("category") or "")
        if allow_phase_updates and category == "completed_reset" and prior_category != "completed_reset":
            return False, None
        return True, f"same event_key {event_key!r} reported {age_seconds // 60} minute(s) ago as {prior_category}"

    def mark_event_reported(self, event_key: str, category: str, tweet_id: str) -> None:
        state = self._load()
        state["reported_events"][str(event_key)] = {
            "category": str(category),
            "last_tweet_id": str(tweet_id),
            "reported_at": int(time.time()),
        }
        self._save(state)

    def record_operational_failure(self, key: str, detail: dict[str, Any]) -> dict[str, Any]:
        state = self._load()
        now = int(time.time())
        failures = state["operational_failures"]
        prior = failures.get(key) if isinstance(failures.get(key), dict) else {}
        record = {
            "count": int(prior.get("count") or 0) + 1,
            "first_failed_at": int(prior.get("first_failed_at") or now),
            "last_failed_at": now,
            "detail": detail,
        }
        failures[key] = record
        self._save(state)
        return record

    def clear_operational_failure(self, key: str) -> None:
        state = self._load()
        if key not in state["operational_failures"]:
            return
        del state["operational_failures"][key]
        self._save(state)
