import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  DIRECTORY_FIELD,
  FIND_DESCRIPTION,
  FIND_TITLE,
  FRAMEWORK_FIELD,
  MARKING_DESCRIPTION,
  MARKING_TITLE,
  READ_ONLY_ANNOTATIONS,
  RECEIPT_DESCRIPTION,
  RECEIPT_FIELD,
  RECEIPT_TITLE,
  RUNTIME_FIELD,
  SERVER_INSTRUCTIONS,
  SETUP_DESCRIPTION,
  SETUP_TITLE,
  SIGNING_INPUT_HELP,
  SURFACE_FIELD,
} from "./copy.js";
import { explainReceipt, knownSigningSecrets, resolveSigningSecret, scrubSecrets } from "./tools/explain-receipt.js";
import { scanWorkspace } from "./tools/find-unwrapped.js";
import { markingHooksText } from "./tools/marking-hooks.js";
import { FRAMEWORKS, RUNTIMES, setupSnippet } from "./tools/setup-snippet.js";

function text(value: string): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: value }] };
}

/** Version advertised on initialize. Reads the package next to the built entry, otherwise 1.0.2. */
function serverVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "..", "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.length > 0) return parsed.version;
  } catch {
    return "1.0.2";
  }
  return "1.0.2";
}

/** Stdio MCP server. Tools are read-only and do not call the network. */
export function createServer(workspaceRoot: string): McpServer {
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

  return server;
}
