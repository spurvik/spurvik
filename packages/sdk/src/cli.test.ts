import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLI_VERSION,
  EXIT_ERROR,
  EXIT_GAP,
  EXIT_OK,
  SCAN_ENDPOINT,
  langForHost,
  looksLikeDomainOrUrl,
  normalizeScanTarget,
  runCli,
  type CliDeps,
} from "./cli.js";

// Shapes copied from GET https://console.spurvik.com/api/v1/sandbox/scan on 2026-11-16.
const cards = (art50: "gap" | "detected") => ({
  art50_1: { article: "Art. 50(1)", title: "Art. 50(1) Interactive Disclosure", status: art50, pill: art50 === "gap" ? "Disclosure gap" : "Disclosure on", summary: "" },
  art50_2: { article: "Art. 50(2)", title: "Art. 50(2) Provenance and machine readable marking", status: "gap", pill: "Provenance gap", summary: "" },
  art50_4: { article: "Art. 50(4)", title: "Art. 50(4) Deepfake / Synthetic Media Labeling", status: "gap", pill: "Synthetic gap", summary: "" },
  art12: { article: "Art. 12", title: "Art. 12 hash chained telemetry", status: "gap", pill: "Telemetry gap", summary: "" },
});

const FOLK_GAP = {
  ok: true,
  scan: {
    domain: "www.folk.app",
    scannedUrl: "https://www.folk.app/",
    reachable: true,
    measured: false,
    reason: "no_markers",
    httpStatus: null,
    detectedWidgets: ["Intercom Fin"],
    detectedSdks: [],
    markers: { art50_1_disclosure: false, art50_2_provenance: false, art50_4_synthetic: false, art12_telemetry: false },
    readinessScore: null,
    gapsCount: null,
    cards: cards("gap"),
    detectedStack: ["Intercom Fin"],
    detectedModel: null,
    toggles: null,
  },
};

const SPURVIK_COVERED = {
  ok: true,
  scan: {
    ...FOLK_GAP.scan,
    domain: "spurvik.com",
    scannedUrl: "https://spurvik.com/",
    reason: "no_ai_surface",
    detectedWidgets: [],
    detectedStack: [],
    markers: { art50_1_disclosure: true, art50_2_provenance: true, art50_4_synthetic: false, art12_telemetry: false },
    cards: cards("detected"),
  },
};

