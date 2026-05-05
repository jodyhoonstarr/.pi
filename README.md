# pi config

Personal [pi](https://github.com/mariozechner/pi-coding-agent) coding agent setup.

## Extensions
- **ask-do-commands** — Adds `/ask` (read-only), `/do` (full access), and `/normal` (toggle) slash commands; regular prompts default to ASK mode automatically
- **filesystem-search-tools** — Registers `fd`, `rg`, and `fzf` as safe, sandboxed pi tools (no general bash access)
- **web-fetch** — Overrides the built-in `fetch_web` tool; fetches pages via curl, converts to Markdown, and saves full content to a temp file when output is truncated

## Skills
- **edit-tool-usage** — Guidelines for correct edit tool parameter formatting
- **fast-filesystem-search** — Instructions for preferring `fd`/`rg`/`fzf` over slower alternatives
- **task-completion** — Enforces strict task boundaries in `/do` mode to prevent scope creep
