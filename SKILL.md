---
name: codex-reset-watchdog
description: Set up a Codex Automation-only, LLM-first check for pre-announcement tweets and replies about OpenAI Codex usage, quota, or rate-limit resets. Uses zero-dependency Node.js plus TwitterAPI.io and notifies only through Codex Automation/Triage.
---

# Codex Reset Watchdog

Use this skill to implement or maintain a **Codex Automation-only** TwitterAPI.io check. The default target is `@thsottiaux` (`https://x.com/thsottiaux`). The skill reports a Codex Automation finding when the Automation LLM judges that a tweet or reply likely announces, confirms, schedules, completes, or remediates a Codex usage/quota/rate-limit reset, quota refill, restored allowance, or related make-good.

This skill intentionally does **not** send Telegram, Discord, Slack, ntfy, email, or generic webhook messages. The notification surface is Codex itself: `scripts/check_once.mjs` emits structured JSON with `review_items`, and the scheduled Codex Automation posts a Triage finding only when its LLM sees a reset signal.

## Required setup shape

The repo is GitHub-ready. Keep the checked-in visible template and create a private local `env` or `.env` file. Prefer `env` for beginner-facing setup because Finder hides dotfiles by default.

The user should only need to supply the TwitterAPI.io API key. There are no Python or npm dependencies to install. When setting this project up for a user, Codex should run the Node self-test, prime state, and dry-run the check itself instead of asking the user to run terminal commands.

Ask the user to duplicate `env.example`, rename the copy to `env`, and edit only this line:

```env
TWITTERAPI_IO_KEY=PASTE_YOUR_TWITTERAPI_IO_KEY_HERE
```

The default target is already set:

```env
TARGET_X_HANDLE=thsottiaux
```

`env` and `.env` are ignored by `.gitignore`; never commit the real key or paste it into the Automation prompt.

To get a TwitterAPI.io key, direct the user to sign in at <https://twitterapi.io/>, open <https://twitterapi.io/dashboard>, and copy the API key shown on the dashboard homepage.

## Core behavior

1. Use `scripts/check_once.mjs` as the runtime entrypoint for scheduled monitoring.
2. Include replies by default. Reset announcements may appear as replies rather than top-level tweets, so `INCLUDE_REPLIES=true` is the default.
3. For new replies, fetch real thread context by default. This catches terse replies such as “yes, later today” when the parent tweet asks about a Codex usage reset.
4. Emit **every new unseen tweet/reply** as a `review_items` entry. Do not pre-filter the batch with deterministic reset rules.
5. Let the Codex Automation LLM judge announcement intent. Alert when the tweet/reply says or strongly implies that Codex usage, quota, rate limits, weekly limits, caps, credits, allowance, or capacity will be reset/refilled/restored, or were just reset as remediation.
6. The LLM should avoid false positives from non-quota meanings of reset: git reset, branch reset, cache reset, password reset, environment reset, session reset, config reset, reset button, reset command, or negated wording like “not going to reset”.
7. Mark each emitted tweet ID as seen in the JSON state file so the same tweet/reply is not sent to the LLM every run.
8. Retry transient TwitterAPI.io DNS/network failures inside the same run. If all retries fail, emit JSON `status=transient_network_error` and report only after `OPERATIONAL_ERROR_REPORT_THRESHOLD` consecutive failures.
9. On the first run, default to priming state rather than reviewing old tweets. Set `ALERT_ON_FIRST_RUN=true` only when the user explicitly wants a historical scan.
10. For findings, the Automation LLM should include tweet text, reply context when used, author handle, tweet URL, creation time, event key, and a concise rationale.

## Long-running lifecycle

The Automation is meant to keep running indefinitely. A successful reset alert does **not** disable the Automation and does **not** stop future checks.

State is split into two practical layers:

- `seen_tweets`: every emitted new tweet/reply is marked seen, so the same tweet is not reviewed again on the next run.
- `operational_failures`: transient TwitterAPI.io network failures are counted so one-off DNS failures can be ignored while repeated failures still surface.

This means:

- if a reset announcement is detected at 10:00, the run emits it, the LLM reports it, and that tweet is marked seen;
- the 10:30 run ignores the same tweet as already seen;
- if a genuinely new reset announcement appears later with a new tweet ID, it is eligible for a new LLM review and finding;
- if the same thread later gets a “done/reset complete” update as a new reply, it can still be reviewed once.

