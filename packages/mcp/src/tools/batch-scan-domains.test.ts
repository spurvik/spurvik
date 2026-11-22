import { afterEach, describe, expect, it, vi } from "vitest";
import { MCP_USER_AGENT } from "../version.js";
import {
  BATCH_MAX_DOMAINS,
  BATCH_SCAN_CONCURRENCY,
  BATCH_SCAN_DOMAINS_INPUT_JSON_SCHEMA,
  batchScanDomains,
  type BatchScanDomainsOutcome,
  type BatchScanDomainsResult,
} from "./batch-scan-domains.js";
import { SCAN_ENDPOINT, SCAN_TIMEOUT_MS } from "./scan-live-url.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const NO_MARKERS = { art50_1_disclosure: false, art50_2_provenance: false, art50_4_synthetic: false, art12_telemetry: false };

function pageScan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    reachable: true,
    measured: true,
    reason: null,
    httpStatus: null,
    detectedWidgets: [],
    detectedSdks: [],
    markers: NO_MARKERS,
    readinessScore: 50,
    detectedModel: null,
    ...overrides,
  };
}

/** The `url` value the tool sent to the console scan endpoint. */
function scannedUrlOf(input: RequestInfo | URL): string {
  const url = new URL(String(input));
  expect(`${url.origin}${url.pathname}`).toBe(SCAN_ENDPOINT);
  return url.searchParams.get("url") ?? "";
}

type FetchMock = ReturnType<typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>>;

function routedFetch(routes: Record<string, () => Response | Promise<Response>>): FetchMock {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const target = scannedUrlOf(input);
    const route = routes[new URL(target).hostname];
    if (!route) throw new Error("unexpected host in test");
    return route();
  });
}

async function expectOk(promise: Promise<BatchScanDomainsOutcome>): Promise<BatchScanDomainsResult> {
  const outcome = await promise;
  if (!outcome.ok) throw new Error(`expected ok, got ${outcome.error}: ${outcome.message}`);
  return outcome.result;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BATCH_SCAN_DOMAINS_INPUT_JSON_SCHEMA", () => {
  it("caps the batch at 10 public domains", () => {
    expect(BATCH_MAX_DOMAINS).toBe(10);
    expect(BATCH_SCAN_CONCURRENCY).toBe(4);
    expect(BATCH_SCAN_DOMAINS_INPUT_JSON_SCHEMA.required).toEqual(["domains"]);
    expect(BATCH_SCAN_DOMAINS_INPUT_JSON_SCHEMA.properties.domains).toMatchObject({ type: "array", minItems: 1, maxItems: 10 });
  });
});

