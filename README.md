# codex-reset-watchdog

[中文说明](README.zh-CN.md)

This skill monitors public X posts from Codex lead `thsottiaux`, detects future-actionable Codex reset signals, and outputs findings through Codex Automation. It helps users learn about major changes before a reset happens, so they can spend remaining quota intentionally, including switching to fast mode when useful.

## How To Use?

### Step 1: Create A Codex Project First

Create a dedicated Codex Project for this monitor, for example `Codex Reset Watchdog`. This Project is not your product repo and not the source repo you use to develop this skill; it stores a runtime copy only, giving the Automation a stable working directory, `.codex/config.toml` permissions, and persistent `var/state.json`.

Do not run the prompt below in a normal Chat. A normal Chat may not have a stable cwd, may not inherit project-level `.codex/config.toml`, and may not persist state writes.

### Step 2: In That Project, Copy The Prompt To Install And Initialize The Skill

Open the Project you just created, start a new chat inside that Project, then paste the prompt below. Codex will install this skill, prepare the runtime files in the current workspace, run the basic checks, and prime baseline state.

```text
Quietly install and initialize codex-reset-watchdog:
https://github.com/thinkingjimmy/codex-reset-watchdog

Only message me mid-run if you need my approval or hit a blocker that I must resolve.
Otherwise, do not output progress narration, tool parameter details, command attempts, retry details, raw JSON, or state file contents. Complete the tasks below yourself, then give only a concise setup summary.

Tasks:
1. Prefer Codex's skill installation workflow for this GitHub repo, using the skill name codex-reset-watchdog. If no installer is available, clone the repo.
2. Find the installed or cloned source directory and confirm it contains SKILL.md, scripts/check_once.mjs, references/automation-prompt.md, and .codex/config.toml.
3. Prepare the runtime files in the current workspace root: SKILL.md, README.md, README.zh-CN.md, env.example, .codex/, agents/, references/, scripts/, and images/. Preserve the existing .git directory, do not create a nested repo, and do not overwrite local env or .env.
4. In the current workspace root, confirm SKILL.md, scripts/check_once.mjs, references/automation-prompt.md, and .codex/config.toml exist.
5. In the current workspace root, run node scripts/self_test.mjs.
6. Run node scripts/check_once.mjs --prime-state --json to create the baseline state.
7. Run node scripts/check_once.mjs --dry-run --json to confirm the Dayclaw public source, JSON parsing, and state dedupe.
8. If node scripts/check_once.mjs fails because of sandbox/network permissions, request permission only for the narrow node scripts/check_once.mjs entrypoint and rerun; do not request full access. If DNS/HTTPS or state writes still fail, summarize them as operational issues, not as reset/no-reset conclusions.
9. Final summary only: runtime directory, install source directory, self-test, prime/dry-run status, state.path, and source health. Do not paste raw JSON.
```

### Step 3: Create The Automation Manually

Create a new cron/project Automation manually in the Codex UI. Field names may change between Codex versions, so fill in these meanings:

1. Name: `Codex Reset Watchdog`
2. Cadence: hourly, not a fixed daily time.
3. Type: cron/project scheduled job; do not create a thread/heartbeat Automation attached to the current chat.
4. Runs in / execution: choose `Local`, not `Worktree`.
5. Project: choose the dedicated Project from Step 1. Its root should already contain `SKILL.md`, `scripts/check_once.mjs`, and `.codex/config.toml`; if it only contains `.git`, Step 2 did not prepare the runtime workspace.
6. Working directory/cwds: if the UI exposes this field, use that Project root, the directory containing `SKILL.md`, `scripts/check_once.mjs`, and `.codex/config.toml`. Do not use `~/.codex/skills/codex-reset-watchdog`.
7. Prompt: copy the block below. It must stay the same as `references/automation-prompt.md`.
8. Permissions: use the Project root's `.codex/config.toml`; it only writes the current workspace and reaches `api.dayclaw.com`.

