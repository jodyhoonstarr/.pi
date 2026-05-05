---
name: edit-tool-usage
description: Critical guidelines for using the edit tool to modify files. Prevents common parameter formatting errors and environment issues. Load before any file editing operation.
compatibility: Available in DO mode only. Not available in ASK mode (read-only).
allowed-tools: edit
metadata:
  activation-triggers: edit file modify replace change update
---

# Edit Tool Usage

**CRITICAL: Read this before every edit tool call**

## Parameter Format Rules

1. **`edits` parameter must be NATIVE ARRAY** - never JSON-encoded string
   ```
   ✅ Correct: "edits": [{"oldText": "original", "newText": "replacement"}]
   ❌ Wrong:   "edits": "[{\"oldText\": \"original\", \"newText\": \"replacement\"}]"
   ```

2. **Multiple edits in single call**:
   ```
   "edits": [
     {"oldText": "first change", "newText": "replacement 1"},
     {"oldText": "second change", "newText": "replacement 2"}
   ]
   ```

3. **Exact text matching**: `oldText` must match exactly in the file

## Environment Requirements

- **DO mode**: Edit tool available, can modify files
- **ASK mode**: Edit tool NOT available, provide instructions instead

## Common Error Prevention

- Error "edits: must be array" = you passed JSON string instead of native array
- Always construct `edits` as direct array structure in function call
- Never use `JSON.stringify()` or equivalent on the `edits` parameter

## Before Every Edit Call

1. Check if in DO mode (edit tool available)
2. Verify `edits` is constructed as native array
3. Ensure `oldText` matches exactly what's in the file
4. Use single edit call with multiple entries for related changes