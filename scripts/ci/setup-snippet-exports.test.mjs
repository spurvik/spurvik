import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const serverBin = join(root, "plugins", "spurvik", "bin", "spurvik-mcp.mjs");
const snippetSource = join(root, "packages/mcp/src/tools/setup-snippet.ts");

const IMPORT_RE = /(?:\bfrom\s+|\bimport\s+)["']([^"']+)["']/g;

function parseExportedStringArray(source, name) {
  const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
  if (!match) throw new Error(`Could not find ${name} in setup-snippet.ts`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function parseSnippetSdkVersion(source) {
  const match = source.match(/export const SNIPPET_SDK_VERSION = "([^"]+)";/);
  if (!match) throw new Error("Could not find SNIPPET_SDK_VERSION in setup-snippet.ts");
  return match[1];
}

async function withServer(fn) {
  const workDir = mkdtempSync(join(tmpdir(), "spurvik-snippet-"));
  writeFileSync(join(workDir, "package.json"), JSON.stringify({ name: "snippet-exports", private: true }));
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
  const send = (msg) => child.stdin.write(`${JSON.stringify(msg)}\n`);
  const waitId = async (id, timeoutMs = 15_000) => {
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
  };
  try {
    return await fn({ send, waitId, workDir });
  } finally {
    child.kill("SIGTERM");
    rmSync(workDir, { recursive: true, force: true });
  }
}

function extractSpecifiers(text) {
  return [...text.matchAll(IMPORT_RE)].map((item) => item[1]);
}

function isSpurvikSpecifier(spec) {
  return spec === "spurvik" || spec.startsWith("spurvik/");
}

test("spurvik_setup_snippet imports resolve against published spurvik@1.0.7 exports", async (t) => {
  const source = readFileSync(snippetSource, "utf8");
  const frameworks = parseExportedStringArray(source, "FRAMEWORKS");
  const runtimes = parseExportedStringArray(source, "RUNTIMES");
  const snippetVersion = parseSnippetSdkVersion(source);
  const sdkVersion = JSON.parse(readFileSync(join(root, "packages/sdk/package.json"), "utf8")).version;
  assert.equal(snippetVersion, sdkVersion);
  assert.ok(frameworks.length > 0 && runtimes.length > 0);

  const installDir = mkdtempSync(join(tmpdir(), "spurvik-npm-"));
  t.after(() => rmSync(installDir, { recursive: true, force: true }));
  writeFileSync(join(installDir, "package.json"), JSON.stringify({ name: "spurvik-export-check", private: true }));
  execFileSync("npm", ["install", "--no-save", "--no-package-lock", `spurvik@${snippetVersion}`], {
    cwd: installDir,
    stdio: "inherit",
  });
  const installedPkg = JSON.parse(readFileSync(join(installDir, "node_modules/spurvik/package.json"), "utf8"));
  assert.equal(installedPkg.version, snippetVersion);
  assert.equal(typeof installedPkg.exports, "object");
  const requireFromInstall = createRequire(join(installDir, "package.json"));
  assert.equal(typeof requireFromInstall("spurvik").verifyProvenanceSignature, "function");

  await withServer(async ({ send, waitId }) => {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "setup-snippet-exports-test", version: snippetVersion },
      },
    });
    await waitId(1);
    send({ jsonrpc: "2.0", method: "notifications/initialized" });

    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const listRes = await waitId(2);
    const setupTool = (listRes?.result?.tools ?? []).find((tool) => tool.name === "spurvik_setup_snippet");
    assert.ok(setupTool, "tools/list must include spurvik_setup_snippet");
    assert.equal(setupTool.description.includes("@spurvik/"), false);
    assert.match(setupTool.description, /installed spurvik exports/);

    let nextId = 10;
    const seenSpurvik = new Set();
    for (const framework of frameworks) {
      for (const runtime of runtimes) {
        const id = nextId++;
        send({
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: { name: "spurvik_setup_snippet", arguments: { framework, runtime } },
        });
        const res = await waitId(id);
        assert.equal(res?.error, undefined, `${framework}/${runtime} returned an error: ${JSON.stringify(res?.error)}`);
        const text = res?.result?.content?.[0]?.text ?? "";
        assert.ok(text.length > 0, `${framework}/${runtime} returned empty text`);
        assert.equal(
          text.includes("@spurvik/"),
          false,
          `${framework}/${runtime} still mentions @spurvik/: ${text.slice(0, 400)}`,
        );
        assert.equal(text.includes("workspace:*"), false, `${framework}/${runtime} still mentions workspace:*`);
        assert.match(text, new RegExp(`spurvik@${snippetVersion}`));
        assert.match(text, new RegExp(`spurvik-sdk@${snippetVersion}`));

        const specifiers = extractSpecifiers(text);
        assert.ok(specifiers.some(isSpurvikSpecifier), `${framework}/${runtime} has no spurvik import`);
        for (const spec of specifiers) {
          if (!isSpurvikSpecifier(spec)) continue;
          seenSpurvik.add(spec);
          const subpath = spec === "spurvik" ? "." : `./${spec.slice("spurvik/".length)}`;
          assert.ok(
            installedPkg.exports[subpath],
            `${framework}/${runtime} imports ${spec}, but spurvik@${snippetVersion} has no exports[${JSON.stringify(subpath)}]`,
          );
          assert.ok(requireFromInstall.resolve(spec), `${framework}/${runtime}: require.resolve(${spec}) failed`);
        }
      }
    }
    assert.ok(seenSpurvik.has("spurvik"), "no variant imported spurvik");
    assert.ok(seenSpurvik.has("spurvik/ai"), "no variant imported spurvik/ai");
    assert.ok(seenSpurvik.has("spurvik/mastra"), "no variant imported spurvik/mastra");
    assert.ok(seenSpurvik.has("spurvik/openai-agents"), "no variant imported spurvik/openai-agents");
    assert.ok(seenSpurvik.has("spurvik/langgraph"), "no variant imported spurvik/langgraph");
  });
});
