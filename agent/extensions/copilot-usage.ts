/**
 * Copilot Usage Status Extension
 *
 * Replaces the default pi footer with a single-line custom footer showing:
 *   [mode]  ↑sent  ↓generated  CHxx.x%  xx%/totalcap  (branch) model • thinking
 *
 * Token stats come from pi session data.
 * GitHub AI credits are polled from the billing API every 5 minutes.
 * Override the PAT at any time with the GITHUB_READONLY_PLAN_PAT env var.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ── Config ────────────────────────────────────────────────────────────────────

const PAT = process.env.GITHUB_READONLY_PLAN_PAT ?? "";

const POLL_MS = 5 * 60 * 1_000;
const ADDITIONAL_USAGE_CAP = 10;
// This account's included-credit billing cycle resets on the 7th.
const BILLING_CYCLE_START_DAY = 7;

// Monthly AI credit allowances keyed by Copilot token SKU
const SKU_CAP: Record<string, number> = {
  free: 50,
  monthly_subscriber_quota: 1_500,
  pro_monthly_subscriber_quota: 1_000,
  pro_yearly_subscriber_quota: 1_000,
  plus_monthly_subscriber_quota: 7_000,
  plus_yearly_subscriber_quota: 7_000,
  max_monthly_subscriber_quota: 15_000,
  max_yearly_subscriber_quota: 15_000,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a token count compactly: 1234 → "1.2k", 7000 → "7k" (no trailing .0) */
