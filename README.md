# codex-reset-watchdog

[中文说明](README.zh-CN.md)

A zero-dependency Codex skill repo for monitoring [`@thsottiaux`](https://x.com/thsottiaux) with **Codex Automation**. It fetches new tweets and replies through TwitterAPI.io, emits every unseen item to the Automation LLM, and surfaces findings only through Codex Automation/Triage when the LLM sees a Codex usage/quota/rate-limit reset signal.

## What It Does

- Works out of the box: users provide only an API key, with no Python, dependency install, or build step.
- Catches terse replies: answers like “yes, later today” are judged with their thread context.
- Gives the LLM the full new batch: every unseen tweet/reply is reviewed, reducing rule prefilter misses.
- Stays quiet when nothing matters: no reset/refill/restored-allowance signal means no finding.
- Avoids repeat noise: the same tweet/reply is handled once, while future new posts remain eligible.
- Handles network blips calmly: transient DNS/network failures do not immediately spam Triage.
- Keeps one notification surface: findings appear only in Codex Automation/Triage, not external channels.

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

## What You Need To Do

Download this skill folder, then add a TwitterAPI.io API key. There are no project dependencies to install.

Start from GitHub:

1. Open this project's GitHub page.
2. Click the green `Code` button.
3. Choose `Download ZIP`.
4. Unzip the downloaded file.
5. Open the unzipped `codex-reset-watchdog` folder in VS Code or Codex.
6. Open the visible file `env.example`.
7. Duplicate `env.example` and rename the copy to `env`.
8. Open `env` and replace only this placeholder line:

```env
TWITTERAPI_IO_KEY=PASTE_YOUR_TWITTERAPI_IO_KEY_HERE
```

## Get An API Key

1. Open <https://twitterapi.io/>.
2. Sign up or log in.
3. Open <https://twitterapi.io/dashboard>.
4. Copy the API key shown on the dashboard homepage.
5. Paste it into the local `env` file:

```env
TWITTERAPI_IO_KEY=your_key_goes_here
```

Do not paste the API key into chat, and do not commit it to GitHub.

## Create The Automation In Codex

After filling `env`, open Codex, use Codex to open this project folder, then send this in Chat:

```text
Use the codex-reset-watchdog skill in the current folder to create a Codex Automation.

Before creating it:
1. Run node scripts/self_test.mjs
2. Run node scripts/check_once.mjs --prime-state --json to initialize state

Then create an Automation that runs every 1 hour:
- Automation prompt: use the full contents of references/automation-prompt.md directly; do not improvise or rewrite it
- working directory: the current codex-reset-watchdog folder
- command: node scripts/check_once.mjs --include-replies true --hydrate-reply-context true --json
- read review_items from the JSON output on every run
- judge them with references/llm-judge-rubric.md
- post a Codex Triage finding only for Codex usage/quota/rate-limit reset, refill, restored allowance, or remediation signals
- archive silently when there is no signal
- do not print, copy, or write my API key anywhere
```

Codex will verify the script, prime the current tweets/replies as the baseline, then create the scheduled Automation using the full contents of [`references/automation-prompt.md`](references/automation-prompt.md). The LLM judging rubric lives in [`references/llm-judge-rubric.md`](references/llm-judge-rubric.md). These files are the source of truth; do not let Codex invent a different runtime prompt.

## State And Dedupe

`STATE_FILE_PATH` points to a persistent JSON file:

- `seen_tweets` prevents the same tweet/reply from being sent to the LLM every run.
- `operational_failures` tracks consecutive transient TwitterAPI.io network failures.
- Future reset posts with a new tweet ID can still be reviewed and reported.

Default state file location:

```env
STATE_FILE_PATH=var/state.json
```

`var/` is ignored by git and writable in Codex sandboxed runs. If you set a custom home-directory path and Codex cannot write it, the script falls back to `var/state.json` and reports that in the `state` field.

## Output Contract

`check_once.mjs --json` prints one JSON object. Important fields:

- `status`: `ok`, `primed`, `state_updated`, `transient_network_error`, or `error`.
- `review_count`: number of new unseen tweets/replies emitted for LLM review.
- `has_review_items`: whether `review_items` is non-empty.
- `review_items`: all new unseen tweets/replies with text, URL, author, reply metadata, event key, and fetched reply context.
- `api_pages`: per-page API diagnostics, including response keys, status, message, and extracted tweet count.
- `api_warning`: present when the API succeeds but no tweet/reply can be extracted, useful for diagnosing target account, user id, or response-shape issues.
- `state`: actual state file path, requested path, fallback status, and related warnings.
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
