Use the $codex-reset-watchdog skill.

Run from the installed codex-reset-watchdog working directory:

Command:
node scripts/check_once.mjs --json

Follow the skill's Automation run protocol. Return an emoji-led actionable/no-action report. Alert only for future actionable resets; treat completed or past reset posts as historical context.

If there is an actionable future reset, an unclear future reset that needs human review, or `notification_test=true`, create a new Codex Thread if the `create_thread` tool is available. Use a projectless thread, title/prompt it as `🚨 Codex reset alert` or `TEST Codex reset watchdog`, and include reset timing, evidence, source link, and whether this is TEST. If any older skill text says only to create a Triage finding, this Thread-first instruction wins. If thread creation is unavailable, create a Triage/Inbox finding instead.

Omit the full repeated table on routine `new_items=0` runs when no future actionable or unclear signal remains. Do not output raw JSON, process narration, or routine memory notes.