function fmtN(n: number): string {
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${parseFloat((n / 1_000).toFixed(1))}k`;
  return `${parseFloat((n / 1_000_000).toFixed(1))}M`;
}

/**
 * Render a 10-segment block progress bar for a usage percentage.
 * Rounds to the nearest 5% for bar rendering; shows the raw ceil'd % as a number.
 * e.g. 32% → "■■■□□□□□□□ 32%TOK"
 */
function ghProgressBar(pct: number, annotation = "TOK"): string {
  const TOTAL = 10;
  const rounded = Math.round(pct / 5) * 5;
  const fullCells = Math.min(TOTAL, Math.floor(rounded / 10));
  const halfCell  = rounded % 10 === 5 && fullCells < TOTAL;
  const emptyCells = TOTAL - fullCells - (halfCell ? 1 : 0);
  const bar = "\u25a0".repeat(fullCells)
            + (halfCell ? "\u25e7" : "")
            + "\u25a1".repeat(emptyCells);
  return `${bar} ${Math.ceil(pct)}%${annotation}`;
}

/** Render context-window usage with the same style as token usage. */
function contextProgressBar(pct: number): string {
  return ghProgressBar(Math.max(0, Math.min(100, pct)), "CTX");
}

function ghHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${PAT}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// ── Extension ─────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let creditsUsed: number | null = null;
  let additionalUsageUsed: number | null = null;
  let creditsCap = 7_000;
  let creditsErr: string | null = null;
  let ghUser: string | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let sessionCtx: any = null;
  let tuiRef: any = null;
  let thinkingLevel = "high";  // matches defaultThinkingLevel in settings.json

  /** Read defaultThinkingLevel from global settings, falling back to "high". */
  function readDefaultThinkingLevel(): string {
    try {
      const raw = readFileSync(join(homedir(), ".pi", "agent", "settings.json"), "utf8");
      const settings = JSON.parse(raw) as Record<string, any>;
      return settings["defaultThinkingLevel"] ?? "high";
    } catch {
      return "high";
    }
  }

  // Read the monthly credit cap from the Copilot token SKU in auth.json
  function readCap(): number {
    try {
      const raw = readFileSync(join(homedir(), ".pi", "agent", "auth.json"), "utf8");
      const auth = JSON.parse(raw) as Record<string, any>;
      const token: string = auth["github-copilot"]?.access ?? "";
      for (const pair of token.split(";")) {
        const eq = pair.indexOf("=");
        if (eq < 0) continue;
        if (pair.slice(0, eq) === "sku") {
          const sku = pair.slice(eq + 1);
          if (sku in SKU_CAP) return SKU_CAP[sku]!;
        }
      }
    } catch {}
    return 7_000;
  }

  async function fetchUser(): Promise<string | null> {
    try {
      const r = await fetch("https://api.github.com/user", { headers: ghHeaders() });
      if (!r.ok) {
        creditsErr = r.status === 401 ? "token expired" : `GH ${r.status}`;
        return null;
      }
      return ((await r.json()) as { login: string }).login;
    } catch {
      creditsErr = "network err";
      return null;
    }
  }

  async function fetchCredits(): Promise<void> {
    if (!ghUser) return;
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    type UsageBody = {
      usageItems?: Array<{ grossQuantity?: number; netAmount?: number }>;
    };
    const fetchUsage = async (year: number, month: number, day?: number): Promise<UsageBody> => {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      if (day !== undefined) params.set("day", String(day));
      const r = await fetch(
        `https://api.github.com/users/${ghUser}/settings/billing/ai_credit/usage?${params}`,
        { headers: ghHeaders() },
      );
      if (!r.ok) {
        throw Object.assign(new Error(`GH ${r.status}`), { status: r.status });
      }
      return (await r.json()) as UsageBody;
    };
    const sumUsage = (body: UsageBody, key: "grossQuantity" | "netAmount"): number =>
      (body.usageItems ?? []).reduce((sum, item) => sum + (item[key] ?? 0), 0);

    try {
      const current = await fetchUsage(y, m);
      let gross = sumUsage(current, "grossQuantity");
      let net = sumUsage(current, "netAmount");
      const preCycleDays = Array.from(
        { length: BILLING_CYCLE_START_DAY - 1 },
        (_, index) => index + 1,
      );

      if (now.getUTCDate() >= BILLING_CYCLE_START_DAY) {
        // The API reports calendar months; exclude days before this cycle began.
        const beforeCycle = await Promise.all(
          preCycleDays.map((day) => fetchUsage(y, m, day)),
        );
        gross -= beforeCycle.reduce((sum, body) => sum + sumUsage(body, "grossQuantity"), 0);
        net -= beforeCycle.reduce((sum, body) => sum + sumUsage(body, "netAmount"), 0);
      } else {
        // During days 1-6, the cycle started in the previous calendar month.
        const previousMonth = m === 1 ? 12 : m - 1;
        const previousYear = m === 1 ? y - 1 : y;
        const previous = await fetchUsage(previousYear, previousMonth);
        const previousBeforeCycle = await Promise.all(
          preCycleDays.map((day) => fetchUsage(previousYear, previousMonth, day)),
        );
        gross += sumUsage(previous, "grossQuantity");
        net += sumUsage(previous, "netAmount");
        gross -= previousBeforeCycle.reduce(
          (sum, body) => sum + sumUsage(body, "grossQuantity"),
          0,
        );
        net -= previousBeforeCycle.reduce(
          (sum, body) => sum + sumUsage(body, "netAmount"),
          0,
        );
      }

      // grossQuantity can be fractional — round to nearest whole credit.
      creditsUsed = Math.max(0, Math.round(gross));
      // netAmount is the amount billed after included-credit discounts, i.e. additional usage.
      additionalUsageUsed = Math.max(0, net);
      creditsErr = null;
    } catch (error) {
      const status = (error as { status?: unknown }).status;
      creditsErr =
        status === 401 ? "token expired" :
        status === 403 ? "permission denied" :
        "network err";
    }
    tuiRef?.requestRender();
  }

  // ── Events ───────────────────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    sessionCtx = ctx;
    thinkingLevel = readDefaultThinkingLevel();  // re-read each session in case settings changed
    creditsCap = readCap();
    creditsUsed = null;
    additionalUsageUsed = null;
    creditsErr = null;

    // Replace the default pi footer with our custom one
    ctx.ui.setFooter((tui: any, theme: any, footerData: any) => {
      tuiRef = tui;
      const unsubBranch = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsubBranch,
        invalidate() {},
        render(width: number): string[] {
          // ── Left: ask-do indicator first, then token stats + credits ────

          const parts: string[] = [];

          // Ask-do (and any other extension) statuses go first
          const extStatuses = footerData.getExtensionStatuses() as Map<string, string>;
          if (extStatuses.size > 0) {
            const sorted = Array.from(extStatuses.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([, v]) => v);
            parts.push(...sorted);
          }

          let totalIn = 0, totalOut = 0;
          let totalCacheRead = 0;
          let lastCacheHit: number | null = null;

          if (sessionCtx) {
            for (const entry of sessionCtx.sessionManager.getEntries()) {
              if (entry.type === "message" && entry.message.role === "assistant") {
                const m = entry.message as AssistantMessage;
                const cacheRead  = m.usage.cacheRead  ?? 0;
                const cacheWrite = m.usage.cacheWrite ?? 0;
                totalIn        += m.usage.input  ?? 0;
                totalOut       += m.usage.output ?? 0;
                totalCacheRead += cacheRead;
                const tot = (m.usage.input ?? 0) + cacheRead + cacheWrite;
                if (tot > 0) lastCacheHit = (cacheRead / tot) * 100;
              }
            }
          }

          if (totalIn > 0)                        parts.push(`↑${fmtN(totalIn)}`);
          if (totalOut > 0)                       parts.push(`↓${fmtN(totalOut)}`);
          // Only show CH when caching is actually active (matches default footer)
          if (totalCacheRead > 0 && lastCacheHit !== null)
            parts.push(`CH${lastCacheHit.toFixed(1)}%`);

          // Context window usage percentage
          const ctxUsage = sessionCtx?.getContextUsage?.();
          if (ctxUsage?.percent != null) {
            const ctxStr = contextProgressBar(ctxUsage.percent);
            parts.push(
              ctxUsage.percent >= 50 ? theme.fg("error",   ctxStr) :
              ctxUsage.percent >= 30 ? theme.fg("warning", ctxStr) :
                                      ctxStr,
            );
          }

          // GitHub AI credits as a rounded-up percentage of the monthly cap
          if (creditsErr) {
            parts.push(theme.fg("warning", `⚠ ${creditsErr}`));
          } else if (creditsUsed !== null) {
            const pct = (creditsUsed / creditsCap) * 100;
            const barStr = ghProgressBar(pct);
            parts.push(barStr);

            if (additionalUsageUsed !== null) {
              const additionalPct = (additionalUsageUsed / ADDITIONAL_USAGE_CAP) * 100;
              const additionalBarStr = ghProgressBar(Math.max(0, additionalPct), "$");
              parts.push(
                additionalPct >= 90 ? theme.fg("error",   additionalBarStr) :
                additionalPct >= 75 ? theme.fg("warning", additionalBarStr) :
                                       theme.fg("dim",     additionalBarStr),
              );
            }
          } else {
            parts.push(theme.fg("dim", "GH:…"));
          }

          // ── Right: (branch) model • thinking ─────────────────────────────

          const branch = footerData.getGitBranch() as string | null;
          const model = ctx.model;
          let right = model?.id ?? "no-model";
          if (model?.reasoning) {
            right += thinkingLevel === "off" ? " • off" : ` • ${thinkingLevel}`;
          }
          if (branch) right = `(${branch}) ${right}`;

          // ── Compose single line with right-aligned model ──────────────────

          const leftStr = parts.join("  ");
          const lw = visibleWidth(leftStr);
          const rw = visibleWidth(right);
          const minPad = 2;

          // Apply dim to left and right independently so colored credit
          // warning/error text keeps its color while plain parts are dimmed
          const dimLeft  = theme.fg("dim", leftStr);
          const dimRight = theme.fg("dim", right);

          const horizontalPadding = width >= 3 ? 1 : 0;
          const contentWidth = Math.max(1, width - horizontalPadding * 2);
          const padLine = (line: string): string =>
            " ".repeat(horizontalPadding) + line + " ".repeat(horizontalPadding);

          if (lw + minPad + rw <= contentWidth) {
            const pad = " ".repeat(contentWidth - lw - rw);
            return [padLine(dimLeft + pad + dimRight)];
          } else if (lw + minPad <= contentWidth) {
            const avail = contentWidth - lw - minPad;
            return [padLine(dimLeft + "  " + theme.fg("dim", truncateToWidth(right, avail, "")))];
          } else {
            return [padLine(truncateToWidth(dimLeft, contentWidth, theme.fg("dim", "...")))];
          }
        },
      };
    });

    // Fetch credits non-blocking — footer shows cr:… until resolved
    ghUser = await fetchUser();
    void fetchCredits();

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => void fetchCredits(), POLL_MS);
  });

  pi.on("thinking_level_select", async (event: any) => {
    thinkingLevel = event.level;
    tuiRef?.requestRender();
  });

  // Re-render after each assistant message to refresh token stats
  pi.on("message_end", async (_event, ctx) => {
    sessionCtx = ctx;
    tuiRef?.requestRender();
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    tuiRef = null;
    sessionCtx = null;
    ctx.ui.setFooter(undefined); // restore default footer before session teardown
  });
}
