Use the $codex-reset-watchdog skill.

Run from the current Codex Project runtime directory:

Command:
node scripts/check_once.mjs --json

The current directory must contain `scripts/check_once.mjs`. If it does not, report a setup error and ask the user to rerun the install/init prompt in the dedicated Project so the runtime files are copied into the Project root. Do not search for or switch to `~/.codex/skills/codex-reset-watchdog` during Automation runs.

Follow the skill's Automation run protocol. Return an emoji-led actionable/no-action report. Alert only for future actionable resets; treat completed or past reset posts as historical context.

Do not emit progress narration while running. Do not inspect or update automation memory during routine runs.

If JSON status is `transient_network_error`, `network_diagnostic`, or `error`, treat it as a watchdog operational issue, not a possible Codex reset. Never use the reset banners for source/network/state failures.

Omit the full repeated table on routine `new_items=0` runs when no future actionable or unclear signal remains. Do not output raw JSON, process narration, or routine memory notes.
