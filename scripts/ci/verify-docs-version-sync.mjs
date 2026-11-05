import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson(relPath) {
  return JSON.parse(readFileSync(join(root, relPath), "utf8"));
}

function collectFiles(dir, matcher, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === ".next") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, matcher, out);
    } else if (matcher(full)) {
      out.push(full);
    }
  }
  return out;
}

test("Docs, README, RELEASING, and examples stay synced to canonical package versions", () => {
  const sdkVersion = readJson("packages/sdk/package.json").version;
  const mcpVersion = readJson("packages/mcp/package.json").version;
  const n8nVersion = readJson("packages/n8n-nodes-spurvik/package.json").version;

  const markdownFiles = [
    join(root, "README.md"),
    join(root, "RELEASING.md"),
    ...collectFiles(join(root, "docs"), (f) => f.endsWith(".md")),
    ...collectFiles(join(root, "examples"), (f) => f.endsWith(".md")),
  ];

  const expectedVersions = {
    spurvik: sdkVersion,
    "spurvik-sdk": sdkVersion,
    "spurvik-mcp-server": mcpVersion,
    "n8n-nodes-spurvik": n8nVersion,
  };

  const installRegex = /\bnpm\s+(?:install|i)\b[^\n`]*?\b(spurvik|spurvik-sdk|spurvik-mcp-server|n8n-nodes-spurvik)@([0-9]+\.[0-9]+\.[0-9]+)/g;

  for (const file of markdownFiles) {
    const rel = relative(root, file);
    const content = readFileSync(file, "utf8");
    let match;
    while ((match = installRegex.exec(content)) !== null) {
      const [, pkgName, foundVersion] = match;
      assert.equal(
        foundVersion,
        expectedVersions[pkgName],
        `${rel} has outdated install command for ${pkgName}@${foundVersion} (expected ${expectedVersions[pkgName]})`,
      );
    }
  }

  const examplePkgFiles = collectFiles(join(root, "examples"), (f) => f.endsWith("package.json"));
  for (const pkgFile of examplePkgFiles) {
    const rel = relative(root, pkgFile);
    const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [pkgName, expected] of Object.entries(expectedVersions)) {
      if (deps[pkgName]) {
        assert.ok(
          deps[pkgName] === expected || deps[pkgName] === `^${expected}`,
          `${rel} has outdated dependency ${pkgName}: ${deps[pkgName]} (expected ^${expected})`,
        );
      }
    }
  }

  for (const hitlFile of [
    "examples/multi-channel-hitl.ts",
    "examples/slack-telegram-linear-ask-human/ask-human.ts",
  ]) {
    const src = readFileSync(join(root, hitlFile), "utf8");
    assert.ok(
      src.includes('searchParams.get("nonce")'),
      `${hitlFile} must extract and pass the 1.0.5+ nonce query parameter to verifyChannelApprovalToken`,
    );
  }
});
