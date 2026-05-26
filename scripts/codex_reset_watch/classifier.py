from __future__ import annotations

import os
import re

from .config import env_bool, env_csv, env_int
from .models import MatchDecision, TweetCandidate
from .text import normalize_text, phrase_hits, regex_hits, term_hits
from .tweets import is_reply_like


CONFIDENCE_RANK = {"none": 0, "low": 1, "medium": 2, "high": 3}

DEFAULT_CODEX_TERMS = ["codex", "openai codex", "chatgpt codex"]

DEFAULT_RESET_TERMS = [
    "reset",
    "resets",
    "resetting",
    "reseted",
    "resetting everyone",
    "usage reset",
    "quota reset",
    "limit reset",
    "limits reset",
    "rate limit reset",
    "rate limits reset",
    "refresh",
    "refill",
    "replenish",
    "restore",
    "top up",
    "bump",
    "raise limits",
    "increase limits",
    "remediation",
    "compensate",
    "make-good",
]

DEFAULT_SCOPE_TERMS = [
    "usage",
    "usage limit",
    "usage limits",
    "quota",
    "quotas",
    "rate limit",
    "rate limits",
    "limit",
    "limits",
    "cap",
    "caps",
    "usage cap",
    "credits",
    "allowance",
    "allocation",
    "weekly limit",
    "weekly limits",
    "weekly quota",
    "message cap",
    "compute",
    "capacity",
]

DEFAULT_ANNOUNCEMENT_TERMS = [
    "will",
    "we'll",
    "we will",
    "going to",
    "plan to",
    "planning to",
    "scheduled",
    "about to",
    "soon",
    "shortly",
    "later today",
    "tonight",
    "tomorrow",
    "this week",
    "next week",
    "eta",
    "heads up",
    "stand by",
    "incoming",
    "next",
    "after",
    "once",
]

DEFAULT_COMPLETED_TERMS = [
    "just reset",
    "we reset",
    "we've reset",
    "we have reset",
    "has been reset",
    "have been reset",
    "is reset",
    "are reset",
    "reset is complete",
    "reset complete",
    "reset done",
    "done resetting",
]

DEFAULT_REMEDIATION_TERMS = [
    "remediation",
    "make-good",
    "compensate",
    "affected users",
    "impacted users",
    "everyone gets",
    "all users",
    "for everyone",
    "people who hit",
    "users who hit",
    "folks who hit",
]

DEFAULT_REPLY_AFFIRMATION_TERMS = [
    "yes",
    "yep",
    "yeah",
    "correct",
    "that's right",
    "that is right",
    "exactly",
    "indeed",
    "we will",
    "we'll",
    "will do",
    "that's the plan",
    "that is the plan",
    "planning to",
    "plan to",
    "on it",
    "working on it",
    "we are working on it",
    "we're working on it",
    "looking into it",
    "we are looking into it",
    "we're looking into it",
    "should be fixed",
    "fixed",
    "fixing",
    "addressing",
    "handled",
    "doing it",
    "we are doing it",
    "we're doing it",
    "coming",
    "incoming",
    "later today",
    "tomorrow",
    "soon",
    "shortly",
    "next week",
    "after the deploy",
]

DEFAULT_REPLY_NEGATION_TERMS = [
    "no",
    "nope",
    "not yet",
    "not planned",
    "not planning to",
    "won't",
    "will not",
    "can't",
    "cannot",
    "not doing that",
    "not for now",
]

DEFAULT_NEGATIVE_TERMS = [
    "git reset",
    "hard reset",
    "soft reset",
    "reset --hard",
    "repo reset",
    "branch reset",
    "reset your branch",
    "reset my branch",
    "cli reset",
    "codex cli reset",
    "reset cli",
    "reset workspace",
    "workspace reset",
    "cache reset",
    "reset cache",
    "database reset",
    "db reset",
    "environment reset",
    "reset environment",
    "factory reset",
    "password reset",
    "reset password",
    "token reset",
    "api key reset",
    "reset settings",
    "reset preferences",
    "reset config",
    "reset state",
    "session reset",
    "reset session",
    "reset command",
    "reset button",
    "not reset",
    "won't reset",
    "will not reset",
    "not going to reset",
    "no reset",
]

