import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runMcpUnwrappedScan } from "./run-mcp-scan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..", "..");
const bundledServerBin = path.join(repoRoot, "plugins", "spurvik", "bin", "spurvik-mcp.mjs");

test("GitHub Actions MCP CI check detects unwrapped AI calls and passes wrapped AI calls", async () => {
  const workDir = mkdtempSync(path.join(tmpdir(), "spurvik-ci-scan-"));
  try {
    writeFileSync(path.join(workDir, "package.json"), JSON.stringify({ name: "sample-app", private: true }));
    writeFileSync(
      path.join(workDir, "unwrapped.ts"),
      `import OpenAI from "openai";\nconst client = new OpenAI();\nawait client.chat.completions.create({ model: "gpt-4o", messages: [] });\n`,
    );

    const failRes = await runMcpUnwrappedScan({
      rootDir: workDir,
      targetDir: ".",
      serverBin: bundledServerBin,
      githubActions: false,
    });
    assert.equal(failRes.exitCode, 1);
    assert.equal(failRes.findings.length, 1);
    assert.equal(failRes.findings[0].file, "unwrapped.ts");
    assert.equal(failRes.findings[0].line, 3);

    rmSync(path.join(workDir, "unwrapped.ts"));
    writeFileSync(
      path.join(workDir, "wrapped.ts"),
      `import OpenAI from "openai";\nimport { withSpurvik } from "spurvik";\nconst client = withSpurvik(new OpenAI(), { apiKey: process.env.SPURVIK_API_KEY!, signingSecret: process.env.SPURVIK_SIGNING_SECRET! });\nawait client.chat.completions.create({ model: "gpt-4o", messages: [] });\n`,
    );

    const passRes = await runMcpUnwrappedScan({
      rootDir: workDir,
      targetDir: ".",
      serverBin: bundledServerBin,
      githubActions: false,
    });
    assert.equal(passRes.exitCode, 0);
    assert.equal(passRes.findings.length, 0);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