```text
Use the $codex-reset-watchdog skill.

Run from the current Codex Project runtime directory:

Command:
node scripts/check_once.mjs --json

The current directory must contain `scripts/check_once.mjs`. If it does not, report a setup error and ask the user to rerun the install/init prompt in the dedicated Project so the runtime files are copied into the Project root. Do not search for or switch to `~/.codex/skills/codex-reset-watchdog` during Automation runs.

Follow the skill's Automation run protocol. Return an emoji-led actionable/no-action report. Alert only for future actionable resets; treat completed or past reset posts as historical context.

Do not emit progress narration while running. Do not inspect or update automation memory during routine runs.

If JSON status is `transient_network_error`, `network_diagnostic`, or `error`, treat it as a watchdog operational issue, not a possible Codex reset. Never use the reset banners for source/network/state failures.

Omit the full repeated table on routine `new_items=0` runs when no future actionable or unclear signal remains. Do not output raw JSON, process narration, or routine memory notes.
```

### Step 4: Test The Automation

After creation, test from the Automation detail page with **Run Now**. Do not test by pasting the Automation prompt into a normal Chat/Agent run; a normal Chat may run outside the Project runtime directory and will not inherit `.codex/config.toml` permissions, which can cause `api.dayclaw.com` DNS/HTTPS failures or `var/state.json` write failures. If Run Now reports source unreachable and mentions `EPERM`, first confirm the Project root is not just `.git` and instead contains `SKILL.md`, `scripts/`, and `.codex/`. Cron/project Automation findings appear as separate automation runs in Triage; routine output may stay inside Automations/Previous Runs.

[previous runs screenshot](images/previous-runs.png)

## Want To Monitor More Sources?

If you want to monitor sources beyond the `thsottiaux` account, such as other accounts, Reddit, or news feeds, you can register for [Dayclaw](https://dayclaw.com/).

## Timezone And Env

Most users do not need to modify or create an env file. With the default configuration, Codex monitors `@thsottiaux`, writes state to `var/state.json`, and displays times using the Automation runtime environment.

If you want finding output to use a timezone that matches your habits, create an env file and override the default `REPORT_TIMEZONE`:

1. Duplicate [`env.example`](env.example).
2. Rename the copy to `env` or `.env`. `env` is easier to see in Finder; `.env` is the standard developer name.
3. Change only the fields you actually need. To force a report timezone, set `REPORT_TIMEZONE` to an IANA timezone:

```env
REPORT_TIMEZONE=America/Los_Angeles
```

Common examples: `Asia/Shanghai`, `America/Los_Angeles`, `America/New_York`, `Europe/London`, `Europe/Berlin`, `UTC`.

Leave `REPORT_TIMEZONE` blank to use the Automation runtime/user timezone. This is the recommended default.

## Skill Layout

This repo is a single skill directory: `SKILL.md` sits at the root, with optional `agents/`, `references/`, and `scripts/` beside it. To embed this skill inside another repo, copy this directory to `.agents/skills/codex-reset-watchdog/`.

```text
codex-reset-watchdog/
  .codex/
    config.toml                   # Minimal Codex permission profile
    rules/
      codex-reset-watchdog.rules  # Command-level network fallback for older sandbox mode
  SKILL.md                         # Skill metadata and operating instructions
  README.md                        # English guide
  README.zh-CN.md                  # Chinese guide
  env.example                      # Visible configuration template
  .gitignore                       # Ignores caches and local state
  agents/
    openai.yaml                    # Optional Codex skill display metadata
  references/
    automation-prompt.md           # Prompt used when creating Codex Automation
    deployment.md                  # Operations checklist
    llm-judge-rubric.md            # Rules for LLM review of review_items
  scripts/
    check_once.mjs                 # Zero-dependency Automation entrypoint
    self_test.mjs                  # Local deterministic self-test
```
