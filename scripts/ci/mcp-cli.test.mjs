import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const mcpBin = join(root, "plugins", "spurvik", "bin", "spurvik-mcp.mjs");

function runMcp(args, cwd = root) {
  return spawnSync(process.execPath, [mcpBin, ...args], {
    cwd,
    encoding: "utf8",
  });
}

test("spurvik-mcp CLI supports --version, --help, snippet, and marking-hooks", () => {
  const ver = runMcp(["--version"]);
  assert.equal(ver.status, 0);
  assert.equal(ver.stdout.trim(), "1.0.4");

  const help = runMcp(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /spurvik-mcp-server check/);
  assert.match(help.stdout, /console\.spurvik\.com\/sandbox/);

  const snippet = runMcp(["snippet", "openai", "node"]);
  assert.equal(snippet.status, 0);
  assert.match(snippet.stdout, /import \{[\s\S]*withSpurvik[\s\S]*\} from "spurvik"/);

  const hooks = runMcp(["marking-hooks", "text"]);
  assert.equal(hooks.status, 0);
  assert.ok(hooks.stdout.length > 40);
});

test("spurvik-mcp CLI check scans workspaces, supports --json, and enforces --ci exit code", () => {
  const cleanDir = mkdtempSync(join(tmpdir(), "spurvik-cli-clean-"));
  const dirtyDir = mkdtempSync(join(tmpdir(), "spurvik-cli-dirty-"));

  try {
    writeFileSync(join(cleanDir, "package.json"), JSON.stringify({ name: "clean-demo", private: true }));
    writeFileSync(join(cleanDir, "index.ts"), 'export const ok = "hello";\n');

    const cleanRes = runMcp(["check", cleanDir, "--ci", "--json"]);
    assert.equal(cleanRes.status, 0, `Expected exit 0 for clean repo, stderr=${cleanRes.stderr}`);
    const cleanJson = JSON.parse(cleanRes.stdout);
    assert.equal(cleanJson.status, "clean");
    assert.equal(cleanJson.unwrappedCount, 0);
    assert.equal(cleanJson.sandboxUrl, "https://console.spurvik.com/sandbox");

    writeFileSync(join(dirtyDir, "package.json"), JSON.stringify({ name: "dirty-demo", private: true }));
    writeFileSync(
      join(dirtyDir, "agent.ts"),
      [
        'import OpenAI from "openai";',
        "const client = new OpenAI();",
        'export async function ask() { return client.chat.completions.create({ model: "gpt-4o", messages: [] }); }',
      ].join("\n"),
    );

    const dirtyHuman = runMcp(["check", dirtyDir]);
    assert.equal(dirtyHuman.status, 0, "Without --ci, check exits 0 and prints human report");
    assert.match(dirtyHuman.stdout, /agent\.ts:3/);
    assert.match(dirtyHuman.stdout, /Unlock|€19\/mo|\?upgrade=pro/);

    const dirtyCi = runMcp(["check", dirtyDir, "--ci", "--json"]);
    assert.equal(dirtyCi.status, 1, "With --ci, unwrapped AI calls must exit 1");
    const dirtyJson = JSON.parse(dirtyCi.stdout);
    assert.equal(dirtyJson.status, "unwrapped_calls_found");
    assert.equal(dirtyJson.unwrappedCount, 1);
  } finally {
    rmSync(cleanDir, { recursive: true, force: true });
    rmSync(dirtyDir, { recursive: true, force: true });
  }
});
