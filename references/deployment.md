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
.codex/config.toml
.codex/README.md
.codex/rules/codex-reset-watchdog.rules
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

Dry-run checks are useful for API reading and JSON parsing, but they do not prove state writes. The scheduled Automation writes `seen_tweets` and `operational_failures`, so keep the default `STATE_FILE_PATH=var/state.json` in sandboxed Codex runs.

## Runtime command

Use the project-level `.codex/config.toml` profile `codex-reset-watchdog-net`. This runtime needs write access to the current workspace and outbound HTTPS to `api.twitterapi.io`; it does not require full filesystem access.

If the Codex UI only lets local shell commands reach the network after enabling full access, treat that as a runtime permission limitation. The project itself still only needs workspace write plus network egress, so full access should be a temporary fallback rather than the recommended setup.

Codex Automation should run:

```bash
node scripts/check_once.mjs --include-replies true --hydrate-reply-context true --json
```

Recommended cadence: every 30-60 minutes.

## Codex permission profile

The checked-in `.codex/config.toml` file defines the recommended project permission profile:

```toml
default_permissions = "codex-reset-watchdog-net"

[permissions.codex-reset-watchdog-net.filesystem]
":minimal" = "read"

[permissions.codex-reset-watchdog-net.filesystem.":workspace_roots"]
"." = "write"

[permissions.codex-reset-watchdog-net.network]
enabled = true

[permissions.codex-reset-watchdog-net.network.domains]
"api.twitterapi.io" = "allow"
```

This is the preferred alternative to full access. It keeps filesystem access scoped to the workspace while allowing the one network destination the runtime needs.

When Codex asks whether to trust project configuration, inspect `.codex/config.toml` first. If the permissions selector offers `Custom (config.toml)`, select it for this project.

Permission profiles do not compose with older `sandbox_mode` settings. If `workspace-write` is still active and blocks local `node fetch`, use the project-local rule file instead:

```text
.codex/rules/codex-reset-watchdog.rules
```

That rule allows only `node scripts/check_once.mjs` to run outside the sandbox. It is the compatibility fallback before considering full access.

For existing Automations, check `automation.toml` and confirm `cwds` points at a folder that has the latest `.codex/`. A common failure mode is updating the source repo while the Automation still runs an older copied test directory.

## State path

Use the default persistent state file path:

```env
STATE_FILE_PATH=var/state.json
```

`var/` is ignored by git and writable in Codex sandboxed runs. If the file is deleted, the script loses dedupe memory and may reprocess old tweets. If you set a custom home-directory path and Codex cannot write it, the script falls back to `var/state.json` and reports that in the `state` field.

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

For repeated `fetch failed` or `connection_error` results, diagnose the network path from the same working directory:

```bash
node scripts/check_once.mjs --diagnose-network --json
```

Interpretation:

- `dns.ok=false`: the runtime cannot resolve `api.twitterapi.io`.
- `http.reached=false`: DNS may work, but outbound HTTPS to `api.twitterapi.io` is blocked or timing out.
- `network_ok=true`: network reachability is not the blocker; inspect API key, target handle/userId, and `api_pages` / `api_warning`.

Useful knobs:

```env
TWITTERAPI_IO_RETRY_ATTEMPTS=3
TWITTERAPI_IO_RETRY_SLEEP_SECONDS=5
TWITTERAPI_IO_RETRY_MAX_SLEEP_SECONDS=30
TRANSIENT_NETWORK_ERRORS_EXIT_ZERO=true
OPERATIONAL_ERROR_REPORT_THRESHOLD=3
OPERATIONAL_ERROR_REPORT_EVERY_FAILURES=24
```

Do not report when there are simply no new tweets, no positive LLM judgments, or a non-reportable transient network status. Transient network errors report on the threshold failure, then only every `OPERATIONAL_ERROR_REPORT_EVERY_FAILURES` failures while the outage continues.

Do not write automation memory for routine successful no-op runs. After state is primed, repeated output such as `status=ok`, `fetched=40`, `new_items=0`, and `review_count=0` is expected and should be silently archived.

## Useful links

- Target profile: https://x.com/thsottiaux
- TwitterAPI.io docs: https://docs.twitterapi.io/introduction
- TwitterAPI.io authentication: https://docs.twitterapi.io/authentication
- TwitterAPI.io last tweets endpoint: https://docs.twitterapi.io/api-reference/endpoint/get_user_last_tweets
- TwitterAPI.io thread context endpoint: https://docs.twitterapi.io/api-reference/endpoint/get_tweet_thread_context
- Codex skills docs: https://developers.openai.com/codex/skills
- Codex automations docs: https://developers.openai.com/codex/app/automations
