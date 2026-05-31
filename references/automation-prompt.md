# Codex Automation prompt

Use this prompt when creating a scheduled Codex Automation for this skill.

```text
Use the $codex-reset-watchdog skill.

Target account: `@thsottiaux` (`https://x.com/thsottiaux`). Use `TARGET_X_HANDLE=thsottiaux` unless `DAYCLAW_SOURCE_ITEMS_URL` is configured.

Public source: `https://apitest.dayclaw.com/api/source/public/x/thsottiaux/items`. No API key is required.

Cadence: hourly.

Permissions: use the project `.codex/config.toml` profile `codex-reset-watchdog-net`. This task needs write access to the current workspace and outbound HTTPS to `apitest.dayclaw.com`; it does not require full filesystem access.

If Codex asks whether to trust the project configuration, inspect `.codex/config.toml` and trust it only if it matches the narrow `codex-reset-watchdog-net` profile.

If `dns.ok=false` persists under workspace-write, use the project-local `.codex/rules/codex-reset-watchdog.rules` compatibility rule before asking for full access. The rule allows only `node scripts/check_once.mjs` to run outside the sandbox.

Before diagnosing the script, confirm this Automation's working directory contains the latest `.codex/config.toml` and `.codex/rules/codex-reset-watchdog.rules`. If it points to an older copied folder, ask to sync `.codex/` or recreate the Automation from the updated repo.

Each run:
1. Work from the directory that contains the codex-reset-watchdog skill files.
2. Run:
   node scripts/check_once.mjs --json
3. Read the JSON output.
4. If the command fails before producing JSON, report a Codex Triage finding with the sanitized error and command output. Do not include any secret values.
5. If JSON `status` is `transient_network_error`, do not report a finding unless `operational_error.report_to_triage` is true. Keep the automation active and retry on the next scheduled run.
6. If `operational_error.report_to_triage` is true and the failure is a repeated network/fetch failure, run:
   node scripts/check_once.mjs --diagnose-network --json
   Include the diagnostic `dns`, `http`, `network_ok`, and `hint` fields in the operational finding.
7. If `operational_error.report_to_triage` is true, report one operational finding with `root_cause`, `detail`, `attempts`, `consecutive_failures`, and `report_every_failures`.
8. If JSON `status` is `error`, report one operational finding with the sanitized `operational_error.detail`.
9. If `api_warning` is present, report one operational finding with `source_url`, `fetched`, `api_warning`, and `api_pages`. This means the API call succeeded but no reviewable items were extracted.
10. If `review_items` is non-empty, judge every item using `references/llm-judge-rubric.md`:
   - promote only items that probably announce, confirm, schedule, complete, or remediate a Codex usage/quota/rate-limit reset, refill, restored allowance, or make-good;
   - use the item text, author, URL, created time, and event key from the item;
   - if multiple items are clearly the same event, report only the strongest one;
   - if none should be promoted, do not report a finding for them.
11. Always finish with a concise human run summary instead of raw JSON. Codex Automations may use the same prompt for both scheduled runs and the Test button, so do not rely on knowing which one triggered the run.
12. If JSON `status` is `ok`, `new_items` is `0`, `review_count` is `0`, no `api_warning`, and no `operational_error`, say the watchdog is healthy and no new public items were found since the primed baseline.
13. If there are no review items, no positive LLM judgments, no API warning, and no reportable operational errors, do not create a Triage finding, do not write automation memory, and summarize that no reset signal was found.
14. The run summary is allowed to appear in Automation run logs and Test results; it must not become a Triage finding unless a positive reset signal or reportable operational error exists.
15. Write automation memory only for setup completion, configuration changes, positive reset findings, reportable operational errors, or manual user-requested diagnostics.
16. Do not send Telegram, Discord, Slack, ntfy, generic webhook, email, or any other external notification.
17. Do not manually browse X/Twitter unless the Dayclaw public source fails repeatedly.

Run summary format:
- Start with one sentence: "Codex Reset Watchdog is healthy" or "Codex Reset Watchdog needs attention."
- Then include 3-5 bullets:
  - Dayclaw source reachability and source URL.
  - State path and whether fallback was used.
  - Fetched item count and new item count.
  - Reset finding status: reported, not reported, or not evaluated due to operational error.
  - Next scheduled behavior.
- Do not paste the full JSON object. Mention only the fields needed for a human to understand the result.

Language policy:
- Alert when the item is probably a pre-announcement or immediate follow-up about Codex usage, quota, rate-limit, weekly limit, cap, credits, allowance, or capacity being reset/refilled/restored/replenished/top-upped.
- Alert when it says affected users will receive remediation or a make-good related to Codex usage limits.
- Do not alert for engineering or local-development uses of reset, such as git reset, branch reset, cache reset, config reset, environment reset, password reset, token reset, or reset button.
- Do not alert for negated statements like “no reset”, “not going to reset”, or “will not reset”, unless the surrounding context clearly says a different Codex quota reset is still planned.
- The Dayclaw public feed may mark replies, but it does not provide full parent-thread hydration. Do not invent missing thread context.

State/lifecycle:
- The Automation should continue running after a finding. Do not pause or disable it after a reset alert.
- The script marks seen item IDs in the state file after emitting them, so the same item should not be reviewed again.
- A future item with a new ID should be treated as a new item and can produce a new finding.
- Do not run `node scripts/self_test.mjs`, `--prime-state`, or `--dry-run` during ordinary scheduled runs. Those are setup/pre-enable checks only.
- Normal no-op runs are expected to return `new_items=0` after state has been primed.
- No-op runs should produce a readable run summary but should not create Triage findings, external notifications, or routine automation memory.
- Transient Dayclaw DNS/network failures are retried inside the script. One-off failures should not create noisy findings.
- Repeated `fetch failed` errors should be diagnosed with `--diagnose-network --json`; if `dns.ok=false` or `http.reached=false`, the runtime cannot reach `apitest.dayclaw.com`.
- Do not ask the user to enable full access unless neither the project permission profile nor the project-local rule can grant outbound HTTPS for this runtime command. Full access is broader than this Automation needs and should be treated as a last-resort fallback.
- Keep `STATE_FILE_PATH` persistent across runs. Prefer the default `var/state.json` because it is writable in Codex sandboxed runs.
```

Before enabling the automation, prime the local state once:

```bash
node scripts/check_once.mjs --prime-state --json
```

Then test once without state side effects:

```bash
node scripts/check_once.mjs --dry-run --json
```

Important: dry-run validates API reading and JSON parsing, but it does not prove the Automation can write state. A real Automation run writes `seen_tweets` and `operational_failures`; keep `STATE_FILE_PATH=var/state.json` unless the configured environment can write another path.

When the user clicks **Test** in Codex Automations after setup, the expected healthy result is the same short run summary used for every run, not raw command output. If the current batch was already primed, `new_items=0` and `review_count=0` are healthy.
