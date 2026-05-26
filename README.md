# codex-reset-watchdog

[中文说明](README.zh-CN.md)

A zero-dependency Codex skill repo for monitoring [`@thsottiaux`](https://x.com/thsottiaux) with **Codex Automation**. It fetches new tweets and replies through TwitterAPI.io, emits every unseen item to the Automation LLM, and surfaces findings only through Codex Automation/Triage when the LLM sees a Codex usage/quota/rate-limit reset signal.

## What It Does

- Runs with Node.js only; no Python, pip, venv, npm install, or build step.
- Includes replies, because reset notices may be terse answers inside threads.
- Fetches reply thread context so the LLM can understand replies like “yes, later today”.
- Sends all new unseen tweets/replies to the Automation LLM, not only rule-selected candidates.
- Stores dedupe state in a small JSON file, not a database.
- Retries transient TwitterAPI.io DNS/network failures before reporting them.
- Avoids Telegram, Discord, Slack, email, ntfy, and generic webhooks.

## Skill Layout

The repo is shaped as a single Codex skill directory: `SKILL.md` at the root, optional `agents/`, `references/`, and `scripts/` beside it. If embedding this skill inside another repo, copy this directory to `.agents/skills/codex-reset-watchdog/`.

```text
codex-reset-watchdog/
  SKILL.md                         # Skill metadata and operating instructions
  README.md                        # English setup guide
  README.zh-CN.md                  # Chinese setup guide
  env.example                      # Visible local configuration template
  .gitignore                       # Keeps secrets, caches, and state out of git
  agents/
    openai.yaml                    # Optional Codex skill display metadata
  references/
    automation-prompt.md           # Prompt for scheduled Codex Automation
    deployment.md                  # Operations checklist
    llm-judge-rubric.md            # LLM review rubric for review_items
  scripts/
    README.md                      # Runtime module map
    check_once.mjs                 # Zero-dependency Automation entrypoint
    self_test.mjs                  # Local deterministic tests
```

## Setup

The only thing the user must supply is a TwitterAPI.io API key. There are no project dependencies to install.

Beginner-friendly setup:

1. Open this folder in VS Code.
2. Open the visible file `env.example`.
3. Duplicate it and rename the copy to `env`.
4. Replace only the API key placeholder.

The script also supports `.env`, but files starting with `.` are hidden by default in macOS Finder. `env` is easier for non-technical users.

Edit only the API key line to start:

```env
TWITTERAPI_IO_KEY=PASTE_YOUR_TWITTERAPI_IO_KEY_HERE
```

Get a TwitterAPI.io key:

1. Open <https://twitterapi.io/>.
2. Sign up or log in.
3. Open <https://twitterapi.io/dashboard>.
4. Copy the API key shown on the dashboard homepage.
5. Paste it into local `env`.

Recommended defaults:

```env
TARGET_X_HANDLE=thsottiaux
STATE_FILE_PATH=~/.cache/codex-reset-watchdog/state.json
INCLUDE_REPLIES=true
HYDRATE_REPLY_CONTEXT=true
```

Ask Codex to finish setup:

```text
Run codex-reset-watchdog self_test, then prime state. Do not print my API key.
```

Codex should run:

```bash
node scripts/self_test.mjs
node scripts/check_once.mjs --prime-state --json
```

## Manual Checks

Dry-run without changing state:

```bash
node scripts/check_once.mjs --include-replies true --hydrate-reply-context true --dry-run --json
```

Prime state again if needed:

```bash
node scripts/check_once.mjs --prime-state --json
```

## Automation

Create a Codex Automation using [`references/automation-prompt.md`](references/automation-prompt.md). Recommended cadence: every 30-60 minutes.

Runtime command:

```bash
node scripts/check_once.mjs --include-replies true --hydrate-reply-context true --json
```

## State And Dedupe

`STATE_FILE_PATH` points to a persistent JSON file:

- `seen_tweets` prevents the same tweet/reply from being sent to the LLM every run.
- `operational_failures` tracks consecutive transient TwitterAPI.io network failures.
- Future reset posts with a new tweet ID can still be reviewed and reported.

Keep the state file outside disposable worktrees:

```env
STATE_FILE_PATH=~/.cache/codex-reset-watchdog/state.json
```

## Output Contract

`check_once.mjs --json` prints one JSON object. Important fields:

- `status`: `ok`, `primed`, `state_updated`, `transient_network_error`, or `error`.
- `review_count`: number of new unseen tweets/replies emitted for LLM review.
- `has_review_items`: whether `review_items` is non-empty.
- `review_items`: all new unseen tweets/replies with text, URL, author, reply metadata, event key, and fetched reply context.
- `llm_instruction`: short instruction for the Automation LLM.
- `reply_context_fetches`: number of TwitterAPI.io thread-context lookups.
- `operational_error`: present for transient/network/runtime failures; report only when instructed by the Automation prompt.
- `results`: per-tweet handling details such as `queued_for_llm`, `already_seen`, or `ignored_repost`.

Transient DNS failures for `api.twitterapi.io` are retried inside the same run. If all retries fail, the script exits cleanly with `status: "transient_network_error"` so one-off network blips do not spam Triage.

## Links

- Target profile: <https://x.com/thsottiaux>
- TwitterAPI.io docs: <https://docs.twitterapi.io/introduction>
- TwitterAPI.io authentication: <https://docs.twitterapi.io/authentication>
- TwitterAPI.io `last_tweets`: <https://docs.twitterapi.io/api-reference/endpoint/get_user_last_tweets>
- TwitterAPI.io `thread_context`: <https://docs.twitterapi.io/api-reference/endpoint/get_tweet_thread_context>
- Codex Skills docs: <https://developers.openai.com/codex/skills>
- Codex Automations docs: <https://developers.openai.com/codex/app/automations>
