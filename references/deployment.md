# Deployment and operations

This repo is designed to be GitHub-safe and easy for a user to run.

## User-facing setup

The intended user flow is one copied prompt from `README.md` / `README.zh-CN.md`. Codex should install this skill from:

```text
https://github.com/thinkingjimmy/codex-reset-watchdog
```

Then Codex should run setup checks, prime state, create an hourly Automation, and summarize the result in human language. Users only need a local `env` or `.env` file when they want to override defaults.

The target account is already set:

```env
TARGET_X_HANDLE=thsottiaux
DAYCLAW_SOURCE_ITEMS_URL=
```

The full profile URL is `https://x.com/thsottiaux`. The default public source is `https://apitest.dayclaw.com/api/source/public/x/thsottiaux/items`.

## What should be committed

Commit these files:

```text
env.example
.codex/config.toml
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

## Validate the installed folder

There is no npm, Python, or build install step. After Codex installs or clones the skill repo, it should run this setup check for the user:

```bash
node scripts/self_test.mjs
```

## First-run state priming

Run once before enabling the schedule:

```bash
node scripts/check_once.mjs --prime-state --json
```

This prevents old public source items from becoming new Codex Triage findings.

Dry-run checks are useful for API reading and JSON parsing, but they do not prove state writes. The scheduled Automation writes `seen_tweets` and `operational_failures`, so keep the default `STATE_FILE_PATH=var/state.json` in sandboxed Codex runs.

## Runtime command

Use the project-level `.codex/config.toml` profile `codex-reset-watchdog-net`. This runtime needs write access to the current workspace and outbound HTTPS to `apitest.dayclaw.com`; it does not require full filesystem access.

If the Codex UI only lets local shell commands reach the network after enabling full access, treat that as a runtime permission limitation. The project itself still only needs workspace write plus network egress, so full access should be a temporary fallback rather than the recommended setup.

Codex Automation should run hourly:

```bash
node scripts/check_once.mjs --json
```

Use the full contents of `references/automation-prompt.md` as the Automation prompt. It is intentionally thin and delegates behavior to `SKILL.md`; do not copy the full run protocol into the Automation prompt.

Setup-only commands are `node scripts/self_test.mjs`, `node scripts/check_once.mjs --prime-state --json`, and `node scripts/check_once.mjs --dry-run --json`. Do not run them on every schedule.

## Automation creation compatibility

Do not guess the Codex Automation tool's parameter shape. Before creating or updating the Automation, inspect the current tool schema or read an existing Automation config from the same Codex version.

Known pitfalls:

- Some versions reject plain cadence strings; use the tool's accepted hourly format, preferably iCalendar `DTSTART` plus `RRULE:FREQ=HOURLY;INTERVAL=1`.
- Some versions distinguish `cwd` string from `cwds` list; pass exactly what the current schema accepts.
- Some versions require `model` and `reasoning` during cron creation even when the schema marks them optional.
- Prompt length is not the first suspect; validate schedule/model/cwd shape before shortening the prompt.
- After creation, read the Automation back and confirm active status, cadence, working directory, command, and prompt.

## Run summary behavior

Codex Automations may use the same prompt for the Test button and scheduled runs. Because the prompt cannot reliably distinguish them, every run should end with a reviewable Markdown report rather than raw JSON.

A healthy no-op run after priming should say:

```text
No Codex reset signal found.

| Time | Reset? | Item | Link |
| --- | --- | --- | --- |
| 2026-05-29 01:40 | no | Codex Thursday moved to Friday; no usage/quota reset language. | link |
| 2026-05-27 14:59 | no | Codex model availability update; no allowance refill or rate-limit reset. | link |

Fetched: 10; new items: 0; review items: 0; Triage finding: none.
Source is healthy.
```

Healthy no-op runs should not create Triage findings, external notifications, or routine automation memory. The concise report is safe for Automation run logs and Test results.

## Public source model

Default scheduled monitoring uses the Dayclaw public source:

```env
TARGET_X_HANDLE=thsottiaux
DAYCLAW_SOURCE_ITEMS_URL=
```

When the override is blank, the script derives:

```text
https://apitest.dayclaw.com/api/source/public/x/thsottiaux/items
```

The endpoint currently returns a fixed public batch of recent items. The script dedupes locally by stable tweet/item ID. This removes paid API key setup and keeps the runtime small, but it also means the script should not pretend to have full thread hydration or arbitrary pagination.

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
"apitest.dayclaw.com" = "allow"
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

`var/` is ignored by git and writable in Codex sandboxed runs. If the file is deleted, the script loses dedupe memory and may reprocess old items. If you set a custom home-directory path and Codex cannot write it, the script falls back to `var/state.json` and reports that in the `state` field.

State contains `seen_tweets` for dedupe and `operational_failures` for repeated transient network errors.

## Lifecycle

The Automation should keep running after a finding.

Expected behavior:

1. New public source item appears.
2. Script outputs it in `review_items`.
3. Codex Automation LLM judges whether it signals a Codex reset/refill/restored allowance/remediation.
4. Automation posts a Triage finding only for positive judgments.
5. Script records the item ID in the JSON state file.
6. Later runs ignore the same item.
7. A future item with a new ID can still produce a new finding.

## Failure handling

Report a Codex Triage finding when:

- `check_once.mjs` exits non-zero;
- Dayclaw returns an API error;
- JSON `status` is `error`;
- JSON `status` is `transient_network_error` and `operational_error.report_to_triage` is true;
- JSON `api_warning` is present;
- JSON output cannot be parsed.

Do not report one-off DNS/network failures. The script retries transient Dayclaw connection failures inside the same run, then records consecutive failures in `STATE_FILE_PATH`.

For repeated `fetch failed` or `connection_error` results, diagnose the network path from the same working directory:

```bash
node scripts/check_once.mjs --diagnose-network --json
```

Interpretation:

- `dns.ok=false`: the runtime cannot resolve `apitest.dayclaw.com`.
- `http.reached=false`: DNS may work, but outbound HTTPS to `apitest.dayclaw.com` is blocked or timing out.
- `network_ok=true`: network reachability is not the blocker; inspect `source_url`, `api_pages`, and `api_warning`.

Useful knobs:

```env
DAYCLAW_RETRY_ATTEMPTS=3
DAYCLAW_RETRY_SLEEP_SECONDS=5
DAYCLAW_RETRY_MAX_SLEEP_SECONDS=30
TRANSIENT_NETWORK_ERRORS_EXIT_ZERO=true
OPERATIONAL_ERROR_REPORT_THRESHOLD=3
OPERATIONAL_ERROR_REPORT_EVERY_FAILURES=24
```

Do not report scheduled findings when there are simply no new items, no positive LLM judgments, or a non-reportable transient network status. Transient network errors report on the threshold failure, then only every `OPERATIONAL_ERROR_REPORT_EVERY_FAILURES` failures while the outage continues.

Do not write automation memory for routine successful no-op runs. After state is primed, repeated output such as `status=ok`, `new_items=0`, and `review_count=0` is expected and should produce only the concise run report, with no Triage finding.

## Useful links

- Target profile: https://x.com/thsottiaux
- Dayclaw public source: https://apitest.dayclaw.com/api/source/public/x/thsottiaux/items
- Codex skills docs: https://developers.openai.com/codex/skills
- Codex automations docs: https://developers.openai.com/codex/app/automations
