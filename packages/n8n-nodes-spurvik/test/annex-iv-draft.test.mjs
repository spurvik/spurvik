import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import {
  SpurvikEuAiActGuard,
  SpurvikN8nNodeDescription,
} from "../dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js";
import {
  SPURVIK_ANNEX_IV_LOCALES,
  SPURVIK_ANNEX_IV_PROVIDERS,
  SPURVIK_ANNEX_IV_USE_CASES,
  spurvikAnnexIvDraft,
} from "../dist/annex-iv-draft.js";
import * as packageIndex from "../dist/index.js";

const require = createRequire(import.meta.url);
const PROMPT = "RAW_PROMPT_SHOULD_NOT_LEAK_ANNEX_IV";
const byName = (name) => SpurvikN8nNodeDescription.properties.find((property) => property.name === name);

function parameterShown(property, params) {
  const rules = property.displayOptions?.show;
  if (!rules) return true;
  for (const [key, allowed] of Object.entries(rules)) {
    const dependency = byName(key);
    const value = Object.prototype.hasOwnProperty.call(params, key) ? params[key] : dependency?.default;
    if (!allowed.map(String).includes(String(value))) return false;
  }
  return true;
}

function annexCtx(params = {}, items = [{ json: { promptText: PROMPT, ticketId: "T-ANNEX-IV" } }]) {
  const all = { operation: "annexIvDraft", ...params };
  const context = {
    credentialCalls: 0,
    getInputData: () => items,
    getNodeParameter: (name, _index, fallback) => {
      if (name === "operation") return all.operation;
      const property = byName(name);
      if (property && !parameterShown(property, all)) return property.default;
      if (Object.prototype.hasOwnProperty.call(all, name)) return all[name];
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

async function withNoNetwork(run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    throw new Error(`Unexpected network fetch: ${url}`);
  };
  try {
    return { result: await run(), calls };
  } finally {
    globalThis.fetch = original;
  }
}

describe("annexIvDraft descriptor & offline 9-section execution (zero-credential operation #9)", () => {
  const node = new SpurvikEuAiActGuard();

  it("registers annexIvDraft as operation #9, hides spurvikApi & consoleBaseUrl, and exports helpers", () => {
    const operation = byName("operation");
    assert.equal(operation.options.length, 9);
    assert.equal(operation.options[8].value, "annexIvDraft");
    assert.equal(operation.options[8].name, "Draft Annex IV Technical Documentation (Art. 11)");
    assert.match(operation.options[8].description, /no request, no credential or API key/);
    assert.equal(packageIndex.spurvikAnnexIvDraft, spurvikAnnexIvDraft);
    assert.deepEqual(SPURVIK_ANNEX_IV_LOCALES, ["en", "de", "fr", "nl", "da", "sv", "es", "it"]);
    assert.deepEqual(SPURVIK_ANNEX_IV_PROVIDERS, ["openai", "anthropic", "gemini", "mistral", "python"]);
    assert.equal(SPURVIK_ANNEX_IV_USE_CASES.length, 6);

    const { validateNodeCredentials } = require("n8n-workflow");
    const issues = validateNodeCredentials(
      {
        id: "1",
        name: "Spurvik Annex IV",
        type: "n8n-nodes-spurvik.spurvikEuAiActGuard",
        typeVersion: 1,
        position: [0, 0],
        parameters: { operation: "annexIvDraft" },
      },
      node,
    );
    assert.deepEqual(issues, []);
  });

  it("generates 9-section Annex IV Markdown & JSON locally with 0 network calls, 0 credential reads, and 0 prompt leakage", async () => {
    const context = annexCtx({
      annexIvDomain: "https://Personio.de/hr",
      annexIvUseCase: "employment",
      annexIvProvider: "anthropic",
      annexIvTier: "team",
      annexIvLocale: "de",
    });
    const { result, calls } = await withNoNetwork(() => node.execute.call(context));
    assert.deepEqual(calls, []);
    assert.equal(context.credentialCalls, 0);

    const out = result[0][0].json;
    const raw = JSON.stringify(out);
    assert.ok(!raw.includes(PROMPT), "incoming raw prompt must never leak into annexIvDraft output");
    assert.doesNotMatch(raw, /\b(compliant|verified|certified|guaranteed)\b/i);
    assert.ok(!raw.includes("€49"));

    assert.equal(out.format, "spurvik.annex-iv-preview.v1");
    assert.equal(out.domain, "personio.de");
    assert.equal(out.locale, "de");
    assert.equal(out.readinessScorePct, 100);
    assert.equal(out.sections.length, 9);
    assert.equal(
      out.studioUrl,
      "https://spurvik.com/de/ki-verordnung-anhang-iv-technische-dokumentation?domain=personio.de",
    );
    assert.equal(
      out.upgradeUrls.teamAnnualEur790,
      "https://console.spurvik.com/signup?plan=team&interval=annual&appUrl=personio.de&locale=de",
    );
    assert.match(out.markdown, /# EU AI Act Annex IV Technical Documentation Draft — personio\.de/);

    // Private/localhost hostnames are silently dropped
    const priv = spurvikAnnexIvDraft({ domain: "http://localhost:3000", tier: "free", locale: "fr" });
    assert.equal(priv.domain, null);
    assert.equal(priv.readinessScorePct, 44);
    assert.equal(priv.studioUrl, "https://spurvik.com/fr/reglement-ia-annexe-iv-documentation-technique");
  });
});
