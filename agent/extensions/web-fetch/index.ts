import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchUrlToMarkdown as fetchUrlToMarkdownCore } from "./core.mjs";

export interface FetchWebParams {
  url: string;
  timeoutMs?: number;
}

export interface FetchWebResult {
  markdown: string;
  title: string;
  extracted: boolean;
  truncated: boolean;
  fullOutputPath?: string;
}

const FETCH_WEB_PARAMS = Type.Object({
  url: Type.String({ description: "The URL to fetch" }),
  timeoutMs: Type.Optional(
    Type.Number({ description: "Request timeout in milliseconds", default: 30000 }),
  ),
});

export async function fetchUrlToMarkdown(
  pi: Pick<ExtensionAPI, "exec">,
  params: FetchWebParams,
  signal?: AbortSignal,
): Promise<FetchWebResult> {
  const fetched = await fetchUrlToMarkdownCore(
    (command, args, options) => pi.exec(command, args, options),
    params,
    { signal },
  );

  const truncation = truncateHead(fetched.markdown, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let markdown = truncation.content;
  let fullOutputPath: string | undefined;

  if (truncation.truncated) {
    const tempDir = await mkdtemp(join(tmpdir(), "pi-fetch-web-"));
    fullOutputPath = join(tempDir, "page.md");
    await writeFile(fullOutputPath, fetched.markdown, "utf8");

    markdown +=
      `\n\n[Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines` +
      `, ${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}.` +
      ` Full markdown saved to: ${fullOutputPath}]`;
  }

  return {
    markdown,
    title: fetched.title,
    extracted: fetched.extracted,
    truncated: truncation.truncated,
    fullOutputPath,
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "fetch_web",
    label: "Fetch Web",
    description:
      `Fetch a web page with curl, extract readable content, and convert it to Markdown. ` +
      `Good for docs, blog posts, and article-like pages. Output is truncated to ` +
      `${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
    promptSnippet: "Fetch a URL with curl and convert the readable page content to markdown",
    promptGuidelines: [
      "Use this tool when the user asks for information from a web page or documentation URL.",
      "Prefer this tool over raw bash+curl when the goal is readable Markdown content.",
    ],
    parameters: FETCH_WEB_PARAMS,

    async execute(_toolCallId, params, signal) {
      const fetched = await fetchUrlToMarkdown(pi, params, signal);
      return {
        content: [{ type: "text", text: fetched.markdown }],
        details: {
          url: params.url,
          title: fetched.title,
          extracted: fetched.extracted,
          truncated: fetched.truncated,
          fullOutputPath: fetched.fullOutputPath,
        },
      };
    },
  });
}
