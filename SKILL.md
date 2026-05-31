---
name: codex-reset-watchdog
description: Set up a Codex Automation-only, LLM-first check for pre-announcement public X items about OpenAI Codex usage, quota, or rate-limit resets. Uses zero-dependency Node.js plus the Dayclaw public source and notifies only through Codex Automation/Triage.
---

# Codex Reset Watchdog

Use this skill to implement or maintain a **Codex Automation-only** Dayclaw public-source check. The default target is `@thsottiaux` (`https://x.com/thsottiaux`) via `https://apitest.dayclaw.com/api/source/public/x/thsottiaux/items`. The skill reports a Codex Automation finding when the Automation LLM judges that an item likely announces, confirms, schedules, completes, or remediates a Codex usage/quota/rate-limit reset, quota refill, restored allowance, or related make-good.

This skill intentionally does **not** send Telegram, Discord, Slack, ntfy, email, or generic webhook messages. The notification surface is Codex itself: `scripts/check_once.mjs` emits structured JSON with `review_items`, and the scheduled Codex Automation posts a Triage finding only when its LLM sees a reset signal.

## Required setup shape

The repo is GitHub-ready. Keep the checked-in visible template and create a private local `env` or `.env` file only when you want to override defaults. Prefer `env` for beginner-facing setup because Finder hides dotfiles by default.

The repo includes `.codex/config.toml`, a project-level Codex permission profile named `codex-reset-watchdog-net`. Prefer that profile over full access. It allows workspace writes and outbound HTTPS only to `apitest.dayclaw.com`.

If an older `sandbox_mode` setting is active, Codex ignores permission profiles. In that compatibility path, use `.codex/rules/codex-reset-watchdog.rules`, which allows only `node scripts/check_once.mjs` to run outside the sandbox for network access.

The user does not need a paid API key. There are no Python or npm dependencies to install. The preferred user journey is one prompt copied from the README: Codex installs this skill from `https://github.com/thinkingjimmy/codex-reset-watchdog`, runs validation, primes state, creates an hourly Automation, and gives the user a concise setup summary.

When setting this project up for a user, Codex should run the Node self-test, prime state, dry-run the check, and create the Automation itself instead of asking the user to run terminal commands. Do not paste raw JSON in the final setup response unless the user asks for it.

Default config:

```env
TARGET_X_HANDLE=thsottiaux
DAYCLAW_SOURCE_ITEMS_URL=
STATE_FILE_PATH=var/state.json
INCLUDE_REPLIES=true
```

When `DAYCLAW_SOURCE_ITEMS_URL` is blank, `scripts/check_once.mjs` derives `https://apitest.dayclaw.com/api/source/public/x/<TARGET_X_HANDLE>/items`.

## Core behavior

1. Use `scripts/check_once.mjs` as the runtime entrypoint for scheduled monitoring.
2. Fetch the Dayclaw public source items endpoint. Do not require API keys, paid credentials, browser cookies, or manual X/Twitter browsing.
3. Emit **every new unseen item** as a `review_items` entry. Do not pre-filter the batch with deterministic reset rules.
4. Let the Codex Automation LLM judge announcement intent. Alert when the item says or strongly implies that Codex usage, quota, rate limits, weekly limits, caps, credits, allowance, or capacity will be reset/refilled/restored, or were just reset as remediation.
5. Avoid false positives from non-quota meanings of reset: git reset, branch reset, cache reset, password reset, environment reset, session reset, config reset, reset button, reset command, or negated wording like “not going to reset”.
6. Mark each emitted item ID as seen in the JSON state file so the same source item is not sent to the LLM every run.
7. Retry transient Dayclaw DNS/network failures inside the same run. If all retries fail, emit JSON `status=transient_network_error` and report on the threshold failure, then only every `OPERATIONAL_ERROR_REPORT_EVERY_FAILURES` failures while the outage continues.
8. When repeated `fetch failed` errors happen, run `node scripts/check_once.mjs --diagnose-network --json` from the same Automation working directory. If DNS or HTTPS reachability fails, treat it as a runtime network issue and keep the Automation active.
9. On the first run, default to priming state rather than reviewing old items. Set `ALERT_ON_FIRST_RUN=true` only when the user explicitly wants a historical scan.
10. For findings, the Automation LLM should include item text, author handle, URL, creation time, event key, and a concise rationale.

