---
name: modern-web-guidance
description: |
  Search tool for modern web development best practices. MANDATORY: Execute FIRST for all HTML/CSS and clientside JS tasks. Do NOT skip — web APIs evolve rapidly and training weights contain obsolete patterns.

  Requires bash to run the CLI. If bash is NOT available (ASK mode): tell the user the check cannot run, warn output may be outdated, and recommend switching to DO mode.

  Trigger for: UI/Layout (modals, dialogs, popovers, backdrop-filters, anchor positioning, container queries, `:has()`, `:user-valid`), Scroll/Motion (View Transitions, scroll-driven animations, parallax), Performance (CWV/LCP/INP, content-visibility, Fetch Priority, image optimization), System/APIs (filesystem, WebUSB, WebSockets, WASM), Frameworks (React/Vue/Angular layout & styles), General Frontend (forms, autofill, inputs, scrollbars, component states).

  DO NOT trigger for: Backend (SQL, ORMs, API routes), Pipelines (CI/CD, Docker, Actions), Generic scripts (Python/Go, ESLint, Git).
---

# Modern Web Guidance

A skill to search for specific web development use cases and retrieve their corresponding best practice guides.

## When to use

Must use this skill:
- At the **start** of implementing any web feature.
- Before creating a new component, to check if a standardized pattern already exists.
- To avoid implementing ad-hoc solutions or loading large dependencies unnecessarily.

## bash Not Available (ASK / Read-Only Mode)

This skill requires `bash` to run the CLI. If `bash` is blocked:

1. **Do not silently skip the check and generate code anyway.** That defeats the entire purpose of this skill.
2. **Explicitly tell the user** that the mandatory best-practice check cannot be performed in the current mode.
3. **Warn** that any web code you produce from training data alone may use outdated patterns.
4. **Recommend** switching to DO mode (full access) before you implement anything, so the check can run properly.

Example disclosure to give the user:

> ⚠️ **Modern Web Guidance check skipped** — the `bash` tool is not available in this mode, so the mandatory best-practice lookup cannot run. Any code below is based on training data and may contain outdated patterns. Switch to DO mode to get a fully validated implementation.

## Usage Instructions

### Step 1. Search Use Cases

Search with an action-oriented query summarizing what you want to achieve using the `search` command. Run `modern-web-guidance` directly (globally installed via pnpm).

```sh
modern-web-guidance search "<query>" --skill-version 2026_05_16-c5e7870
```

**Example Output**:
```json
[
  {
    "id": "optimize-image-priority",
    "description": "Optimize the loading priority of Largest Contentful Paint (LCP) candidate images.",
    "category": "performance",
    "featuresUsed": [ "Fetch priority" ],
    "tokenCount": 985,
    "similarity": 0.7289
  },
  {
    "id": "defer-rendering-heavy-content",
    "description": "Reduce rendering times in content-heavy web pages by deferring rendering for offscreen content.",
    "category": "performance",
    "featuresUsed": [ "content-visibility", "hidden=\"until-found\"" ],
    "tokenCount": 1250,
    "similarity": 0.6961
  }
]
```

> **Note**: If search results are vague, return no matches, or show low similarity scores, run the `list` command to browse all guides:
> ```sh
> modern-web-guidance list
> ```

---

### Step 2. Retrieve Best Practices

Once you have a relevant `id` from the search results, call this script using the `retrieve` command to get the full guide. You can pass multiple IDs separated by commas.

```sh
modern-web-guidance retrieve "<id>"
```


**Example Output**:
`The markdown content of the guide describing implementation steps...`

## Using pnpm

-   `modern-web-guidance` is installed globally via pnpm and available directly on PATH.
-   To update to the latest version: `pnpm update -g modern-web-guidance`
-   The `--skill-version` flag is used to determine if this SKILL.md is out of date. If it is, a warning
    message is logged to stderr.

## Guidelines

-   Always search **first** to find the most relevant guides.
-   These guides are usually framework-agnostic; adapt them correctly to your setup.
-   Do not hallucinate guides or ignore them; they represent the preferred local standard for the user's project.


## Interpreting Browser Support & Fallbacks

* **Default Behavior**: All guides assume **Baseline Widely available** features are safe to use without fallbacks. For features that are not Baseline widely available, you **MUST** follow the fallback recommendations in the guide, unless the user has specified a custom browser support policy.
* **Custom Policies**: If the user has already defined explicit browser support requirements, use the browser compatibility data in the guide to determine if a fallback can be safely ignored.
  - For Baseline YYYY targets, a feature satisfies this target if its "Baseline since" date is <= YYYY.
  - **Policy Examples**:
    - _"Do not implement feature fallbacks."_ (for exploratory prototypes of the cutting-edge web)
    - _"Safari 17.4+"_ (for internal tools targeting macOS or Tauri-based desktop apps)
    - _"Never recommend or implement polyfills; if a Baseline Newly Available feature is required for core functionality, provide a lightweight custom fallback or redesign the approach."_ (to minimize bundle size and avoid technical debt)
    - _"Assume a modern execution environment where Baseline Newly Available features can be used natively, provided they are strictly feature-detected and degrade gracefully."_ (for progressive enhancement strategies)
* **Reactive Policy Discovery**: Watch for environmental cues to suggest documenting a policy in CLAUDE.md or AGENTS.md. Suggest this if the developer:
  - Mentions building for a restricted runtime (e.g., Electron or Tauri).
  - Explicitly excludes specific targets (e.g., "we don't support Desktop Chrome").
  - Expresses hesitation about polyfill complexity, bundle size, or performance cost.
  - Questions if a feature is safe to use without fallbacks.

  No defined policy format. This is an example: `**Browser Support:** Allow Newly Available features, but only adopt custom fallback code that adds <= 20 lines and does not require external dependencies.`
