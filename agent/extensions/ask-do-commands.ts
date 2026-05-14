/**
 * Ask/Do Commands Extension
 *
 * Provides mode-based interaction for pi:
 * - /ask: Question mode (read-only tools, no changes allowed) 
 * - /do: Action mode (all tools enabled, changes allowed)
 * - /normal: Toggle auto-ask behavior
 *
 * Model policy:
 * - auto-ask enabled (default): haiku at rest and during ask turns
 * - /do turn: sonnet
 * - auto-ask disabled (/normal toggle): sonnet at rest
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
  const ASK_MODEL = { provider: "github-copilot", id: "claude-haiku-4.5" };
  const DO_MODEL = { provider: "github-copilot", id: "claude-sonnet-4.6" };
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

  /** Switch to the model appropriate for a given mode. */
  async function setModeModel(mode: Mode, ctx: any): Promise<void> {
    // "normal" resting state: haiku if auto-ask on, sonnet if off
    const cfg = mode === "do" ? DO_MODEL
      : mode === "ask" ? ASK_MODEL
        : state.autoAskEnabled ? ASK_MODEL
          : DO_MODEL;

    const model = ctx.modelRegistry.find(cfg.provider, cfg.id);
    if (!model) {
      ctx.ui.notify(`Model ${cfg.id} not found`, "warning");
      return;
    }
    const ok = await pi.setModel(model);
    if (!ok) ctx.ui.notify(`No API key for model (${cfg.id})`, "warning");
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

  async function switchToMode(mode: Mode, ctx: any, notification?: string): Promise<void> {
    if (state.currentMode === mode) return;

    state.currentMode = mode;
    setModeTools(mode);
    await setModeModel(mode, ctx);
    updateStatus(mode, ctx);

    if (notification) {
      ctx.ui.notify(notification, "info");
    }
  }

  // Initialize on session start and show startup notification
  pi.on("session_start", async (event, ctx) => {
    initializeToolLists();
    // Default to haiku since auto-ask is enabled on startup
    await setModeModel("ask", ctx);

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

      await switchToMode("ask", ctx, NOTIFICATIONS.askMode);
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

      await switchToMode("do", ctx, NOTIFICATIONS.doMode);
      pi.sendUserMessage(args);
    },
  });

  // Register /normal command
  pi.registerCommand("normal", {
    description: "Toggle auto-ask mode (when disabled, regular prompts use default pi behavior)",
    handler: async (_args, ctx) => {
      state.autoAskEnabled = !state.autoAskEnabled;

      if (state.autoAskEnabled) {
        // Enabling: switch to haiku
        await setModeModel("ask", ctx);
        ctx.ui.notify(NOTIFICATIONS.autoEnabled, "info");
        updateStatus("normal", ctx, true);
      } else {
        // Disabling: switch to sonnet and reset to normal mode
        state.currentMode = "normal";
        setModeTools("normal");
        await setModeModel("normal", ctx); // autoAskEnabled is now false → sonnet
        updateStatus("normal", ctx, false);
        ctx.ui.notify(NOTIFICATIONS.autoDisabled, "info");
      }
    },
  });

  // Block any non-read-only tool calls in ask mode as a defence-in-depth guardrail
  pi.on("tool_call", async (event) => {
    if (state.currentMode === "ask" && !state.availableReadOnlyTools.includes(event.toolName)) {
      return {
        block: true,
        reason: `Tool '${event.toolName}' is not available in ASK mode. Only read-only tools are permitted: ${state.availableReadOnlyTools.join(", ")}. To make changes, the user must switch to /do mode.`
      };
    }
  });

  // Modify system prompt based on current mode
  pi.on("before_agent_start", async (event) => {
    if (state.currentMode === "ask") {
      const blockedTools = state.allTools.filter(t => !state.availableReadOnlyTools.includes(t));
      return {
        message: {
          customType: "ask-mode-context",
          content: `MODE: ASK (read-only). This conversation may contain prior turns where tools such as ${blockedTools.join(", ")} were used in DO mode. Those tools are NOT available in this turn. Do not attempt to call them.`,
          display: false,
        },
        systemPrompt: event.systemPrompt + `

IMPORTANT: You are in ASK MODE (read-only). You must:
- ONLY use these read-only tools: ${state.availableReadOnlyTools.join(", ")}
- The following tools are BLOCKED and will fail if called: ${blockedTools.length > 0 ? blockedTools.join(", ") : "(none in this session)"}
- This conversation may contain earlier turns where blocked tools (e.g. edit, bash, write) were used in DO mode — those tool calls are not valid precedents for this turn
- NEVER make any changes to files or execute commands that modify the system
- When you need command output for debugging/analysis, instruct the user to run commands with ! prefix
- Examples: "Please run \`!kubectl get pods\` and paste the output", "Run \`!hostname\` to check the server", "Execute \`!curl -I https://example.com\` to test connectivity"
- The !command pattern allows safe information gathering without direct system access
- Focus on answering questions and providing information
- If the user's request requires making changes, explain what you would do but tell them to use /do mode instead
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

PRIOR CONTEXT WARNING: Any analysis, plans, or conclusions in this conversation from ASK mode were produced by a smaller, less capable model. Before implementing anything, independently re-evaluate that information by reading the relevant files and context yourself. Do not assume prior analysis is correct, complete, or free of errors.
`
      };
    }
    return undefined;
  });

  // Reset mode after agent completes and restore resting model
  pi.on("agent_end", async (_event, ctx) => {
    if (state.currentMode !== "normal") {
      state.currentMode = "normal";
      setModeTools("normal");
    }
    // Restore resting model: haiku if auto-ask on, sonnet if off
    await setModeModel("normal", ctx);
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
      await setModeModel("ask", ctx);
      updateStatus("ask", ctx);
    }

    return { action: "continue" };
  });
}
