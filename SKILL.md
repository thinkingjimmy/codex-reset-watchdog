---
name: codex-reset-watch
description: Set up a Codex Automation-only, hybrid rule-plus-LLM check for pre-announcement tweets and replies about OpenAI Codex usage, quota, or rate-limit resets. Use when monitoring @thsottiaux or another X/Twitter account via TwitterAPI.io and notifying only through Codex Automation/Triage.
---

# Codex Reset Watch

Use this skill to implement or maintain a **Codex Automation-only** TwitterAPI.io check. The default target is `@thsottiaux` (`https://x.com/thsottiaux`). The skill reports a Codex Automation finding when a tweet or reply likely announces a Codex usage/quota/rate-limit reset, quota refill, restored allowance, or related remediation.

This skill intentionally does **not** send Telegram, Discord, Slack, ntfy, email, or generic webhook messages. The notification surface is Codex itself: `scripts/check_once.py` emits structured JSON, and the scheduled Codex Automation posts a Triage finding only when there is a high-confidence hit or a Codex LLM-promoted ambiguous candidate.

## Required setup shape

The repo is GitHub-ready. Keep the checked-in template and create a private local `.env`:

```bash
cp .env.example .env
```

Then edit this line inside `.env`:

```env
TWITTERAPI_IO_KEY=PASTE_YOUR_TWITTERAPI_IO_KEY_HERE
```

The default target is already set:

```env
TARGET_X_HANDLE=thsottiaux
```

`.env` is ignored by `.gitignore`; never commit the real key or paste it into the Automation prompt.

## Core behavior

1. Use `scripts/check_once.py` as the runtime entrypoint for scheduled monitoring.
2. Include replies by default. Reset announcements may appear as replies rather than top-level tweets, so `INCLUDE_REPLIES=true` is the default.
3. For new replies, fetch real thread context by default. This catches terse replies such as “yes, later today” when the parent tweet asks about a Codex usage reset.
4. Use a **hybrid classifier**:
   - deterministic rules auto-alert only high-confidence reset/refill/remediation announcements;
   - medium/low ambiguous candidates are emitted as `llm_review_candidates` for Codex Automation's LLM to judge in that same run;
   - clear negatives are suppressed without LLM review.
5. Match on **announcement intent**, not just keywords. Alert when a tweet/reply says or strongly implies that Codex usage, quota, rate limits, weekly limits, caps, credits, allowance, or capacity will be reset/refilled/restored, or were just reset as remediation.
6. Avoid false positives from non-quota meanings of reset: git reset, branch reset, cache reset, password reset, environment reset, session reset, config reset, reset button, reset command, or negated wording like “not going to reset”.
7. Alert only once per tweet ID. Use the included JSON state file or an equivalent persistent store.
8. Suppress repeated alerts for the same conversation/thread within `EVENT_DEDUPE_WINDOW_HOURS`, while allowing an optional later `completed_reset` phase update.
9. On the first run, default to priming state rather than reporting old tweets. Set `ALERT_ON_FIRST_RUN=true` only when the user explicitly wants a historical scan.
10. For alerts, include tweet text, reply context when used, author handle, tweet URL, category, confidence, score, matched terms, creation time, event key, and a concise rationale.

## Long-running lifecycle

The Automation is meant to keep running indefinitely. A successful reset alert does **not** disable the Automation and does **not** stop future checks.

State is split into two layers:

- `seen_tweets`: every fetched new tweet/reply is marked seen after classification, so the same tweet is not reported again on the next run.
- `reported_events`: high-confidence findings are grouped by `conversationId` or fallback tweet ID, so several target replies in the same thread do not spam Triage for the same reset event.

This means:

- if a reset announcement is detected at 10:00, the run reports it and records that tweet/event;
- the 10:30 run sees the same tweet but ignores it as already seen;
- if a genuinely new reset announcement appears later with a new tweet ID or a new event key, it is eligible for a new finding;
- if the same thread later gets a “done/reset complete” update, `EVENT_DEDUPE_ALLOW_PHASE_UPDATES=true` allows that completed phase to alert once.

Use a persistent `STATE_FILE_PATH`, preferably outside a repo worktree, such as `~/.cache/codex-reset-watch/state.json`.

## Files in this skill

