---
name: fast-filesystem-search
description: Use fd, rg, and fzf for fast filesystem discovery and content search. Prefer these tools over find, grep, and broad ls-based exploration when locating files, directories, filenames, paths, or matching text.
compatibility: Requires /usr/bin/fd, /usr/bin/rg, and /usr/bin/fzf to be available.
allowed-tools: read fd rg fzf
metadata:
  preferred-commands: fd rg fzf
---

# Fast Filesystem Search

## Priority

1. `fd` — find files and directories by name/path
2. `rg` — search file contents; also safe for path-scoped file listing
3. `fzf` — fuzzy narrow when you already have a candidate list

Avoid `find`, `grep -R`, and broad `ls -R` when the above tools can express the query.

## Tool Selection

### `fd` — filename/path search

Use for finding files or directories by name. **Do not combine `path` and `pattern` together** — the tool inverts the argument order and `fd` will error.

```
fd tool with pattern="nvim", type="d"
fd tool with pattern="component"
fd tool with extension="ts", path="src"     # extension + path is safe
```

> **⚠️ `path` + `pattern` bug:** When both are set, arguments are inverted and fd errors.
> **Workaround:** Use `pattern` alone, or use `rg` with `listFiles=true` when you need both a path scope and a name filter.

### `rg` — content search and scoped file listing

Use for searching inside files, finding references/symbols/config values, or listing files under a path. **Always provide a `path` scope.**

```
rg tool with pattern="TODO", path="src", lineNumbers=true
rg tool with pattern="vite-plus", path="src", filesOnly=true
rg tool with listFiles=true, path="src/components", pattern="."
rg tool with listFiles=true, path="src", pattern=".", glob="*.ts"
```

> **⚠️ Unscoped `rg` in large projects:** Omitting `path` causes `rg` to search vendored and generated directories (e.g. `node_modules/`, `vendor/`, `.venv/`, `target/`) and can produce errors or timeouts. Always provide `path` unless you explicitly intend a full-tree search and no large dependency trees are present.

> **⚠️ Pipe (`|`) in `pattern` bug:** Shell may interpret `|` as a pipe operator.
> **Workaround:** Issue separate `rg` calls per term instead of using alternation.

### `fzf` — fuzzy narrowing

Use after `fd` or `rg` when there are many candidates and exact names are uncertain.

```
fzf tool with input="<candidate list>", filter="vite config", selectOne=true
```

## Pre-Search Checklist

Before issuing any search, answer these questions:

1. **Is the target local source or an external package?**
   - Bare/external import (e.g., `from 'some-lib'`, `import "github.com/..."`, `require 'rails'`) → the code lives in the language's dependency directory (`node_modules/`, `vendor/`, `.venv/`, etc.), not `src/`
   - Relative import (e.g., `from './heap'`) → search `src/`
2. **What is the correct `path` scope?** Never leave it unset.
3. **Are vendored or generated directories (e.g. `node_modules/`, `vendor/`, `.venv/`, `target/`) in the search path, and should they be?**

When a search returns no results or errors, the first hypothesis should be **"unscoped search hit a large tree"** — not "tool unavailable." Re-issue with a narrower `path` before falling back to built-in tools.

## Heuristics

- **File/folder/path lookup** → start with `fd`
- **Definition, reference, import, config value** → start with `rg` with a `path` scope
- **Both path scope and name pattern** → use `rg` with `listFiles=true` (avoids `fd` bug)
- **External package symbol** → scope `rg` to the language's dependency directory (e.g. `node_modules/<pkg>/src`, `vendor/<pkg>`, `.venv/lib/<pkg>`)
- **Many candidates, uncertain name** → pipe results into `fzf`
- **Known full path** → use `ls` directly, not `fd`
- Fall back to `find`/`grep` only if these tools can't express the query
