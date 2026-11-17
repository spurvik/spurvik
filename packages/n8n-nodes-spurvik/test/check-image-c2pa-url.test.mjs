import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { SpurvikEuAiActGuard, SpurvikN8nNodeDescription } from "../dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js";
import {
  checkSpurvikImageC2paUrl,
  detectImageProxy,
  N8N_NODES_SPURVIK_USER_AGENT,
  N8N_NODES_SPURVIK_VERSION,
  normalizeC2paImageUrl,
  safeClaimGenerator,
  safeFileName,
  safeValidationCodes,
} from "../dist/check-image-c2pa-url.js";
import * as packageIndex from "../dist/index.js";

// Every test mocks fetch (globalThis.fetch is swapped per test or fetchImpl is injected). Nothing reaches the network.

const require = createRequire(import.meta.url);
const PROMPT = "RAW_PROMPT_SHOULD_NOT_LEAK_C2PA";
const CONSOLE = "https://console.spurvik.com";
const ENDPOINT = `${CONSOLE}/api/v1/provenance/public-check-url`;
const CHECKER = `${CONSOLE}/c2pa`;
const OUTPUT_KEYS = [
  "imageUrl",
  "imageHost",
  "checkStatus",
  "reason",
  "fileName",
  "mediaType",
  "byteLength",
  "manifestFound",
  "embedded",
  "signatureMatches",
  "trustAnchor",
  "claimGenerator",
  "validationCodes",
  "cdnRewriteSuspected",
  "cdnProvider",
  "diagnosis",
  "art50GeneratedBadgeSnippet",
  "c2paCheckerUrl",
  "upgradeUrls",
];
const NOT_CHECKED_DIAGNOSIS = `Nothing was checked. Try again later, or upload the image at ${CHECKER}.`;

function parameterShown(property, params) {
  const rules = property.displayOptions?.show;
  if (!rules) return true;
  for (const [key, allowed] of Object.entries(rules)) {
    const dependency = SpurvikN8nNodeDescription.properties.find((item) => item.name === key);
    const value = Object.prototype.hasOwnProperty.call(params, key) ? params[key] : dependency?.default;
    if (!allowed.map(String).includes(String(value))) return false;
  }
  return true;
}

/** n8n context with no spurvikApi credential. Counts getCredentials calls. */
function c2paCtx(params, items = [{ json: { promptText: PROMPT, ticketId: "T-C2PA" } }], operations = null) {
  const all = { operation: "checkImageC2paUrl", ...params };
  const context = {
    credentialCalls: 0,
    getInputData: () => items,
    getNodeParameter: (name, index, fallback) => {
      // A mixed run resolves visibility with that item's operation, as n8n does.
      const params = operations ? { ...all, operation: operations[index] } : all;
      if (name === "operation") return params.operation;
      const property = SpurvikN8nNodeDescription.properties.find((item) => item.name === name);
      if (property && !parameterShown(property, params)) return property.default;
      if (Object.prototype.hasOwnProperty.call(params, name)) return params[name];
      if (property && Object.prototype.hasOwnProperty.call(property, "default")) return property.default;
      return fallback;
    },
    getCredentials: async (name) => {
      context.credentialCalls += 1;
      throw new Error(`No credentials of type ${name}`);
    },
  };
  return context;
}