DEFAULT_HARD_NEGATION_TERMS = [
    "no reset",
    "not reset",
    "won't reset",
    "will not reset",
    "not going to reset",
    "not planning to reset",
    "no codex reset",
]

TIME_WINDOW_PATTERNS = [
    r"\b(?:in|within)\s+\d+\s*(?:minutes?|mins?|hours?|hrs?|days?)\b",
    r"\b\d+\s*(?:minutes?|mins?|hours?|hrs?|days?)\s+(?:from now|away)\b",
    r"\b(?:today|tomorrow|tonight|later today|this afternoon|this evening|this week|next week)\b",
    r"\b\d{1,2}\s*(?:am|pm)\b",
    r"\b\d{1,2}:\d{2}\s*(?:am|pm|utc|pt|pst|pdt|et|est|edt|gmt)?\b",
    r"\b(?:utc|pt|pst|pdt|et|est|edt|gmt)\b",
]

HIGH_SIGNAL_PATTERNS = [
    r"\bcodex\b.{0,120}\b(?:usage|quota|rate limits?|limits?|caps?|credits?)\b.{0,120}\b(?:will|we'?ll|going to|plan(?:ning)? to|scheduled|soon|tomorrow|today|tonight)\b.{0,120}\b(?:reset|refresh|refill|restore|replenish|top up)\b",
    r"\b(?:will|we'?ll|going to|plan(?:ning)? to|scheduled|soon|tomorrow|today|tonight)\b.{0,120}\b(?:reset|refresh|refill|restore|replenish|top up)\b.{0,120}\bcodex\b.{0,120}\b(?:usage|quota|rate limits?|limits?|caps?|credits?)\b",
    r"\b(?:reset|refresh|refill|restore|replenish|top up)\b.{0,120}\bcodex\b.{0,120}\b(?:usage|quota|rate limits?|limits?|caps?|credits?)\b",
    r"\bcodex\b.{0,120}\b(?:reset|refresh|refill|restore|replenish|top up)\b.{0,120}\b(?:usage|quota|rate limits?|limits?|caps?|credits?)\b",
]


def confidence_at_least(confidence: str, minimum: str) -> bool:
    return CONFIDENCE_RANK.get(confidence, 0) >= CONFIDENCE_RANK.get(minimum, 0)


def should_auto_alert(decision: MatchDecision) -> bool:
    """Return whether deterministic rules should create a finding without LLM review."""
    if not decision.alert:
        return False
    allowed = set(env_csv("RULES_AUTO_ALERT_CONFIDENCES", ["high"]))
    return decision.confidence.lower() in allowed


def should_request_codex_llm_review(tweet: TweetCandidate, decision: MatchDecision) -> bool:
    """Return whether the Codex Automation LLM should judge this candidate."""
    if not env_bool("CODEX_LLM_REVIEW_ENABLED", True):
        return False
    if should_auto_alert(decision):
        return False
    if decision.category in {"negated_reset", "reply_negated_reset", "negative_context", "no_codex_context", "no_match"}:
        return False
    review_confidences = set(env_csv("CODEX_LLM_REVIEW_CONFIDENCES", ["medium", "low"]))
    if decision.confidence.lower() not in review_confidences:
        return False
    min_score = env_int("CODEX_LLM_REVIEW_MIN_SCORE", max(env_int("MATCH_MIN_SCORE", 7) - 2, 1))
    if decision.score < min_score:
        return False
    joined_terms = " ".join(decision.matched_terms).lower()
    has_relevant_terms = any(key in joined_terms for key in ["codex", "reset", "refill", "restore", "quota", "limit", "usage", "remediation", "context:"])
    if not has_relevant_terms:
        return False
    if is_reply_like(tweet.raw) and not tweet.context_text and env_bool("CODEX_LLM_REVIEW_REQUIRE_REPLY_CONTEXT", True):
        return False
    return True


