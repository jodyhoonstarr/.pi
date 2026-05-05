/**
 * Filesystem Search Tools Extension
 *
 * Provides safe, read-only tools for fd, rg, and fzf commands
 * without allowing general bash access.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { spawn } from "child_process";
import { promisify } from "util";

const execFile = promisify(require('child_process').execFile);

export default function filesystemSearchToolsExtension(pi: ExtensionAPI) {

	// fd tool for finding files and directories
	pi.registerTool({
		name: "fd",
		label: "Find Files/Directories",
		description: "Fast file and directory finder using fd command",
		promptSnippet: "Search for files and directories by name/pattern",
		parameters: Type.Object({
			pattern: Type.String({ description: "Search pattern/filename" }),
			path: Type.Optional(Type.String({ description: "Directory to search in (default: current)" })),
			type: Type.Optional(Type.Union([
				Type.Literal("f"),
				Type.Literal("d")
			], { description: "Type filter: 'f' for files, 'd' for directories" })),
			extension: Type.Optional(Type.String({ description: "File extension to filter by" })),
			hidden: Type.Optional(Type.Boolean({ description: "Include hidden files" })),
			ignoreFile: Type.Optional(Type.Boolean({ description: "Ignore .gitignore and similar files" }))
		}),
		async execute(_toolCallId, params) {
			try {
				const args = [params.pattern];
				
				if (params.path) args.unshift(params.path);
				if (params.type) args.unshift("-t", params.type);
				if (params.extension) args.unshift("-e", params.extension);
				if (params.hidden) args.unshift("-H");
				if (params.ignoreFile) args.unshift("-I");

				const result = await execFile("/usr/bin/fd", args, { 
					maxBuffer: 1024 * 1024,
					timeout: 30000 
				});
				
				return {
					content: [{ type: "text", text: result.stdout || "No results found" }]
				};
			} catch (error: any) {
				return {
					content: [{ type: "text", text: `Error: ${error.message}` }]
				};
			}
		}
	});

	// rg tool for searching file contents
	pi.registerTool({
		name: "rg",
		label: "Search File Contents", 
		description: "Fast text search in files using ripgrep",
		promptSnippet: "Search for text patterns within files",
		parameters: Type.Object({
			pattern: Type.String({ description: "Search pattern/regex" }),
			path: Type.Optional(Type.String({ description: "Directory or file to search (default: current)" })),
			lineNumbers: Type.Optional(Type.Boolean({ description: "Show line numbers" })),
			filesOnly: Type.Optional(Type.Boolean({ description: "Only show filenames with matches" })),
			ignoreCase: Type.Optional(Type.Boolean({ description: "Case-insensitive search" })),
			glob: Type.Optional(Type.String({ description: "Include/exclude files by glob pattern" })),
			hidden: Type.Optional(Type.Boolean({ description: "Search hidden files" })),
			listFiles: Type.Optional(Type.Boolean({ description: "List files only (no content search)" }))
		}),
		async execute(_toolCallId, params) {
			try {
				const args = [params.pattern];
				
				if (params.path) args.push(params.path);
				if (params.lineNumbers) args.unshift("-n");
				if (params.filesOnly) args.unshift("-l");
				if (params.ignoreCase) args.unshift("-i");
				if (params.glob) args.unshift("--glob", params.glob);
				if (params.hidden) args.unshift("--hidden");
				if (params.listFiles) {
					args.splice(0, 1); // remove pattern
					args.unshift("--files");
				}

				const result = await execFile("/usr/bin/rg", args, {
					maxBuffer: 1024 * 1024,
					timeout: 30000
				});
				
				return {
					content: [{ type: "text", text: result.stdout || "No matches found" }]
				};
			} catch (error: any) {
				return {
					content: [{ type: "text", text: `Error: ${error.message}` }]
				};
			}
		}
	});

	// fzf tool for fuzzy filtering
	pi.registerTool({
		name: "fzf",
		label: "Fuzzy Filter",
		description: "Fuzzy filter for narrowing down lists",
		promptSnippet: "Filter a list of items using fuzzy matching",
		parameters: Type.Object({
			input: Type.String({ description: "Input text to filter (newline-separated)" }),
			filter: Type.String({ description: "Filter query" }),
			selectOne: Type.Optional(Type.Boolean({ description: "Auto-select if only one match" }))
		}),
		async execute(_toolCallId, params) {
			try {
				const args = ["--filter", params.filter];
				if (params.selectOne) {
					args.push("--select-1", "--exit-0");
				}

				const child = spawn("/usr/bin/fzf", args, {
					stdio: ["pipe", "pipe", "pipe"]
				});

				child.stdin.write(params.input);
				child.stdin.end();

				let stdout = "";
				let stderr = "";

				child.stdout.on("data", (data) => {
					stdout += data.toString();
				});

				child.stderr.on("data", (data) => {
					stderr += data.toString();
				});

				await new Promise((resolve, reject) => {
					child.on("close", (code) => {
						if (code === 0 || code === 1) { // 0=found, 1=not found
							resolve(void 0);
						} else {
							reject(new Error(`fzf exited with code ${code}: ${stderr}`));
						}
					});
				});

				return {
					content: [{ type: "text", text: stdout.trim() || "No matches found" }]
				};
			} catch (error: any) {
				return {
					content: [{ type: "text", text: `Error: ${error.message}` }]
				};
			}
		}
	});
}