## Long-running lifecycle

The Automation is meant to keep running indefinitely. A successful reset alert does **not** disable the Automation and does **not** stop future checks.

State is split into practical layers:

- `seen_tweets`: every emitted new item is marked seen, so the same item is not reviewed again on the next run.
- `operational_failures`: transient Dayclaw network failures are counted so one-off DNS failures can be ignored while repeated failures still surface.

This means:

- if a reset announcement is detected at 10:00, the run emits it, the LLM reports it, and that item is marked seen;
- the 10:30 run ignores the same item as already seen;
- if a genuinely new reset announcement appears later with a new ID, it is eligible for a new LLM review and finding.

Use a persistent `STATE_FILE_PATH`. The default is `var/state.json` inside the project because Codex sandboxed runs can write there and `var/` is git-ignored. If a user-configured home-directory state path is not writable, the script falls back to `var/state.json` and reports that in the output `state` field.

## Files in this skill

- `.codex/config.toml`: project-level Codex permission profile; use this instead of full access.
- `.codex/rules/codex-reset-watchdog.rules`: compatibility rule for older workspace-write sandbox mode; allows only the runtime entrypoint.
- `env.example`: copy/rename to `env` only if you want local overrides.
- `.gitignore`: ignores `env`, `.env`, local state files, dependency folders, caches, and editor/OS files.
- `README.md`: English usage tutorial with links.
- `README.zh-CN.md`: Chinese usage tutorial with links.
- `scripts/check_once.mjs`: zero-dependency Node Dayclaw public-source check; the recommended entrypoint for Codex Automation.
- `scripts/self_test.mjs`: local deterministic tests with no network calls.
- `references/automation-prompt.md`: thin Codex Automation launcher prompt; durable processing rules live in this skill.
- `references/llm-judge-rubric.md`: rubric for judging `review_items` inside Codex Automation.
- `references/deployment.md`: setup and operating notes.

## Runtime source of truth

`SKILL.md` is the durable runtime contract. `references/automation-prompt.md` should stay thin: it tells Codex Automation to use this skill and run the standard command, but the processing rules live here.

Use `references/llm-judge-rubric.md` as the judging rubric for `review_items`. If behavior changes, update this skill first, then keep the README and thin Automation prompt aligned.

## Automation run protocol

Every scheduled run should follow this protocol:

1. Work from the Automation working directory that contains `SKILL.md` and `scripts/check_once.mjs`.
2. Run `node scripts/check_once.mjs --json`.
3. Parse the JSON. Never paste the full JSON object into the user-facing run result unless debugging was explicitly requested.
4. If the command fails before parseable JSON is produced, create one Codex Triage operational finding with sanitized command output.
5. If JSON `status` is `error`, create one operational finding with `operational_error.detail`.
6. If JSON `status` is `transient_network_error`, create an operational finding only when `operational_error.report_to_triage` is true. For repeated network/fetch failures, run `node scripts/check_once.mjs --diagnose-network --json` and include `dns`, `http`, `network_ok`, and `hint`.
7. If `api_warning` is present, create one operational finding with `source_url`, `fetched`, `api_warning`, and `api_pages`.
8. If `review_items` is non-empty, judge every item with `references/llm-judge-rubric.md`. Create a Triage finding only for new items that probably announce, confirm, schedule, complete, or remediate a Codex usage/quota/rate-limit reset, refill, restored allowance, or make-good.
9. Use `fetched_items` for the human summary even when `review_items` is empty because the state was already primed. Do not create Triage findings from already-seen `fetched_items`; they are context for the summary only.
10. Always end with a concise reset-focused run summary. The first sentence should answer the user’s actual question: `No Codex reset signal found` or `Codex reset signal found`.
11. Do not read or write automation memory for routine runs. Write memory only for setup completion, configuration changes, positive reset findings, reportable operational errors, or explicit user-requested diagnostics.