async function withFetch(impl, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return impl(url, init);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The live console answer shape (`{ data: PublicC2paReport, fileName }`). */
function report(overrides = {}, fileName = "hero.png") {
  return {
    data: {
      mediaType: "image/png",
      byteLength: 33270,
      manifestFound: true,
      embedded: true,
      claimGenerator: "Adobe Firefly",
      signatureMatches: true,
      trustAnchor: "no_failure_reported",
      validationCodes: [],
      note: "SECRET_NOTE_MARKER",
      ...overrides,
    },
    fileName,
  };
}

const NO_MANIFEST = {
  manifestFound: false,
  embedded: false,
  claimGenerator: "SECRET_CLAIM_MARKER",
  signatureMatches: false,
  trustAnchor: "not_checked",
};

function badge(locale) {
  return `<script src="https://spurvik.com/badge.js" data-notice="generated" data-locale="${locale}" data-theme="auto" data-attribution="true" defer></script>`;
}

function upgradeUrls(appHost) {
  const appUrl = appHost ? `&appUrl=${encodeURIComponent(appHost)}` : "";
  return {
    proWhiteLabelEur19: `${CONSOLE}/signup?plan=pro${appUrl}`,
    teamAgencyEur79: `${CONSOLE}/signup?plan=team${appUrl}`,
    doneForYou24hEur199: `${CONSOLE}/signup?plan=concierge${appUrl}`,
  };
}

function notChecked(imageUrl, imageHost, reason, { locale = "en", appHost = imageHost, proxy = null } = {}) {
  return {
    imageUrl,
    imageHost,
    checkStatus: "not_checked",
    reason,
    fileName: null,
    mediaType: null,
    byteLength: null,
    manifestFound: null,
    embedded: null,
    signatureMatches: null,
    trustAnchor: null,
    claimGenerator: null,
    validationCodes: [],
    cdnRewriteSuspected: proxy !== null,
    cdnProvider: proxy,
    diagnosis: NOT_CHECKED_DIAGNOSIS,
    art50GeneratedBadgeSnippet: badge(locale),
    c2paCheckerUrl: CHECKER,
    upgradeUrls: upgradeUrls(appHost),
  };
}

describe("checkImageC2paUrl descriptor (zero-key Check Image C2PA & CDN Strip)", () => {
  const node = new SpurvikEuAiActGuard();
  const byName = (name) => SpurvikN8nNodeDescription.properties.find((property) => property.name === name);

  it("adds the operation as #6 with a read-only, zero-key description", () => {
    const operation = byName("operation");
    assert.equal(operation.default, "art50_disclosure");
    // 1.0.8 adds vendorQuestionnaireAnswers as #7; checkImageC2paUrl stays #6.
    assert.equal(operation.options.length, 7);
    const option = operation.options[5];
    assert.equal(option.value, "checkImageC2paUrl");
    assert.equal(option.name, "Check Image C2PA & CDN Strip (Art. 50(2))");
    assert.match(option.description, /C2PA JUMBF manifest & CDN-strip checker/);
    assert.match(option.description, /never signs/);
    assert.match(option.description, /no credential or API key/);
    assert.doesNotMatch(JSON.stringify(SpurvikN8nNodeDescription), /C2PA signer|signs images|n8n Cloud/i);
  });

  it("describes imageUrl as a required string shown only for checkImageC2paUrl", () => {
    const imageUrl = byName("imageUrl");
    assert.equal(imageUrl.displayName, "Image URL");
    assert.equal(imageUrl.type, "string");
    assert.equal(imageUrl.default, "");
    assert.equal(imageUrl.required, true);
    assert.equal(imageUrl.placeholder, "https://example.com/hero.png");
    assert.deepEqual(imageUrl.displayOptions, { show: { operation: ["checkImageC2paUrl"] } });
    assert.match(imageUrl.description, /https/);
    assert.match(imageUrl.description, /443/);
    assert.match(imageUrl.description, /localhost/);
  });

  it("hides spurvikApi, systemName and passThroughFields and shows only operation, imageUrl and consoleBaseUrl (n8n-workflow rules)", () => {
    const hide = { hide: { operation: ["scanDomain", "batchScanDomains", "checkImageC2paUrl", "vendorQuestionnaireAnswers"] } };
    assert.deepEqual(SpurvikN8nNodeDescription.credentials[0].displayOptions, hide);
    assert.deepEqual(byName("systemName").displayOptions, hide);
    assert.deepEqual(byName("passThroughFields").displayOptions, hide);
    assert.match(byName("consoleBaseUrl").description, /Check Image C2PA/);

    const { validateNodeCredentials, NodeHelpers } = require("n8n-workflow");
    const parameters = { operation: "checkImageC2paUrl", imageUrl: "https://example.com/hero.png" };
    const n8nNode = {
      id: "1",
      name: "Spurvik C2PA",
      type: "n8n-nodes-spurvik.spurvikEuAiActGuard",
      typeVersion: 1,
      position: [0, 0],
      parameters,
    };
    assert.deepEqual(validateNodeCredentials(n8nNode, node), []);
    const resolved = NodeHelpers.getNodeParameters(node.description.properties, parameters, true, false, n8nNode, node.description);
    assert.deepEqual(Object.keys(resolved), ["operation", "imageUrl", "consoleBaseUrl"]);
  });

  it("pins the User-Agent version to package.json and exports the C2PA API from the package index", () => {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(N8N_NODES_SPURVIK_VERSION, manifest.version);
    assert.equal(N8N_NODES_SPURVIK_USER_AGENT, `n8n-nodes-spurvik/${manifest.version}`);
    assert.equal(packageIndex.checkSpurvikImageC2paUrl, checkSpurvikImageC2paUrl);
    assert.equal(packageIndex.normalizeC2paImageUrl, normalizeC2paImageUrl);
    assert.equal(packageIndex.detectImageProxy, detectImageProxy);
    assert.equal(packageIndex.N8N_NODES_SPURVIK_USER_AGENT, N8N_NODES_SPURVIK_USER_AGENT);
  });
});

describe("checkImageC2paUrl execute", () => {
  const node = new SpurvikEuAiActGuard();

  it("POSTs { url } with JSON, Accept and User-Agent headers, no credential, and returns a clean manifest_valid row", async () => {
    await withFetch(
      async () => json(report()),
      async (calls) => {
        const context = c2paCtx({ imageUrl: "https://www.stepnetwork.dk/media/hero.png" });
        const [out] = await node.execute.call(context);
        assert.equal(context.credentialCalls, 0);
        assert.equal(calls.length, 1);
        const [{ url, init }] = calls;
        assert.equal(url, ENDPOINT);
        assert.equal(init.method, "POST");
        assert.deepEqual(init.headers, {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "n8n-nodes-spurvik/1.0.8",
        });
        assert.equal(Object.keys(init.headers).some((key) => /authorization|cookie|api-?key/i.test(key)), false);
        assert.deepEqual(JSON.parse(init.body), { url: "https://www.stepnetwork.dk/media/hero.png" });
        assert.equal(init.redirect, "error");
        assert.ok(init.signal instanceof AbortSignal);

        assert.equal(out.length, 1);
        assert.deepEqual(out[0].json, {
          imageUrl: "https://www.stepnetwork.dk/media/hero.png",
          imageHost: "www.stepnetwork.dk",
          checkStatus: "manifest_valid",
          reason: null,
          fileName: "hero.png",
          mediaType: "image/png",
          byteLength: 33270,
          manifestFound: true,
          embedded: true,
          signatureMatches: true,
          trustAnchor: "no_failure_reported",
          claimGenerator: "Adobe Firefly",
          validationCodes: [],
          cdnRewriteSuspected: false,
          cdnProvider: null,
          diagnosis: null,
          art50GeneratedBadgeSnippet: badge("da"),
          c2paCheckerUrl: CHECKER,
          upgradeUrls: upgradeUrls("www.stepnetwork.dk"),
        });
        assert.deepEqual(Object.keys(out[0].json), OUTPUT_KEYS);
        const body = JSON.stringify(out);
        assert.equal(body.includes(PROMPT), false);
        assert.equal(body.includes("T-C2PA"), false);
        assert.equal(body.includes("SECRET_"), false);
        assert.equal(body.includes("plan=team&appUrl=www.stepnetwork.dk"), true);
      },
    );
  });

  it("reports no_manifest with null claimGenerator and no signature match, and points to the interactive checker", async () => {
    await withFetch(
      async () => json(report(NO_MANIFEST, "hero.jpg")),
      async () => {
        const [out] = await node.execute.call(c2paCtx({ imageUrl: "https://example.com/hero.jpg" }));
        const row = out[0].json;
        assert.equal(row.checkStatus, "no_manifest");
        assert.equal(row.manifestFound, false);
        assert.equal(row.embedded, false);
        assert.equal(row.signatureMatches, false);
        assert.equal(row.claimGenerator, null);
        assert.equal(row.trustAnchor, "not_checked");
        assert.equal(row.cdnRewriteSuspected, false);
        assert.match(row.diagnosis, /no C2PA manifest/);
        assert.match(row.diagnosis, /https:\/\/console\.spurvik\.com\/c2pa/);
        assert.deepEqual(row.upgradeUrls, upgradeUrls("example.com"));
        assert.equal(row.art50GeneratedBadgeSnippet, badge("en"));
        assert.equal(JSON.stringify(out).includes("SECRET_"), false);
      },
    );
  });

  it("forces signatureMatches false when the console says no manifest but signatureMatches true", async () => {
    await withFetch(
      async () => json(report({ ...NO_MANIFEST, signatureMatches: true, embedded: true })),
      async () => {
        const [out] = await node.execute.call(c2paCtx({ imageUrl: "https://example.com/hero.png" }));
        assert.equal(out[0].json.checkStatus, "no_manifest");
        assert.equal(out[0].json.signatureMatches, false);
        assert.equal(out[0].json.embedded, false);
      },
    );
  });

  it("reports signature_mismatch with validation codes and the not-on-trust-list anchor", async () => {
    await withFetch(
      async () =>
        json(
          report({
            signatureMatches: false,
            trustAnchor: "not_on_trust_list",
            validationCodes: ["claimSignature.mismatch", "assertion.dataHash.mismatch"],
          }),
        ),
      async () => {
        const [out] = await node.execute.call(c2paCtx({ imageUrl: "https://example.com/hero.png" }));
        const row = out[0].json;
        assert.equal(row.checkStatus, "signature_mismatch");
        assert.equal(row.manifestFound, true);
        assert.equal(row.signatureMatches, false);
        assert.equal(row.trustAnchor, "not_on_trust_list");
        assert.deepEqual(row.validationCodes, ["claimSignature.mismatch", "assertion.dataHash.mismatch"]);
        assert.match(row.diagnosis, /signature does not match/);
      },
    );
  });

  const proxyCases = [
    [
      "Next.js /_next/image on the customer's own host (appUrl kept)",
      "https://shop.example.de/_next/image?url=%2Fhero.png&w=1080&q=75",
      "Next.js image optimizer (/_next/image)",
      "shop.example.de",
      "de",
    ],
    [
      "Cloudflare /cdn-cgi/image/ (appUrl kept)",
      "https://www.example.fr/cdn-cgi/image/width=800/hero.png",
      "Cloudflare image resizing (/cdn-cgi/image/)",
      "www.example.fr",
      "fr",
    ],
    ["Cloudinary (shared CDN host: appUrl omitted)", "https://res.cloudinary.com/demo/image/upload/hero.png", "Cloudinary", null, "en"],
    ["imgix (shared CDN host: appUrl omitted)", "https://acme.imgix.net/hero.png?w=800", "imgix", null, "en"],
  ];
  for (const [label, imageUrl, provider, appHost, locale] of proxyCases) {
    it(`flags cdnRewriteSuspected for ${label}`, async () => {
      await withFetch(
        async () => json(report(NO_MANIFEST)),
        async (calls) => {
          const [out] = await node.execute.call(c2paCtx({ imageUrl }));
          const row = out[0].json;
          assert.equal(JSON.parse(calls[0].init.body).url, imageUrl);
          assert.equal(row.cdnRewriteSuspected, true);
          assert.equal(row.cdnProvider, provider);
          assert.equal(row.checkStatus, "no_manifest");
          assert.match(row.diagnosis, /re-encode/);
          assert.deepEqual(row.upgradeUrls, upgradeUrls(appHost));
          assert.equal(row.art50GeneratedBadgeSnippet, badge(locale));
          if (!appHost) assert.equal(JSON.stringify(row.upgradeUrls).includes("appUrl"), false);
        },
      );
    });
  }

  it("says the manifest survived the optimizer when it still matches", async () => {
    await withFetch(
      async () => json(report()),
      async () => {
        const [out] = await node.execute.call(c2paCtx({ imageUrl: "https://acme.imgix.net/hero.png" }));
        assert.equal(out[0].json.checkStatus, "manifest_valid");
        assert.equal(out[0].json.cdnRewriteSuspected, true);
        assert.match(out[0].json.diagnosis, /survived imgix/);
      },
    );
  });

  it("does not treat look-alike hosts as shared CDNs and keeps their appUrl", () => {
    for (const lookalike of [
      "https://evilcloudinary.com/hero.png",
      "https://cloudinary.com.example.dk/hero.png",
      "https://notimgix.net/hero.png",
      "https://example.com/static/_next/image.png",
    ]) {
      assert.equal(detectImageProxy(lookalike), null, lookalike);
    }
  });

  it("sanitizes claimGenerator, validationCodes and fileName from the manifest", async () => {
    const hostileClaim = `Evil\n\`rm -rf\` <script>alert(1)</script> [link](https://x.test) ‮RTL​ ${"A".repeat(300)}`;
    const codes = [
      "claimSignature.mismatch",
      "bad code with spaces",
      "<script>",
      42,
      null,
      "x".repeat(81),
      ...Array.from({ length: 30 }, (_, index) => `code.${index}`),
    ];
    await withFetch(
      async () => json(report({ claimGenerator: hostileClaim, validationCodes: codes }, "../../.etc/pass wd<>.png")),
      async () => {
        const [out] = await node.execute.call(c2paCtx({ imageUrl: "https://example.com/hero.png" }));
        const row = out[0].json;
        assert.ok(row.claimGenerator.length <= 100);
        assert.match(row.claimGenerator, /^[\p{L}\p{N} ._()/+:@-]+$/u);
        for (const forbidden of ["\n", "`", "<", ">", "[", "]", "‮", "​"]) {
          assert.equal(row.claimGenerator.includes(forbidden), false, JSON.stringify(forbidden));
        }
        assert.equal(row.validationCodes.length, 20);
        assert.equal(row.validationCodes[0], "claimSignature.mismatch");
        for (const code of row.validationCodes) assert.match(code, /^[A-Za-z0-9._:-]{1,80}$/);
        assert.match(row.fileName, /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
        assert.equal(row.fileName.includes("/"), false);
      },
    );
    assert.equal(safeClaimGenerator("  \n\t "), null);
    assert.equal(safeClaimGenerator(42), null);
    assert.deepEqual(safeValidationCodes("claimSignature.mismatch"), []);
    assert.equal(safeFileName(undefined, "image/webp"), "image.webp");
    assert.equal(safeFileName("...", "image/jpeg"), "image.jpg");
    assert.equal(safeFileName("a".repeat(200), "image/png").length, 80);
  });

  it("defaults fileName and trustAnchor when the console omits or garbles them", async () => {
    await withFetch(
      async () => json(report({ mediaType: "image/webp", trustAnchor: "Not A Code!" }, null)),
      async () => {
        const [out] = await node.execute.call(c2paCtx({ imageUrl: "https://example.com/x" }));
        assert.equal(out[0].json.fileName, "image.webp");
        assert.equal(out[0].json.trustAnchor, "no_failure_reported");
      },
    );
  });

  const notCheckedCases = [
    ["a rejected fetch", async () => Promise.reject(new TypeError("fetch failed SECRET_ERROR_MARKER")), "network_error"],
    ["a redirect (redirect: error)", async () => Promise.reject(new TypeError("unexpected redirect SECRET_ERROR_MARKER")), "network_error"],
    ["a timeout", async () => Promise.reject(new DOMException("SECRET_ERROR_MARKER", "TimeoutError")), "timeout"],
    ["an abort", async () => Promise.reject(new DOMException("SECRET_ERROR_MARKER", "AbortError")), "timeout"],
    ["HTTP 413 image_too_large", async () => json({ error: { code: "image_too_large", message: "SECRET_BODY_MARKER" } }, 413), "image_too_large"],
    ["HTTP 415 unsupported_media", async () => json({ error: { code: "unsupported_media", message: "SECRET_BODY_MARKER" } }, 415), "unsupported_media"],
    ["HTTP 422 blocked_target", async () => json({ error: { code: "blocked_target", message: "SECRET_BODY_MARKER" } }, 422), "blocked_target"],
    ["HTTP 429 rate_limited", async () => json({ error: { code: "rate_limited", message: "SECRET_BODY_MARKER" } }, 429), "rate_limited"],
    ["HTTP 504 upstream_timeout", async () => json({ error: { code: "upstream_timeout", message: "SECRET_BODY_MARKER" } }, 504), "upstream_timeout"],
    ["HTTP 500 with a hostile code", async () => json({ error: { code: "Bad Code!\nSECRET", message: "SECRET_BODY_MARKER" } }, 500), "upstream_http_500"],
    ["HTTP 403 with a string error", async () => json({ error: "SECRET_BODY_MARKER" }, 403), "upstream_http_403"],
    ["HTTP 503 with an empty body", async () => new Response("", { status: 503 }), "upstream_http_503"],
    ["HTTP 502 with HTML", async () => new Response("<html>SECRET_BODY_MARKER", { status: 502 }), "upstream_http_502"],
    ["HTTP 201 with a report", async () => json(report(), 201), "upstream_http_201"],
    ["invalid JSON on 200", async () => new Response("<html>SECRET_BODY_MARKER", { status: 200 }), "upstream_invalid_json"],
    ["a body without data", async () => json({ fileName: "x.png", note: "SECRET_BODY_MARKER" }), "upstream_invalid_shape"],
    ["a JSON array", async () => json([report()]), "upstream_invalid_shape"],
    ["an SVG media type", async () => json(report({ mediaType: "image/svg+xml" })), "upstream_invalid_shape"],
    ["a negative byteLength", async () => json(report({ byteLength: -1 })), "upstream_invalid_shape"],
    ["a fractional byteLength", async () => json(report({ byteLength: 1.5 })), "upstream_invalid_shape"],
    ["a byteLength over 4 MB", async () => json(report({ byteLength: 4 * 1024 * 1024 + 1 })), "upstream_invalid_shape"],
    ["a string byteLength", async () => json(report({ byteLength: "33270" })), "upstream_invalid_shape"],
    ["a missing manifestFound", async () => json(report({ manifestFound: undefined })), "upstream_invalid_shape"],
    ["a string manifestFound", async () => json(report({ manifestFound: "true" })), "upstream_invalid_shape"],
  ];
  for (const [label, impl, reason] of notCheckedCases) {
    it(`returns not_checked (${reason}) on ${label} without throwing or echoing the error or body`, async () => {
      await withFetch(impl, async (calls) => {
        const context = c2paCtx({ imageUrl: "https://cdn.stepnetwork.dk/hero.png#top" });
        const [out] = await node.execute.call(context);
        assert.equal(calls.length, 1);
        assert.equal(context.credentialCalls, 0);
        assert.deepEqual(
          out[0].json,
          notChecked("https://cdn.stepnetwork.dk/hero.png", "cdn.stepnetwork.dk", reason, { locale: "da" }),
        );
        assert.deepEqual(Object.keys(out[0].json), OUTPUT_KEYS);
        const body = JSON.stringify(out);
        assert.equal(body.includes("SECRET"), false);
        assert.equal(body.includes(PROMPT), false);
      });
    });
  }

  it("aborts a hanging request through AbortSignal.timeout and returns not_checked", async () => {
    const started = Date.now();
    const result = await checkSpurvikImageC2paUrl(
      { imageUrl: "https://example.com/hero.png" },
      {
        timeoutMs: 40,
        // AbortSignal.timeout uses an unref'd timer; this mock holds a ref'd timer that the abort clears.
        fetchImpl: (_url, init) =>
          new Promise((_resolve, reject) => {
            const keepAlive = setTimeout(() => reject(new Error("mock fetch was never aborted")), 10_000);
            init.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(keepAlive);
                reject(init.signal.reason);
              },
              { once: true },
            );
          }),
      },
    );
    assert.deepEqual(result, notChecked("https://example.com/hero.png", "example.com", "timeout"));
    assert.ok(Date.now() - started < 5000);
  });

  it("returns not_checked (fetch_unavailable) when no fetch exists, without throwing", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = undefined;
    try {
      const result = await checkSpurvikImageC2paUrl({ imageUrl: "https://example.com/hero.png" });
      assert.equal(result.checkStatus, "not_checked");
      assert.equal(result.reason, "fetch_unavailable");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("normalizes accepted URLs: case, :443, trailing dot, fragment, query and IDN", () => {
    const accepted = [
      ["HTTPS://Example.COM/Hero.PNG#frag", "https://example.com/Hero.PNG", "example.com"],
      ["  https://example.com:443/a/b.webp?v=2  ", "https://example.com/a/b.webp?v=2", "example.com"],
      ["https://www.example.dk./hero.jpg", "https://www.example.dk/hero.jpg", "www.example.dk"],
      ["https://bücher.de/cover.png", "https://xn--bcher-kva.de/cover.png", "xn--bcher-kva.de"],
      ["https://res.cloudinary.com/demo/image/upload/v1/hero.png", "https://res.cloudinary.com/demo/image/upload/v1/hero.png", "res.cloudinary.com"],
    ];
    for (const [raw, url, host] of accepted) {
      assert.deepEqual(normalizeC2paImageUrl(raw), { url, host }, raw);
    }
  });

  it("sends a custom https consoleBaseUrl without its trailing slash", async () => {
    await withFetch(
      async () => json(report()),
      async (calls) => {
        await node.execute.call(c2paCtx({ imageUrl: "https://example.com/hero.png", consoleBaseUrl: "https://staging.console.example.com/" }));
        assert.equal(calls[0].url, "https://staging.console.example.com/api/v1/provenance/public-check-url");
      },
    );
  });

  const refusedImageUrls = [
    ["http scheme", "http://example.com/hero.png", /only accepts https/],
    ["ftp scheme", "ftp://example.com/hero.png", /only accepts https/],
    ["file scheme", "file:///etc/passwd", /only accepts https/],
    ["data URL", "data:image/png;base64,AAAA", /only accepts https/],
    ["javascript URL", "javascript:alert(1)", /only accepts https/],
    ["bare domain", "shop.example.org/hero.png", /full https URL/],
    ["protocol-relative", "//shop.example.org/hero.png", /full https URL/],
    ["empty", "", /full https URL/],
    ["whitespace only", "   ", /full https URL/],
    ["space inside", "https://example.com/my hero.png", /full https URL/],
    ["quote inside", 'https://example.com/"hero.png', /full https URL/],
    ["angle bracket", "https://example.com/<hero>.png", /full https URL/],
    ["backslash", "https://example.com\\@evil.test/hero.png", /full https URL/],
    ["control character", "https://example.com/\u0000hero.png", /full https URL/],
    ["C1 control", "https://example.com/\u0085hero.png", /full https URL/],
    ["over 2048 characters", `https://example.com/${"a".repeat(2050)}.png`, /full https URL/],
    ["user and password", "https://user:pass@example.com/hero.png", /user name or password/],
    ["user only", "https://user@example.com/hero.png", /user name or password/],
    ["port 8443", "https://example.com:8443/hero.png", /port \(443\)/],
    ["port 80 on https", "https://example.com:80/hero.png", /port \(443\)/],
    ["localhost", "https://localhost/hero.png", /public hosts/],
    ["LOCALHOST with a dot", "https://LOCALHOST./hero.png", /public hosts/],
    ["*.localhost", "https://app.localhost/hero.png", /public hosts/],
    ["percent-encoded localhost", "https://%6c%6fcalhost/hero.png", /public hosts/],
    [".local", "https://printer.local/hero.png", /public hosts/],
    [".internal", "https://metadata.google.internal/hero.png", /public hosts/],
    [".lan", "https://nas.lan/hero.png", /public hosts/],
    [".home.arpa", "https://router.home.arpa/hero.png", /public hosts/],
    [".localdomain", "https://box.localdomain/hero.png", /public hosts/],
    [".intranet", "https://wiki.intranet/hero.png", /public hosts/],
    [".corp", "https://files.corp/hero.png", /public hosts/],
    ["single-label host", "https://intranet/hero.png", /public hosts/],
    ["loopback IPv4", "https://127.0.0.1/hero.png", /public hosts/],
    ["private 10/8", "https://10.0.0.1/hero.png", /public hosts/],
    ["private 192.168/16", "https://192.168.1.10/hero.png", /public hosts/],
    ["private 172.16/12", "https://172.16.0.5/hero.png", /public hosts/],
    ["cloud metadata", "https://169.254.169.254/latest/meta-data", /public hosts/],
    ["CGNAT", "https://100.64.0.1/hero.png", /public hosts/],
    ["public IPv4 literal (fail-closed)", "https://8.8.8.8/hero.png", /public hosts/],
    ["decimal IPv4", "https://2130706433/hero.png", /public hosts/],
    ["hex IPv4", "https://0x7f000001/hero.png", /public hosts/],
    ["octal IPv4", "https://0177.0.0.1/hero.png", /public hosts/],
    ["short IPv4", "https://127.1/hero.png", /public hosts/],
    ["IPv6 loopback", "https://[::1]/hero.png", /public hosts/],
    ["IPv4-mapped IPv6", "https://[::ffff:127.0.0.1]/hero.png", /public hosts/],
    ["IPv6 link-local", "https://[fe80::1]/hero.png", /public hosts/],
    ["public IPv6 literal (fail-closed)", "https://[2001:4860:4860::8888]/hero.png", /public hosts/],
    ["underscore label", "https://bad_label.example.com/hero.png", /full https URL/],
    ["label over 63", `https://${"a".repeat(64)}.example.com/hero.png`, /full https URL/],
    ["number", 42, /full https URL/],
    ["null", null, /full https URL/],
    ["undefined", undefined, /full https URL/],
    ["object", { url: "https://example.com/hero.png" }, /full https URL/],
    ["array", ["https://example.com/hero.png"], /full https URL/],
  ];
  for (const [label, imageUrl, message] of refusedImageUrls) {
    it(`refuses ${label} before any request, without reading the credential or echoing the input`, async () => {
      await withFetch(
        async () => json(report()),
        async (calls) => {
          const context = c2paCtx({ imageUrl });
          await assert.rejects(
            () => node.execute.call(context),
            (error) => {
              assert.match(error.message, message);
              if (typeof imageUrl === "string" && imageUrl.trim().length > 8) {
                assert.equal(error.message.includes(imageUrl.trim()), false);
              }
              return true;
            },
          );
          assert.equal(calls.length, 0);
          assert.equal(context.credentialCalls, 0);
        },
      );
    });
  }

  const refusedBaseUrls = [
    ["http on a public host", "http://console.example.com"],
    ["ftp", "ftp://console.example.com"],
    ["credentials", "https://user:pw@console.example.com"],
    ["a query", "https://console.example.com/?x=1"],
    ["a fragment", "https://console.example.com/#x"],
    ["garbage", "not a url"],
  ];
  for (const [label, consoleBaseUrl] of refusedBaseUrls) {
    it(`refuses a consoleBaseUrl with ${label} before any request`, async () => {
      await withFetch(
        async () => json(report()),
        async (calls) => {
          await assert.rejects(
            () => node.execute.call(c2paCtx({ imageUrl: "https://example.com/hero.png", consoleBaseUrl })),
            /consoleBaseUrl/,
          );
          assert.equal(calls.length, 0);
        },
      );
    });
  }

  it("checks every item, one output row each, with no credential and nothing copied from the items", async () => {
    const items = [{ json: { promptText: PROMPT, a: 1 } }, { json: { promptText: PROMPT, b: 2 } }];
    const urls = ["https://example.com/a.png", "https://example.com/b.png"];
    await withFetch(
      async (_url, init) => json(report({}, JSON.parse(init.body).url.endsWith("a.png") ? "a.png" : "b.png")),
      async (calls) => {
        const context = c2paCtx({}, items);
        const getNodeParameter = context.getNodeParameter;
        context.getNodeParameter = (name, index, fallback) =>
          name === "imageUrl" ? urls[index] : getNodeParameter(name, index, fallback);
        const [out] = await node.execute.call(context);
        assert.equal(calls.length, 2);
        assert.equal(context.credentialCalls, 0);
        assert.deepEqual(
          out.map((entry) => [entry.json.imageUrl, entry.json.fileName]),
          [
            ["https://example.com/a.png", "a.png"],
            ["https://example.com/b.png", "b.png"],
          ],
        );
        for (const entry of out) assert.deepEqual(Object.keys(entry.json), OUTPUT_KEYS);
        assert.equal(JSON.stringify(out).includes(PROMPT), false);
      },
    );
  });

  it("never reads the credential when items mix checkImageC2paUrl with the other zero-key operations", async () => {
    const items = [{ json: {} }, { json: {} }];
    await withFetch(
      async (url) =>
        String(url).includes("/provenance/")
          ? json(report())
          : json({ ok: true, scan: { reachable: true, measured: false, reason: "no_ai_surface", detectedWidgets: [], detectedSdks: [] } }),
      async (calls) => {
        const context = c2paCtx({ imageUrl: "https://example.com/hero.png", domainOrUrl: "example.com" }, items, [
          "checkImageC2paUrl",
          "scanDomain",
        ]);
        const [out] = await node.execute.call(context);
        assert.equal(context.credentialCalls, 0);
        assert.equal(calls.length, 2);
        assert.equal(out[0].json.checkStatus, "manifest_valid");
        assert.equal(out[1].json.domain, "example.com");
      },
    );
  });

  it("still reads the credential when another item in the same run needs it, and sends nothing", async () => {
    const items = [{ json: { promptText: PROMPT } }, { json: { promptText: PROMPT } }];
    await withFetch(
      async () => json(report()),
      async (calls) => {
        const context = c2paCtx({ imageUrl: "https://example.com/hero.png" }, items, ["checkImageC2paUrl", "art12_hmac_log"]);
        await assert.rejects(() => node.execute.call(context), /No credentials of type spurvikApi/);
        assert.equal(context.credentialCalls, 1);
        assert.equal(calls.length, 0);
      },
    );
  });
});
