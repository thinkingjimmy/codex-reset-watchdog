Use the $codex-reset-watchdog skill.

Run from the installed codex-reset-watchdog working directory:

Command:
node scripts/check_once.mjs --json

Follow the skill's Automation run protocol. Return an emoji-led actionable/no-action report. Alert only for future actionable resets; treat completed or past reset posts as historical context.

Omit the full repeated table on routine `new_items=0` runs when no future actionable or unclear signal remains. Do not output raw JSON, process narration, or routine memory notes.
