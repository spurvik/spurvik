#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";

/**
 * Runs `spurvik_find_unwrapped_calls` via the local stdio MCP server (`spurvik-mcp-server@1.0.2`
 * or `plugins/spurvik/bin/spurvik-mcp.mjs`), emits GitHub Actions annotations for each finding,
 * and exits with code 1 when unwrapped AI calls are found (unless `--warn-only` is passed).
 */
export async function runMcpUnwrappedScan({
  rootDir = process.cwd(),
  targetDir = ".",
  serverBin,
  warnOnly = false,
  githubActions = process.env.GITHUB_ACTIONS === "true",
} = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const args = serverBin
    ? [serverBin, "--root", resolvedRoot]
    : ["--yes", "spurvik-mcp-server@1.0.2", "--root", resolvedRoot];
  const cmd = serverBin ? process.execPath : "npx";

  const child = spawn(cmd, args, {
    cwd: resolvedRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const responses = new Map();
  let WaitResolve;

  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    const lines = stdout.split("\n");
    stdout = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.id !== undefined) {
          responses.set(msg.id, msg);
          if (WaitResolve) WaitResolve();
        }
      } catch {
        // ignore non-JSON lines
      }
    }
  });

  function send(msg) {
    child.stdin.write(`${JSON.stringify(msg)}\n`);
  }

  async function waitForId(id, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (!responses.has(id)) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`Timed out waiting for MCP response id=${id}. stderr=${stderr}`);
      }
      await new Promise((resolve) => {
        WaitResolve = resolve;
        setTimeout(resolve, Math.min(remaining, 100));
      });
    }
    return responses.get(id);
  }

  try {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "spurvik-ci-check", version: "1.0.6" },
      },
    });
    await waitForId(1);
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "spurvik_find_unwrapped_calls",
        arguments: { directory: targetDir },
      },
    });
    const callRes = await waitForId(2);
    const text = callRes?.result?.content?.[0]?.text ?? "";
    const findings = [];
    for (const line of text.split("\n")) {
      const match = /^([^:\s]+):(\d+)\s+(.+)$/.exec(line.trim());
      if (match) {
        findings.push({
          file: match[1],
          line: Number(match[2]),
          call: match[3],
        });
      }
    }

    if (githubActions) {
      const level = warnOnly ? "warning" : "error";
      for (const f of findings) {
        process.stdout.write(
          `::${level} file=${f.file},line=${f.line},title=Spurvik Unwrapped AI Call::${f.call} — wrap with withSpurvik(), spurvikMiddleware(), withSpurvikMastra(), withSpurvikModelProvider(), or withSpurvikLangGraph()\n`,
        );
      }
    }

    return {
      reportText: text,
      findings,
      exitCode: findings.length > 0 && !warnOnly ? 1 : 0,
    };
  } finally {
    child.stdin.end();
    child.kill();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const warnOnly = argv.includes("--warn-only");
  const rootIdx = argv.indexOf("--root");
  const rootDir = rootIdx >= 0 && argv[rootIdx + 1] ? argv[rootIdx + 1] : process.cwd();
  const dirIdx = argv.indexOf("--dir");
  const targetDir = dirIdx >= 0 && argv[dirIdx + 1] ? argv[dirIdx + 1] : ".";
  const binIdx = argv.indexOf("--server-bin");
  const serverBin = binIdx >= 0 && argv[binIdx + 1] ? argv[binIdx + 1] : undefined;

  runMcpUnwrappedScan({ rootDir, targetDir, serverBin, warnOnly })
    .then(({ reportText, exitCode }) => {
      process.stdout.write(reportText);
      process.exitCode = exitCode;
    })
    .catch((err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    });
}
