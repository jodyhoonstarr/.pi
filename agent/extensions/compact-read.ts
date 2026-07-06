/**
 * Compact Read Renderer
 *
 * Overrides the built-in `read` tool with a compact one-line summary by default.
 * Press Ctrl+O to expand/collapse the full file contents in the terminal.
 */

import type { ExtensionAPI, ReadToolDetails } from "@earendil-works/pi-coding-agent";
import { createReadTool } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

// Maximum lines shown in the expanded view (keeps the terminal manageable)
const MAX_EXPANDED_LINES = 200;

export default function (pi: ExtensionAPI) {
  // We need the tool's description and parameter schema; cwd is resolved per-call below.
  const toolSpec = createReadTool(process.cwd());

  pi.registerTool({
    name: "read",
    label: "read",
    description: toolSpec.description,
    parameters: toolSpec.parameters,

    // Delegate execution to a fresh tool instance using the current session cwd so
    // relative paths resolve correctly no matter where pi was launched from.
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return createReadTool(ctx.cwd).execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("read "));
      text += theme.fg("accent", args.path);
      if (args.offset !== undefined || args.limit !== undefined) {
        const parts: string[] = [];
        if (args.offset !== undefined) parts.push(`offset=${args.offset}`);
        if (args.limit !== undefined) parts.push(`limit=${args.limit}`);
        text += theme.fg("dim", ` (${parts.join(", ")})`);
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Reading…"), 0, 0);

      const content = result.content[0];
      const details = result.details as ReadToolDetails | undefined;

      // Error state
      if (result.isError || (content?.type === "text" && content.text.startsWith("Error"))) {
        const errText = content?.type === "text" ? content.text : "Read failed";
        return new Text(theme.fg("error", errText.split("\n")[0] ?? "Read failed"), 0, 0);
      }

      // Image files
      if (content?.type === "image") {
        return new Text(theme.fg("success", "Image loaded"), 0, 0);
      }

      if (content?.type !== "text") {
        return new Text(theme.fg("dim", "No content"), 0, 0);
      }

      const lines = content.text.split("\n");
      const lineCount = lines.length;

      // One-line summary shown when collapsed
      let summary = theme.fg("success", `${lineCount} lines`);
      if (details?.truncation?.truncated) {
        summary += theme.fg("warning", ` (truncated from ${details.truncation.totalLines})`);
      }

      if (!expanded) {
        return new Text(summary, 0, 0);
      }

      // Expanded view: show file contents up to MAX_EXPANDED_LINES
      const displayLines = lines.slice(0, MAX_EXPANDED_LINES);
      let output = summary;
      for (const line of displayLines) {
        output += `\n${theme.fg("toolOutput", line)}`;
      }
      if (lineCount > MAX_EXPANDED_LINES) {
        output += `\n${theme.fg("muted", `… ${lineCount - MAX_EXPANDED_LINES} more lines not shown`)}`;
      }

      return new Text(output, 0, 0);
    },
  });
}