def should_hydrate_reply_context(tweet: TweetCandidate) -> bool:
    """Return whether check_once should call thread_context for this reply."""
    if not env_bool("HYDRATE_REPLY_CONTEXT", env_bool("ENRICH_REPLY_CONTEXT", True)):
        return False
    if not is_reply_like(tweet.raw):
        return False
    mode = (os.getenv("HYDRATE_REPLY_CONTEXT_MODE") or os.getenv("ENRICH_REPLY_CONTEXT_MODE") or "all").strip().lower()
    if mode == "all":
        return True
    text = normalize_text(tweet.text)
    reply_affirmation_terms = env_csv("MATCH_REPLY_AFFIRMATION_TERMS", DEFAULT_REPLY_AFFIRMATION_TERMS)
    reply_negation_terms = env_csv("MATCH_REPLY_NEGATION_TERMS", DEFAULT_REPLY_NEGATION_TERMS)
    return bool(
        term_hits(text, env_csv("MATCH_RESET_TERMS", DEFAULT_RESET_TERMS))
        or term_hits(text, env_csv("MATCH_SCOPE_TERMS", DEFAULT_SCOPE_TERMS))
        or term_hits(text, env_csv("MATCH_ANNOUNCEMENT_TERMS", DEFAULT_ANNOUNCEMENT_TERMS))
        or term_hits(text, env_csv("MATCH_REMEDIATION_TERMS", DEFAULT_REMEDIATION_TERMS))
        or phrase_hits(text, reply_affirmation_terms)
        or phrase_hits(text, reply_negation_terms)
        or regex_hits(text, TIME_WINDOW_PATTERNS)
    )


