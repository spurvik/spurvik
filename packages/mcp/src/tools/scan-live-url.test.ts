import { afterEach, describe, expect, it, vi } from "vitest";
import { MCP_USER_AGENT } from "../version.js";
import {
  isPublicIpLiteral,
  normalizeScanTarget,
  SCAN_ENDPOINT,
  SCAN_TIMEOUT_MS,
  scanLiveUrl,
  ScanTargetRejected,
  type ScanLiveUrlResult,
} from "./scan-live-url.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const UPSTREAM_SCAN = {
  domain: "stepnetwork.dk",
  scannedUrl: "https://stepnetwork.dk/",
  reachable: true,
  measured: true,
  reason: null,
  httpStatus: null,
  detectedWidgets: ["Intercom Fin"],
  detectedSdks: ["OpenAI", "Vercel AI SDK"],
  markers: { art50_1_disclosure: false, art50_2_provenance: false, art50_4_synthetic: false, art12_telemetry: true },
  readinessScore: 50,
  gapsCount: 3,
  detectedModel: "gpt-4o",
  toggles: { chats: true, generates: false },
};

async function expectOk(promise: ReturnType<typeof scanLiveUrl>): Promise<ScanLiveUrlResult> {
  const outcome = await promise;
  if (!outcome.ok) throw new Error(`expected ok, got ${outcome.error}: ${outcome.message}`);
  return outcome.result;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("normalizeScanTarget", () => {
  it.each([
    ["stepnetwork.dk", "https://stepnetwork.dk/", "stepnetwork.dk"],
    ["  STEPNETWORK.DK  ", "https://stepnetwork.dk/", "stepnetwork.dk"],
    ["http://stepnetwork.dk/pricing?x=1", "https://stepnetwork.dk/pricing?x=1", "stepnetwork.dk"],
    ["https://www.example.com/a#frag", "https://www.example.com/a", "www.example.com"],
    ["//example.org", "https://example.org/", "example.org"],
    ["example.com:443", "https://example.com/", "example.com"],
    ["http://example.com:80/", "https://example.com/", "example.com"],
    ["bücher.de", "https://xn--bcher-kva.de/", "xn--bcher-kva.de"],
    ["8.8.8.8", "https://8.8.8.8/", "8.8.8.8"],
    ["[2606:4700:4700::1111]", "https://[2606:4700:4700::1111]/", "2606:4700:4700::1111"],
  ])("normalizes %s", (raw, url, host) => {
    expect(normalizeScanTarget(raw)).toEqual({ url, host });
  });

  it.each([
    "localhost",
    "http://localhost:3000",
    "app.localhost",
    "printer.local",
    "metadata.google.internal",
    "db.internal",
    "router.lan",
    "nas.home.arpa",
    "intranet",
    "127.0.0.1",
    "http://127.1",
    "2130706433",
    "0x7f.0.0.1",
    "10.0.0.8",
    "172.16.4.2",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "[::1]",
    "[::]",
    "[fc00::1]",
    "[fd12:3456::1]",
    "[fe80::1]",
    "[::ffff:127.0.0.1]",
    "[::ffff:10.0.0.1]",
    "[2001:db8::1]",
  ])("blocks non-public target %s", (raw) => {
    expect(() => normalizeScanTarget(raw)).toThrowError(ScanTargetRejected);
    try {
      normalizeScanTarget(raw);
    } catch (error) {
      expect((error as ScanTargetRejected).code).toBe("blocked_target");
    }
  });

  it.each([
    ["", "invalid_url"],
    ["   ", "invalid_url"],
    ["ftp://example.com", "invalid_url"],
    ["file:///etc/passwd", "invalid_url"],
    ["javascript:alert(1)", "invalid_url"],
    ["mailto:hi@example.com", "invalid_url"],
    ["https://user:pass@example.com", "invalid_url"],
    ["https://example.com:8443", "invalid_url"],
    ["http://example.com:443", "invalid_url"],
    ["example.com:22", "invalid_url"],
    ["exa mple.com", "invalid_url"],
    ['example.com"><script>', "invalid_url"],
    ["under_score.example.com", "invalid_url"],
    [`https://example.com/${"a".repeat(2050)}`, "invalid_url"],
  ])("rejects malformed input %j", (raw, code) => {
    try {
      normalizeScanTarget(raw);
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ScanTargetRejected);
      expect((error as ScanTargetRejected).code).toBe(code);
    }
  });

  it("rejects non-string input", () => {
    expect(() => normalizeScanTarget(42)).toThrowError(ScanTargetRejected);
    expect(() => normalizeScanTarget(undefined)).toThrowError(ScanTargetRejected);
  });
});

