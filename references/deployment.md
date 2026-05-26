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
requirements.txt
agents/
references/
scripts/
```

Do not commit:

```text
.env
env
.venv/
state.json
*.state.json
var/
.cache/
```

`.gitignore` is already configured for this.

## Install and test

Codex should run these setup commands for the user when possible. The user should only need to provide the API key.

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python scripts/self_test.py
```

## First-run state priming

Run once before enabling the schedule:

```bash
python scripts/check_once.py --prime-state --json
```

This prevents old tweets/replies from becoming new Codex Triage findings.

## Runtime command

Codex Automation should run:

```bash
python scripts/check_once.py --include-replies true --hydrate-reply-context true --json
```

Recommended cadence: every 30–60 minutes.

## State path

Use a persistent state file path:

```env
STATE_FILE_PATH=~/.cache/codex-reset-watch/state.json
```

Do not put the state file inside a disposable worktree. If the file is deleted, the script loses dedupe memory and may reprocess old tweets.

## Lifecycle

The Automation should keep running after a finding.

Expected behavior:

1. New reset-related tweet/reply appears.
2. Script outputs `has_finding=true` and `finding_markdown` or emits a candidate for LLM review.
3. Codex Automation posts a Triage finding if appropriate.
4. Script records the tweet/event in the JSON state file.
5. Later runs ignore the same tweet/event.
6. A future reset-related tweet/reply can still produce a new finding.

## Failure handling

Report a Codex Triage finding when:

- `check_once.py` exits non-zero;
- TwitterAPI.io returns an authentication or API error;
- repeated thread-context errors are likely causing missed detections;
- JSON output cannot be parsed.

Do not report when there are simply no new tweets or no matching candidates.

## Useful links

- Target profile: https://x.com/thsottiaux
- TwitterAPI.io docs: https://docs.twitterapi.io/introduction
- TwitterAPI.io authentication: https://docs.twitterapi.io/authentication
- TwitterAPI.io last tweets endpoint: https://docs.twitterapi.io/api-reference/endpoint/get_user_last_tweets
- TwitterAPI.io thread context endpoint: https://docs.twitterapi.io/api-reference/endpoint/get_tweet_thread_context
- Codex skills docs: https://developers.openai.com/codex/skills
- Codex automations docs: https://developers.openai.com/codex/app/automations
