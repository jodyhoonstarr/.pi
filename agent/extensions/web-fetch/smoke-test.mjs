import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fetchUrlToMarkdown } from "./core.mjs";

const execFileAsync = promisify(execFile);
const url = process.argv[2] ?? "https://example.com";

function exec(command, args, options = {}) {
  return execFileAsync(command, args, {
    timeout: options.timeout,
    signal: options.signal,
    maxBuffer: 10 * 1024 * 1024,
    encoding: "utf8",
  }).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
    (error) => ({
      code: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message ?? String(error),
    }),
  );
}

const result = await fetchUrlToMarkdown(exec, { url, timeoutMs: 30000 });
console.log(result.markdown.slice(0, 4000));
