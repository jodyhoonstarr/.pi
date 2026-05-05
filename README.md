# pi config

Personal [pi](https://pi.dev) coding agent setup.

## Extensions

- **ask-do-commands** — Adds `/ask` (read-only,default), `/do` (full access) modes
- **filesystem-search-tools** — Registers `fd`, `rg`, and `fzf` as safe, sandboxed pi tools (no general bash access)
- **web-fetch** — Overrides the built-in `fetch_web` tool; fetches pages via curl, converts to Markdown, and saves full content to a temp file when output is truncated

## Skills

- **edit-tool-usage** — Guidelines for correct edit tool parameter formatting
- **fast-filesystem-search** — Instructions for preferring `fd`/`rg`/`fzf` over slower alternatives
- **task-completion** — Enforces strict task boundaries in `/do` mode to prevent scope creep
