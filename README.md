# pi config

Personal [pi](https://pi.dev) coding agent setup.

## Settings

- **Provider**: `github-copilot`
- **Default model**: `claude-sonnet-4.6` (used as the DO mode / resting model when auto-ask is off)
- **Packages**: `pi-cursor-theme`
- **Hide thinking block**: enabled

## Extensions

- **ask-do-commands**: `/ask` (read-only), `/do` (full access), `/normal` (toggle) slash commands; regular prompts default to ASK mode
  - **ASK mode model**: `claude-haiku-4.5` — smaller, faster model for read-only analysis
  - **DO mode model**: `claude-sonnet-4.6` — more capable model for making changes
  - After each turn, resets to the resting model (Haiku if auto-ask on, Sonnet if off)
  - DO mode injects a prior-context warning reminding the agent to re-evaluate ASK mode conclusions independently
- **web-fetch**: overrides built-in `fetch_web`; fetches via curl, converts to Markdown, saves full content to temp file on truncation

## Skills

- **edit-tool-usage**: correct edit tool parameter formatting (DO mode only)
- **task-completion**: strict task boundaries in `/do` mode to prevent scope creep
