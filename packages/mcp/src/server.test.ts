import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type ServerOptions } from "./server.js";

const ALL_TOOLS = [
  "spurvik_batch_scan_domains",
  "spurvik_check_image_c2pa_url",
  "spurvik_classify_ai_act_risk",
  "spurvik_explain_receipt",
  "spurvik_find_unwrapped_calls",
  "spurvik_generate_art50_badge",
  "spurvik_marking_hooks",
  "spurvik_scan_live_url",
  "spurvik_setup_snippet",
  "spurvik_vendor_questionnaire_answers",
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

/** Second text item: the `## Next steps` Markdown after a JSON result. */
function nextStepsOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  expect(content).toHaveLength(2);
  return content[1]?.text ?? "";
}

function allText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as Array<{ text?: string }>).map((item) => item.text ?? "").join("\n");
}

describe("createServer", () => {
  it("advertises the 1.0.9 version and lists all 10 tools", async () => {
    const client = await connect();
    expect(client.getServerVersion()).toMatchObject({ name: "spurvik", version: "1.0.9" });
    expect(client.getInstructions()).toMatch(/Seven tools run locally and do not use the network/);
    expect(client.getInstructions()).toMatch(/spurvik_vendor_questionnaire_answers drafts copy-paste answers/);
    expect(client.getInstructions()).toMatch(/spurvik_scan_live_url sends one public URL to console\.spurvik\.com/);
    expect(client.getInstructions()).toMatch(/spurvik_batch_scan_domains does the same for up to 10 public domains/);
    expect(client.getInstructions()).toMatch(/spurvik_check_image_c2pa_url sends one public https image URL to console\.spurvik\.com for a read-only C2PA manifest check/);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(10);
    expect(tools.map((tool) => tool.name).sort()).toEqual(ALL_TOOLS);
    const networkTools = ["spurvik_batch_scan_domains", "spurvik_check_image_c2pa_url", "spurvik_scan_live_url"];
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
      expect(tool.annotations?.idempotentHint).toBe(true);
      expect(tool.annotations?.openWorldHint).toBe(networkTools.includes(tool.name));
    }
    const scan = tools.find((tool) => tool.name === "spurvik_scan_live_url");
    expect(scan?.inputSchema.required).toEqual(["url"]);
    const batch = tools.find((tool) => tool.name === "spurvik_batch_scan_domains");
    expect(batch?.inputSchema.required).toEqual(["domains"]);
    expect((batch?.inputSchema.properties as Record<string, { type?: string; minItems?: number; maxItems?: number }>).domains).toMatchObject({
      type: "array",
      minItems: 1,
      maxItems: 10,
    });
    expect(batch?.description).toContain("€79/mo");
    expect(batch?.description).toContain("€199 once");
    const c2pa = tools.find((tool) => tool.name === "spurvik_check_image_c2pa_url");
    expect(c2pa?.inputSchema.required).toEqual(["url"]);
    expect((c2pa?.inputSchema.properties as Record<string, { type?: string; minLength?: number; maxLength?: number }>).url).toMatchObject({
      type: "string",
      minLength: 1,
      maxLength: 2048,
    });
    expect(c2pa?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
    expect(c2pa?.description).toContain("C2PA JUMBF manifest & CDN-strip checker");
    expect(c2pa?.description).toContain("never signs");
    expect(c2pa?.description).toContain("€19/mo");
    expect(c2pa?.description).toContain("€199 once");
    expect(c2pa?.description).not.toMatch(/Ed25519|signer\b/i);
    const classify = tools.find((tool) => tool.name === "spurvik_classify_ai_act_risk");
    expect(classify?.inputSchema.required).toEqual(["useCase"]);
    expect((classify?.inputSchema.properties as Record<string, { enum?: string[] }>).domain?.enum).toContain("employment_hr");
    const badge = tools.find((tool) => tool.name === "spurvik_generate_art50_badge");
    expect(badge?.inputSchema.required ?? []).toEqual([]);
    const questionnaire = tools.find((tool) => tool.name === "spurvik_vendor_questionnaire_answers");
    expect(questionnaire?.inputSchema.required ?? []).toEqual([]);
    const props = questionnaire?.inputSchema.properties as Record<string, { type?: string; enum?: string[]; maxLength?: number }>;
    expect(props.plan?.enum).toEqual(["free", "pro", "team", "concierge"]);
    expect(props.provider?.enum).toEqual(["openai", "anthropic", "google-genai", "vercel-ai-sdk", "langgraph", "openai-agents", "mastra", "python", "custom"]);
    expect(props.hasHighRiskActions?.type).toBe("boolean");
    expect(props.generatesMedia?.type).toBe("boolean");
    expect(props.domain).toMatchObject({ type: "string", maxLength: 2048 });
    expect(questionnaire?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(questionnaire?.description).toContain("€79/mo");
    expect(questionnaire?.description).not.toMatch(/€49|inputHmac|entryHash/);
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
      portfolioUrl: "https://console.spurvik.com/portfolio",
      statusShieldMarkdown:
        "[![EU AI Act Art. 50](https://console.spurvik.com/api/v1/badge/status.svg?domain=example.fr)](https://console.spurvik.com/report?domain=example.fr)",
      upgradeUrls: {
        proWhiteLabelAndAuditVault: "https://console.spurvik.com/signup?plan=pro&appUrl=example.fr",
        doneForYou24hSetup: "https://console.spurvik.com/signup?plan=concierge&appUrl=example.fr",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await client.close();
  });

  it("spurvik_batch_scan_domains returns a summary from mocked console scans", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const host = new URL(new URL(String(input)).searchParams.get("url") ?? "").hostname;
      const widgets = host === "folk.app" ? ["Intercom Fin"] : [];
      return new Response(
        JSON.stringify({
          ok: true,
          scan: {
            reachable: true,
            measured: widgets.length > 0,
            reason: widgets.length > 0 ? null : "no_ai_surface",
            httpStatus: null,
            detectedWidgets: widgets,
            detectedSdks: [],
            markers: { art50_1_disclosure: false, art50_2_provenance: false, art50_4_synthetic: false, art12_telemetry: false },
            readinessScore: widgets.length > 0 ? 25 : null,
            detectedModel: null,
          },
        }),
        { status: 200 },
      );
    });
    const client = await connect({ scan: { fetch: fetchMock as unknown as typeof fetch } });
    const result = await client.callTool({ name: "spurvik_batch_scan_domains", arguments: { domains: ["folk.app", "stepnetwork.dk"] } });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(textOf(result));
    expect(body).toMatchObject({
      tool: "spurvik_batch_scan_domains",
      totalDomains: 2,
      gapsFound: 1,
      portfolioUrl: "https://console.spurvik.com/portfolio",
      upgradeUrls: {
        teamAgencyPack: "https://console.spurvik.com/signup?plan=team",
        doneForYouPerSite: "https://console.spurvik.com/signup?plan=concierge",
      },
    });
    expect(body.results.map((row: { host: string; gap: boolean }) => [row.host, row.gap])).toEqual([
      ["folk.app", true],
      ["stepnetwork.dk", false],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await client.close();
  });

  it("spurvik_batch_scan_domains refuses a batch with a private target, and more than 10 domains, before any request", async () => {
    const fetchMock = vi.fn();
    const client = await connect({ scan: { fetch: fetchMock as unknown as typeof fetch } });
    const blocked = await client.callTool({
      name: "spurvik_batch_scan_domains",
      arguments: { domains: ["folk.app", "http://192.168.1.1", "localhost"] },
    });
    expect(blocked.isError).toBe(true);
    expect(JSON.parse(textOf(blocked))).toEqual({
      error: "blocked_target",
      message: expect.stringMatching(/^Nothing was scanned\. Entries 2, 3 are not public/),
      rejected: [
        { position: 2, error: "blocked_target" },
        { position: 3, error: "blocked_target" },
      ],
    });
    const tooMany = await client.callTool({
      name: "spurvik_batch_scan_domains",
      arguments: { domains: Array.from({ length: 11 }, (_, index) => `site${index}.example.com`) },
    });
    expect(tooMany.isError).toBe(true);
    const empty = await client.callTool({ name: "spurvik_batch_scan_domains", arguments: { domains: [] } });
    expect(empty.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("spurvik_check_image_c2pa_url returns JSON from a mocked console check", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            mediaType: "image/png",
            byteLength: 33270,
            manifestFound: false,
            embedded: false,
            claimGenerator: null,
            signatureMatches: false,
            trustAnchor: "not_checked",
            validationCodes: [],
          },
          fileName: "hero.png",
        }),
        { status: 200 },
      ),
    );
    const client = await connect({ c2pa: { fetch: fetchMock as unknown as typeof fetch } });
    const result = await client.callTool({
      name: "spurvik_check_image_c2pa_url",
      arguments: { url: "https://example.fr/_next/image?url=%2Fhero.png&w=640&q=75" },
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(textOf(result));
    expect(body).toMatchObject({
      tool: "spurvik_check_image_c2pa_url",
      status: "no_manifest",
      host: "example.fr",
      fileName: "hero.png",
      mediaType: "image/png",
      byteLength: 33270,
      c2pa: { manifestFound: false, signatureMatches: false, trustAnchor: "not_checked", claimGenerator: null, validationCodes: [] },
      imageProxy: { detected: true, name: "Next.js image optimizer (/_next/image)" },
      disclosure: { locale: "fr" },
      links: {
        c2pa: "https://console.spurvik.com/c2pa",
        pro: "https://console.spurvik.com/signup?plan=pro&appUrl=example.fr",
        concierge: "https://console.spurvik.com/signup?plan=concierge&appUrl=example.fr",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await client.close();
  });

  it("spurvik_check_image_c2pa_url refuses http, private and internal URLs with isError and no request", async () => {
    const fetchMock = vi.fn();
    const client = await connect({ c2pa: { fetch: fetchMock as unknown as typeof fetch } });
    for (const url of ["http://example.com/a.png", "https://192.168.0.10/a.png", "https://cam.local/a.png", "https://example.com:8443/a.png"]) {
      const result = await client.callTool({ name: "spurvik_check_image_c2pa_url", arguments: { url } });
      expect(result.isError).toBe(true);
      expect(JSON.parse(textOf(result)).error).toMatch(/^(invalid_url|blocked_target)$/);
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
    const steps = nextStepsOf(result);
    expect(steps).toMatch(/^## Next steps\n/);
    expect(steps).toContain("https://spurvik.com/eu-ai-act-vendor-security-questionnaire");
    expect(steps).toContain("https://console.spurvik.com/signup\n");
    expect(steps).toContain("https://console.spurvik.com/signup?plan=pro\n");
    expect(steps).toContain("Team €79/mo): https://console.spurvik.com/signup?plan=team");
    expect(steps).toContain("Done-For-You 24h setup (€199 once, incl. 1 yr Pro): https://console.spurvik.com/signup?plan=concierge");
    const bad = await client.callTool({ name: "spurvik_classify_ai_act_risk", arguments: { useCase: "x", domain: "healthcare" } });
    expect(bad.isError).toBe(true);
    expect((bad.content as unknown[]).length).toBe(1);
    await client.close();
  });

  it("spurvik_classify_ai_act_risk Next steps: no Team/Done-For-You below high-risk, none for a prohibited practice", async () => {
    const client = await connect();
    const limited = await client.callTool({
      name: "spurvik_classify_ai_act_risk",
      arguments: { useCase: "A customer support chatbot that answers shipping questions" },
    });
    expect(JSON.parse(textOf(limited)).tier).toBe("limited_transparency_art50");
    const steps = nextStepsOf(limited);
    expect(steps).toContain("https://spurvik.com/eu-ai-act-vendor-security-questionnaire");
    expect(steps).toContain("https://console.spurvik.com/signup?plan=pro");
    expect(steps).not.toContain("plan=team");
    expect(steps).not.toContain("plan=concierge");
    const prohibited = await client.callTool({
      name: "spurvik_classify_ai_act_risk",
      arguments: { useCase: "A social scoring system that ranks citizens by trustworthiness for public services" },
    });
    expect(JSON.parse(textOf(prohibited)).tier).toBe("prohibited_art5");
    expect((prohibited.content as unknown[]).length).toBe(1);
    expect(JSON.stringify(prohibited.content)).not.toContain("Next steps");
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
    const steps = nextStepsOf(result);
    expect(steps).toContain("https://console.spurvik.com/labels");
    expect(steps).toContain("Done-For-You 24h setup (€199 once, incl. 1 yr Pro): https://console.spurvik.com/signup?plan=concierge&appUrl=stepnetwork.dk");
    expect(allText(result).match(/not legal advice/gi)).toHaveLength(1);
    const named = await client.callTool({ name: "spurvik_generate_art50_badge", arguments: { systemName: "Acme <Bot>" } });
    expect(nextStepsOf(named)).toContain("https://console.spurvik.com/signup?plan=concierge\n");
    expect(nextStepsOf(named)).not.toContain("appUrl");
    const bad = await client.callTool({ name: "spurvik_generate_art50_badge", arguments: { locale: "xx" } });
    expect(bad.isError).toBe(true);
    expect(JSON.parse(textOf(bad)).error).toBe("invalid_locale");
    expect((bad.content as unknown[]).length).toBe(1);
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
    expect(text).toMatch(/```\n\n## Next steps\n- Mint a Free SPURVIK_API_KEY in 10s \(work email only, no password, EU Frankfurt fra1\): https:\/\/console\.spurvik\.com\/signup\n/);
    expect(text).toContain("- White-label Art. 50 badge + 90-day Frankfurt vault + Slack/Teams approval gates (Pro €19/mo): https://console.spurvik.com/signup?plan=pro\n");
    expect(text).toContain("- Done-For-You 24h setup (€199 once, incl. 1 yr Pro): https://console.spurvik.com/signup?plan=concierge\n");
    const pyFastapi = textOf(await client.callTool({ name: "spurvik_setup_snippet", arguments: { framework: "fastapi" } }));
    expect(pyFastapi).toContain("```python\n");
    expect(pyFastapi).toContain("https://spurvik.com/r/spurvik_guard.py");
    expect(pyFastapi).toContain("from spurvik_guard import art50_badge_html, request_human_approval, send_telemetry_event");
    expect(pyFastapi).toContain("background_tasks.add_task(");
    expect(pyFastapi).toContain("## Next steps\n");
    await client.close();
  });

  it("spurvik_find_unwrapped_calls ends with wrap and signup Next steps", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "spurvik_find_unwrapped_calls", arguments: { directory: "." } });
    const text = textOf(result);
    expect(text).toContain("No unwrapped calls found.");
    const steps = text.slice(text.indexOf("## Next steps"));
    expect(steps).toContain("- Wrap detected calls: call `spurvik_setup_snippet` for your SDK/runtime (`npm install spurvik`).");
    expect(steps).toContain("https://console.spurvik.com/signup\n");
    expect(steps).toContain("https://console.spurvik.com/signup?plan=pro\n");
    expect(steps).toContain("https://console.spurvik.com/signup?plan=concierge\n");
    await client.close();
  });

  it("spurvik_explain_receipt adds receipt Next steps on success only, without the secret", async () => {
    const client = await connect();
    const secret = "server-test-signing-secret-0001";
    const result = await client.callTool({
      name: "spurvik_explain_receipt",
      arguments: { receipt: JSON.stringify({ kind: "provenance_record", signatureAlg: "HMAC-SHA-256", inputHash: "abc" }), signingSecret: secret },
    });
    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("## Next steps");
    expect(text).toContain("(`inputHash` + `recordHash`) to EU Frankfurt (`fra1`) — Free SPURVIK_API_KEY in 10s: https://console.spurvik.com/signup\n");
    expect(text).toContain("- 90-day audit retention + DPO engineering summary download (Pro €19/mo): https://console.spurvik.com/signup?plan=pro\n");
    expect(text).toContain("- 12-month retention + Annex IV technical documentation draft (Team €79/mo): https://console.spurvik.com/signup?plan=team\n");
    expect(text).not.toContain(secret);
    const bad = await client.callTool({ name: "spurvik_explain_receipt", arguments: { receipt: "not json" } });
    expect(bad.isError).toBe(true);
    expect(JSON.stringify(bad.content)).not.toContain("Next steps");
    await client.close();
  });

  it("spurvik_marking_hooks ends with the C2PA checker and signup Next steps", async () => {
    const client = await connect();
    const text = textOf(await client.callTool({ name: "spurvik_marking_hooks", arguments: { surface: "media" } }));
    expect(text).toMatch(/\n\n## Next steps\n- Check live image URLs for C2PA JUMBF manifests & CDN stripping \(2 Dec 2026 Art\. 50\(2\)\): call `spurvik_check_image_c2pa_url` or open https:\/\/console\.spurvik\.com\/c2pa\n/);
    expect(text).toContain("- Mint a Free SPURVIK_API_KEY in 10s (work email only, no password): https://console.spurvik.com/signup\n");
    expect(text).toContain("- White-label Art. 50 badge + 90-day Frankfurt provenance vault (Pro €19/mo): https://console.spurvik.com/signup?plan=pro\n");
    await client.close();
  });

  it("spurvik_vendor_questionnaire_answers returns Markdown with zero arguments", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "spurvik_vendor_questionnaire_answers", arguments: {} });
    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("## Q1: Art. 50(1) & 2 Dec 2026 Art. 50(2) Transparency & Provenance");
    expect(text).toContain("## Q5: Audit Retention, DPO Evidence & Annex IV Documentation");
    expect(text).toContain("Spurvik plan: Pro (€19/mo or €190/yr)");
    expect(text.match(/not legal advice/gi)).toHaveLength(1);
    const prefilled = textOf(
      await client.callTool({ name: "spurvik_vendor_questionnaire_answers", arguments: { plan: "team", provider: "langgraph", domain: "acme.eu" } }),
    );
    expect(prefilled).toContain("https://console.spurvik.com/signup?plan=concierge&appUrl=acme.eu");
    expect(prefilled).toContain("`spurvikInterrupt`");
    const bad = await client.callTool({ name: "spurvik_vendor_questionnaire_answers", arguments: { plan: "enterprise" } });
    expect(bad.isError).toBe(true);
    await client.close();
  });
});