def classify_codex_reset(tweet: TweetCandidate) -> MatchDecision:
    """Classify whether a tweet likely announces a Codex usage/quota/limit reset."""
    original_text = tweet.text or ""
    text = normalize_text(original_text)
    context_text = normalize_text(tweet.context_text or "")
    is_reply = is_reply_like(tweet.raw)

    required_regex = os.getenv("MATCH_REQUIRED_REGEX", "").strip()
    if required_regex:
        try:
            match = re.search(required_regex, f"{original_text}\n{tweet.context_text or ''}", flags=re.IGNORECASE | re.MULTILINE)
            return MatchDecision(
                alert=bool(match),
                confidence="high" if match else "none",
                category="custom_regex" if match else "no_match",
                score=10 if match else 0,
                matched_terms=[match.group(0)] if match else [],
                negative_terms=[],
                rationale="Matched MATCH_REQUIRED_REGEX" if match else "Did not match MATCH_REQUIRED_REGEX",
            )
        except re.error as exc:
            raise ValueError(f"Invalid MATCH_REQUIRED_REGEX: {exc}") from exc

    codex_terms = env_csv("MATCH_CODEX_TERMS", DEFAULT_CODEX_TERMS)
    reset_terms = env_csv("MATCH_RESET_TERMS", DEFAULT_RESET_TERMS)
    scope_terms = env_csv("MATCH_SCOPE_TERMS", DEFAULT_SCOPE_TERMS)
    announcement_terms = env_csv("MATCH_ANNOUNCEMENT_TERMS", DEFAULT_ANNOUNCEMENT_TERMS)
    completed_terms = env_csv("MATCH_COMPLETED_TERMS", DEFAULT_COMPLETED_TERMS)
    remediation_terms = env_csv("MATCH_REMEDIATION_TERMS", DEFAULT_REMEDIATION_TERMS)
    reply_affirmation_terms = env_csv("MATCH_REPLY_AFFIRMATION_TERMS", DEFAULT_REPLY_AFFIRMATION_TERMS)
    reply_negation_terms = env_csv("MATCH_REPLY_NEGATION_TERMS", DEFAULT_REPLY_NEGATION_TERMS)
    negative_terms = env_csv("MATCH_NEGATIVE_TERMS", DEFAULT_NEGATIVE_TERMS)
    hard_negation_terms = env_csv("MATCH_HARD_NEGATION_TERMS", DEFAULT_HARD_NEGATION_TERMS)

    own_codex = term_hits(text, codex_terms)
    own_reset = term_hits(text, reset_terms)
    own_scope = term_hits(text, scope_terms)
    own_announcement = term_hits(text, announcement_terms)
    own_completed = term_hits(text, completed_terms)
    own_remediation = term_hits(text, remediation_terms)
    own_negative = term_hits(text, negative_terms)
    own_hard_negation = term_hits(text, hard_negation_terms)
    own_time = regex_hits(text, TIME_WINDOW_PATTERNS)
    own_high_signal = regex_hits(text, HIGH_SIGNAL_PATTERNS)
    own_reply_affirmation = phrase_hits(text, reply_affirmation_terms)
    own_reply_negation = phrase_hits(text, reply_negation_terms)

    allow_context_codex = env_bool("MATCH_ALLOW_REPLY_CONTEXT_CODEX", True)
    allow_context_scope = env_bool("MATCH_ALLOW_REPLY_CONTEXT_SCOPE", True)
    allow_context_event = env_bool("MATCH_ALLOW_REPLY_CONTEXT_EVENT", True)

    context_codex = term_hits(context_text, codex_terms) if allow_context_codex else []
    context_reset = term_hits(context_text, reset_terms) if allow_context_event else []
    context_scope = term_hits(context_text, scope_terms) if allow_context_scope else []
    context_announcement = term_hits(context_text, announcement_terms)
    context_remediation = term_hits(context_text, remediation_terms)
    context_negative = term_hits(context_text, negative_terms)
    context_high_signal = regex_hits(context_text, HIGH_SIGNAL_PATTERNS)

    matched_codex = list(dict.fromkeys(own_codex + context_codex))
    matched_reset = list(dict.fromkeys(own_reset + context_reset))
    matched_scope = list(dict.fromkeys(own_scope + context_scope))
    matched_announcement = list(dict.fromkeys(own_announcement + context_announcement))
    matched_remediation = list(dict.fromkeys(own_remediation + context_remediation))
    matched_negative = list(dict.fromkeys(own_negative + own_reply_negation + context_negative))

    if own_hard_negation or (is_reply and context_text and own_reply_negation):
        matched_terms = list(dict.fromkeys(matched_codex + matched_reset + matched_scope + own_announcement + own_hard_negation + own_reply_negation))
        return MatchDecision(
            alert=False,
            confidence="none",
            category="reply_negated_reset" if own_reply_negation else "negated_reset",
            score=0,
            matched_terms=matched_terms,
            negative_terms=list(dict.fromkeys(own_negative + own_hard_negation + own_reply_negation)),
            rationale="Author's reply negated a reset statement; do not alert unless a custom regex overrides this behavior.",
        )

    context_supplies_reset_topic = bool(
        context_codex
        and (
            context_remediation
            or (context_reset and (context_scope or own_scope or own_remediation))
            or (context_scope and (own_reset or own_remediation))
        )
    )
    reply_has_action_or_confirmation = bool(
        own_reset
        or own_scope
        or own_announcement
        or own_completed
        or own_remediation
        or own_time
        or own_reply_affirmation
    )
    contextual_reply_signal = bool(is_reply and context_text and context_supplies_reset_topic and reply_has_action_or_confirmation)

    require_codex = env_bool("MATCH_REQUIRE_CODEX", True)
    if require_codex and not matched_codex:
        return MatchDecision(
            alert=False,
            confidence="none",
            category="no_codex_context",
            score=0,
            matched_terms=[],
            negative_terms=matched_negative,
            rationale="No Codex term was present in the tweet or fetched reply context.",
        )

    score = 0
    score += 3 if own_codex else 0
    score += 2 if context_codex and not own_codex else 0
    score += 3 if own_reset else 0
    score += 2 if context_reset and contextual_reply_signal and not own_reset else 0
    score += 2 if own_scope else 0
    score += 1 if context_scope and not own_scope else 0
    score += 2 if own_announcement else 0
    score += 2 if own_completed else 0
    score += 2 if own_remediation else 0
    score += 1 if context_remediation and not own_remediation else 0
    score += 1 if own_time else 0
    score += 2 if own_high_signal else 0
    score += 1 if context_high_signal and contextual_reply_signal else 0
    score += 2 if own_reply_affirmation and contextual_reply_signal else 0
    score += 2 if contextual_reply_signal else 0

    if own_negative:
        score -= 4
        if not (own_scope or own_remediation or context_scope or context_remediation):
            score -= 3
    elif context_negative and not contextual_reply_signal:
        score -= 2

    min_score = env_int("MATCH_MIN_SCORE", 7)
    allow_completed = env_bool("MATCH_ALLOW_COMPLETED_RESETS", True)

    has_event = bool(own_reset or own_remediation or (contextual_reply_signal and (context_reset or context_remediation)))
    has_scope_or_remediation = bool(own_scope or own_remediation or context_scope or context_remediation)
    has_announcement_signal = bool(own_announcement or own_time or (contextual_reply_signal and own_reply_affirmation))
    has_completed_signal = bool(own_completed)

    category = "not_alert"
    if own_negative and score < min_score:
        category = "negative_context"
    elif contextual_reply_signal and has_event and has_scope_or_remediation and has_announcement_signal:
        category = "reply_context_reset"
    elif has_event and has_scope_or_remediation and has_announcement_signal:
        category = "upcoming_reset"
    elif has_event and has_scope_or_remediation and has_completed_signal and allow_completed:
        category = "completed_reset"
    elif has_event and matched_remediation:
        category = "remediation_plan"
    elif has_event and has_announcement_signal:
        category = "possible_upcoming_reset"
    elif has_event and has_scope_or_remediation:
        category = "possible_reset"

    alert_categories = set(
        env_csv(
            "MATCH_ALERT_CATEGORIES",
            ["upcoming_reset", "completed_reset", "remediation_plan", "possible_upcoming_reset", "reply_context_reset"],
        )
    )
    alert = category in alert_categories and score >= min_score and has_event

    if score >= min_score + 3 and category in {"upcoming_reset", "completed_reset", "remediation_plan", "reply_context_reset"}:
        confidence = "high"
    elif alert:
        confidence = "medium"
    elif score >= min_score - 2 and has_event:
        confidence = "low"
    else:
        confidence = "none"

    matched_terms = list(
        dict.fromkeys(
            own_codex
            + own_reset
            + own_scope
            + own_announcement
            + own_completed
            + own_remediation
            + own_time
            + own_reply_affirmation
            + own_reply_negation
            + own_high_signal
            + [f"context:{term}" for term in (context_codex + context_reset + context_scope + context_remediation + context_high_signal)]
        )
    )

    rationale_parts: list[str] = []
    if own_codex:
        rationale_parts.append("Codex context in author tweet")
    elif context_codex:
        rationale_parts.append("Codex context from reply thread")
    if own_reset:
        rationale_parts.append("reset/refill/remediation wording in author tweet")
    elif context_reset and contextual_reply_signal:
        rationale_parts.append("reset/refill topic from reply thread")
    if own_scope:
        rationale_parts.append("usage/quota/limit scope in author tweet")
    elif context_scope:
        rationale_parts.append("usage/quota/limit scope from reply thread")
    if own_announcement or own_time:
        rationale_parts.append("announcement/timing language in author tweet")
    if own_reply_affirmation and contextual_reply_signal:
        rationale_parts.append("affirmative reply to reset-related context")
    if own_completed:
        rationale_parts.append("completed reset language")
    if own_remediation or context_remediation:
        rationale_parts.append("remediation/affected-user language")
    if matched_negative:
        rationale_parts.append("negative/non-quota reset context")

    return MatchDecision(
        alert=alert,
        confidence=confidence,
        category=category,
        score=score,
        matched_terms=matched_terms,
        negative_terms=matched_negative,
        rationale="; ".join(rationale_parts) or "No strong signal.",
    )


def match_codex_reset(tweet: TweetCandidate) -> tuple[bool, list[str]]:
    decision = classify_codex_reset(tweet)
    return decision.alert, decision.matched_terms