describe("isPublicIpLiteral", () => {
  it("returns null for host names and booleans for IP literals", () => {
    expect(isPublicIpLiteral("example.com")).toBeNull();
    expect(isPublicIpLiteral("1.1.1.1")).toBe(true);
    expect(isPublicIpLiteral("192.168.0.10")).toBe(false);
    expect(isPublicIpLiteral("[2606:4700::1111]")).toBe(true);
    expect(isPublicIpLiteral("::ffff:8.8.8.8")).toBe(true);
    expect(isPublicIpLiteral("fe80::1%en0")).toBe(false);
    expect(isPublicIpLiteral("1.2.3")).toBe(false);
  });
});

describe("scanLiveUrl", () => {
  it("calls the console scan endpoint once with the encoded URL, an 8 s timeout and the package User-Agent", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ ok: true, scan: UPSTREAM_SCAN }));
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    const result = await expectOk(scanLiveUrl("stepnetwork.dk"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0]!;
    expect(String(input)).toBe(`${SCAN_ENDPOINT}?url=${encodeURIComponent("https://stepnetwork.dk/")}`);
    expect(String(input)).toBe("https://console.spurvik.com/api/v1/sandbox/scan?url=https%3A%2F%2Fstepnetwork.dk%2F");
    expect(init?.method).toBe("GET");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(MCP_USER_AGENT);
    expect(MCP_USER_AGENT).toBe("spurvik-mcp-server/1.0.5");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledWith(SCAN_TIMEOUT_MS);
    expect(SCAN_TIMEOUT_MS).toBe(8000);

    expect(result).toMatchObject({
      tool: "spurvik_scan_live_url",
      host: "stepnetwork.dk",
      scannedUrl: "https://stepnetwork.dk/",
      offlineFallback: false,
      status: "measured",
      score: 50,
      httpStatus: null,
      detectedWidgets: ["Intercom Fin"],
      detectedSdks: ["OpenAI", "Vercel AI SDK"],
      detectedModel: "gpt-4o",
      art50NoticeDetected: false,
      suggestedLocale: "da",
      suggestedLanguage: "Dansk (da)",
      reportUrl: "https://console.spurvik.com/report?domain=stepnetwork.dk",
      sandboxUrl: "https://console.spurvik.com/sandbox?scan=stepnetwork.dk",
      upgradeUrls: {
        proWhiteLabelAndAuditVault: "https://console.spurvik.com/signup?plan=pro",
        doneForYou24hSetup: "https://console.spurvik.com/signup?plan=concierge",
      },
    });
    expect(result.markers?.art12_telemetry).toBe(true);
    expect(result.badgeSnippet).toBe(
      '<script src="https://spurvik.com/badge.js" data-system="stepnetwork.dk" data-locale="da" data-theme="dark" data-attribution="true" defer></script>',
    );
    expect(result.badgeSnippet.split("\n")).toHaveLength(1);
  });

  it("accepts a bare PageScan body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(UPSTREAM_SCAN)));
    const result = await expectOk(scanLiveUrl("https://stepnetwork.dk"));
    expect(result.offlineFallback).toBe(false);
    expect(result.score).toBe(50);
  });

  it("does not call fetch for a blocked target", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await scanLiveUrl("http://192.168.1.10/admin");
    expect(outcome).toEqual({ ok: false, error: "blocked_target", message: expect.stringContaining("not a public address") });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call fetch for an invalid URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await scanLiveUrl("ftp://example.com");
    expect(outcome.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["404", () => new Response("<html>not found</html>", { status: 404 }), "upstream_http_404"],
    ["500", () => jsonResponse({ error: "boom" }, 500), "upstream_http_500"],
    ["429", () => jsonResponse({ error: "rate_limited" }, 429), "upstream_http_429"],
    ["invalid JSON", () => new Response("not json", { status: 200 }), "upstream_invalid_json"],
    ["wrong shape", () => jsonResponse({ ok: true }), "upstream_invalid_shape"],
  ])("returns a structured offline fallback on upstream %s", async (_label, make, reason) => {
    vi.stubGlobal("fetch", vi.fn(async () => make()));
    const result = await expectOk(scanLiveUrl("stepnetwork.dk"));
    expect(result).toMatchObject({
      offlineFallback: true,
      status: "offline_fallback",
      reason,
      score: null,
      detectedWidgets: [],
      detectedSdks: [],
      art50NoticeDetected: null,
      reportUrl: "https://console.spurvik.com/report?domain=stepnetwork.dk",
      sandboxUrl: "https://console.spurvik.com/sandbox?scan=stepnetwork.dk",
    });
    expect(result.badgeSnippet).toMatch(/^<script src="https:\/\/spurvik\.com\/badge\.js" [^\n]+><\/script>$/);
  });

  it("returns a fallback when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    const result = await expectOk(scanLiveUrl("example.com"));
    expect(result).toMatchObject({ offlineFallback: true, reason: "network_error", suggestedLocale: "en" });
  });

  it("returns a fallback when the request times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      ),
    );
    const result = await expectOk(scanLiveUrl("example.com", { timeoutMs: 20 }));
    expect(result).toMatchObject({ offlineFallback: true, reason: "timeout" });
  });

  it("returns a fallback when fetch is unavailable", async () => {
    vi.stubGlobal("fetch", undefined);
    const result = await expectOk(scanLiveUrl("example.com"));
    expect(result).toMatchObject({ offlineFallback: true, reason: "fetch_unavailable" });
  });

  it("uses an injected fetch over the global one", async () => {
    const globalFetch = vi.fn();
    vi.stubGlobal("fetch", globalFetch);
    const injected = vi.fn(async () => jsonResponse({ scan: UPSTREAM_SCAN }));
    await expectOk(scanLiveUrl("stepnetwork.dk", { fetch: injected as unknown as typeof fetch }));
    expect(injected).toHaveBeenCalledTimes(1);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("reports an unreachable page and an HTTP error page without page findings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ scan: { ...UPSTREAM_SCAN, reachable: false, measured: false, reason: "unreachable", readinessScore: null } }),
      ),
    );
    const unreachable = await expectOk(scanLiveUrl("stepnetwork.dk"));
    expect(unreachable).toMatchObject({ status: "unreachable", reason: "unreachable", score: null, detectedWidgets: [], art50NoticeDetected: null });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ scan: { ...UPSTREAM_SCAN, measured: false, reason: "http_status", httpStatus: 503 } })),
    );
    const httpError = await expectOk(scanLiveUrl("stepnetwork.dk"));
    expect(httpError).toMatchObject({ status: "not_measured", httpStatus: 503, score: null, detectedSdks: [], markers: null });
  });

  it("sanitizes hostile upstream values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          scan: {
            ...UPSTREAM_SCAN,
            readinessScore: 9999,
            reason: "<script>",
            detectedWidgets: ["Crisp", "Crisp", 7, "x".repeat(500), "bad\u0000name"],
            detectedSdks: "OpenAI",
          },
        }),
      ),
    );
    const result = await expectOk(scanLiveUrl("stepnetwork.dk"));
    expect(result.score).toBeNull();
    expect(result.reason).toBeNull();
    expect(result.detectedWidgets).toEqual(["Crisp", "x".repeat(120), "badname"]);
    expect(result.detectedSdks).toEqual([]);
  });

  it("never logs the URL or the response", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) => vi.spyOn(console, method));
    const writeSpy = vi.spyOn(process.stderr, "write");
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ scan: UPSTREAM_SCAN })));
    await scanLiveUrl("stepnetwork.dk");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNREFUSED stepnetwork.dk");
    }));
    await scanLiveUrl("stepnetwork.dk");
    await scanLiveUrl("localhost");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
  });
});
