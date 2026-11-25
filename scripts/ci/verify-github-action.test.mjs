import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const actionYml = readFileSync(join(ROOT, "action.yml"), "utf8");
const sdkPkg = JSON.parse(readFileSync(join(ROOT, "packages/sdk/package.json"), "utf8"));
const mcpPkg = JSON.parse(readFileSync(join(ROOT, "packages/mcp/package.json"), "utf8"));

test("action.yml meets GitHub Marketplace metadata & security invariants", () => {
  assert.match(actionYml, /^name: "Spurvik EU AI Act & C2PA PR Check"/m);
  const descMatch = actionYml.match(/^description: "([^"]+)"/m);
  assert.ok(descMatch, "description present");
  assert.ok(descMatch[1].length > 40 && descMatch[1].length <= 125, `Marketplace description <= 125 chars (got ${descMatch[1].length})`);
  assert.match(actionYml, /using: "composite"/);
  assert.match(actionYml, /icon: "shield"/);
  assert.match(actionYml, /color: "green"/);

  // Zero banned words
  assert.doesNotMatch(actionYml, /\b(?:compliant|verified|certified|guaranteed)\b/i);
  assert.doesNotMatch(actionYml, /€\s?49\b|49\s?€/);

  // Security: zero ${{ inputs.* }} inside `run:` blocks (all untrusted inputs must pass through `env:`).
  const runBlocks = [...actionYml.matchAll(/^\s*run:\s*\|\n((?: {8}.*\n?)+)/gm)].map((m) => m[1]);
  assert.ok(runBlocks.length >= 4, `expected >= 4 run blocks, got ${runBlocks.length}`);
  for (const block of runBlocks) {
    assert.doesNotMatch(block, /\$\{\{\s*inputs\./, "never interpolate inputs.* directly in run: shell scripts");
  }

  // Version lockstep with published packages
  assert.ok(actionYml.includes(`spurvik@${sdkPkg.version}`), `pins spurvik@${sdkPkg.version}`);
  assert.ok(actionYml.includes(`spurvik-mcp-server@${mcpPkg.version}`), `pins spurvik-mcp-server@${mcpPkg.version}`);

  // Outputs match step outputs
  for (const [outKey, stepKey] of [
    ["status-shield-markdown", "status_shield_markdown"],
    ["c2pa-shield-markdown", "c2pa_shield_markdown"],
    ["report-url", "report_url"],
    ["well-known-manifest-url", "well_known_manifest_url"],
    ["annex-iv-studio-url", "annex_iv_studio_url"],
  ]) {
    assert.ok(actionYml.includes(`  ${outKey}:`), `missing output ${outKey}`);
    assert.ok(actionYml.includes(`steps.summary.outputs.${stepKey}`), `missing step output ${stepKey}`);
    assert.ok(actionYml.includes(`${stepKey}=`), `summary script writes ${stepKey}`);
  }
});
