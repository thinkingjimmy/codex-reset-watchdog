# codex-reset-watchdog

[中文说明](README.zh-CN.md)

This skill monitors public X posts from Codex lead `thsottiaux`, detects future-actionable Codex reset signals, and outputs findings through Codex Automation. It helps users learn about major changes before a reset happens, so they can spend remaining quota intentionally, including switching to fast mode when useful.

## How To Use?

### Step 1: Copy The Prompt, Then Install And Initialize The Skill

Open Codex, click **New Chats**, start a new chat, then paste the prompt below. Codex will install this skill, run the basic checks, and prime baseline state, but it will not create an Automation.

```text
Quietly install and initialize the codex-reset-watchdog skill:
https://github.com/thinkingjimmy/codex-reset-watchdog

Only message me mid-run if you need my approval or hit a blocker that I must resolve.
Otherwise, do not output progress narration, tool parameter details, command attempts, retry details, raw JSON, or state file contents. Complete the tasks below yourself, then give only a concise setup summary.

Tasks:
1. Prefer Codex's skill installation workflow for this GitHub repo, using the skill name codex-reset-watchdog. If no installer is available, clone the repo and use that directory as the future Automation working directory.
2. Find the directory containing SKILL.md, scripts/check_once.mjs, references/automation-prompt.md, and .codex/config.toml.
3. In that directory, run node scripts/self_test.mjs.
4. Run node scripts/check_once.mjs --prime-state --json to create the baseline state.
5. Run node scripts/check_once.mjs --dry-run --json to confirm the Dayclaw public source, JSON parsing, and state dedupe.
6. If node scripts/check_once.mjs fails because of sandbox/network permissions, request permission only for the narrow node scripts/check_once.mjs entrypoint and rerun; do not request full access. If DNS/HTTPS or state writes still fail, summarize them as operational issues, not as reset/no-reset conclusions.
7. Do not create, update, or test an Automation; I will create it manually in the next step.
8. Final summary only: install directory, self-test, prime/dry-run status, state.path, source health, and the Automation working directory I should use next. Do not paste raw JSON.
```

### Step 2: Create The Automation Manually

Create a new cron/project Automation manually in the Codex UI. Field names may change between Codex versions, so fill in these meanings:

1. Name: `Codex Reset Watchdog`
2. Cadence: hourly.
3. Type: cron/project scheduled job; do not create a thread/heartbeat Automation attached to the current chat.
4. Working directory/cwds: the installed skill directory from Step 1, the one containing `SKILL.md`, `scripts/check_once.mjs`, and `.codex/config.toml`.
5. Prompt: copy the full block below.
6. Permissions: use the directory's `.codex/config.toml`; it only writes the current workspace and reaches `api.dayclaw.com`.

```text
Use the $codex-reset-watchdog skill.

Run from the installed codex-reset-watchdog working directory:

Command:
node scripts/check_once.mjs --json

Follow the skill's Automation run protocol. Return an emoji-led actionable/no-action report. Alert only for future actionable resets; treat completed or past reset posts as historical context.

Do not emit progress narration while running. Do not inspect or update automation memory during routine runs. If the initial working directory does not contain `scripts/check_once.mjs`, silently switch to the configured Automation working directory that does.

If JSON status is `transient_network_error`, `network_diagnostic`, or `error`, treat it as a watchdog operational issue, not a possible Codex reset. Never use the reset banners for source/network/state failures.

Omit the full repeated table on routine `new_items=0` runs when no future actionable or unclear signal remains. Do not output raw JSON, process narration, or routine memory notes.
```

After saving, test from the Automation detail page with **Run Now**. Do not test by pasting this Automation prompt into a normal Chat/Agent run; a normal Chat may run outside the skill directory and will not inherit this Automation's working directory or `.codex/config.toml` permissions, which can cause `api.dayclaw.com` DNS/HTTPS failures or `var/state.json` write failures. Cron/project Automation findings appear as separate automation runs in Triage; routine output may stay inside Automations/Previous Runs.

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
