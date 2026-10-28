import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifestPath = join(root, "docs/distribution/spurvik-com-well-known-mcp.json");

test("spurvik.com well-known MCP manifest versions", () => {
  const body = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(body.version, "1.0.1");
  assert.equal(body.localStdio.version, "1.0.2");
  assert.equal(body.localStdio.npmPackage, "spurvik-mcp-server");
  assert.deepEqual(body.localStdio.sdkNpmPackages, ["spurvik@1.0.1", "spurvik-sdk@1.0.1"]);
});
