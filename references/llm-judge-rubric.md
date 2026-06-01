# Codex Automation LLM judge rubric

Use this rubric for every item in `review_items` emitted by `scripts/check_once.mjs`. The Node script has fetched the Dayclaw public source item and preserved available metadata; do not infer missing thread content.

## Promote to a Triage finding when

The item probably means one of these:

- Codex usage limits, weekly limits, quotas, rate limits, caps, credits, allowance, or capacity will be reset, refilled, restored, replenished, topped up, raised, or otherwise made good.
- A reset/refill/remediation is scheduled or expected soon: later today, tomorrow, this week, after a deploy, after an incident, or similar.
- Future scheduled wording is positive even if the reset has not happened yet: “will reset”, “resetting tomorrow morning”, “we are going to refill”, “limits should be restored later today”, and similar phrases qualify.
- The target author gives a terse affirmative reply only when the provided item text or metadata makes the Codex quota/usage reset context clear.
- The wording avoids the word “reset” but means the same operational outcome, for example “affected users should get their weekly allowance back” or “we’ll take care of folks who hit the limit because of the incident”.

## Do not promote when

- The reset is about git, branches, local workspace, cache, CLI config, password, tokens, settings, database, environment, session, UI reset button, or any non-quota meaning.
- The author negates the reset: no, nope, no reset, not planned, won’t, cannot, not doing that.
- The context is too vague to connect it to Codex usage/quota/rate limits.
- The tweet is only a generic outage/status update with no limit reset, refill, restored allowance, compensation, or make-good meaning.
- The judgment relies on speculation outside the provided item text and metadata.

## Output expectation inside Codex Automation

If you promote an item, create one concise Codex Triage finding containing:

- why it likely signals a Codex reset/refill/restored allowance/remediation;
- reset timing, including the item wording and an absolute date derived from `created_at` when possible;
- item text and available context when relevant;
- author, created time, URL, and event key.

If several items are clearly the same reset event, report only the strongest one. Mention that duplicates were ignored.

If no item should be promoted, create no Triage finding and return the concise no-reset run summary described in `SKILL.md`.
