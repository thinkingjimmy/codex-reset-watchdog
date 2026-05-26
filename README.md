# codex-reset-watch

[中文说明](README.zh-CN.md)

A Codex skill repo for monitoring [`@thsottiaux`](https://x.com/thsottiaux) with **Codex Automation**. It checks tweets and replies through TwitterAPI.io, detects likely Codex usage/quota/rate-limit reset announcements, and surfaces findings only through Codex Automation/Triage.

## What It Does

- Includes replies, because reset notices may be terse answers inside threads.
- Fetches reply thread context before classification.
- Uses deterministic rules for high-confidence alerts.
- Emits ambiguous candidates for Codex Automation's LLM review.
- Stores dedupe state in a small JSON file, not a database.
- Retries transient TwitterAPI.io DNS/network failures before reporting them.
- Avoids Telegram, Discord, Slack, email, ntfy, and generic webhooks.

## Skill Layout

The repo is shaped as a single Codex skill directory: `SKILL.md` at the root, optional `agents/`, `references/`, and `scripts/` beside it. If embedding this skill inside another repo, copy this directory to `.agents/skills/codex-reset-watch/`.

```text
codex-reset-watch/
  SKILL.md                         # Skill metadata and operating instructions
  README.md                        # English setup guide
  README.zh-CN.md                  # Chinese setup guide
  requirements.txt                 # Python dependencies
  env.example                      # Visible local configuration template
  .gitignore                       # Keeps secrets, caches, and state out of git
  agents/
    openai.yaml                    # Optional Codex skill display metadata
  references/
    automation-prompt.md           # Prompt for scheduled Codex Automation
    deployment.md                  # Operations checklist
    llm-judge-rubric.md            # LLM review rubric for ambiguous candidates
  scripts/
    check_once.py                  # One-shot Automation entrypoint
    self_test.py                   # Local deterministic tests
    common.py                      # Compatibility exports
    codex_reset_watch/
      classifier.py                # Reset classifier and review gating
      config.py                    # env loading, typed env helpers, API key lookup
      models.py                    # TweetCandidate and MatchDecision dataclasses
      output.py                    # Finding formatting and payload processing
      state.py                     # JSON state file dedupe store
      text.py                      # Text normalization and match helpers
      tweets.py                    # Tweet extraction, URLs, reply/thread helpers
```

## Setup

The only thing the user must supply is a TwitterAPI.io API key. Dependency installation, self-test, state priming, and dry runs can be delegated to Codex.

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
STATE_FILE_PATH=~/.cache/codex-reset-watch/state.json
INCLUDE_REPLIES=true
HYDRATE_REPLY_CONTEXT=true
CODEX_LLM_REVIEW_ENABLED=true
```

Ask Codex to finish setup:

```text
Install dependencies for codex-reset-watch, run self_test, then prime state. Do not print my API key.
```

Codex should run:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python scripts/self_test.py
python scripts/check_once.py --prime-state --json
```

## Manual Checks

Dry-run classification without changing state:

```bash
python scripts/check_once.py --include-replies true --hydrate-reply-context true --dry-run --json
```

Prime state again if needed:

```bash
python scripts/check_once.py --prime-state --json
```

## Automation

Create a Codex Automation using [`references/automation-prompt.md`](references/automation-prompt.md). Recommended cadence: every 30-60 minutes.

Runtime command:

```bash
python scripts/check_once.py --include-replies true --hydrate-reply-context true --json
```

## State And Dedupe

`STATE_FILE_PATH` points to a persistent JSON file:

- `seen_tweets` prevents the same tweet/reply from alerting every run.
- `reported_events` suppresses repeated alerts from the same conversation/thread for a short window.
- Future reset posts with a new tweet ID or event key can still alert.
- `EVENT_DEDUPE_ALLOW_PHASE_UPDATES=true` allows one later `completed_reset` update in the same thread.

Keep the state file outside disposable worktrees:

```env
STATE_FILE_PATH=~/.cache/codex-reset-watch/state.json
```

## Output Contract

`check_once.py --json` prints one JSON object. Important fields:

- `alerts`: number of deterministic high-confidence findings.
- `has_finding`: whether `finding_markdown` should be posted to Codex Triage.
- `finding_markdown`: ready-to-post Markdown when deterministic alerts exist.
- `llm_review_candidates`: ambiguous candidates for Codex Automation's LLM.
- `reply_context_fetches`: number of TwitterAPI.io thread-context lookups.
- `operational_error`: present for transient TwitterAPI.io DNS/network failures; report only when `report_to_triage` is true.
- `results`: per-tweet classification details.

Transient DNS failures for `api.twitterapi.io` are retried inside the same run. If all retries fail, the script exits cleanly with `status: "transient_network_error"` so one-off network blips do not spam Triage.

## Links

- Target profile: <https://x.com/thsottiaux>
- TwitterAPI.io docs: <https://docs.twitterapi.io/introduction>
- TwitterAPI.io authentication: <https://docs.twitterapi.io/authentication>
- TwitterAPI.io `last_tweets`: <https://docs.twitterapi.io/api-reference/endpoint/get_user_last_tweets>
- TwitterAPI.io `thread_context`: <https://docs.twitterapi.io/api-reference/endpoint/get_tweet_thread_context>
- Codex Skills docs: <https://developers.openai.com/codex/skills>
- Codex Automations docs: <https://developers.openai.com/codex/app/automations>