- `.env.example`: copy/rename to `.env`, paste the TwitterAPI.io key, and keep the recommended defaults.
- `.gitignore`: ignores `.env`, local state files, virtualenvs, caches, and editor/OS files.
- `README.md`: English usage tutorial with links.
- `README.zh-CN.md`: Chinese usage tutorial with links.
- `scripts/check_once.py`: one-shot TwitterAPI.io `last_tweets` check; the recommended entrypoint for Codex Automation.
- `scripts/common.py`: compatibility exports for older imports.
- `scripts/codex_reset_watch/classifier.py`: reset classifier, confidence scoring, and LLM-review gating.
- `scripts/codex_reset_watch/config.py`: `.env` loading, typed env helpers, and API key lookup.
- `scripts/codex_reset_watch/models.py`: `TweetCandidate` and `MatchDecision` dataclasses.
- `scripts/codex_reset_watch/output.py`: Codex finding formatting and payload processing.
- `scripts/codex_reset_watch/state.py`: JSON file state store for tweet/event dedupe.
- `scripts/codex_reset_watch/text.py`: text normalization and matching helpers.
- `scripts/codex_reset_watch/tweets.py`: tweet extraction, URL building, reply detection, and thread context helpers.
- `scripts/self_test.py`: local deterministic tests.
- `references/automation-prompt.md`: durable Codex Automation prompt to paste into the app.
- `references/llm-judge-rubric.md`: rubric for judging `llm_review_candidates` inside Codex Automation.
- `references/deployment.md`: setup and operating notes.

## Recommended workflow

### 1. Configure `.env`

```bash
cp .env.example .env
```

Edit only the API key line to start:

```env
TWITTERAPI_IO_KEY=PASTE_YOUR_TWITTERAPI_IO_KEY_HERE
```

Keep these defaults unless you need to change them:

```env
TARGET_X_HANDLE=thsottiaux
STATE_FILE_PATH=~/.cache/codex-reset-watch/state.json
INCLUDE_REPLIES=true
HYDRATE_REPLY_CONTEXT=true
CODEX_LLM_REVIEW_ENABLED=true
```

### 2. Install dependencies

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

### 3. Run self-test

```bash
python scripts/self_test.py
```

### 4. Prime state once

Priming prevents historical tweets from being reported as new automation findings.

```bash
python scripts/check_once.py --prime-state --json
```

### 5. Test classification

```bash
python scripts/check_once.py --include-replies true --hydrate-reply-context true --dry-run --json
```

### 6. Create a Codex Automation

Use `references/automation-prompt.md`. A good cadence is every 30–60 minutes because reset posts are usually advance notices rather than instant events.

The Automation should run:

```bash
python scripts/check_once.py --include-replies true --hydrate-reply-context true --json
```

Then it should:

- report a Triage finding when `alerts > 0` and `finding_markdown` exists;
- if `llm_review_candidates` exist, judge them using `references/llm-judge-rubric.md` and report only the candidates that should alert;
- report command failures or repeated reply-context errors;
- archive the run with no finding when there are no alerts and no promoted review candidates.

## Output contract

`check_once.py --json` prints a JSON object. Important fields:

- `status`: `ok`, `primed`, or `state_updated`.
- `alerts`: number of new high-confidence matching tweets/replies.
- `has_finding`: boolean; true when the script already produced a deterministic finding.
- `finding_markdown`: ready-to-post Markdown for Codex Triage, present when high-confidence alerts exist.
- `llm_review_count`: number of ambiguous candidates the Automation LLM should judge.
- `llm_review_candidates`: structured ambiguous candidates with tweet text, reply context, score, matched terms, negative terms, and `finding_markdown_if_promoted`.
- `reply_context_fetches`: number of thread context API lookups used.
- `results`: per-tweet decisions with status, category, confidence, score, matched terms, negative terms, URL, event key, and reply metadata.

## Reply-aware language policy

Auto-alert examples:

- “Heads up, we’ll reset Codex usage limits later today.”
- “Planning to refill Codex weekly limits tomorrow.”
- “Codex rate limits will be reset after the deploy.”
- Reply: “yes, later today” with parent context “Will you reset Codex usage limits?”
- Reply: “that’s the plan” with parent context “Any quota reset for Codex users affected by the outage?”

LLM-review examples:

- Reply: “working on it” with context about exhausted Codex weekly quota.
- “Affected folks should be taken care of after the deploy” with nearby Codex limit context.
- “Not exactly a reset, but limits should be restored soon.”

Suppress examples:

- “git reset fixed my Codex branch.”
- “reset your Codex CLI config.”
- “No Codex usage reset planned.”
- “The reset button in the Codex UI is confusing.”
- Reply: “yes” with parent context about git reset, branch reset, config reset, password reset, token reset, or local environment reset.

## Maintenance notes

- Do not add external notification channels unless the user explicitly asks for them later.
- Keep `INCLUDE_REPLIES=true` and `HYDRATE_REPLY_CONTEXT=true` unless API cost becomes a problem.
- Keep the matcher conservative: high-confidence goes straight to Triage; medium/low goes through Codex Automation LLM review.
- Keep `STATE_FILE_PATH` persistent across automation runs.
- Keep the real API key only in `.env`; `.gitignore` prevents committing it, but the user is still responsible for not sharing it.
- If the target account becomes very active, reduce `CHECK_ONCE_MAX_PAGES` or raise `CODEX_LLM_REVIEW_MIN_SCORE` before reducing reply context support.
