import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const serverBin = join(root, "plugins", "spurvik", "bin", "spurvik-mcp.mjs");
const { withSpurvik, provenanceOf } = await import(join(root, "packages/spurvik/dist/index.js"));

test("MCP config files (Cursor, Claude Code, VS Code) are valid JSON targeting spurvik-mcp-server@1.0.5", () => {
  const cursorCfg = JSON.parse(readFileSync(join(here, "cursor.mcp.json"), "utf8"));
  assert.equal(cursorCfg.mcpServers.spurvik.command, "npx");
  assert.ok(cursorCfg.mcpServers.spurvik.args.includes("spurvik-mcp-server@1.0.5"));

  const claudeCfg = JSON.parse(readFileSync(join(here, "claude-code.mcp.json"), "utf8"));
  assert.equal(claudeCfg.mcpServers.spurvik.command, "npx");
  assert.ok(claudeCfg.mcpServers.spurvik.args.includes("spurvik-mcp-server@1.0.5"));

  const vscodeCfg = JSON.parse(readFileSync(join(here, "vscode.mcp.json"), "utf8"));
  assert.equal(vscodeCfg.servers.spurvik.command, "npx");
  assert.ok(vscodeCfg.servers.spurvik.args.includes("spurvik-mcp-server@1.0.5"));
});

test("Stdio MCP server exposes all 7 read-only tools and executes the core tools over JSON-RPC", async () => {
  const workDir = mkdtempSync(join(tmpdir(), "spurvik-mcp-stdio-"));
  writeFileSync(join(workDir, "package.json"), JSON.stringify({ name: "mcp-demo", private: true }));
  writeFileSync(
    join(workDir, "agent.ts"),
    `import OpenAI from "openai";\nconst client = new OpenAI();\nawait client.chat.completions.create({ model: "gpt-4o", messages: [] });\n`,
  );

  const child = spawn(process.execPath, [serverBin, "--root", workDir], {
    cwd: workDir,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  const responses = new Map();
  let wake;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    const lines = stdout.split("\n");
    stdout = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined) {
          responses.set(msg.id, msg);
          if (wake) wake();
        }
      } catch {
        // ignore non-json
      }
    }
  });

  function send(msg) {
    child.stdin.write(`${JSON.stringify(msg)}\n`);
  }

  async function waitId(id, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (!responses.has(id)) {
      const rem = deadline - Date.now();
      if (rem <= 0) throw new Error(`Timed out waiting for MCP id=${id}`);
      await new Promise((r) => {
        wake = r;
        setTimeout(r, Math.min(rem, 50));
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
        clientInfo: { name: "cursor-smoke-test", version: "1.0.3" },
      },
    });
    await waitId(1);
    send({ jsonrpc: "2.0", method: "notifications/initialized" });

    // List tools
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const listRes = await waitId(2);
    const toolNames = (listRes?.result?.tools ?? []).map((t) => t.name).sort();
    assert.deepEqual(toolNames, [
      "spurvik_classify_ai_act_risk",
      "spurvik_explain_receipt",
      "spurvik_find_unwrapped_calls",
      "spurvik_generate_art50_badge",
      "spurvik_marking_hooks",
      "spurvik_scan_live_url",
      "spurvik_setup_snippet",
    ]);

    // 1. spurvik_setup_snippet
    send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "spurvik_setup_snippet",
        arguments: { framework: "langgraph", runtime: "next" },
      },
    });
    const snippetRes = await waitId(3);
    const snippetText = snippetRes?.result?.content?.[0]?.text ?? "";
    assert.ok(snippetText.includes("withSpurvikLangGraph"));

    // 2. spurvik_find_unwrapped_calls
    send({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "spurvik_find_unwrapped_calls",
        arguments: { directory: "." },
      },
    });
    const scanRes = await waitId(4);
    const scanText = scanRes?.result?.content?.[0]?.text ?? "";
    assert.ok(scanText.includes("agent.ts:3"));

    // 3. spurvik_explain_receipt
    const secret = "mcp-smoke-test-signing-secret-32chars!!";
    const fakeClient = {
      chat: {
        completions: {
          async create() {
            return {
              id: "chatcmpl_mcp_1",
              model: "gpt-4o-mini",
              choices: [{ index: 0, message: { role: "assistant", content: "Hej" }, finish_reason: "stop" }],
              usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
            };
          },
        },
      },
    };
    const wrapped = withSpurvik(fakeClient, {
      apiKey: `spurvik_live_${"a".repeat(32)}`,
      signingSecret: secret,
      contentHash: { mode: "keyed", secret: "mcp-smoke-test-content-secret-32chars!!" },
      riskTier: "limited_art50",
      article50Disclosure: true,
      registerProcessHooks: false,
    });
    const completion = await wrapped.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Private user prompt" }],
    });
    const receipt = provenanceOf(completion);

    send({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "spurvik_explain_receipt",
        arguments: { receipt: JSON.stringify(receipt), signingSecret: secret },
      },
    });
    const explainRes = await waitId(5);
    const explainText = explainRes?.result?.content?.[0]?.text ?? "";
    assert.ok(explainText.includes("still match the HMAC-SHA-256 signature"));
    assert.ok(!explainText.includes("Private user prompt"));

    // 4. spurvik_marking_hooks
    send({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "spurvik_marking_hooks",
        arguments: { surface: "both" },
      },
    });
    const hooksRes = await waitId(6);
    const hooksText = hooksRes?.result?.content?.[0]?.text ?? "";
    assert.ok(hooksText.includes("marking.text"));
    assert.ok(hooksText.includes("marking.media"));

    // 5. spurvik_classify_ai_act_risk (zero network)
    send({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "spurvik_classify_ai_act_risk",
        arguments: { useCase: "Customer support chatbot on our web shop" },
      },
    });
    const classifyRes = await waitId(7);
    const classifyBody = JSON.parse(classifyRes?.result?.content?.[0]?.text ?? "{}");
    assert.equal(classifyBody.tier, "limited_transparency_art50");
    assert.equal(classifyBody.scopeNote, "Engineering mapping aid; not legal advice.");

    // 6. spurvik_generate_art50_badge (zero network)
    send({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "spurvik_generate_art50_badge",
        arguments: { systemName: "stepnetwork.dk" },
      },
    });
    const badgeRes = await waitId(8);
    const badgeBody = JSON.parse(badgeRes?.result?.content?.[0]?.text ?? "{}");
    assert.equal(badgeBody.locale, "da");
    assert.match(badgeBody.script, /^<script src="https:\/\/spurvik\.com\/badge\.js" .*data-attribution="true" defer><\/script>$/);

    // 7. spurvik_scan_live_url rejects a private target before any request
    send({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: {
        name: "spurvik_scan_live_url",
        arguments: { url: "http://127.0.0.1:8080" },
      },
    });
    const liveScanRes = await waitId(9);
    assert.equal(liveScanRes?.result?.isError, true);
    assert.equal(JSON.parse(liveScanRes?.result?.content?.[0]?.text ?? "{}").error, "blocked_target");
  } finally {
    child.stdin.end();
    child.kill();
    rmSync(workDir, { recursive: true, force: true });
  }
});