Use a persistent `STATE_FILE_PATH`, preferably outside a repo worktree, such as `~/.cache/codex-reset-watchdog/state.json`.

## Files in this skill

- `env.example`: copy/rename to `env`, paste the TwitterAPI.io key, and keep the recommended defaults.
- `.gitignore`: ignores `env`, `.env`, local state files, dependency folders, caches, and editor/OS files.
- `README.md`: English usage tutorial with links.
- `README.zh-CN.md`: Chinese usage tutorial with links.
- `scripts/README.md`: runtime module map for entrypoints and boundaries.
- `scripts/check_once.mjs`: zero-dependency Node TwitterAPI.io `last_tweets` check; the recommended entrypoint for Codex Automation.
- `scripts/self_test.mjs`: local deterministic tests with no network calls.
- `references/automation-prompt.md`: durable Codex Automation prompt to paste into the app.
- `references/llm-judge-rubric.md`: rubric for judging `review_items` inside Codex Automation.
- `references/deployment.md`: setup and operating notes.

## Recommended workflow

### 1. Configure local env

Tell the user to open the folder in VS Code, duplicate `env.example`, rename the copy to `env`, and edit only the API key line:

```env
TWITTERAPI_IO_KEY=PASTE_YOUR_TWITTERAPI_IO_KEY_HERE
```

Keep these defaults unless you need to change them:

```env
TARGET_X_HANDLE=thsottiaux
STATE_FILE_PATH=~/.cache/codex-reset-watchdog/state.json
INCLUDE_REPLIES=true
HYDRATE_REPLY_CONTEXT=true
```

### 2. Run self-test

```bash
node scripts/self_test.mjs
```

### 3. Prime state once

Priming prevents historical tweets from being reported as new automation findings.

```bash
node scripts/check_once.mjs --prime-state --json
```

### 4. Test the LLM-first batch

```bash
node scripts/check_once.mjs --include-replies true --hydrate-reply-context true --dry-run --json
```

### 5. Create a Codex Automation

Use `references/automation-prompt.md`. A good cadence is every 30-60 minutes because reset posts are usually advance notices rather than instant events.

The Automation should run:

```bash
node scripts/check_once.mjs --include-replies true --hydrate-reply-context true --json
```

Then it should:

- read `review_items` and judge every item using `references/llm-judge-rubric.md`;
- report a Triage finding only when an item probably announces or confirms a Codex usage/quota/rate-limit reset, refill, restored allowance, or remediation;
- if multiple items are clearly the same thread/event, report only the strongest one;
- report command failures or repeated reply-context errors when likely to cause missed detections;
- archive the run with no finding when there are no review items, no positive LLM judgment, and no reportable operational errors.

## Output contract

`check_once.mjs --json` prints one JSON object. Important fields:

- `status`: `ok`, `primed`, `state_updated`, `transient_network_error`, or `error`.
- `review_count`: number of new unseen tweets/replies emitted for LLM review.
- `has_review_items`: boolean; true when `review_items` is non-empty.
- `review_items`: structured new tweets/replies with text, reply context, URL, author, event key, created time, and reply metadata.
- `api_pages`: per-page API diagnostics with response keys, status/message, and extracted tweet count.
- `api_warning`: present when the API succeeds but no tweet/reply can be extracted.
- `llm_instruction`: short instruction for judging this batch.
- `reply_context_fetches`: number of thread context API lookups used.
- `operational_error`: structured transient/runtime error data; report according to the Automation prompt.
- `results`: per-tweet handling details with statuses such as `queued_for_llm`, `already_seen`, and `ignored_repost`.

## Reply-aware language policy

Report examples:

- “Heads up, we’ll reset Codex usage limits later today.”
- “Planning to refill Codex weekly limits tomorrow.”
- “Codex rate limits will be reset after the deploy.”
- Reply: “yes, later today” with parent context “Will you reset Codex usage limits?”
- Reply: “that’s the plan” with parent context “Any quota reset for Codex users affected by the outage?”
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
- Keep the script as a fact collector, not a semantic classifier. The LLM should be the judge.
- Keep `STATE_FILE_PATH` persistent across automation runs.
- Keep the real API key only in `env` or `.env`; `.gitignore` prevents committing it, but the user is still responsible for not sharing it.
- If the target account becomes very active, reduce `CHECK_ONCE_MAX_PAGES` or `THREAD_CONTEXT_MAX_FETCHES` before disabling reply context support.
