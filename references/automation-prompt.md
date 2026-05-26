# Codex Automation prompt

Use this prompt when creating a scheduled Codex Automation for this skill.

```text
Use the $codex-reset-watchdog skill.

Target account: `@thsottiaux` (`https://x.com/thsottiaux`). Use `TARGET_X_HANDLE=thsottiaux` unless `TARGET_X_USER_ID` is configured.

The TwitterAPI.io key should be in the local `env` or `.env` file as `TWITTERAPI_IO_KEY=...`. Do not put the key in this prompt and do not report it in Triage.

Cadence: every 30 minutes, or hourly if lower cost/noise is preferred.

Permissions: use the project `.codex/config.toml` profile `codex-reset-watchdog-net`. This task needs write access to the current workspace and outbound HTTPS to `api.twitterapi.io`; it does not require full filesystem access.

If Codex asks whether to trust the project configuration, inspect `.codex/config.toml` and trust it only if it matches the narrow `codex-reset-watchdog-net` profile.

If `dns.ok=false` persists under workspace-write, use the project-local `.codex/rules/codex-reset-watchdog.rules` compatibility rule before asking for full access. The rule allows only `node scripts/check_once.mjs` to run outside the sandbox.

Before diagnosing the script, confirm this Automation's working directory contains the latest `.codex/config.toml` and `.codex/rules/codex-reset-watchdog.rules`. If it points to an older copied folder, ask to sync `.codex/` or recreate the Automation from the updated repo.

Each run:
1. Work from the directory that contains the codex-reset-watchdog skill files.
2. Run:
   node scripts/check_once.mjs --include-replies true --hydrate-reply-context true --json
3. Read the JSON output.
4. If the command fails before producing JSON, report a Codex Triage finding with the sanitized error and command output. Do not include any secret values.
5. If JSON `status` is `transient_network_error`, do not report a finding unless `operational_error.report_to_triage` is true. Keep the automation active and retry on the next scheduled run.
6. If `operational_error.report_to_triage` is true and the failure is a repeated network/fetch failure, run:
   node scripts/check_once.mjs --diagnose-network --json
   Include the diagnostic `dns`, `http`, `network_ok`, and `hint` fields in the operational finding.
7. If `operational_error.report_to_triage` is true, report one operational finding with `root_cause`, `detail`, `attempts`, `consecutive_failures`, and `report_every_failures`.
8. If JSON `status` is `error`, report one operational finding with the sanitized `operational_error.detail`.
9. If `api_warning` is present, report one operational finding with `target`, `fetched`, `api_warning`, and `api_pages`. This means the API call succeeded but no reviewable tweets/replies were extracted.
10. If `review_items` is non-empty, judge every item using `references/llm-judge-rubric.md`:
   - promote only items that probably announce, confirm, schedule, complete, or remediate a Codex usage/quota/rate-limit reset, refill, restored allowance, or make-good;
   - use the tweet text, reply context, author, URL, created time, and event key from the item;
   - if multiple items are clearly the same thread/event, report only the strongest one;
   - if none should be promoted, do not report a finding for them.
11. Report repeated reply-context errors only when they are likely causing missed detections.
12. If JSON `status` is `ok`, `new_items` is `0`, `review_count` is `0`, `api_warning` is absent, and `operational_error` is absent, archive the automation run silently with no finding and do not write to automation memory.
13. If there are no review items, no positive LLM judgments, no API warning, and no reportable operational errors, archive the automation run with no finding and do not write routine run summaries to automation memory.
14. Write automation memory only for setup completion, configuration changes, positive reset findings, reportable operational errors, or manual user-requested diagnostics.
15. Do not send Telegram, Discord, Slack, ntfy, generic webhook, email, or any other external notification.
16. Do not manually browse X/Twitter unless the TwitterAPI.io check fails repeatedly.

Language policy:
- Include replies from the target account. Reset announcements may be replies, not only top-level posts.
- Alert when the tweet or reply is probably a pre-announcement or immediate follow-up about Codex usage, quota, rate-limit, weekly limit, cap, credits, allowance, or capacity being reset/refilled/restored/replenished/top-upped.
- Alert when a terse reply such as “yes”, “soon”, “later today”, “tomorrow”, “that’s the plan”, or “working on it” is attached to thread context about a Codex usage/quota/rate-limit reset.
- Alert when it says affected users will receive remediation or a make-good related to Codex usage limits.
- Do not alert for engineering or local-development uses of reset, such as git reset, branch reset, cache reset, config reset, environment reset, password reset, token reset, or reset button.
- Do not alert for negated statements like “no reset”, “not going to reset”, or “will not reset”, unless the surrounding context clearly says a different Codex quota reset is still planned.

State/lifecycle:
- The Automation should continue running after a finding. Do not pause or disable it after a reset alert.
- The script marks seen tweet IDs in the state file after emitting them, so the same tweet should not be reviewed again.
- A future tweet/reply with a new tweet ID should be treated as a new item and can produce a new finding.
- Do not run `node scripts/self_test.mjs`, `--prime-state`, or `--dry-run` during ordinary scheduled runs. Those are setup/pre-enable checks only.
- Normal no-op runs are expected to fetch recent tweets and return `new_items=0` after state has been primed.
- Transient TwitterAPI.io DNS/network failures are retried inside the script. One-off failures should not create noisy findings.
- Repeated `fetch failed` errors should be diagnosed with `--diagnose-network --json`; if `dns.ok=false` or `http.reached=false`, the runtime cannot reach `api.twitterapi.io`.
- Do not ask the user to enable full access unless neither the project permission profile nor the project-local rule can grant outbound HTTPS for this runtime command. Full access is broader than this Automation needs and should be treated as a last-resort fallback.
- Keep `STATE_FILE_PATH` persistent across runs. Prefer the default `var/state.json` because it is writable in Codex sandboxed runs.
```

Before enabling the automation, prime the local state once:

```bash
# Duplicate env.example to env, then replace TWITTERAPI_IO_KEY=PASTE_YOUR_TWITTERAPI_IO_KEY_HERE with the real key.
node scripts/check_once.mjs --prime-state --json
```

Then test once without state side effects:

```bash
node scripts/check_once.mjs --include-replies true --hydrate-reply-context true --dry-run --json
```

Important: dry-run validates API reading and JSON parsing, but it does not prove the Automation can write state. A real Automation run writes `seen_tweets` and `operational_failures`; keep `STATE_FILE_PATH=var/state.json` unless the configured environment can write another path.
