# codex-reset-watchdog

[中文说明](README.zh-CN.md)

A zero-dependency Codex skill repo for monitoring [`@thsottiaux`](https://x.com/thsottiaux) with **Codex Automation**. It fetches public X items from Dayclaw, emits every unseen item to the Automation LLM, and surfaces findings only through Codex Automation/Triage when the LLM sees a Codex usage/quota/rate-limit reset signal.

## What It Does

- Gives users a one-prompt setup flow: Codex installs the skill from GitHub, validates it, primes state, and creates an hourly Automation.
- Works without a paid API key: the default source is `https://api.dayclaw.com/api/source/public/x/thsottiaux/items`.
- Gives the LLM the full new batch: every unseen item is reviewed, reducing rule prefilter misses.
- Stays quiet when nothing matters: no reset/refill/restored-allowance signal means no finding.
- Avoids repeat noise: the same item is handled once, while future new posts remain eligible.
- Handles network blips calmly: transient Dayclaw DNS/network failures do not immediately spam Triage.
- Makes Automation runs readable: the run result should be an emoji-led Markdown report with reset timing and a fetched-items review table, not raw JSON.
- Keeps one notification surface: findings appear only in Codex Automation/Triage, not external channels.

## Skill Layout

The repo is shaped as a single Codex skill directory: `SKILL.md` at the root, optional `agents/`, `references/`, and `scripts/` beside it. If embedding this skill inside another repo, copy this directory to `.agents/skills/codex-reset-watchdog/`.

```text
codex-reset-watchdog/
  .codex/
    config.toml                   # Minimal Codex permission profile
    rules/
      codex-reset-watchdog.rules  # Command-level network fallback
  SKILL.md                         # Skill metadata and operating instructions
  README.md                        # English setup guide
  README.zh-CN.md                  # Chinese setup guide
  env.example                      # Visible local configuration template
  .gitignore                       # Keeps caches and state out of git
  agents/
    openai.yaml                    # Optional Codex skill display metadata
  references/
    automation-prompt.md           # Prompt for scheduled Codex Automation
    deployment.md                  # Operations checklist
    llm-judge-rubric.md            # LLM review rubric for review_items
  scripts/
    check_once.mjs                 # Zero-dependency Automation entrypoint
    self_test.mjs                  # Local deterministic tests
```

## One-Prompt Setup

Open Codex and paste this prompt. Codex should install the skill, run the basic checks, prime the baseline state, and create an hourly Automation for you.

```text
Install and set up the codex-reset-watchdog skill from GitHub:
https://github.com/thinkingjimmy/codex-reset-watchdog

Use Codex's skill installation workflow if available. If you need a fallback, clone the repo and use that folder as the Automation working directory.

After installation:
1. Find the installed skill folder that contains SKILL.md and scripts/check_once.mjs.
2. Run node scripts/self_test.mjs.
3. Run node scripts/check_once.mjs --prime-state --json to create the baseline state.
4. Run node scripts/check_once.mjs --dry-run --json once to confirm the Dayclaw public source, JSON parsing, and state dedupe.
5. Create an hourly Codex Automation:
   - working directory: the installed codex-reset-watchdog folder
   - command: node scripts/check_once.mjs --json
   - prompt: use the full contents of references/automation-prompt.md exactly; it is a thin launcher that tells Automation to use the skill
   - permissions: use the project .codex/config.toml profile codex-reset-watchdog-net if available; otherwise grant only workspace write plus outbound HTTPS to api.dayclaw.com
6. When calling the Codex Automation creation tool, do not guess its parameter shape:
   - inspect the tool schema or an existing Automation config first;
   - use the current tool's accepted hourly schedule format, preferably an iCalendar RRULE with DTSTART if plain "hourly" is rejected;
   - pass the working directory in the exact cwd/cwds shape the current tool expects;
   - include model and reasoning fields if the current tool requires them even when marked optional;
   - after creation, read the Automation back and confirm cadence, working directory, active status, command, and prompt.
7. Give me a concise setup summary with pass/fail status, Automation cadence, working directory, state path, and what the Codex Test button should show.

Do not paste raw JSON unless I ask for it. Do not enable full access unless the narrow network permission path is unavailable and you explain the tradeoff first.
```

There is no API key to buy or paste. The default source is:

```text
https://api.dayclaw.com/api/source/public/x/thsottiaux/items
```

Codex will verify the script, prime the current public items as the baseline, then create the scheduled Automation using the full contents of [`references/automation-prompt.md`](references/automation-prompt.md). That prompt is intentionally small; [`SKILL.md`](SKILL.md) is the runtime source of truth, and [`references/llm-judge-rubric.md`](references/llm-judge-rubric.md) is the reset judgment rubric.

## What Test Should Show

After setup, click **Test** in Codex Automations. Codex uses the same Automation prompt for Test and scheduled runs, so every run ends with a short Markdown report like:

```text
✅ No Codex reset signal found.

| Time | Reset? | Reset timing | Item | Link |
| --- | --- | --- | --- | --- |
| 2026-05-29 01:40 | ✅ no | - | Codex Thursday moved to Friday; no usage/quota reset language. | link |
| 2026-05-27 14:59 | ✅ no | - | Codex model availability update; no allowance refill or rate-limit reset. | link |

Fetched: 10; new items: 0; review items: 0; Triage finding: none.
Source is healthy.
```

When a reset signal is present, the first line should be stronger and include timing:

```text
🚨 Codex reset signal found: limits will reset tomorrow morning. Reset timing: 2026-06-01 morning (from "tomorrow morning"; report timezone: user's local timezone).
```

The result should not paste the raw `check_once.mjs --json` object. Healthy no-op runs should not create Triage findings, external notifications, or routine automation memory; the concise report is safe to show in Automation run logs and Test results.

## State And Dedupe

`STATE_FILE_PATH` points to a persistent JSON file. Reports use the Automation runtime/user timezone by default; set `REPORT_TIMEZONE` to an IANA timezone only when you want an explicit override.

- `seen_tweets` prevents the same source item from being sent to the LLM every run.
- `operational_failures` tracks consecutive transient Dayclaw network failures.
- Future reset posts with a new item/tweet ID can still be reviewed and reported.

Default state file location:

```env
STATE_FILE_PATH=var/state.json
```

`var/` is ignored by git and writable in Codex sandboxed runs. If you set a custom home-directory path and Codex cannot write it, the script falls back to `var/state.json` and reports that in the `state` field.

## Output Contract

`check_once.mjs --json` prints one JSON object. Important fields:

- `status`: `ok`, `primed`, `state_updated`, `transient_network_error`, `network_diagnostic`, or `error`.
- `source_url`: the Dayclaw public source endpoint used for this run.
- `review_count`: number of new unseen items emitted for LLM review.
- `has_review_items`: whether `review_items` is non-empty.
- `review_items`: all new unseen items with text, URL, author, reply metadata, event key, and available context fields.
- `fetched_items`: read-only summary of the current fetched batch, including `created_at_utc`, `created_at_local`, and `local_timezone` for the human review table even when all items were already seen.
- `api_pages`: API diagnostics, including response keys, source URL, limit, and extracted item count.
- `api_warning`: present when the API succeeds but no item can be extracted.
- `state`: actual state file path, requested path, fallback status, and related warnings.
- `fetch_strategy`: always `dayclaw_public_items`.
- `llm_instruction`: short instruction for the Automation LLM.
- `operational_error`: present for transient/network/runtime failures; report only when instructed by the Automation prompt.
- `results`: per-item handling details such as `queued_for_llm`, `already_seen`, or `ignored_reply`.

Transient DNS failures for `api.dayclaw.com` are retried inside the same run. If all retries fail, the script exits cleanly with `status: "transient_network_error"` so one-off network blips do not spam Triage.

## Public Source Notes

The Dayclaw endpoint currently returns a fixed public batch of recent items:

```text
https://api.dayclaw.com/api/source/public/x/thsottiaux/items
```

Runtime behavior:

- The first prime run marks the current batch as already seen.
- Scheduled runs fetch the public batch and dedupe locally by stable tweet/item ID.
- The public feed exposes reply metadata when available, but it does not expose full parent-thread hydration.
- If the feed returns no extractable items, the script emits `api_warning` so the Automation can report an operational finding.

## Permission Guidance

This skill has a small permission footprint:

- read `env` / `.env` in the current project;
- write `var/state.json` in the current project;
- make HTTPS requests to `https://api.dayclaw.com`.

The repo includes the recommended configuration in `.codex/config.toml`. It defines `codex-reset-watchdog-net`, which allows workspace writes and only the `api.dayclaw.com` network destination:

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

The first time you open this project in Codex, if Codex asks whether to trust the project configuration, inspect `.codex/config.toml` and trust it only after confirming it contains the narrow profile above. If the permissions selector offers `Custom (config.toml)`, select it.

Important: permission profiles do not compose with the older `sandbox_mode` settings. If the current Codex runtime still uses the older `workspace-write` sandbox, `default_permissions` may not apply and local `node fetch` can still be blocked. For that compatibility path, the repo includes `.codex/rules/codex-reset-watchdog.rules`, which allows only `node scripts/check_once.mjs` to run outside the sandbox.

Do not enable full access just for this skill. Full access expands filesystem read/write scope beyond what the script needs.

## Network Diagnostics

If Automation returns `status: "transient_network_error"`, `root_cause: "connection_error"`, or `detail: "fetch failed"`, run this from the same Automation working directory:

```bash
node scripts/check_once.mjs --diagnose-network --json
```

This checks DNS resolution and HTTPS reachability for `api.dayclaw.com`. If `dns.ok=false` or `http.reached=false`, the failure is in the runtime environment's outbound network, not item content, LLM judgment, or state dedupe. Allow outbound HTTPS to `https://api.dayclaw.com` for the Automation runtime instead of broadening filesystem permissions.

If `network_ok=true` but the normal check still fails, inspect `source_url`, `api_pages`, and `api_warning`.

## Links

- Target profile: <https://x.com/thsottiaux>
- Dayclaw public source: <https://api.dayclaw.com/api/source/public/x/thsottiaux/items>
- Codex Skills docs: <https://developers.openai.com/codex/skills>
- Codex Automations docs: <https://developers.openai.com/codex/app/automations>