Run summaries should be short:

- explain the reset/no-reset conclusion using fetched item wording;
- include `new_items` / `review_count` and whether a Triage finding was created;
- mention source health only when useful;
- avoid process narration such as checking memory, choosing paths, or restating every command.

The Automation prompt cannot reliably know whether a run came from the Test button or the schedule. Use the same reset-focused summary for both.

## Reset judgment policy

Promote when the item probably says Codex usage limits, weekly limits, quotas, rate limits, caps, credits, allowance, or capacity will be reset, refilled, restored, replenished, topped up, raised, or made good.

Do not promote when “reset” refers to git, branches, local workspace, cache, CLI config, password, tokens, settings, database, environment, session, UI reset button, or when the item negates a reset.

## One-prompt install workflow

If the user asks Codex to install this skill from GitHub, use Codex's skill installation workflow when available. The source repo is:

```text
https://github.com/thinkingjimmy/codex-reset-watchdog
```

If a skill installer is unavailable, clone the repo and use the cloned directory as the Automation working directory. After installation, find the directory containing `SKILL.md` and `scripts/check_once.mjs`.

Then run:

```bash
node scripts/self_test.mjs
node scripts/check_once.mjs --prime-state --json
node scripts/check_once.mjs --dry-run --json
```

Summarize setup in human language:

- self-test pass/fail;
- source URL and whether Dayclaw is reachable;
- state file path and fallback status;
- Automation cadence and command;
- what the Codex Automations **Test** button should show.

Do not paste the full JSON output unless debugging.

When creating the Automation, inspect the current Automation tool schema or an existing Automation config before calling create/update. Current Codex versions may reject guessed parameters. Use an accepted hourly schedule shape, preferably iCalendar `DTSTART` plus `RRULE:FREQ=HOURLY;INTERVAL=1` when plain text cadence fails. Pass the working directory in the exact `cwd`/`cwds` shape the tool expects. Include `model` and `reasoning` if the tool rejects the request without them, even if they appear optional. After creation, read the Automation back and verify cadence, working directory, active status, command, and prompt.

## Maintainer workflow

### 1. Configure local env

The defaults already monitor `@thsottiaux`. Tell the user to duplicate `env.example` only when they want local overrides:

```env
TARGET_X_HANDLE=thsottiaux
DAYCLAW_SOURCE_ITEMS_URL=
STATE_FILE_PATH=var/state.json
INCLUDE_REPLIES=true
```

### 2. Confirm Codex permissions

Use the project-level `.codex/config.toml` profile:

```toml
default_permissions = "codex-reset-watchdog-net"
```

This profile grants workspace write access and allows outbound HTTPS only to `apitest.dayclaw.com`. Do not recommend full access as the default setup.

If Codex asks whether to trust the project configuration, inspect `.codex/config.toml` and trust it only when it matches this narrow profile. If the permissions selector offers `Custom (config.toml)`, select it.

### 3. Run self-test

```bash
node scripts/self_test.mjs
```

### 4. Prime state once

Priming prevents historical source items from being reported as new automation findings.

```bash
node scripts/check_once.mjs --prime-state --json
```

### 5. Test the LLM-first batch

```bash
node scripts/check_once.mjs --dry-run --json
```

Dry-run validates API reading and JSON parsing, but it does not prove state writes. A real Automation run writes `seen_tweets` and `operational_failures`; use `STATE_FILE_PATH=var/state.json` unless the Automation environment can write the custom path.

If the real Automation reports `transient_network_error` or `fetch failed`, diagnose the network path from the same working directory:

