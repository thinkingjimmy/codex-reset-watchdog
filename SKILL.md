---
name: codex-reset-watchdog
description: Set up a Codex Automation-only, LLM-first check for pre-announcement tweets and replies about OpenAI Codex usage, quota, or rate-limit resets. Uses zero-dependency Node.js plus TwitterAPI.io and notifies only through Codex Automation/Triage.
---

# Codex Reset Watchdog

Use this skill to implement or maintain a **Codex Automation-only** TwitterAPI.io check. The default target is `@thsottiaux` (`https://x.com/thsottiaux`). The skill reports a Codex Automation finding when the Automation LLM judges that a tweet or reply likely announces, confirms, schedules, completes, or remediates a Codex usage/quota/rate-limit reset, quota refill, restored allowance, or related make-good.

This skill intentionally does **not** send Telegram, Discord, Slack, ntfy, email, or generic webhook messages. The notification surface is Codex itself: `scripts/check_once.mjs` emits structured JSON with `review_items`, and the scheduled Codex Automation posts a Triage finding only when its LLM sees a reset signal.

## Required setup shape

The repo is GitHub-ready. Keep the checked-in visible template and create a private local `env` or `.env` file. Prefer `env` for beginner-facing setup because Finder hides dotfiles by default.

The repo includes `.codex/config.toml`, a project-level Codex permission profile named `codex-reset-watchdog-net`. Prefer that profile over full access. It allows workspace writes and outbound HTTPS only to `api.twitterapi.io`.

If an older `sandbox_mode` setting is active, Codex ignores permission profiles. In that compatibility path, use `.codex/rules/codex-reset-watchdog.rules`, which allows only `node scripts/check_once.mjs` to run outside the sandbox for network access.

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
8. Retry transient TwitterAPI.io DNS/network failures inside the same run. If all retries fail, emit JSON `status=transient_network_error` and report on the threshold failure, then only every `OPERATIONAL_ERROR_REPORT_EVERY_FAILURES` failures while the outage continues.
9. When repeated `fetch failed` errors happen, run `node scripts/check_once.mjs --diagnose-network --json` from the same Automation working directory. If DNS or HTTPS reachability fails, treat it as a runtime network issue and keep the Automation active.
10. On the first run, default to priming state rather than reviewing old tweets. Set `ALERT_ON_FIRST_RUN=true` only when the user explicitly wants a historical scan.
11. For findings, the Automation LLM should include tweet text, reply context when used, author handle, tweet URL, creation time, event key, and a concise rationale.

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

Use a persistent `STATE_FILE_PATH`. The default is `var/state.json` inside the project because Codex sandboxed runs can write there and `var/` is git-ignored. If a user-configured home-directory state path is not writable, the script falls back to `var/state.json` and reports that in the output `state` field.

## Files in this skill

- `.codex/config.toml`: project-level Codex permission profile; use this instead of full access.
- `.codex/README.md`: local map for Codex configuration files.
- `.codex/rules/codex-reset-watchdog.rules`: compatibility rule for older workspace-write sandbox mode; allows only the runtime entrypoint.
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

## Automation prompt source of truth

When creating or updating the Codex Automation, use the full contents of `references/automation-prompt.md` as the Automation prompt. Do not summarize, freestyle, or replace it with an improvised prompt. The README instruction is only a user-facing wrapper that asks Codex to create the Automation; the durable runtime contract lives in `references/automation-prompt.md`.

Use `references/llm-judge-rubric.md` as the judging rubric referenced by that prompt. If behavior changes, update these reference files first, then update README/SKILL descriptions to match.

## Recommended workflow

### 1. Configure local env

Tell the user to open the folder in VS Code, duplicate `env.example`, rename the copy to `env`, and edit only the API key line:

```env
TWITTERAPI_IO_KEY=PASTE_YOUR_TWITTERAPI_IO_KEY_HERE
```

Keep these defaults unless you need to change them:

```env
TARGET_X_HANDLE=thsottiaux
STATE_FILE_PATH=var/state.json
INCLUDE_REPLIES=true
HYDRATE_REPLY_CONTEXT=true
```

### 2. Confirm Codex permissions

Use the project-level `.codex/config.toml` profile:

```toml
default_permissions = "codex-reset-watchdog-net"
```

This profile grants workspace write access and allows outbound HTTPS only to `api.twitterapi.io`. Do not recommend full access as the default setup.

