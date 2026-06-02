# codex-reset-watchdog

[中文说明](README.zh-CN.md)

This skill monitors public X posts from Codex lead [thsottiaux](https://x.com/thsottiaux), detects future-actionable Codex reset signals, and outputs findings through Codex Automation. It helps users learn about major changes before a reset happens, so they can spend remaining quota intentionally, including switching to fast mode when useful.

## How To Use?

### Step 1: Create A Codex Project First

Create a dedicated Codex Project for this monitor, for example `Codex Reset Watchdog`.

⚠️ Note: do not run the prompt below in a normal Chat.

### Step 2: In That Project, Copy The Prompt To Install The Skill And Create The Automation

Open the Project you just created, start a new chat inside that Project, then paste the prompt below. Codex will install this skill, prepare the runtime files in the current workspace, run the basic checks, prime baseline state, and create the hourly Automation.

```text
Quietly install, initialize, and enable codex-reset-watchdog:
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
9. Read the full contents of references/automation-prompt.md as the Automation prompt.
10. Use the Codex Automation tool to create or update a cron/project Automation named Codex Reset Watchdog: hourly cadence, ACTIVE status, Local execution, and cwd/cwds set to the current workspace root. If the Automation tool is not already available, search for automation_update first. Look for an existing Automation with the same name or id and update it instead of creating a duplicate. If the Automation tool is still unavailable or its schema is unclear, summarize that as a setup blocker; do not repeatedly trial-create invalid Automations.
11. Final summary only: runtime directory, install source directory, self-test, prime/dry-run status, state.path, source health, Automation name/status/cadence/execution/cwd/prompt source, and Run Now expectation. Do not paste raw JSON.
```

### Step 3: Test The Automation

After creation, click **Run Now** on the Automation detail page. As expected, you should see the latest chat output inside the `Codex Reset Watchdog` Project.

![previous runs screenshot](images/previous-runs.png)

When a possible reset signal appears, the result looks like this:

🚨 Actionable Codex reset ahead: paid ChatGPT Codex limits are scheduled to reset. Reset timing: 2026-06-03 morning (Asia/Shanghai).

| Time | Evidence | Reset timing | Actionability | Link |
| --- | --- | --- | --- | --- |
| 2026-06-02 22:15 Asia/Shanghai | Said limits are "resetting tomorrow morning". | 2026-06-03 morning | 🚨 future | https://x.com/example/status/3 |

Action: use remaining Codex quota before the reset; consider fast mode if it helps spend down quota.

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

## FAQ

**Q: Why not use a normal chat?**

Because Codex Automation sandbox restrictions can prevent the required install, check, and state-write operations from completing in a normal chat. Use a Project instead.

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
