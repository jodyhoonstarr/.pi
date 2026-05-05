# pi config

Personal [pi](https://github.com/mariozechner/pi-coding-agent) coding agent setup.

## Settings
- Default provider: GitHub Copilot
- Default model: `claude-sonnet-4.6`
- Thinking blocks hidden
- Theme: `pi-cursor-theme`

## Extensions
- **ask-do-commands** — Adds `/ask` (read-only), `/do` (full access), and `/normal` (toggle) slash commands; regular prompts default to ASK mode automatically
- **filesystem-search-tools** — Registers `fd`, `rg`, and `fzf` as safe, sandboxed pi tools (no general bash access)

## Skills
- **edit-tool-usage** — Guidelines for correct edit tool parameter formatting
- **fast-filesystem-search** — Instructions for preferring `fd`/`rg`/`fzf` over slower alternatives
- **task-completion** — Enforces strict task boundaries in `/do` mode to prevent scope creep
