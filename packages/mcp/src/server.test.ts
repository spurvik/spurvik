import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type ServerOptions } from "./server.js";

const ALL_TOOLS = [
  "spurvik_classify_ai_act_risk",
  "spurvik_explain_receipt",
  "spurvik_find_unwrapped_calls",
  "spurvik_generate_art50_badge",
  "spurvik_marking_hooks",
  "spurvik_scan_live_url",
  "spurvik_setup_snippet",
];

let workspace: string;

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), "spurvik-mcp-server-test-"));
  writeFileSync(join(workspace, "package.json"), JSON.stringify({ name: "server-test", private: true }));
});

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

async function connect(options: ServerOptions = {}): Promise<Client> {
  const server = createServer(workspace, options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "spurvik-server-test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content[0]?.text ?? "";
}

describe("createServer", () => {
  it("advertises the 1.0.5 version and lists all 7 tools", async () => {
    const client = await connect();
    expect(client.getServerVersion()).toMatchObject({ name: "spurvik", version: "1.0.5" });
    expect(client.getInstructions()).toMatch(/spurvik_scan_live_url sends one public URL to console\.spurvik\.com/);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(ALL_TOOLS);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
      expect(tool.annotations?.openWorldHint).toBe(tool.name === "spurvik_scan_live_url");
    }
    const scan = tools.find((tool) => tool.name === "spurvik_scan_live_url");
    expect(scan?.inputSchema.required).toEqual(["url"]);
    const classify = tools.find((tool) => tool.name === "spurvik_classify_ai_act_risk");
    expect(classify?.inputSchema.required).toEqual(["useCase"]);
    expect((classify?.inputSchema.properties as Record<string, { enum?: string[] }>).domain?.enum).toContain("employment_hr");
    const badge = tools.find((tool) => tool.name === "spurvik_generate_art50_badge");
    expect(badge?.inputSchema.required ?? []).toEqual([]);
    await client.close();
  });

  it("spurvik_scan_live_url returns JSON from a mocked console scan", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          scan: {
            reachable: true,
            measured: true,
            reason: null,
            httpStatus: null,
            detectedWidgets: ["Crisp"],
            detectedSdks: [],
            markers: { art50_1_disclosure: true, art50_2_provenance: false, art50_4_synthetic: false, art12_telemetry: false },
            readinessScore: 50,
            detectedModel: null,
          },
        }),
        { status: 200 },
      ),
    );
    const client = await connect({ scan: { fetch: fetchMock as unknown as typeof fetch } });
    const result = await client.callTool({ name: "spurvik_scan_live_url", arguments: { url: "example.fr" } });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(textOf(result));
    expect(body).toMatchObject({
      host: "example.fr",
      offlineFallback: false,
      status: "measured",
      score: 50,
      detectedWidgets: ["Crisp"],
      art50NoticeDetected: true,
      suggestedLocale: "fr",
      reportUrl: "https://console.spurvik.com/report?domain=example.fr",
      sandboxUrl: "https://console.spurvik.com/sandbox?scan=example.fr",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await client.close();
  });

  it("spurvik_scan_live_url falls back cleanly when the global fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    const client = await connect();
    const result = await client.callTool({ name: "spurvik_scan_live_url", arguments: { url: "stepnetwork.dk" } });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(textOf(result))).toMatchObject({ offlineFallback: true, host: "stepnetwork.dk", suggestedLocale: "da" });
    vi.unstubAllGlobals();
    await client.close();
  });

  it("spurvik_scan_live_url refuses private targets with isError", async () => {
    const fetchMock = vi.fn();
    const client = await connect({ scan: { fetch: fetchMock as unknown as typeof fetch } });
    for (const url of ["localhost", "http://10.1.2.3", "http://[::1]:8080", "metadata.google.internal"]) {
      const result = await client.callTool({ name: "spurvik_scan_live_url", arguments: { url } });
      expect(result.isError).toBe(true);
      expect(JSON.parse(textOf(result)).error).toMatch(/^(blocked_target|invalid_url)$/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    await client.close();
  });

  it("spurvik_classify_ai_act_risk returns a tier", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "spurvik_classify_ai_act_risk",
      arguments: { useCase: "CV screening that ranks job applicants", domain: "employment_hr" },
    });
    const body = JSON.parse(textOf(result));
    expect(body.tier).toBe("high_risk_annex_iii");
    expect(body.scopeNote).toBe("Engineering mapping aid; not legal advice.");
    expect(body.interactiveClassifierUrl).toBe("https://console.spurvik.com/risk-check");
    const bad = await client.callTool({ name: "spurvik_classify_ai_act_risk", arguments: { useCase: "x", domain: "healthcare" } });
    expect(bad.isError).toBe(true);
    await client.close();
  });

  it("spurvik_generate_art50_badge returns the badge bundle", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "spurvik_generate_art50_badge",
      arguments: { systemName: "stepnetwork.dk", position: "bottom-left", theme: "light", attribution: false },
    });
    const body = JSON.parse(textOf(result));
    expect(body.locale).toBe("da");
    expect(body.script).toBe(
      '<script src="https://spurvik.com/badge.js" data-system="stepnetwork.dk" data-locale="da" data-theme="light" data-position="bottom-left" data-attribution="false" defer></script>',
    );
    const bad = await client.callTool({ name: "spurvik_generate_art50_badge", arguments: { locale: "xx" } });
    expect(bad.isError).toBe(true);
    expect(JSON.parse(textOf(bad)).error).toBe("invalid_locale");
    await client.close();
  });

  it("spurvik_setup_snippet links the report, Pro and Done-For-You pages", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "spurvik_setup_snippet", arguments: { framework: "openai", runtime: "node" } });
    const text = textOf(result);
    expect(text).toContain("https://console.spurvik.com/report");
    expect(text).toContain("https://console.spurvik.com/signup?plan=pro");
    expect(text).toContain("https://console.spurvik.com/signup?plan=concierge");
    expect(text).toContain("€199");
    expect(text).toMatch(/import \{[\s\S]*withSpurvik[\s\S]*\} from "spurvik"/);
    expect(text.includes("@spurvik/")).toBe(false);
    await client.close();
  });
});