const NO_WIDGET = {
  ok: true,
  scan: { ...FOLK_GAP.scan, domain: "www.stepnetwork.dk", scannedUrl: "https://www.stepnetwork.dk/", reason: "no_ai_surface", detectedWidgets: [], detectedStack: [] },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function harness(fetchImpl?: CliDeps["fetch"], extra: Partial<CliDeps> = {}) {
  let out = "";
  let err = "";
  const deps: CliDeps = {
    fetch: fetchImpl,
    stdout: (t) => {
      out += t;
    },
    stderr: (t) => {
      err += t;
    },
    color: false,
    ...extra,
  };
  return { deps, out: () => out, err: () => err };
}

describe("spurvik scan", () => {
  it("prints a scorecard from the live-shaped console answer and calls the fixed endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(FOLK_GAP));
    const h = harness(fetchMock as unknown as typeof fetch);
    const code = await runCli(["scan", "folk.app"], h.deps);

    expect(code).toBe(EXIT_OK);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${SCAN_ENDPOINT}?url=${encodeURIComponent("https://folk.app/")}`);
    expect(url.startsWith("https://console.spurvik.com/api/v1/sandbox/scan?url=")).toBe(true);
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("spurvik-cli/1.0.9");
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const text = h.out();
    expect(text).toContain("folk.app");
    expect(text).toContain("Intercom Fin");
    expect(text).toContain("GAP — AI widget detected without Art. 50 notice");
    expect(text).toContain('<script src="https://spurvik.com/badge.js" data-system="folk.app" data-locale="en"');
    expect(text).toContain("https://console.spurvik.com/report?domain=folk.app");
    expect(text).toContain("https://console.spurvik.com/signup?plan=pro&appUrl=folk.app");
    expect(text).toContain("https://console.spurvik.com/signup?plan=concierge&appUrl=folk.app");
    expect(text).toContain("https://console.spurvik.com/portfolio");
    expect(text).toContain("€19/mo");
    expect(text).toContain("€199 once");
    expect(text).not.toMatch(/€49/);
    expect(text).not.toMatch(/legal advice/i);
  });

  it("treats a bare domain as `scan <domain>` (npx spurvik folk.app)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(FOLK_GAP));
    const h = harness(fetchMock as unknown as typeof fetch);
    expect(await runCli(["folk.app"], h.deps)).toBe(EXIT_OK);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.out()).toContain("Intercom Fin");

    const fetchUrl = vi.fn(async () => jsonResponse(FOLK_GAP));
    await runCli(["https://example.com/pricing"], harness(fetchUrl as unknown as typeof fetch).deps);
    expect(String((fetchUrl.mock.calls[0] as unknown[])[0])).toContain(encodeURIComponent("https://example.com/pricing"));
  });

  it("--json prints the structured report", async () => {
    const h = harness((async () => jsonResponse(FOLK_GAP)) as unknown as typeof fetch);
    expect(await runCli(["scan", "folk.app", "--json"], h.deps)).toBe(EXIT_OK);
    const body = JSON.parse(h.out());
    expect(body).toMatchObject({
      domain: "folk.app",
      status: "gap",
      detectedWidgets: ["Intercom Fin"],
      covered: false,
      links: {
        reportUrl: "https://console.spurvik.com/report?domain=folk.app",
        sandboxUrl: "https://console.spurvik.com/sandbox?scan=folk.app",
        portfolioUrl: "https://console.spurvik.com/portfolio",
        proUpgradeUrl: "https://console.spurvik.com/signup?plan=pro&appUrl=folk.app",
        doneForYouUrl: "https://console.spurvik.com/signup?plan=concierge&appUrl=folk.app",
      },
    });
    expect(body.badgeSnippet).toContain('data-locale="en"');
  });

  it("--fail-on-gap exits 1 when a widget has no Art. 50 notice", async () => {
    const h = harness((async () => jsonResponse(FOLK_GAP)) as unknown as typeof fetch);
    expect(await runCli(["scan", "folk.app", "--fail-on-gap"], h.deps)).toBe(EXIT_GAP);
  });

  it("--fail-on-gap exits 0 when the notice is present or no widget is detected", async () => {
    const covered = harness((async () => jsonResponse(SPURVIK_COVERED)) as unknown as typeof fetch);
    expect(await runCli(["scan", "spurvik.com", "--fail-on-gap"], covered.deps)).toBe(EXIT_OK);
    expect(covered.out()).toContain("COVERED");
    expect(covered.out()).not.toContain("1-line fix");

    const none = harness((async () => jsonResponse(NO_WIDGET)) as unknown as typeof fetch);
    expect(await runCli(["stepnetwork.dk", "--fail-on-gap"], none.deps)).toBe(EXIT_OK);
    expect(none.out()).toContain("NO PUBLIC WIDGET DETECTED");
    expect(none.out()).toContain('data-locale="da"');
  });

  it("network errors and timeouts exit 2 with a short message and no stack", async () => {
    const offline = harness((async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    expect(await runCli(["scan", "folk.app", "--fail-on-gap"], offline.deps)).toBe(EXIT_ERROR);
    expect(offline.err()).toContain("Could not reach console.spurvik.com");
    expect(offline.err()).toContain("https://console.spurvik.com/sandbox?scan=folk.app");
    expect(offline.err()).not.toMatch(/at .*\(|TypeError/);

    const slow = harness((async () => {
      throw new DOMException("timed out", "TimeoutError");
    }) as unknown as typeof fetch);
    expect(await runCli(["scan", "folk.app"], slow.deps)).toBe(EXIT_ERROR);
    expect(slow.err()).toContain("did not answer within 10s");

    const json = harness((async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    expect(await runCli(["scan", "folk.app", "--json"], json.deps)).toBe(EXIT_ERROR);
    expect(JSON.parse(json.out())).toMatchObject({ domain: "folk.app", status: "error" });
  });

  it("reports an upstream refusal and a malformed answer as errors", async () => {
    const refused = harness(
      (async () => jsonResponse({ error: { code: "blocked_target", message: "That host is not a public address." } }, 422)) as unknown as typeof fetch,
    );
    expect(await runCli(["scan", "example.com"], refused.deps)).toBe(EXIT_ERROR);
    expect(refused.err()).toContain("Scan refused (blocked_target)");

    const garbage = harness((async () => jsonResponse({ hello: "world" })) as unknown as typeof fetch);
    expect(await runCli(["scan", "example.com"], garbage.deps)).toBe(EXIT_ERROR);
    expect(garbage.err()).toContain("cannot read");
  });

  it("refuses localhost, private IPs, credentials and odd schemes before any network call", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(FOLK_GAP));
    for (const target of ["localhost", "http://127.0.0.1", "10.1.2.3", "https://[::1]/", "intranet.corp", "ftp://example.com", "https://u:p@example.com", "https://example.com:8443"]) {
      const h = harness(fetchMock as unknown as typeof fetch);
      expect(await runCli(["scan", target], h.deps), target).toBe(EXIT_ERROR);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(normalizeScanTarget("HTTP://Folk.App./x#frag")).toEqual({ url: "https://folk.app/x", host: "folk.app" });
  });

  it("strips terminal control sequences from upstream strings", async () => {
    const evil = { ok: true, scan: { ...FOLK_GAP.scan, detectedWidgets: ["Intercom\u001b[2J Fin\u0007"] } };
    const h = harness((async () => jsonResponse(evil)) as unknown as typeof fetch);
    await runCli(["scan", "folk.app"], h.deps);
    expect(h.out()).toContain("Intercom[2J Fin");
    expect(h.out()).not.toMatch(/[\u0000-\u0008\u001b]/);
  });
});

describe("spurvik audit", () => {
  let dir: string;
  const PROMPT = "TOP-SECRET-PROMPT-do-not-print";

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "spurvik-cli-audit-"));
    mkdirSync(path.join(dir, "src"));
    mkdirSync(path.join(dir, "node_modules", "openai"), { recursive: true });
    mkdirSync(path.join(dir, "app"));
    writeFileSync(
      path.join(dir, "src", "chat.ts"),
      [
        'import OpenAI from "openai";',
        "",
        "const client = new OpenAI();",
        `export const run = () => client.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: "${PROMPT}" }] });`,
        "// new Anthropic() in a comment is ignored",
      ].join("\n"),
    );
    writeFileSync(
      path.join(dir, "app", "route.tsx"),
      ['import { streamText } from "ai";', `export async function POST() { return streamText({ model, prompt: "${PROMPT}" }); }`].join("\n"),
    );
    writeFileSync(
      path.join(dir, "src", "wrapped.ts"),
      ['import Anthropic from "@anthropic-ai/sdk";', 'import { withSpurvik } from "spurvik";', "export const ai = withSpurvik(new Anthropic(), config);"].join("\n"),
    );
    writeFileSync(path.join(dir, "agent.py"), ["from openai import OpenAI", "", `client = openai.OpenAI()  # ${PROMPT}`].join("\n"));
    writeFileSync(path.join(dir, "node_modules", "openai", "index.js"), "module.exports = new OpenAI();");
    writeFileSync(path.join(dir, "src", "huge.js"), `${"x".repeat(600 * 1024)}\nnew OpenAI();`);
    writeFileSync(path.join(dir, "README.md"), "new OpenAI() in docs is not source");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists unwrapped call sites as relative file:line — provider without printing source text", async () => {
    const h = harness(undefined, { cwd: dir });
    expect(await runCli(["audit", "."], h.deps)).toBe(EXIT_OK);
    const text = h.out();
    expect(text).toContain("Files scanned     4");
    expect(text).toContain("Already wrapped   1 file(s)");
    expect(text).toContain("agent.py:3 — OpenAI");
    expect(text).toContain("app/route.tsx:2 — Vercel AI SDK streamText");
    expect(text).toContain("src/chat.ts:3 — OpenAI");
    expect(text).not.toContain("src/wrapped.ts");
    expect(text).not.toContain("node_modules");
    expect(text).not.toContain("huge.js");
    expect(text).not.toContain(PROMPT);
    expect(text).not.toContain("chat.completions.create({ model");
    expect(text).not.toContain(dir);
    expect(text).toContain('import { withSpurvik } from "spurvik";');
    expect(text).toContain("spurvikMiddleware");
    expect(text).toContain("https://console.spurvik.com/signup?plan=pro");
    expect(text).not.toMatch(/spurvik\.wrap\s*\(/);
  });

  it("--json and --fail-on-gap: exit 1 with unwrapped calls, 0 once every file is wrapped", async () => {
    const h = harness(undefined, { cwd: dir });
    expect(await runCli(["audit", "--json", "--fail-on-gap"], h.deps)).toBe(EXIT_GAP);
    const body = JSON.parse(h.out());
    expect(body.unwrappedCount).toBe(3);
    expect(body.unwrapped).toEqual([
      { file: "agent.py", line: 3, provider: "OpenAI" },
      { file: "app/route.tsx", line: 2, provider: "Vercel AI SDK streamText" },
      { file: "src/chat.ts", line: 3, provider: "OpenAI" },
    ]);
    expect(JSON.stringify(body)).not.toContain(PROMPT);

    rmSync(path.join(dir, "src", "chat.ts"));
    rmSync(path.join(dir, "app", "route.tsx"));
    writeFileSync(path.join(dir, "agent.py"), "from spurvik_sdk import wrap\nclient = OpenAI()\n");
    const clean = harness(undefined, { cwd: dir });
    expect(await runCli(["audit", ".", "--fail-on-gap"], clean.deps)).toBe(EXIT_OK);
    expect(clean.out()).toContain("Unwrapped calls   0");
  });

  it("rejects a path that is not a directory", async () => {
    const h = harness(undefined, { cwd: dir });
    expect(await runCli(["audit", "does-not-exist"], h.deps)).toBe(EXIT_ERROR);
    expect(h.err()).toContain("not a readable directory");
  });
});

