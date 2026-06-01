# codex-reset-watchdog

[中文说明](README.zh-CN.md)

This skill monitors public X posts from Codex lead `thsottiaux`, detects future-actionable Codex reset signals, and outputs findings through Codex Automation. It helps users learn about major changes before a reset happens, so they can spend remaining quota intentionally, including switching to fast mode when useful.

## How To Use?

### Step 1: Create A Codex Project First

Create a dedicated Codex Project for this monitor, for example `Codex Reset Watchdog`. This Project is not your product repo and not the skill source repo; it is just a stable runtime workspace for the Automation working directory, `.codex/config.toml` permissions, and persistent `var/state.json`.

Do not run the prompt below in a normal Chat. A normal Chat may not have a stable cwd, may not inherit project-level `.codex/config.toml`, and may not persist state writes.

### Step 2: In That Project, Copy The Prompt To Install The Skill And Create The Automation

Open the Project you just created, start a new chat inside that Project, then paste the prompt below. Codex will install this skill, run the basic checks, prime baseline state, and create an hourly Automation.

```text
Quietly install and set up codex-reset-watchdog inside the current Codex Project:
https://github.com/thinkingjimmy/codex-reset-watchdog

Only message me mid-run if you need my approval or hit a blocker that I must resolve.
Otherwise, do not output progress narration, tool parameter details, command attempts, retry details, raw JSON, or state file contents. Complete the tasks below yourself, then give only a concise setup summary.

Tasks:
1. The current chat must be running inside a Codex Project. If it is not a Project chat, stop and tell me to create/open a Project first.
2. Prefer Codex's skill installation workflow for this GitHub repo, using the skill name codex-reset-watchdog. If no installer is available, clone the repo and use that directory as the Automation working directory.
3. Find the directory containing SKILL.md, scripts/check_once.mjs, references/automation-prompt.md, and .codex/config.toml.
4. Confirm this directory can be used as the current Project's Automation working directory/cwds.
5. In that directory, run node scripts/self_test.mjs.
6. Run node scripts/check_once.mjs --prime-state --json to create the baseline state.
7. Run node scripts/check_once.mjs --dry-run --json to confirm the Dayclaw public source, JSON parsing, and state dedupe.
8. If node scripts/check_once.mjs fails because of sandbox/network permissions, request permission only for the narrow node scripts/check_once.mjs entrypoint and rerun; do not request full access. If DNS/HTTPS or state writes still fail, summarize them as operational issues, not as reset/no-reset conclusions.
9. Create or update an hourly cron/project Automation named Codex Reset Watchdog; do not create a thread/heartbeat Automation attached to the current chat.
10. The Automation working directory/cwds must be the skill directory from step 3; the prompt must be the full contents of references/automation-prompt.md; permissions come from that directory's .codex/config.toml.
11. If an Automation with the same name already exists, update it instead of creating a duplicate.
12. After creation, only confirm the Automation is active, hourly, uses the right working directory, and uses the right prompt source; do not read the raw state file and do not write automation memory.
13. Final summary only: install directory, self-test, prime/dry-run status, state.path, source health, Automation ID/status/cadence/working directory, and Run Now/Test expectation. Do not paste raw JSON or narrate schema retries that were already resolved.
```

### Step 3: Test The Automation

After creation, test from the Automation detail page with **Run Now**. Do not test by pasting the Automation prompt into a normal Chat/Agent run; a normal Chat may run outside the Project/skill directory and will not inherit `.codex/config.toml` permissions, which can cause `api.dayclaw.com` DNS/HTTPS failures or `var/state.json` write failures. Cron/project Automation findings appear as separate automation runs in Triage; routine output may stay inside Automations/Previous Runs.

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