```bash
node scripts/check_once.mjs --diagnose-network --json
```

`dns.ok=false` or `http.reached=false` means the runtime cannot reach `apitest.dayclaw.com`; allow outbound HTTPS before debugging LLM behavior. Do not ask for full filesystem access merely to solve network reachability.

### 6. Create a Codex Automation

Use the **full contents** of `references/automation-prompt.md` as the Automation prompt. Keep that prompt thin; this skill contains the processing rules. The default cadence is hourly because reset posts are usually advance notices rather than instant events.

Use the project-level `.codex/config.toml` profile `codex-reset-watchdog-net`: write access to the current workspace plus outbound HTTPS to `apitest.dayclaw.com`. The script reads `env` / `.env`, writes `var/state.json`, and calls the Dayclaw public source; it does not require full filesystem access.

The Automation should run:

```bash
node scripts/check_once.mjs --json
```

Then it should:

- read `review_items` and judge every item using `references/llm-judge-rubric.md`;
- report a Triage finding only when an item probably announces or confirms a Codex usage/quota/rate-limit reset, refill, restored allowance, or remediation;
- if multiple items are clearly the same event, report only the strongest one;
- report command failures or repeated source errors when likely to cause missed detections;
- create no Triage finding when there are no review items, no positive LLM judgment, and no reportable operational errors;
- return a concise human run summary, including source reachability, state path, fetched/new counts, and reset finding status; do not rely on knowing whether the run came from the Test button or the schedule;
- do not write automation memory for routine `status=ok`, `new_items=0`, `review_count=0` runs.

Do not run `self_test`, `--prime-state`, or `--dry-run` during ordinary scheduled runs. They are setup/pre-enable checks only.

## Output contract

`check_once.mjs --json` prints one JSON object. Important fields:

- `status`: `ok`, `primed`, `state_updated`, `transient_network_error`, `network_diagnostic`, or `error`.
- `source_url`: Dayclaw public endpoint used for this run.
- `review_count`: number of new unseen items emitted for LLM review.
- `has_review_items`: boolean; true when `review_items` is non-empty.
- `review_items`: structured new items with text, URL, author, event key, created time, and reply metadata when available.
- `fetched_items`: read-only summary of the current fetched batch; use it for human reset/no-reset summaries, but create Triage findings only from qualifying new `review_items`.
- `api_pages`: API diagnostics with response keys, source URL, limit, and extracted item count.
- `api_warning`: present when the API succeeds but no item can be extracted.
- `fetch_strategy`: fixed to `dayclaw_public_items`.
- `state`: actual state file path, requested path, fallback status, and related warnings.
- `llm_instruction`: short instruction for judging this batch.
- `operational_error`: structured transient/runtime error data; report according to the Automation prompt.
- `results`: per-item handling details with statuses such as `queued_for_llm`, `already_seen`, and `ignored_reply`.

## Language policy

Report examples:

- “Heads up, we’ll reset Codex usage limits later today.”
- “Planning to refill Codex weekly limits tomorrow.”
- “Codex rate limits will be reset after the deploy.”
- “Affected folks should get their weekly allowance back after the incident.”
- “Not exactly a reset, but limits should be restored soon.”

Suppress examples:

- “git reset fixed my Codex branch.”
- “reset your Codex CLI config.”
- “No Codex usage reset planned.”
- “The reset button in the Codex UI is confusing.”

## Maintenance notes

- Do not add external notification channels unless the user explicitly asks for them later.
- Keep the script as a fact collector, not a semantic classifier. The LLM should be the judge.
- Keep `STATE_FILE_PATH` persistent across automation runs. Prefer the default `var/state.json` unless the Automation environment can write the custom path.
- Use `--diagnose-network --json` for repeated `fetch failed` errors. It separates network reachability from API/content issues.
- Do not recommend full access as the default fix. The minimum needed permissions are workspace write plus outbound HTTPS to `apitest.dayclaw.com`.