describe("spurvik badge", () => {
  it("localizes by TLD: .dk -> da, .de/.at -> de, else en", async () => {
    for (const [domain, lang] of [
      ["stepnetwork.dk", "da"],
      ["example.de", "de"],
      ["shop.example.at", "de"],
      ["example.com", "en"],
    ] as const) {
      const h = harness();
      expect(await runCli(["badge", domain], h.deps)).toBe(EXIT_OK);
      expect(h.out()).toContain(`data-system="${domain}" data-locale="${lang}"`);
      expect(h.out()).toContain(`<AIDisclosureLabel notice="interaction" locale="${lang}" systemName="${domain}" />`);
      expect(h.out()).toContain(`https://console.spurvik.com/signup?plan=pro&appUrl=${domain}`);
      expect(h.out()).toContain('data-attribution="false"');
      expect(h.out()).toContain("€19/mo");
    }
    expect(langForHost("www.example.co.uk")).toBe("en");
  });

  it("--lang overrides the TLD, rejects other values, and the system name cannot break the attribute", async () => {
    const h = harness();
    expect(await runCli(["badge", "example.dk", "--lang", "en"], h.deps)).toBe(EXIT_OK);
    expect(h.out()).toContain('data-locale="en"');

    const bad = harness();
    expect(await runCli(["badge", "--lang=fr"], bad.deps)).toBe(EXIT_ERROR);

    const noDomain = harness();
    expect(await runCli(["badge"], noDomain.deps)).toBe(EXIT_OK);
    expect(noDomain.out()).toContain('data-system="AI assistant" data-locale="en"');

    const evil = harness();
    await runCli(["badge", 'x"><img src=x onerror=alert(1)>'], evil.deps);
    expect(evil.out()).not.toContain("<img");
    expect(evil.out()).not.toMatch(/data-system="[^"]*"[^ ]/);
  });
});

