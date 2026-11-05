import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

test("packages/sdk and packages/spurvik expose identical exports map and version", () => {
  const sdkPkg = JSON.parse(readFileSync(join(root, "packages/sdk/package.json"), "utf8"));
  const spurvikPkg = JSON.parse(readFileSync(join(root, "packages/spurvik/package.json"), "utf8"));

  assert.equal(spurvikPkg.version, sdkPkg.version, "spurvik and spurvik-sdk versions must match");
  assert.deepEqual(
    Object.keys(spurvikPkg.exports).sort(),
    Object.keys(sdkPkg.exports).sort(),
    "spurvik and spurvik-sdk exports keys must match",
  );
  for (const subpath of [".", "./ai", "./langgraph", "./mastra", "./openai-agents", "./channels", "./react"]) {
    assert.ok(sdkPkg.exports[subpath], `Missing required export subpath ${subpath} in packages/sdk/package.json`);
  }
});

test("No documentation or example files reference removed APIs (spurvik.wrap, badge.js, 10 EU languages)", () => {
  const files = [
    join(root, "README.md"),
    join(root, "RELEASING.md"),
    ...collectFiles(join(root, "docs"), (f) => f.endsWith(".md") || f.endsWith(".json")),
    ...collectFiles(join(root, "examples"), (f) => f.endsWith(".md") || f.endsWith(".ts") || f.endsWith(".mjs")),
  ];

  const forbiddenPatterns = [
    { pattern: /\bspurvik\.wrap\s*\(/, reason: "Use withSpurvik(...) instead of removed spurvik.wrap(...)" },
    { pattern: /spurvik\.com\/badge\.js/, reason: "Do not reference non-existent spurvik.com/badge.js; use <AIDisclosureLabel /> (spurvik/react)" },
    { pattern: /\b10 EU languages\b/i, reason: "Spurvik supports all 24 official EU languages" },
  ];

  for (const file of files) {
    const rel = relative(root, file);
    const text = readFileSync(file, "utf8");
    for (const { pattern, reason } of forbiddenPatterns) {
      assert.equal(
        pattern.test(text),
        false,
        `${rel} matched forbidden pattern ${pattern}: ${reason}`,
      );
    }
  }
});
