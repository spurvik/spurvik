import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SpurvikEuAiActGuard, SpurvikN8nNodeDescription } from "../dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js";
import { SpurvikApi } from "../dist/credentials/SpurvikApi.credentials.js";

const SECRET = "spurvik-n8n-test-secret-2026";
const PROMPT = "RAW_PROMPT_SHOULD_NOT_LEAK_1105";

function ctx(params, credentials, items) {
  return {
    getInputData: () => items,
    getNodeParameter: (name, _index, fallback) => (name in params ? params[name] : fallback),
    getCredentials: async (name) => {
      if (name !== "spurvikApi") throw new Error(`unexpected credential ${name}`);
      if (credentials === undefined) throw new Error("No credentials of type spurvikApi");
      return credentials;
    },
  };
}

describe("SpurvikEuAiActGuard.execute", () => {
  const node = new SpurvikEuAiActGuard();

  it("keeps the 1.0.1 node type id", () => {
    assert.equal(SpurvikN8nNodeDescription.name, "spurvikEuAiActGuard");
    assert.equal(node.description.name, "spurvikEuAiActGuard");
    assert.equal(SpurvikApi.prototype?.name ?? new SpurvikApi().name, "spurvikApi");
  });

  it("throws when the signing secret is missing", async () => {
    const context = ctx(
      { operation: "art12_hmac_log", systemName: "Bot", inputField: "promptText" },
      { signingSecret: "" },
      [{ json: { promptText: PROMPT } }],
    );
    await assert.rejects(() => node.execute.call(context), /signingSecret/);
  });

  it("throws when the signing secret has surrounding whitespace", async () => {
    const context = ctx(
      { operation: "art12_hmac_log", systemName: "Bot", inputField: "promptText" },
      { signingSecret: ` ${SECRET}` },
      [{ json: { promptText: PROMPT } }],
    );
    await assert.rejects(() => node.execute.call(context), /whitespace/);
  });

  it("adds a notice and does not echo promptText", async () => {
    const context = ctx(
      {
        operation: "art50_disclosure",
        systemName: "Support bot",
        inputField: "outputText",
        noticeText: "You are interacting with an AI system.",
      },
      { signingSecret: SECRET },
      [{ json: { promptText: PROMPT, outputText: "Invoice updated." } }],
    );
    const [out] = await node.execute.call(context);
    const body = JSON.stringify(out);
    assert.equal(body.includes(PROMPT), false);
    assert.match(out[0].json.spurvik.disclosedOutputText, /Invoice updated\./);
    assert.match(out[0].json.spurvik.art50Notice, /interacting with an AI system/);
    assert.equal(out[0].json.spurvik.art12Record, null);
    assert.equal(out[0].json.promptText, undefined);
  });

  it("records an HMAC-SHA256 digest that matches node:crypto and omits the prompt", async () => {
    const context = ctx(
      { operation: "art12_hmac_log", systemName: "Support bot", inputField: "promptText" },
      { signingSecret: SECRET },
      [{ json: { promptText: PROMPT, outputText: "Invoice updated." } }],
    );
    const [out] = await node.execute.call(context);
    const expected = createHmac("sha256", SECRET).update(`spurvik:workflow:input:v1|${PROMPT}`, "utf8").digest("hex");
    assert.equal(out[0].json.spurvik.art12Record.inputHmac, expected);
    assert.equal(out[0].json.spurvik.art50Notice, null);
    assert.equal(out[0].json.spurvik.disclosedOutputText, null);
    assert.equal(JSON.stringify(out).includes(PROMPT), false);
  });

  it("sends an approval request and does not copy the prompt", async () => {
    const calls = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), body: init?.body });
      return new Response(JSON.stringify({ ok: true, id: "msg_1" }), { status: 200 });
    };
    try {
      const context = ctx(
        {
          operation: "art14_ask_human",
          systemName: "Refund bot",
          channel: "slack",
          approverTarget: "",
          callbackBaseUrl: "https://approvals.example/hitl/callback",
          actionName: "stripe.refunds.create",
          actionSummary: "Refund order 4821",
        },
        { signingSecret: SECRET, slackWebhookUrl: "https://hooks.slack.test/services/T/B/X" },
        [{ json: { promptText: PROMPT } }],
      );
      const [out] = await node.execute.call(context);
      assert.equal(out[0].json.spurvik.art14Gate.required, true);
      assert.equal(out[0].json.spurvik.art14Gate.linksDelivered, true);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, "https://hooks.slack.test/services/T/B/X");
      assert.equal(typeof calls[0].body, "string");
      assert.equal(JSON.stringify(out).includes(PROMPT), false);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("says Monday.com creates an item only", () => {
    const channel = SpurvikN8nNodeDescription.properties.find((property) => property.name === "channel");
    const monday = channel.options.find((option) => option.value === "monday");
    assert.match(monday.description, /does not send Approve or Block links/);
  });
});
