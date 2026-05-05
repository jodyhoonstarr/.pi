# pi config

Personal [pi](https://pi.dev) coding agent setup.

## Extensions

- **ask-do-commands**: `/ask` (read-only), `/do` (full access), `/normal` (toggle) slash commands; regular prompts default to ASK mode
- **filesystem-search-tools**: `fd`, `rg`, and `fzf` as sandboxed pi tools without general bash access
- **web-fetch**: overrides built-in `fetch_web`; fetches via curl, converts to Markdown, saves full content to temp file on truncation

## Skills

- **edit-tool-usage**: correct edit tool parameter formatting
- **fast-filesystem-search**: prefer `fd`/`rg`/`fzf` over slower alternatives
- **task-completion**: strict task boundaries in `/do` mode to prevent scope creep
