import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// `spurvik rfp | head -n 5`: the reader closes the pipe before the CLI is done writing. The staged
// `npx spurvik` bin must drop the rest of its output and keep its own exit code, with no uncaught EPIPE trace.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(root, "packages", "spurvik", "dist", "cli.js");

/** Runs the CLI with the read end of `closed` ("stdout" or "stderr") shut before the CLI writes anything. */
function runWithClosedPipe(args, closed) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: root,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("error", reject);
    child[closed].destroy();
    const open = closed === "stdout" ? child.stderr : child.stdout;
    let text = "";
    open.setEncoding("utf8");
    open.on("data", (chunk) => {
      text += chunk;
    });
    child.on("close", (code, signal) => resolve({ code, signal, text }));
  });
}

describe("spurvik CLI with a closed pipe (EPIPE)", () => {
  assert.equal(existsSync(cli), true, `Missing ${cli}. Build packages/sdk and run scripts/stage-spurvik-package.mjs first.`);

  const dir = mkdtempSync(join(tmpdir(), "spurvik-epipe-"));
  writeFileSync(join(dir, "agent.ts"), "const client = new OpenAI();\n".repeat(200));
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("rfp | head exits 0 with nothing on stderr", async () => {
    const { code, signal, text } = await runWithClosedPipe(["rfp", "acme.eu"], "stdout");
    assert.equal(signal, null);
    assert.equal(text, "");
    assert.equal(code, 0);
  });

  it("audit --fail-on-gap | head keeps exit code 1 for unwrapped calls, with nothing on stderr", async () => {
    const { code, signal, text } = await runWithClosedPipe(["audit", dir, "--fail-on-gap"], "stdout");
    assert.equal(signal, null);
    assert.equal(text, "");
    assert.equal(code, 1);
  });

  it("a usage error with stderr closed still exits 2 and prints nothing to stdout", async () => {
    const { code, signal, text } = await runWithClosedPipe(["scan", "folk.app", "--yolo"], "stderr");
    assert.equal(signal, null);
    assert.equal(text, "");
    assert.equal(code, 2);
  });
});
