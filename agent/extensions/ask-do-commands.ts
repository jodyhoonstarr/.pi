/**
 * Ask/Do Commands Extension
 *
 * Provides mode-based interaction for pi:
 * - /ask: Question mode (read-only tools, no changes allowed) 
 * - /do: Action mode (all tools enabled, changes allowed)
 * - /normal: Toggle auto-ask behavior
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type Mode = "ask" | "do" | "normal";

interface ExtensionState {
	currentMode: Mode;
	autoAskEnabled: boolean;
	originalTools: string[];
	allTools: string[];
	availableReadOnlyTools: string[];
}

export default function askDoExtension(pi: ExtensionAPI) {
	// Constants
	const READ_ONLY_TOOLS = ["read", "grep", "find", "ls", "fetch_web"];
	const STATUS_MESSAGES = {
		ask: "🔒 ASK (+r)",
		do: "🔓 DO (+rw)", 
		auto: "◉ AUTO (+r)",
		normal: "○ NORMAL"
	} as const;
	const NOTIFICATIONS = {
		askMode: "Switched to ASK mode (read-only tools only)",
		doMode: "Switched to DO mode (all tools enabled)",
		autoEnabled: "Auto-ask mode ENABLED: Regular prompts will default to ASK mode",
		autoDisabled: "Auto-ask mode DISABLED: Regular prompts will use default pi behavior",
		startup: "Ask/Do extension loaded. Auto-ask ENABLED: Regular prompts default to ASK mode. Use /normal to toggle."
	} as const;

	// Extension state
	const state: ExtensionState = {
		currentMode: "normal",
		autoAskEnabled: true,
		originalTools: [],
		allTools: [],
		availableReadOnlyTools: []
	};

	// Helper functions
	function initializeToolLists(): void {
		state.originalTools = pi.getActiveTools();
		state.allTools = pi.getAllTools().map(t => t.name);
		state.availableReadOnlyTools = READ_ONLY_TOOLS.filter(tool => 
			state.allTools.includes(tool)
		);
	}

	function setModeTools(mode: Mode): void {
		switch (mode) {
			case "ask":
				if (state.availableReadOnlyTools.length === 0) {
					console.warn("No read-only tools available for ASK mode");
				}
				pi.setActiveTools(state.availableReadOnlyTools);
				break;
			case "do":
				pi.setActiveTools(state.allTools);
				break;
			case "normal":
			default:
				pi.setActiveTools(state.originalTools);
				break;
		}
	}

	function updateStatus(mode: Mode, ctx?: any, isAuto = false): void {
		const statusKey = isAuto ? "auto" : mode;
		const statusMessage = STATUS_MESSAGES[statusKey as keyof typeof STATUS_MESSAGES];
		if (ctx?.ui) {
			ctx.ui.setStatus("ask-do-mode", statusMessage);
		}
	}

	function switchToMode(mode: Mode, ctx: any, notification?: string): void {
		if (state.currentMode === mode) return; // No change needed
		
		state.currentMode = mode;
		setModeTools(mode);
		updateStatus(mode, ctx);
		
		if (notification) {
			ctx.ui.notify(notification, "info");
		}
	}

	// Initialize on session start and show startup notification
	pi.on("session_start", async (event, ctx) => {
		initializeToolLists();
		
		if (event.reason === "startup") {
			ctx.ui.notify(NOTIFICATIONS.startup, "info");
			updateStatus("normal", ctx, state.autoAskEnabled);
		}
	});

	// Register /ask command
	pi.registerCommand("ask", {
		description: "Ask a question (read-only mode, no changes made)",
		handler: async (args, ctx) => {
			if (!args.trim()) {
				ctx.ui.notify("Usage: /ask [your question]", "warning");
				return;
			}

			switchToMode("ask", ctx, NOTIFICATIONS.askMode);
			pi.sendUserMessage(args);
		},
	});

	// Register /do command  
	pi.registerCommand("do", {
		description: "Accomplish a task (full access mode, changes allowed)",
		handler: async (args, ctx) => {
			if (!args.trim()) {
				ctx.ui.notify("Usage: /do [task description]", "warning");
				return;
			}

			switchToMode("do", ctx, NOTIFICATIONS.doMode);
			pi.sendUserMessage(args);
		},
	});

	// Register /normal command
	pi.registerCommand("normal", {
		description: "Toggle auto-ask mode (when disabled, regular prompts use default pi behavior)",
		handler: async (_args, ctx) => {
			state.autoAskEnabled = !state.autoAskEnabled;
			
			if (state.autoAskEnabled) {
				ctx.ui.notify(NOTIFICATIONS.autoEnabled, "info");
				updateStatus("normal", ctx, true);
			} else {
				// Force mode change and status update
				state.currentMode = "normal";
				setModeTools("normal");
				// Explicitly set to normal mode (not auto)
				updateStatus("normal", ctx, false);
				ctx.ui.notify(NOTIFICATIONS.autoDisabled, "info");
			}
		},
	});

	// Modify system prompt based on current mode
	pi.on("before_agent_start", async (event) => {
		if (state.currentMode === "ask") {
			return {
				systemPrompt: event.systemPrompt + `

IMPORTANT: You are in ASK MODE (read-only). You must:
- Only use read-only tools to gather information
- NEVER make any changes to files or execute commands that modify the system
- When you need command output for debugging/analysis, instruct the user to run commands with ! prefix
- Examples: "Please run \`!kubectl get pods\` and paste the output", "Run \`!hostname\` to check the server", "Execute \`!curl -I https://example.com\` to test connectivity"
- The !command pattern allows safe information gathering without direct system access
- Focus on answering questions and providing information
- Available tools are limited to: ${state.availableReadOnlyTools.join(", ")}
- If the user's request requires making changes, explain what you would do but don't actually do it
`
			};
		} else if (state.currentMode === "do") {
			return {
				systemPrompt: event.systemPrompt + `

IMPORTANT: You are in DO MODE (full access). You can:
- Use all available tools to accomplish the requested task
- Make changes to files, execute commands, and modify the system as needed
- Focus on completing the task efficiently and effectively
- All tools are enabled for this task
`
			};
		}
		return undefined;
	});

	// Reset mode after agent completes (preserve auto-ask setting)
	pi.on("agent_end", async (_event, ctx) => {
		if (state.currentMode !== "normal") {
			state.currentMode = "normal";
			setModeTools("normal");
		}
		// Always update status to reflect current auto-ask state
		updateStatus("normal", ctx, state.autoAskEnabled);
	});

	// Auto-switch to ask mode for regular prompts (when enabled)
	pi.on("input", async (event, ctx) => {
		const text = event.text.trim();
		
		// Skip slash commands
		if (text.startsWith("/")) {
			return { action: "continue" };
		}
		
		// Auto-switch to ask mode if enabled and not already in do mode
		if (text.length > 0 && state.autoAskEnabled && state.currentMode !== "do") {
			state.currentMode = "ask";
			setModeTools("ask");
			updateStatus("ask", ctx);
		}
		
		return { action: "continue" };
	});
}