describe("batchScanDomains", () => {
  it("scans each domain once through GET /api/v1/sandbox/scan and summarizes gaps", async () => {
    const fetchMock = routedFetch({
      "folk.app": () => jsonResponse({ ok: true, scan: pageScan({ detectedWidgets: ["Intercom Fin"], readinessScore: 25 }) }),
      "trengo.com": () =>
        jsonResponse({ ok: true, scan: pageScan({ detectedWidgets: ["Trengo"], detectedSdks: ["HubSpot"] }) }),
      "spurvik.com": () =>
        jsonResponse({
          ok: true,
          scan: pageScan({ measured: false, reason: "no_ai_surface", readinessScore: null, markers: { ...NO_MARKERS, art50_1_disclosure: true } }),
        }),
      "stepnetwork.dk": () =>
        jsonResponse({ ok: true, scan: pageScan({ detectedSdks: ["OpenAI"], markers: { ...NO_MARKERS, art50_1_disclosure: true } }) }),
      "example.org": () => jsonResponse({ ok: true, scan: pageScan({ measured: false, reason: "no_ai_surface", readinessScore: null }) }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    const result = await expectOk(
      batchScanDomains(["folk.app", "https://trengo.com/pricing", "spurvik.com", "STEPNETWORK.DK", "http://example.org"]),
    );

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls.map(([input]) => scannedUrlOf(input))).toEqual([
      "https://folk.app/",
      "https://trengo.com/pricing",
      "https://spurvik.com/",
      "https://stepnetwork.dk/",
      "https://example.org/",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.method).toBe("GET");
      expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(MCP_USER_AGENT);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(timeoutSpy).toHaveBeenCalledTimes(5);
    expect(timeoutSpy).toHaveBeenCalledWith(SCAN_TIMEOUT_MS);

    expect(result).toMatchObject({
      tool: "spurvik_batch_scan_domains",
      totalDomains: 5,
      duplicatesRemoved: 0,
      scannedDomains: 5,
      gapsFound: 2,
      offlineFallbacks: 0,
      portfolioUrl: "https://console.spurvik.com/portfolio",
      upgradeUrls: {
        teamAgencyPack: "https://console.spurvik.com/signup?plan=team",
        doneForYouPerSite: "https://console.spurvik.com/signup?plan=concierge",
      },
      prices: { teamAgencyPack: "€79/mo", doneForYouPerSite: "€199 once" },
    });
    expect(result.note).toContain("Not legal advice.");
    expect(result.note).toContain("Prices excl. VAT, B2B.");
    expect(JSON.stringify(result)).not.toContain("€49");

    expect(result.results.map((row) => [row.host, row.gap, row.art50NoticeDetected])).toEqual([
      ["folk.app", true, false],
      ["trengo.com", true, false],
      ["spurvik.com", false, true],
      ["stepnetwork.dk", false, true],
      ["example.org", false, false],
    ]);
    const folk = result.results[0]!;
    expect(folk).toEqual({
      host: "folk.app",
      scannedUrl: "https://folk.app/",
      status: "measured",
      offlineFallback: false,
      reason: null,
      score: 25,
      detectedWidgets: ["Intercom Fin"],
      detectedSdks: [],
      art50NoticeDetected: false,
      gap: true,
      suggestedLocale: "en",
      reportUrl: "https://console.spurvik.com/report?domain=folk.app",
      sandboxUrl: "https://console.spurvik.com/sandbox?scan=folk.app",
      badgeSnippet:
        '<script src="https://spurvik.com/badge.js" data-system="folk.app" data-locale="en" data-theme="dark" data-attribution="true" defer></script>',
      statusShieldUrl: "https://console.spurvik.com/api/v1/badge/status.svg?domain=folk.app",
      statusShieldMarkdown:
        "[![EU AI Act Art. 50](https://console.spurvik.com/api/v1/badge/status.svg?domain=folk.app)](https://console.spurvik.com/report?domain=folk.app)",
    });
    expect(result.results[3]?.suggestedLocale).toBe("da");
  });

  it("runs at most 4 scans at once over 10 domains and keeps input order", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      const host = new URL(scannedUrlOf(input)).hostname;
      // Later hosts answer first, so a result written to the wrong slot would show up.
      await new Promise((resolve) => setTimeout(resolve, 30 - Number(host.split(".")[0]!.slice(4)) * 2));
      inFlight -= 1;
      return jsonResponse({ scan: pageScan({ detectedWidgets: [`W-${host}`] }) });
    });
    const domains = Array.from({ length: 10 }, (_, index) => `site${index}.example.com`);
    const result = await expectOk(batchScanDomains(domains, { fetch: fetchMock as unknown as typeof fetch }));
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(peak).toBe(4);
    expect(result.results.map((row) => row.host)).toEqual(domains);
    expect(result.results.map((row) => row.detectedWidgets[0])).toEqual(domains.map((host) => `W-${host}`));
    expect(result.gapsFound).toBe(10);
  });

  it.each([
    [["stepnetwork.dk", "localhost"], "blocked_target", [{ position: 2, error: "blocked_target" }]],
    [["http://10.0.0.8", "folk.app"], "blocked_target", [{ position: 1, error: "blocked_target" }]],
    [["folk.app", "[::ffff:127.0.0.1]", "metadata.google.internal"], "blocked_target", [
      { position: 2, error: "blocked_target" },
      { position: 3, error: "blocked_target" },
    ]],
    [["folk.app", "ftp://example.com"], "invalid_url", [{ position: 2, error: "invalid_url" }]],
    [["https://example.com:8443", "169.254.169.254"], "blocked_target", [
      { position: 1, error: "invalid_url" },
      { position: 2, error: "blocked_target" },
    ]],
    [["folk.app", 42], "invalid_url", [{ position: 2, error: "invalid_url" }]],
  ])("refuses the whole batch %j before any request", async (domains, error, rejected) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await batchScanDomains(domains);
    expect(outcome).toEqual({ ok: false, error, message: expect.stringMatching(/^Nothing was scanned\./), rejected });
    expect(fetchMock).not.toHaveBeenCalled();
    // The message is a fixed template plus positions, so no entry value is echoed back.
    if (!outcome.ok) {
      expect(outcome.message).toMatch(
        /^Nothing was scanned\. (Entry \d+ is not a public http\(s\) domain|Entries \d+(, \d+)+ are not public http\(s\) domains)\. localhost, private or reserved IPs, internal hosts, credentials and non-default ports are refused\.$/,
      );
    }
  });

  it.each([
    [[], "no_domains"],
    [Array.from({ length: 11 }, (_, index) => `site${index}.example.com`), "too_many_domains"],
    ["stepnetwork.dk", "invalid_input"],
    [undefined, "invalid_input"],
    [{ domains: ["folk.app"] }, "invalid_input"],
  ])("rejects batch input %j without a request", async (domains, error) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await batchScanDomains(domains);
    expect(outcome).toMatchObject({ ok: false, error });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("scans a host once when it is passed more than once", async () => {
    const fetchMock = routedFetch({ "example.com": () => jsonResponse({ scan: pageScan() }) });
    const result = await expectOk(
      batchScanDomains(["example.com", "https://EXAMPLE.com/pricing", "http://example.com."], { fetch: fetchMock as unknown as typeof fetch }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(scannedUrlOf(fetchMock.mock.calls[0]![0])).toBe("https://example.com/");
    expect(result).toMatchObject({ totalDomains: 1, duplicatesRemoved: 2 });
  });

  it("keeps the batch going when some hosts fail, time out or are rate-limited", async () => {
    const fetchMock = routedFetch({
      "folk.app": () => jsonResponse({ scan: pageScan({ detectedWidgets: ["Intercom Fin"] }) }),
      "a.example.com": () => jsonResponse({ error: { code: "rate_limited" } }, 429),
      "b.example.com": () => {
        throw new TypeError("fetch failed");
      },
      "c.example.com": () => new Response("not json", { status: 200 }),
      "d.example.com": () => jsonResponse({ scan: pageScan({ reachable: false, measured: false, reason: "unreachable" }) }),
    });
    const result = await expectOk(
      batchScanDomains(["folk.app", "a.example.com", "b.example.com", "c.example.com", "d.example.com"], {
        fetch: fetchMock as unknown as typeof fetch,
      }),
    );
    expect(result).toMatchObject({ totalDomains: 5, scannedDomains: 2, offlineFallbacks: 3, gapsFound: 1 });
    expect(result.results.map((row) => [row.host, row.status, row.reason, row.gap])).toEqual([
      ["folk.app", "measured", null, true],
      ["a.example.com", "offline_fallback", "upstream_http_429", false],
      ["b.example.com", "offline_fallback", "network_error", false],
      ["c.example.com", "offline_fallback", "upstream_invalid_json", false],
      ["d.example.com", "unreachable", "unreachable", false],
    ]);
    for (const row of result.results) {
      expect(row.reportUrl).toBe(`https://console.spurvik.com/report?domain=${row.host}`);
      expect(row.statusShieldMarkdown).toContain(`status.svg?domain=${row.host})`);
      expect(row.badgeSnippet).toMatch(/^<script src="https:\/\/spurvik\.com\/badge\.js" [^\n]+><\/script>$/);
    }
  });

  it("does not count a gap when the notice result is unknown", async () => {
    const fetchMock = routedFetch({
      "folk.app": () => jsonResponse({ scan: pageScan({ detectedWidgets: ["Intercom Fin"], markers: undefined }) }),
      "trengo.com": () =>
        jsonResponse({ scan: pageScan({ measured: false, reason: "http_status", httpStatus: 503, detectedWidgets: ["Trengo"] }) }),
    });
    const result = await expectOk(batchScanDomains(["folk.app", "trengo.com"], { fetch: fetchMock as unknown as typeof fetch }));
    expect(result.results.map((row) => [row.host, row.art50NoticeDetected, row.gap])).toEqual([
      ["folk.app", null, false],
      ["trengo.com", null, false],
    ]);
    expect(result.results[0]?.detectedWidgets).toEqual(["Intercom Fin"]);
    expect(result.gapsFound).toBe(0);
  });

  it("returns offline rows when the request times out", async () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const result = await expectOk(
      batchScanDomains(["folk.app", "example.com"], { fetch: fetchMock as unknown as typeof fetch, timeoutMs: 20 }),
    );
    expect(result.results.map((row) => row.reason)).toEqual(["timeout", "timeout"]);
    expect(result).toMatchObject({ scannedDomains: 0, offlineFallbacks: 2, gapsFound: 0 });
  });

  it("propagates upstream htmlLocale to suggestedLocale and badgeSnippet for generic TLDs in a batch", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("charlie-paris.com")) {
        return jsonResponse({
          scan: {
            ...pageScan({ detectedWidgets: ["Gorgias"] }),
            domain: "charlie-paris.com",
            htmlLocale: "fr",
            detectedPlatforms: ["Shopify", "Google Tag Manager"],
            heroImageUrl: "https://cdn.shopify.com/s/files/1/0001/hero.jpg",
          },
        });
      }
      return jsonResponse({ scan: { ...pageScan({ detectedWidgets: ["Intercom"] }), domain: "petgood.com", htmlLocale: "sv" } });
    });
    const result = await expectOk(batchScanDomains(["charlie-paris.com", "petgood.com"], { fetch: fetchMock as unknown as typeof fetch }));
    expect(result.results[0]?.suggestedLocale).toBe("fr");
    expect(result.results[0]?.badgeSnippet).toContain('data-locale="fr"');
    expect(result.results[0]?.detectedPlatforms).toEqual(["Shopify", "Google Tag Manager"]);
    expect(result.results[0]?.platformInstallerUrls).toEqual({
      shopifyLiquid: "https://spurvik.com/r/spurvik-shopify-art50.liquid",
      gtmContainerJson: "https://spurvik.com/r/spurvik-gtm-art50-container.json",
    });
    expect(result.results[0]?.heroImageProxy?.name).toBe("Shopify CDN (/cdn/shop/)");
    expect(result.results[1]?.suggestedLocale).toBe("sv");
    expect(result.results[1]?.badgeSnippet).toContain('data-locale="sv"');
    expect(result.results[1]?.platformInstallerUrls).toBeUndefined();
    expect(result.results[1]?.heroImageProxy).toBeUndefined();
    expect(result.prefilledPortfolioUrl).toBe("https://console.spurvik.com/portfolio?domains=charlie-paris.com,petgood.com");
    expect(result.upgradeUrls.proAnnual2MonthsFree).toBe("https://console.spurvik.com/signup?plan=pro&interval=annual");
    expect(result.upgradeUrls.teamAnnual2MonthsFree).toBe("https://console.spurvik.com/signup?plan=team&interval=annual");
  });

  it("never logs the domains or the responses", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) => vi.spyOn(console, method));
    const writeSpy = vi.spyOn(process.stderr, "write");
    const stdoutSpy = vi.spyOn(process.stdout, "write");
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ scan: pageScan({ detectedWidgets: ["Crisp"] }) })));
    await batchScanDomains(["stepnetwork.dk", "folk.app"]);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNREFUSED stepnetwork.dk");
    }));
    await batchScanDomains(["stepnetwork.dk"]);
    await batchScanDomains(["stepnetwork.dk", "localhost"]);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});
