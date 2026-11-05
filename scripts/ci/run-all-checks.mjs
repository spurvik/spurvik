import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function runStep(label, cmd, args, cwd = root) {
  console.log(`\n=== [CI] ${label} ===`);
  execFileSync(cmd, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
}

runStep("MCP & Claude Plugin Manifest Verification", process.execPath, [
  "--test",
  "scripts/ci/plugin-manifest.test.mjs",
]);

runStep("Docs & Runnable Examples Version Sync Gate", process.execPath, [
  "--test",
  "scripts/ci/verify-docs-version-sync.mjs",
]);

runStep("Distribution Surfaces & Exports Parity Gate", process.execPath, [
  "--test",
  "scripts/ci/verify-distribution-surfaces.mjs",
]);

runStep("n8n & Make.com Workflow Validation", process.execPath, [
  "examples/n8n-make-import/validate-workflows.mjs",
]);

runStep("GitHub Actions MCP Unwrapped-Call Scanner Smoke Test", process.execPath, [
  "--test",
  "examples/github-actions-ci-check/smoke.test.mjs",
]);

runStep("LangGraph, Mastra & OpenAI Agents Adapters Smoke Test", process.execPath, [
  "--test",
  "examples/langgraph-mastra-openai-agents/smoke.test.mjs",
]);

runStep("Cursor, Claude Code & VS Code MCP Tools Smoke Test", process.execPath, [
  "--test",
  "examples/cursor-claude-code-mcp/smoke.test.mjs",
]);

runStep("n8n Community Node Build & Execution Tests", "npm", ["test"], join(root, "packages/n8n-nodes-spurvik"));

console.log("\n=== [CI] All repository checks passed ===");
