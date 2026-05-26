# Deployment and operations

This repo is designed to be GitHub-safe and easy for a user to run.

## What the user edits

Users should edit only their local `env` or `.env` file. Prefer `env` for beginner-facing setup because it is visible in Finder:

1. Open the folder in VS Code.
2. Duplicate `env.example`.
3. Rename the copy to `env`.
4. Replace only the API key placeholder.

Then replace:

```env
TWITTERAPI_IO_KEY=PASTE_YOUR_TWITTERAPI_IO_KEY_HERE
```

with their real TwitterAPI.io key.

The target account is already set:

```env
TARGET_X_HANDLE=thsottiaux
```

The full profile URL is `https://x.com/thsottiaux`, but the local env file should contain only the handle.

## What should be committed

Commit these files:

```text
env.example
.gitignore
README.md
README.zh-CN.md
SKILL.md
agents/
references/
scripts/
```

Do not commit:

```text
.env
env
node_modules/
state.json
*.state.json
var/
.cache/
```

`.gitignore` is already configured for this.

## Install and test

There is no install step. Codex should run this setup check for the user when possible:

```bash
node scripts/self_test.mjs
```

## First-run state priming

Run once before enabling the schedule:

```bash
node scripts/check_once.mjs --prime-state --json
```

This prevents old tweets/replies from becoming new Codex Triage findings.

## Runtime command

Codex Automation should run:

```bash
node scripts/check_once.mjs --include-replies true --hydrate-reply-context true --json
```

Recommended cadence: every 30-60 minutes.

## State path

Use a persistent state file path:

```env
STATE_FILE_PATH=~/.cache/codex-reset-watchdog/state.json
```

Do not put the state file inside a disposable worktree. If the file is deleted, the script loses dedupe memory and may reprocess old tweets.

## Lifecycle

The Automation should keep running after a finding.

Expected behavior:

1. New tweet/reply appears.
2. Script outputs it in `review_items` with any fetched reply context.
3. Codex Automation LLM judges whether it signals a Codex reset/refill/restored allowance/remediation.
4. Automation posts a Triage finding only for positive judgments.
5. Script records the tweet ID in the JSON state file.
6. Later runs ignore the same tweet.
7. A future tweet/reply with a new tweet ID can still produce a new finding.

## Failure handling

Report a Codex Triage finding when:

- `check_once.mjs` exits non-zero;
- TwitterAPI.io returns an authentication or API error;
- JSON `status` is `error`;
- JSON `status` is `transient_network_error` and `operational_error.report_to_triage` is true;
- repeated thread-context errors are likely causing missed detections;
- JSON output cannot be parsed.

Do not report one-off DNS/network failures. The script retries transient TwitterAPI.io connection failures inside the same run, then records consecutive failures in `STATE_FILE_PATH`.

Useful knobs:

```env
TWITTERAPI_IO_RETRY_ATTEMPTS=3
TWITTERAPI_IO_RETRY_SLEEP_SECONDS=5
TWITTERAPI_IO_RETRY_MAX_SLEEP_SECONDS=30
TRANSIENT_NETWORK_ERRORS_EXIT_ZERO=true
OPERATIONAL_ERROR_REPORT_THRESHOLD=3
```

Do not report when there are simply no new tweets, no positive LLM judgments, or a non-reportable transient network status.

## Useful links

- Target profile: https://x.com/thsottiaux
- TwitterAPI.io docs: https://docs.twitterapi.io/introduction
- TwitterAPI.io authentication: https://docs.twitterapi.io/authentication
- TwitterAPI.io last tweets endpoint: https://docs.twitterapi.io/api-reference/endpoint/get_user_last_tweets
- TwitterAPI.io thread context endpoint: https://docs.twitterapi.io/api-reference/endpoint/get_tweet_thread_context
- Codex skills docs: https://developers.openai.com/codex/skills
- Codex automations docs: https://developers.openai.com/codex/app/automations
