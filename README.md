# codex-reset-watchdog

[中文说明](README.zh-CN.md)

This skill monitors public X posts from Codex lead `thsottiaux`, detects future-actionable Codex reset signals, and outputs findings through Codex Automation. It helps users learn about major changes before a reset happens, so they can spend remaining quota intentionally, including switching to fast mode when useful.

## How To Use?

### Step 1: Copy And Paste The Prompt, Then Install The Skill

Open Codex, click **New Chats**, start a new chat, then paste the prompt below. Codex will install this skill, run the basic checks, prime baseline state, and create an hourly Automation.

```text
Install and set up the codex-reset-watchdog skill from GitHub:
https://github.com/thinkingjimmy/codex-reset-watchdog

Use Codex's skill installation workflow if available. If no installer is available, clone this repo and use that directory as the Automation working directory.

After installation:
1. Find the skill directory that contains SKILL.md and scripts/check_once.mjs.
2. Run node scripts/self_test.mjs.
3. Run node scripts/check_once.mjs --prime-state --json to create the baseline state.
4. Run node scripts/check_once.mjs --dry-run --json once to confirm the Dayclaw public source, JSON parsing, and state dedupe.
5. Create an hourly Codex Automation:
   - working directory/cwds: the installed codex-reset-watchdog directory
   - prompt: use the full contents of references/automation-prompt.md exactly; it is only a thin launcher that tells Automation to use the skill
   - permissions: if the Automation tool has no permissions field, rely on the installed directory's .codex/config.toml profile codex-reset-watchdog-net
6. When calling the Codex Automation creation tool, do not guess its parameter shape:
   - inspect the tool schema or an existing Automation config first;
   - use the hourly schedule format accepted by the current tool; if the schema shows `rrule`, prefer `RRULE:FREQ=HOURLY;INTERVAL=1`;
   - pass the working directory as `cwd` or `cwds` exactly as the current tool expects; do not guess string vs array;
   - if the schema has no `command` or `permissions` fields, do not invent them; the command lives in the thin prompt, and permissions come from `.codex/config.toml`;
   - if the current tool actually requires `model` and `reasoningEffort`/`reasoning`, include them even if the schema marks them optional;
   - after creation, read the Automation back and confirm cadence, working directory, active status, command, and prompt were not rewritten by the tool layer.
7. Give me a concise setup summary: success/failure, Automation cadence, working directory, state path, and what I should see when I click Codex Test/Run Now. Note that Test/Run Now immediately runs the same Automation prompt; it is not a special test mode and cannot pass one-off parameters for that run.

Do not paste raw JSON unless I explicitly ask. In the final summary, do not narrate schema retries that were already successfully resolved; mention them only if creation ultimately fails or I ask for debugging. Do not enable full access unless the narrow network permission path is unavailable and you explain the tradeoff first.
```

### Step 2: Test And Configure The Automation

If everything works, click **Automations** in the Codex left navigation. You should see an Automation named **Codex Reset Watchdog**. Open its detail page:

1. Click **Run Now** in the top right.
2. You should see a new run under **Previous Runs**. Open it to inspect the details.
3. Automation output may stay inside Automations instead of appearing in normal chats. You also need to set the Automation **Project** to **Chats**. After that, findings produced by the Automation will appear in Chats, making them easier to review day to day. If recent `thsottiaux` posts are parsed correctly and the report says whether action is needed, the basic workflow is working.

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
