import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ATTRIBUTION_FIELD,
  BADGE_DESCRIPTION,
  BADGE_TITLE,
  CLASSIFY_DESCRIPTION,
  CLASSIFY_TITLE,
  DECISIONS_FIELD,
  DIRECTORY_FIELD,
  DOMAIN_FIELD,
  FIND_DESCRIPTION,
  FIND_TITLE,
  FRAMEWORK_FIELD,
  INTERACTS_FIELD,
  LOCALE_FIELD,
  MARKING_DESCRIPTION,
  MARKING_TITLE,
  POSITION_FIELD,
  READ_ONLY_ANNOTATIONS,
  READ_ONLY_OPEN_WORLD_ANNOTATIONS,
  RECEIPT_DESCRIPTION,
  RECEIPT_FIELD,
  RECEIPT_TITLE,
  RUNTIME_FIELD,
  SCAN_DESCRIPTION,
  SCAN_TITLE,
  SCAN_URL_FIELD,
  SERVER_INSTRUCTIONS,
  SETUP_DESCRIPTION,
  SETUP_TITLE,
  SIGNING_INPUT_HELP,
  SURFACE_FIELD,
  SYNTHETIC_FIELD,
  SYSTEM_NAME_FIELD,
  THEME_FIELD,
  USE_CASE_FIELD,
} from "./copy.js";
import { generateArt50Badge } from "./tools/art50-badge.js";
import { BADGE_POSITIONS, BADGE_THEMES } from "./tools/badge-copy.js";
import { classifyAiActRisk, MAX_USE_CASE_CHARS, RISK_DOMAINS } from "./tools/classify-risk.js";
import { explainReceipt, knownSigningSecrets, resolveSigningSecret, scrubSecrets } from "./tools/explain-receipt.js";
import { scanWorkspace } from "./tools/find-unwrapped.js";
import { markingHooksText } from "./tools/marking-hooks.js";
import { scanLiveUrl, type ScanLiveUrlDeps } from "./tools/scan-live-url.js";
import { FRAMEWORKS, RUNTIMES, setupSnippet } from "./tools/setup-snippet.js";
import { MCP_VERSION } from "./version.js";

function text(value: string): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: value }] };
}

type ToolOutcome<T> = { ok: true; result: T } | { ok: false; error: string; message: string };

/** JSON tool result. A rejected input is returned as `isError: true` with `{ error, message }`. */
function json<T>(outcome: ToolOutcome<T>): { content: [{ type: "text"; text: string }]; isError?: true } {
  if (!outcome.ok) {
    return { ...text(JSON.stringify({ error: outcome.error, message: outcome.message }, null, 2)), isError: true };
  }
  return text(JSON.stringify(outcome.result, null, 2));
}

/** Version advertised on initialize. Reads the package next to the built entry, otherwise MCP_VERSION. */
export function serverVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "..", "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.length > 0) return parsed.version;
  } catch {
    return MCP_VERSION;
  }
  return MCP_VERSION;
}

export interface ServerOptions {
  /** Test hook for spurvik_scan_live_url. Defaults to globalThis.fetch with an 8 s timeout. */
  scan?: ScanLiveUrlDeps;
}

/** Stdio MCP server. Tools are read-only; only spurvik_scan_live_url calls the network (console.spurvik.com). */
export function createServer(workspaceRoot: string, options: ServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: "spurvik", version: serverVersion() },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "spurvik_setup_snippet",
    {
      title: SETUP_TITLE,
      description: SETUP_DESCRIPTION,
      inputSchema: {
        framework: z.enum(FRAMEWORKS).describe(FRAMEWORK_FIELD),
        runtime: z.enum(RUNTIMES).describe(RUNTIME_FIELD),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ framework, runtime }) => text(setupSnippet(framework, runtime)),
  );

  server.registerTool(
    "spurvik_find_unwrapped_calls",
    {
      title: FIND_TITLE,
      description: FIND_DESCRIPTION,
      inputSchema: {
        directory: z.string().min(1).describe(DIRECTORY_FIELD),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ directory }) => text(scanWorkspace(workspaceRoot, directory)),
  );

  server.registerTool(
    "spurvik_explain_receipt",
    {
      title: RECEIPT_TITLE,
      description: RECEIPT_DESCRIPTION,
      inputSchema: {
        receipt: z.string().min(1).describe(RECEIPT_FIELD),
        signingSecret: z.string().optional().describe(SIGNING_INPUT_HELP),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ receipt, signingSecret }) => {
      let secret: string | undefined;
      try {
        secret = resolveSigningSecret(signingSecret);
        return text(await explainReceipt(receipt, secret));
      } catch (error) {
        const message = error instanceof Error ? error.message : "The receipt could not be explained.";
        throw new Error(scrubSecrets(message, knownSigningSecrets(secret ?? signingSecret)));
      }
    },
  );

  server.registerTool(
    "spurvik_marking_hooks",
    {
      title: MARKING_TITLE,
      description: MARKING_DESCRIPTION,
      inputSchema: {
        surface: z.enum(["text", "media", "both"]).optional().describe(SURFACE_FIELD),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ surface }) => text(markingHooksText(surface ?? "both")),
  );

  server.registerTool(
    "spurvik_scan_live_url",
    {
      title: SCAN_TITLE,
      description: SCAN_DESCRIPTION,
      inputSchema: {
        url: z.string().min(1).max(2048).describe(SCAN_URL_FIELD),
      },
      annotations: READ_ONLY_OPEN_WORLD_ANNOTATIONS,
    },
    async ({ url }) => json(await scanLiveUrl(url, options.scan)),
  );

  server.registerTool(
    "spurvik_classify_ai_act_risk",
    {
      title: CLASSIFY_TITLE,
      description: CLASSIFY_DESCRIPTION,
      inputSchema: {
        useCase: z.string().min(1).max(MAX_USE_CASE_CHARS).describe(USE_CASE_FIELD),
        domain: z.enum(RISK_DOMAINS).optional().describe(DOMAIN_FIELD),
        interactsWithHumans: z.boolean().optional().describe(INTERACTS_FIELD),
        generatesSyntheticMedia: z.boolean().optional().describe(SYNTHETIC_FIELD),
        makesAutomatedDecisionsAboutPeople: z.boolean().optional().describe(DECISIONS_FIELD),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => json(classifyAiActRisk(args)),
  );

  server.registerTool(
    "spurvik_generate_art50_badge",
    {
      title: BADGE_TITLE,
      description: BADGE_DESCRIPTION,
      inputSchema: {
        locale: z.string().max(16).optional().describe(LOCALE_FIELD),
        position: z.enum(BADGE_POSITIONS).optional().describe(POSITION_FIELD),
        theme: z.enum(BADGE_THEMES).optional().describe(THEME_FIELD),
        systemName: z.string().max(200).optional().describe(SYSTEM_NAME_FIELD),
        attribution: z.boolean().optional().describe(ATTRIBUTION_FIELD),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => json(generateArt50Badge(args)),
  );

  return server;
}