If Codex asks whether to trust the project configuration, inspect `.codex/config.toml` and trust it only when it matches this narrow profile. If the permissions selector offers `Custom (config.toml)`, select it.

If the runtime still reports `dns.ok=false` under workspace-write, assume an older `sandbox_mode` layer is winning. Use the project-local rule `.codex/rules/codex-reset-watchdog.rules` as the compatibility fallback before considering full access.

For existing Automations, verify the configured working directory contains the latest `.codex/config.toml` and `.codex/rules/codex-reset-watchdog.rules`. If the Automation points to an older downloaded test copy, sync `.codex/` into that copy or recreate the Automation against the updated repo.

### 3. Run self-test

```bash
node scripts/self_test.mjs
```

### 4. Prime state once

Priming prevents historical tweets from being reported as new automation findings.

```bash
node scripts/check_once.mjs --prime-state --json
```

### 5. Test the LLM-first batch

```bash
node scripts/check_once.mjs --include-replies true --hydrate-reply-context true --dry-run --json
```

Dry-run validates API reading and JSON parsing, but it does not prove state writes. A real Automation run writes `seen_tweets` and `operational_failures`; use `STATE_FILE_PATH=var/state.json` unless the Automation environment can write the custom path.

If the real Automation reports `transient_network_error` or `fetch failed`, diagnose the network path from the same working directory:

```bash
node scripts/check_once.mjs --diagnose-network --json
```

`dns.ok=false` or `http.reached=false` means the runtime cannot reach `api.twitterapi.io`; allow outbound HTTPS before debugging LLM behavior. Do not ask for full filesystem access merely to solve network reachability.

### 6. Create a Codex Automation

Use the **full contents** of `references/automation-prompt.md` as the Automation prompt. A good cadence is every 1 hour because reset posts are usually advance notices rather than instant events.

Use the project-level `.codex/config.toml` profile `codex-reset-watchdog-net`: write access to the current workspace plus outbound HTTPS to `api.twitterapi.io`. The script reads `env` / `.env`, writes `var/state.json`, and calls TwitterAPI.io; it does not require full filesystem access.

If the current Codex version cannot apply the project-level profile and only reaches the network after the user enables full access, explain the tradeoff clearly. Treat full access as a temporary fallback, not the recommended path. Some skills may work without full access because they use built-in tools, browser plugins, MCP connectors, or hosted capabilities instead of local `node fetch`.

The Automation should run:

```bash
node scripts/check_once.mjs --include-replies true --hydrate-reply-context true --json
```

Then it should:

- read `review_items` and judge every item using `references/llm-judge-rubric.md`;
- report a Triage finding only when an item probably announces or confirms a Codex usage/quota/rate-limit reset, refill, restored allowance, or remediation;
- if multiple items are clearly the same thread/event, report only the strongest one;
- report command failures or repeated reply-context errors when likely to cause missed detections;
- archive the run with no finding when there are no review items, no positive LLM judgment, and no reportable operational errors;
- do not write automation memory for routine `status=ok`, `new_items=0`, `review_count=0` runs.

Do not run `self_test`, `--prime-state`, or `--dry-run` during ordinary scheduled runs. They are setup/pre-enable checks only.

## Output contract

`check_once.mjs --json` prints one JSON object. Important fields:

- `status`: `ok`, `primed`, `state_updated`, `transient_network_error`, `network_diagnostic`, or `error`.
- `review_count`: number of new unseen tweets/replies emitted for LLM review.
- `has_review_items`: boolean; true when `review_items` is non-empty.
- `review_items`: structured new tweets/replies with text, reply context, URL, author, event key, created time, and reply metadata.
- `api_pages`: per-page API diagnostics with response keys, status/message, and extracted tweet count.
- `api_warning`: present when the API succeeds but no tweet/reply can be extracted.
- `state`: actual state file path, requested path, fallback status, and related warnings.
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
- Keep `STATE_FILE_PATH` persistent across automation runs. Prefer the default `var/state.json` unless the Automation environment can write the custom path.
- Use `--diagnose-network --json` for repeated `fetch failed` errors. It separates network reachability from API/auth/content issues.
- Do not recommend full access as the default fix. The minimum needed permissions are workspace write plus outbound HTTPS to `api.twitterapi.io`.
- Keep the real API key only in `env` or `.env`; `.gitignore` prevents committing it, but the user is still responsible for not sharing it.
- If the target account becomes very active, reduce `CHECK_ONCE_MAX_PAGES` or `THREAD_CONTEXT_MAX_FETCHES` before disabling reply context support.
