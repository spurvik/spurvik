import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serverVersion } from "./server.js";
import { MCP_USER_AGENT, MCP_VERSION } from "./version.js";

describe("version", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

  it("MCP_VERSION matches packages/mcp/package.json", () => {
    expect(MCP_VERSION).toBe(pkg.version);
    expect(MCP_VERSION).toBe("1.0.5");
  });

  it("the User-Agent and serverInfo carry the same version", () => {
    expect(MCP_USER_AGENT).toBe(`spurvik-mcp-server/${pkg.version}`);
    expect(serverVersion()).toBe(pkg.version);
  });
});
