# Codex Automation prompt

Use this prompt when creating a scheduled Codex Automation for this skill.

```text
Use the $codex-reset-watch skill.

Target account: `@thsottiaux` (`https://x.com/thsottiaux`). Use `TARGET_X_HANDLE=thsottiaux` unless `TARGET_X_USER_ID` is configured.

The TwitterAPI.io key should be in the local `.env` file as `TWITTERAPI_IO_KEY=...`. Do not put the key in this prompt and do not report it in Triage.

Cadence: every 30 minutes, or hourly if lower cost/noise is preferred.

Each run:
1. Work from the directory that contains the codex-reset-watch skill files.
2. Run:
   python scripts/check_once.py --include-replies true --hydrate-reply-context true --json
3. Read the JSON output.
4. If the command fails, report a Codex Triage finding with the error and the command output. Do not include any secret values.
5. If `alerts > 0` and `finding_markdown` exists, report `finding_markdown` as a Codex Triage finding.
6. If `llm_review_candidates` is non-empty, judge those candidates using `references/llm-judge-rubric.md`:
   - promote only candidates that probably announce or confirm a Codex usage/quota/rate-limit reset, refill, restored allowance, or remediation;
   - use `finding_markdown_if_promoted` as the body for promoted candidates;
   - if multiple candidates are clearly the same thread/event, report only the strongest one;
   - if none should be promoted, do not report a finding for them.
7. Report repeated reply-context errors only when they are likely causing missed detections.
8. If there are no deterministic alerts, no promoted LLM-review candidates, and no operational errors, archive the automation run with no finding.
9. Do not send Telegram, Discord, Slack, ntfy, generic webhook, email, or any other external notification.
10. Do not manually browse X/Twitter unless the TwitterAPI.io check fails.

Language policy:
- Include replies from the target account. Reset announcements may be replies, not only top-level posts.
- Alert when the tweet or reply is probably a pre-announcement or immediate follow-up about Codex usage, quota, rate-limit, weekly limit, cap, credits, allowance, or capacity being reset/refilled/restored/replenished/top-upped.
- Alert when a terse reply such as “yes”, “soon”, “later today”, “tomorrow”, “that’s the plan”, or “working on it” is attached to thread context about a Codex usage/quota/rate-limit reset.
- Alert when it says affected users will receive remediation or a make-good related to Codex usage limits.
- Do not alert for engineering or local-development uses of reset, such as git reset, branch reset, cache reset, config reset, environment reset, password reset, token reset, or reset button.
- Do not alert for negated statements like “no reset”, “not going to reset”, or “will not reset”, unless the surrounding context clearly says a different Codex quota reset is still planned.

State/lifecycle:
- The Automation should continue running after a finding. Do not pause or disable it after a reset alert.
- The script marks seen tweet IDs in the state file, so the same tweet should not alert again.
- A future tweet/reply with a new tweet ID or new event key should be treated as a new candidate and can produce a new finding.
- Keep `STATE_FILE_PATH` persistent across runs, preferably `~/.cache/codex-reset-watch/state.json`.
```

Before enabling the automation, prime the local state once:

```bash
cp .env.example .env
# Edit .env and replace TWITTERAPI_IO_KEY=PASTE_YOUR_TWITTERAPI_IO_KEY_HERE with the real key.
python scripts/check_once.py --prime-state --json
```

Then test once without state side effects:

```bash
python scripts/check_once.py --include-replies true --hydrate-reply-context true --dry-run --json
```
