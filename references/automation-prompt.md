# Codex Automation prompt

Use this prompt when creating a scheduled Codex Automation for this skill.

```text
Use the $codex-reset-watchdog skill.

Target account: `@thsottiaux` (`https://x.com/thsottiaux`). Use `TARGET_X_HANDLE=thsottiaux` unless `TARGET_X_USER_ID` is configured.

The TwitterAPI.io key should be in the local `env` or `.env` file as `TWITTERAPI_IO_KEY=...`. Do not put the key in this prompt and do not report it in Triage.

Cadence: every 30 minutes, or hourly if lower cost/noise is preferred.

Each run:
1. Work from the directory that contains the codex-reset-watchdog skill files.
2. Run:
   node scripts/check_once.mjs --include-replies true --hydrate-reply-context true --json
3. Read the JSON output.
4. If the command fails before producing JSON, report a Codex Triage finding with the sanitized error and command output. Do not include any secret values.
5. If JSON `status` is `transient_network_error`, do not report a finding unless `operational_error.report_to_triage` is true. Keep the automation active and retry on the next scheduled run.
6. If `operational_error.report_to_triage` is true, report one operational finding with `root_cause`, `detail`, `attempts`, and `consecutive_failures`.
7. If JSON `status` is `error`, report one operational finding with the sanitized `operational_error.detail`.
8. If `api_warning` is present, report one operational finding with `target`, `fetched`, `api_warning`, and `api_pages`. This means the API call succeeded but no reviewable tweets/replies were extracted.
9. If `review_items` is non-empty, judge every item using `references/llm-judge-rubric.md`:
   - promote only items that probably announce, confirm, schedule, complete, or remediate a Codex usage/quota/rate-limit reset, refill, restored allowance, or make-good;
   - use the tweet text, reply context, author, URL, created time, and event key from the item;
   - if multiple items are clearly the same thread/event, report only the strongest one;
   - if none should be promoted, do not report a finding for them.
10. Report repeated reply-context errors only when they are likely causing missed detections.
11. If there are no review items, no positive LLM judgments, no API warning, and no reportable operational errors, archive the automation run with no finding.
12. Do not send Telegram, Discord, Slack, ntfy, generic webhook, email, or any other external notification.
13. Do not manually browse X/Twitter unless the TwitterAPI.io check fails repeatedly.

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
- Transient TwitterAPI.io DNS/network failures are retried inside the script. One-off failures should not create noisy findings.
- Keep `STATE_FILE_PATH` persistent across runs, preferably `~/.cache/codex-reset-watchdog/state.json`.
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
