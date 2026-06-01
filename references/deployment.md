# Deployment and operations

This repo is designed to be GitHub-safe and easy for a user to run.

## User-facing setup

The intended user flow starts with a dedicated Codex Project that acts as the watchdog runtime workspace. From a chat inside that Project, the user copies one prompt from `README.md` / `README.zh-CN.md`. Codex should install this skill from:

```text
https://github.com/thinkingjimmy/codex-reset-watchdog
```

Then Codex should run setup checks, prime state, and summarize the installed directory in human language. The user manually creates the hourly cron/project Automation in the Codex UI, using the installed skill directory as cwd and the README-embedded copy of `references/automation-prompt.md` as the prompt. Users only need a local `env` or `.env` file when they want to override defaults.

The README setup prompt is intentionally quiet. Apply the setup notes in this document silently, and send intermediate user messages only for approval requests or real blockers. Do not turn schema probing, command retries, raw JSON, or state-file inspection into the setup story.

The target account is already set:

```env
TARGET_X_HANDLE=thsottiaux
DAYCLAW_SOURCE_ITEMS_URL=
REPORT_TIMEZONE=
```

The full profile URL is `https://x.com/thsottiaux`. The default public source is `https://api.dayclaw.com/api/source/public/x/thsottiaux/items`.

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

Use the project-level `.codex/config.toml` profile `codex-reset-watchdog-net`. This runtime needs write access to the current workspace and outbound HTTPS to `api.dayclaw.com`; it does not require full filesystem access.

If the Codex UI only lets local shell commands reach the network after enabling full access, treat that as a runtime permission limitation. The project itself still only needs workspace write plus network egress, so full access should be a temporary fallback rather than the recommended setup.

After install initialization succeeds, the user should manually create a cron/project Automation that runs hourly:

```bash
node scripts/check_once.mjs --json
```

Use the README-embedded copy of `references/automation-prompt.md` as the Automation prompt. It is intentionally thin and delegates behavior to `SKILL.md`; do not copy the full run protocol into the Automation prompt.

Setup-only commands are `node scripts/self_test.mjs`, `node scripts/check_once.mjs --prime-state --json`, and `node scripts/check_once.mjs --dry-run --json`. Do not run them on every schedule.

## Manual Automation creation notes

Do not ask the install prompt to create or update Automations. Current Codex Automation tools may leave invalid partial Automations behind while retrying schema shapes, so the user should create the scheduled job manually in the UI. Use the cron/project path for this watchdog, not a thread/heartbeat path.

Minimum fields:

- Name: `Codex Reset Watchdog`.
- Cadence: hourly.
- Type: cron/project scheduled job, not thread/heartbeat.
- Working directory/cwds: the installed skill directory that contains `SKILL.md`, `scripts/check_once.mjs`, and `.codex/config.toml`.
- Prompt: the README-embedded copy of `references/automation-prompt.md`.
- Permissions: rely on `.codex/config.toml` and the narrow `codex-reset-watchdog-net` profile.

If the product UI asks for details such as `kind=cron`, local/worktree execution, model, reasoning effort, or a schedule format, the user should follow the current UI labels. Do not encode brittle UI details into the install prompt.

## Run summary behavior

Cron/project Codex Automation findings appear as separate automation runs in Triage. Routine output can still live in Automations/Previous Runs; do not assume every run appears as a chat notification. This skill should create a finding only for a new future reset signal.

A healthy no-op run after priming should say:

```text
✅ No actionable future Codex reset signal.
Fetched: 10; new items: 0; review items: 0; Triage finding: none.
Historical reset posts in the current batch are already completed or expired, so no user action is needed.
```

A positive run should start with a high-signal banner:

```text
🚨 Actionable Codex reset ahead: limits will reset tomorrow morning. Reset timing: 2026-06-01 morning (from "tomorrow morning"; report timezone: user's local timezone).
```

Operational failures are not reset signals. A source or runtime failure should start with an operational banner such as:

```text
⚠️ Watchdog source unreachable: api.dayclaw.com DNS/HTTPS failed; no reset judgment was made.
```

Routine no-op runs should not repeat the full fetched-items table, create Triage findings, send external notifications, or write routine automation memory. The concise report is safe for Automation run logs and Test/Run Now results. Test/Run Now is only an immediate run of the same Automation prompt; it is not a special mode and cannot pass per-run parameters.

Do not validate the Automation by pasting its prompt into a normal Chat/Agent session. A normal chat may run outside the installed skill directory and therefore miss both the Automation `cwds` and the `.codex/config.toml` permission profile. The usual symptom is a combined false operational failure: `api.dayclaw.com` DNS/HTTPS blocked and `var/state.json` not writable. Validate with the Automation detail page's Run Now button, and make sure `cwds` points at the installed skill directory.

## Public source model

Default scheduled monitoring uses the Dayclaw public source:

```env
TARGET_X_HANDLE=thsottiaux
DAYCLAW_SOURCE_ITEMS_URL=
REPORT_TIMEZONE=
```

When the override is blank, the script derives:

```text
https://api.dayclaw.com/api/source/public/x/thsottiaux/items
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
"api.dayclaw.com" = "allow"
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

`var/` is ignored by git and writable in Codex sandboxed runs. If the file is deleted, the script loses dedupe memory and may reprocess old items. If you set a custom home-directory path and Codex cannot write it, the script falls back to `var/state.json`; if the installed project directory itself is read-only, it falls back to an OS temp state file and reports that in the `state` field.

Leave `REPORT_TIMEZONE` blank to use the Automation runtime/user timezone. Set it only when the user explicitly wants a fixed IANA timezone such as `America/Los_Angeles`.

State contains `seen_tweets` for dedupe and `operational_failures` for repeated transient network errors.

## Lifecycle

The Automation should keep running after a finding.

Expected behavior:

1. New public source item appears.
2. Script outputs it in `review_items`.
3. Codex Automation LLM judges whether it signals an actionable future Codex reset/refill/restored allowance/remediation.
4. Automation posts a Triage finding only for positive future-actionable judgments.
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

- `dns.ok=false`: the runtime cannot resolve `api.dayclaw.com`.
- `http.reached=false`: DNS may work, but outbound HTTPS to `api.dayclaw.com` is blocked or timing out.
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
- Dayclaw public source: https://api.dayclaw.com/api/source/public/x/thsottiaux/items
- Codex skills docs: https://developers.openai.com/codex/skills
- Codex automations docs: https://developers.openai.com/codex/app/automations
