# codex-reset-watchdog

[中文说明](README.zh-CN.md)

This skill monitors public X posts from Codex lead `thsottiaux`, detects future-actionable Codex reset signals, and outputs findings through Codex Automation. It helps users learn about major changes before a reset happens, so they can spend remaining quota intentionally, including switching to fast mode when useful.

## How To Use?

### Step 1: Copy And Paste The Prompt, Then Install The Skill

Open Codex, click **New Chats**, start a new chat, then paste the prompt below. Codex will install this skill, run the basic checks, prime baseline state, and create an hourly Automation.

```text
Quietly complete installation and Automation setup for codex-reset-watchdog:
https://github.com/thinkingjimmy/codex-reset-watchdog

Only message me mid-run if you need my approval or hit a blocker that I must resolve.
Otherwise, do not output progress narration, tool parameter details, command attempts, retry details, raw JSON, or state file contents. Complete the tasks below yourself, then give only a concise setup summary.

Tasks:
1. Prefer Codex's skill installation workflow for this GitHub repo, using the skill name codex-reset-watchdog. If no installer is available, clone the repo and use that directory as the Automation working directory.
2. Find the directory containing SKILL.md, scripts/check_once.mjs, references/automation-prompt.md, and .codex/config.toml.
3. In that directory, run node scripts/self_test.mjs.
4. Run node scripts/check_once.mjs --prime-state --json to create the baseline state.
5. Run node scripts/check_once.mjs --dry-run --json to confirm the Dayclaw public source, JSON parsing, and state dedupe.
6. If node scripts/check_once.mjs fails because of sandbox/network permissions, request permission only for the narrow node scripts/check_once.mjs entrypoint and rerun; do not request full access. If DNS/HTTPS or state writes still fail, summarize them as operational issues, not as reset/no-reset conclusions.
7. Create or update an hourly standalone/project Automation named Codex Reset Watchdog, meaning an independent cron Automation that reports findings to Triage; do not create a thread/heartbeat Automation attached to the current chat. The working directory is the installed directory, the prompt is the full contents of references/automation-prompt.md, and permissions come from .codex/config.toml. If an Automation with the same name already exists, update it instead of creating a duplicate.
8. After creation, only confirm the Automation is active, hourly, uses the right working directory, and uses the right prompt source; do not read the raw state file and do not write automation memory.
9. Final summary only: install directory, self-test, prime/dry-run status, state.path, source health, Automation ID/status/cadence/working directory, and Run Now/Test expectation.
```

### Step 2: Test And Configure The Automation

If everything works, click **Automations** in the Codex left navigation. You should see a standalone/project Automation named **Codex Reset Watchdog**. Open its detail page:

1. Confirm the Automation working directory/cwds points at the installed skill directory, the one containing `SKILL.md`, `scripts/check_once.mjs`, and `.codex/config.toml`.
2. Click **Run Now** in the top right. Do not test by pasting the Automation prompt into a normal Chat/Agent run; a normal Chat may run outside the skill directory and will not inherit this Automation's working directory or `.codex/config.toml` permissions, which can cause `api.dayclaw.com` DNS/HTTPS failures or `var/state.json` write failures.
3. You should see a new run under **Previous Runs**. Open it to inspect the details.
4. Standalone/project Automation findings appear as separate automation runs in Triage. Routine run output may stay inside Automations/Previous Runs instead of appearing in normal chats; if the UI exposes a Project/Chats display setting, it only changes where findings appear and does not change the runtime directory. If recent `thsottiaux` posts are parsed correctly and the report says whether action is needed, the basic workflow is working.

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
