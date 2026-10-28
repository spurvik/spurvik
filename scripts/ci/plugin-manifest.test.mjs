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
  assert.equal(body.homepage, "https://spurvik.com");
  assert.equal(body.packages.sdk, "spurvik@1.0.1");
  assert.equal(body.packages.mcpServer, "spurvik-mcp-server@1.0.2");
  assert.equal(body.autoDiscovery.mcpRegistry, "https://github.com/spurvik/spurvik/blob/main/server.json");
  assert.equal(body.autoDiscovery.smithery, "https://github.com/spurvik/spurvik/blob/main/smithery.yaml");
  assert.equal(body.autoDiscovery.glama, "https://github.com/spurvik/spurvik/blob/main/glama.json");
});

test("MCP auto-discovery manifests (server.json, smithery.yaml, glama.json) match 1.0.1/1.0.2 MIT metadata", () => {
  for (const relDir of ["", "packages/mcp", "docs/distribution"]) {
    const dir = relDir ? join(root, relDir) : root;
    const serverText = readFileSync(join(dir, "server.json"), "utf8");
    const smitheryText = readFileSync(join(dir, "smithery.yaml"), "utf8");
    const glamaText = readFileSync(join(dir, "glama.json"), "utf8");

    const server = JSON.parse(serverText);
    const glama = JSON.parse(glamaText);

    assert.equal(server.name, "io.github.spurvik/spurvik-mcp-server");
    assert.equal(server.version, "1.0.2");
    assert.equal(server.license, "MIT");
    assert.equal(server.websiteUrl, "https://spurvik.com/docs");
    assert.equal(server.sandboxUrl, "https://console.spurvik.com/sandbox?scan=https://your-app.com");
    assert.equal(server.repository.url, "https://github.com/spurvik/spurvik");
    assert.equal(server.packages[0].identifier, "spurvik-mcp-server");
    assert.equal(server.packages[0].version, "1.0.2");
    assert.equal(server.remotes[0].url, "https://console.spurvik.com/api/mcp");

    assert.equal(glama.name, "spurvik-mcp-server");
    assert.equal(glama.version, "1.0.2");
    assert.equal(glama.license, "MIT");
    assert.equal(glama.homepage, "https://spurvik.com/docs");
    assert.equal(glama.repository, "https://github.com/spurvik/spurvik");
    assert.equal(glama.sandboxUrl, "https://console.spurvik.com/sandbox?scan=https://your-app.com");
    assert.equal(glama.npm.mcpServer, "spurvik-mcp-server@1.0.2");
    assert.equal(glama.npm.sdk, "spurvik@1.0.1");

    assert.match(smitheryText, /spurvik@1\.0\.1/);
    assert.match(smitheryText, /spurvik-mcp-server@1\.0\.2/);
    assert.match(smitheryText, /https:\/\/github\.com\/spurvik\/spurvik/);
    assert.match(smitheryText, /https:\/\/spurvik\.com\/docs/);
    assert.match(smitheryText, /https:\/\/console\.spurvik\.com\/sandbox\?scan=https:\/\/your-app\.com/);
  }
});
