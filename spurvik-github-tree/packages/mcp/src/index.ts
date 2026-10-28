import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveConfiguredRoot } from "./root.js";
import { createServer } from "./server.js";

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return pathToFileURL(path.resolve(entry)).href === import.meta.url;
  }
}

async function start(): Promise<void> {
  const root = resolveConfiguredRoot(process.argv, process.env);
  const server = createServer(root);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (isDirectRun()) {
  start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "The MCP server failed to start.";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
