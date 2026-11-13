import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifestPath = join(root, "docs/distribution/spurvik-com-well-known-mcp.json");

test("spurvik.com well-known MCP manifest versions", () => {
  const body = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(body.version, "1.0.8");
  assert.equal(body.localStdio.version, "1.0.5");
  assert.equal(body.localStdio.npmPackage, "spurvik-mcp-server");
  assert.equal(body.localStdio.packageName, "spurvik-mcp-server");
  assert.deepEqual(body.localStdio.sdkNpmPackages, ["spurvik@1.0.8", "spurvik-sdk@1.0.8"]);
  assert.equal(body.homepage, "https://spurvik.com");
  assert.equal(body.packages.sdk, "spurvik@1.0.8");
  assert.equal(body.packages.mcpServer, "spurvik-mcp-server@1.0.5");
  assert.equal(body.autoDiscovery.mcpRegistry, "https://github.com/spurvik/spurvik/blob/main/server.json");
  assert.equal(body.autoDiscovery.smithery, "https://github.com/spurvik/spurvik/blob/main/smithery.yaml");
  assert.equal(body.autoDiscovery.glama, "https://github.com/spurvik/spurvik/blob/main/glama.json");
});

test("MCP auto-discovery manifests (server.json, smithery.yaml, glama.json) match 1.0.8/1.0.5 MIT metadata", () => {
  for (const relDir of ["", "packages/mcp", "docs/distribution"]) {
    const dir = relDir ? join(root, relDir) : root;
    const serverText = readFileSync(join(dir, "server.json"), "utf8");
    const smitheryText = readFileSync(join(dir, "smithery.yaml"), "utf8");
    const glamaText = readFileSync(join(dir, "glama.json"), "utf8");

    const server = JSON.parse(serverText);
    const glama = JSON.parse(glamaText);

    assert.equal(server.name, "io.github.spurvik/spurvik-mcp-server");
    assert.equal(server.version, "1.0.5");
    assert.equal(server.license, "MIT");
    assert.equal(server.websiteUrl, "https://spurvik.com/docs");
    assert.equal(server.sandboxUrl, "https://console.spurvik.com/sandbox?scan=https://your-app.com");
    assert.equal(server.repository.url, "https://github.com/spurvik/spurvik");
    assert.equal(server.packages[0].identifier, "spurvik-mcp-server");
    assert.equal(server.packages[0].version, "1.0.5");
    assert.equal(server.packages[0].packageArguments[0].name, "--root");
    assert.equal(server.packages[0].packageArguments[0].isRequired, true);
    assert.equal(server.remotes[0].url, "https://console.spurvik.com/api/mcp");

    assert.equal(glama.name, "spurvik-mcp-server");
    assert.equal(glama.version, "1.0.5");
    assert.equal(glama.license, "MIT");
    assert.equal(glama.homepage, "https://spurvik.com/docs");
    assert.equal(glama.repository, "https://github.com/spurvik/spurvik");
    assert.equal(glama.sandboxUrl, "https://console.spurvik.com/sandbox?scan=https://your-app.com");
    assert.equal(glama.npm.mcpServer, "spurvik-mcp-server@1.0.5");
    assert.equal(glama.npm.sdk, "spurvik@1.0.8");

    assert.match(smitheryText, /spurvik@1\.0\.8/);
    assert.match(smitheryText, /spurvik-mcp-server@1\.0\.5/);
    assert.match(smitheryText, /https:\/\/github\.com\/spurvik\/spurvik/);
    assert.match(smitheryText, /https:\/\/spurvik\.com\/docs/);
    assert.match(smitheryText, /https:\/\/console\.spurvik\.com\/sandbox\?scan=https:\/\/your-app\.com/);
    assert.match(smitheryText, /--package=spurvik-mcp-server@1\.0\.5/);
    assert.equal(server.packages[0].registryType, "npm");
    assert.ok(!("registry_type" in server.packages[0]));
    assert.ok(!("registry_base_url" in server.packages[0]));
    assert.ok(!("environment_variables" in server.packages[0]));
    assert.ok(!("transport_type" in server.remotes[0]));
  }
});

test("packages/mcp package.json mcpName matches server.json name", () => {
  const pkg = JSON.parse(readFileSync(join(root, "packages/mcp/package.json"), "utf8"));
  const server = JSON.parse(readFileSync(join(root, "server.json"), "utf8"));
  assert.equal(pkg.version, "1.0.5");
  assert.equal(pkg.mcpName, "io.github.spurvik/spurvik-mcp-server");
  assert.equal(pkg.mcpName, server.name);
  assert.equal(pkg.dependencies["spurvik-sdk"], "^1.0.7");
});
