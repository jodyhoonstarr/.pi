import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

export async function fetchUrlToMarkdown(exec, params, options = {}) {
  const timeoutMs = params.timeoutMs ?? 30000;
  const signal = options.signal;

  const result = await exec(
    "curl",
    [
      "-L",
      "--silent",
      "--show-error",
      "--fail",
      "--max-time",
      String(Math.max(1, Math.ceil(timeoutMs / 1000))),
      "-A",
      "Mozilla/5.0 (pi web fetch)",
      params.url,
    ],
    { signal, timeout: timeoutMs },
  );

  if (result.code !== 0) {
    throw new Error(result.stderr?.trim() || `curl failed with exit code ${result.code}`);
  }

  const html = result.stdout ?? "";
  if (!html.trim()) {
    throw new Error(`No content returned from ${params.url}`);
  }

  const dom = new JSDOM(html, { url: params.url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

  const rawContent = article?.content ?? dom.window.document.body?.innerHTML ?? html;
  const markdownBody = turndown.turndown(rawContent).trim();
  const title = article?.title?.trim() || dom.window.document.title?.trim() || params.url;

  return {
    markdown: [
      `# ${title.replace(/```/g, "``\\`")}`,
      "",
      `Source: ${params.url}`,
      "",
      markdownBody || "(No readable body content extracted)",
    ].join("\n"),
    title,
    extracted: Boolean(article),
    markdownBody,
  };
}