describe("spurvik --version / --help", () => {
  it("--version and -v print the package version", async () => {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8")) as { version: string };
    expect(CLI_VERSION).toBe(pkg.version);
    for (const flag of ["--version", "-v"]) {
      const h = harness();
      expect(await runCli([flag], h.deps)).toBe(EXIT_OK);
      expect(h.out().trim()).toBe("1.0.9");
    }
  });

  it("--help, -h and no arguments print usage with a one-line scope footer", async () => {
    for (const argv of [["--help"], ["-h"], []]) {
      const h = harness();
      expect(await runCli(argv, h.deps)).toBe(EXIT_OK);
      expect(h.out()).toContain("spurvik scan <domain-or-url> [--json] [--fail-on-gap]");
      expect(h.out()).toContain("spurvik audit [dir]");
      expect(h.out()).toContain("spurvik badge [domain] [--lang da|de|en]");
      expect(h.out().match(/legal advice/gi)).toHaveLength(1);
    }
  });

  it("unknown commands and options exit 2; paths are not mistaken for domains", async () => {
    const h = harness();
    expect(await runCli(["deploy"], h.deps)).toBe(EXIT_ERROR);
    expect(h.err()).toContain('unknown command "deploy"');
    const opt = harness();
    expect(await runCli(["scan", "folk.app", "--yolo"], opt.deps)).toBe(EXIT_ERROR);
    expect(looksLikeDomainOrUrl("folk.app")).toBe(true);
    expect(looksLikeDomainOrUrl("https://example.com")).toBe(true);
    expect(looksLikeDomainOrUrl("./src")).toBe(false);
    expect(looksLikeDomainOrUrl(".")).toBe(false);
    expect(looksLikeDomainOrUrl("audit")).toBe(false);
  });
});
