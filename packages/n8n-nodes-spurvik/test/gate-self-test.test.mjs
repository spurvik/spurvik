import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import {
  SpurvikEuAiActGuard,
  SpurvikN8nNodeDescription,
} from "../dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js";
import { SPURVIK_GATE_LOCALES, spurvikGateSelfTest } from "../dist/gate-self-test.js";
import * as packageIndex from "../dist/index.js";

const require = createRequire(import.meta.url);
const PROMPT = "RAW_PROMPT_SHOULD_NOT_LEAK_GATE_TEST";
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

function gateCtx(params = {}, items = [{ json: { promptText: PROMPT, ticketId: "T-GATE" } }]) {
  const all = { operation: "gateSelfTest", ...params };
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

describe("gateSelfTest descriptor & offline cryptographic execution (zero-credential operation #8)", () => {
  const node = new SpurvikEuAiActGuard();

  it("registers gateSelfTest as operation #8, hides spurvikApi & consoleBaseUrl, and exports helpers", () => {
    const operation = byName("operation");
    assert.equal(operation.options.length, 9);
    assert.equal(operation.options[7].value, "gateSelfTest");
    assert.equal(operation.options[7].name, "Test Art. 14 Human Approval Blocking (6 Vectors)");
    assert.match(operation.options[7].description, /no request, no credential or API key/);
    assert.equal(packageIndex.spurvikGateSelfTest, spurvikGateSelfTest);
    assert.deepEqual(SPURVIK_GATE_LOCALES, ["en", "de", "fr", "nl", "da", "sv", "es", "it"]);

    const { validateNodeCredentials } = require("n8n-workflow");
    const issues = validateNodeCredentials(
      {
        id: "1",
        name: "Spurvik Gate",
        type: "n8n-nodes-spurvik.spurvikEuAiActGuard",
        typeVersion: 1,
        position: [0, 0],
        parameters: { operation: "gateSelfTest" },
      },
      node,
    );
    assert.deepEqual(issues, []);
  });

  it("runs all 6 Art. 14 fail-closed blocking vectors locally with 0 network calls, 0 credential reads, and 0 prompt leakage", async () => {
    const context = gateCtx({ gateTestDomain: "https://Personio.de/pricing", gateTestLocale: "de" });
    const { result, calls } = await withNoNetwork(() => node.execute.call(context));
    assert.deepEqual(calls, []);
    assert.equal(context.credentialCalls, 0);

    const out = result[0][0].json;
    const raw = JSON.stringify(out);
    assert.ok(!raw.includes(PROMPT), "incoming raw prompt must never leak into gateSelfTest output");
    assert.doesNotMatch(raw, /\b(compliant|verified|certified|guaranteed)\b/i);

    assert.equal(out.article, "EU AI Act Art. 14 + Art. 12");
    assert.equal(out.domain, "personio.de");
    assert.equal(out.locale, "de");
    assert.equal(out.allPassed, true);
    assert.equal(out.blockedAttacks, 5);
    assert.equal(out.totalVectors, 6);
    assert.equal(out.sampleAction.rawPromptPersistedBytes, 0);
    assert.equal(out.sampleAction.actionHmacPrefix.length, 16);
    assert.equal(out.interactiveUrl, "https://spurvik.com/de/ki-verordnung-artikel-14-menschliche-aufsicht-slack-teams-freigabe?domain=personio.de");
    assert.equal(out.upgradeUrls.proAnnualEur190, "https://console.spurvik.com/signup?plan=pro&interval=annual&appUrl=personio.de&locale=de");
    assert.equal(out.upgradeUrls.teamAnnualEur790, "https://console.spurvik.com/signup?plan=team&interval=annual&appUrl=personio.de&locale=de");
    assert.deepEqual(
      out.vectors.map((v) => [v.id, v.expectedExecution, v.actualExecution, v.passed]),
      [
        ["unapproved_default_halt", "blocked", "blocked", true],
        ["explicit_human_block", "blocked", "blocked", true],
        ["tampered_payload_hmac", "blocked", "blocked", true],
        ["decision_flip_forgery", "blocked", "blocked", true],
        ["expired_link_replay", "blocked", "blocked", true],
        ["authentic_signed_approval", "allowed", "allowed", true],
      ],
    );
  });

  it("drops private, localhost, IP and credentialed inputs fail-closed without echoing them", () => {
    for (const bad of ["localhost", "127.0.0.1", "http://10.0.0.5", "intranet.local", "https://u:p@acme.eu", "user@acme.eu"]) {
      const res = spurvikGateSelfTest({ domain: bad });
      assert.equal(res.domain, null, `expected null domain for ${bad}`);
      assert.ok(!JSON.stringify(res).includes(bad));
    }
  });
});
