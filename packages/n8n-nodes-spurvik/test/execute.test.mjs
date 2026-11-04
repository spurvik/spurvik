import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SpurvikEuAiActGuard, SpurvikN8nNodeDescription } from "../dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js";
import { SpurvikApi } from "../dist/credentials/SpurvikApi.credentials.js";

const SECRET = "spurvik-n8n-test-secret-2026";
const PROMPT = "RAW_PROMPT_SHOULD_NOT_LEAK_1105";

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

function ctx(params, credentials, items) {
  return {
    getInputData: () => items,
    getNodeParameter: (name, _index, fallback) => {
      const property = SpurvikN8nNodeDescription.properties.find((item) => item.name === name);
      if (property && !parameterShown(property, params)) return property.default;
      if (Object.prototype.hasOwnProperty.call(params, name)) return params[name];
      if (property && Object.prototype.hasOwnProperty.call(property, "default")) return property.default;
      return fallback;
    },
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

  it("adds a notice to outputField and the prompt marker appears 0 times", async () => {
    const context = ctx(
      {
        operation: "art50_disclosure",
        systemName: "Support bot",
        inputField: "promptText",
        outputField: "outputText",
        noticeText: "You are interacting with an AI system.",
        passThroughFields: "ticketId,promptText",
      },
      { signingSecret: SECRET },
      [{ json: { promptText: PROMPT, outputText: "Invoice updated.", ticketId: "T-9" } }],
    );
    const [out] = await node.execute.call(context);
    const body = JSON.stringify(out);
    assert.equal(body.split(PROMPT).length - 1, 0);
    assert.equal(out[0].json.ticketId, "T-9");
    assert.match(out[0].json.spurvik.disclosedOutputText, /Invoice updated\./);
    assert.match(out[0].json.spurvik.art50Notice, /interacting with an AI system/);
    assert.equal(out[0].json.spurvik.art12Record, null);
  });

  it("rejects an output field that is a prompt name or the input field", async () => {
    const cases = [
      { outputField: "promptText", inputField: "promptText", item: { promptText: PROMPT, outputText: "Invoice updated." } },
      { outputField: "query", inputField: "query", item: { query: PROMPT, outputText: "Invoice updated." } },
      { outputField: "chatInput", inputField: "promptText", item: { chatInput: PROMPT, outputText: "Invoice updated." } },
      { outputField: "Query", inputField: "promptText", item: { Query: PROMPT, outputText: "Invoice updated." } },
      { outputField: "userAsk", inputField: "userAsk", item: { userAsk: PROMPT, outputText: "Invoice updated." } },
    ];
    for (const entry of cases) {
      const context = ctx(
        {
          operation: "art50_disclosure",
          outputField: entry.outputField,
          inputField: entry.inputField,
          systemName: "Support bot",
        },
        { signingSecret: SECRET },
        [{ json: entry.item }],
      );
      await assert.rejects(() => node.execute.call(context), (error) => {
        assert.match(error.message, /must be the AI output/);
        assert.equal(error.message.includes(PROMPT), false);
        return true;
      });
    }
  });

  it("uses the descriptor default when displayOptions hide the parameter", () => {
    const inputField = SpurvikN8nNodeDescription.properties.find((property) => property.name === "inputField");
    assert.deepEqual(inputField.displayOptions.show.operation, ["art50_disclosure", "art12_hmac_log"]);
    const notice = ctx(
      { operation: "art50_disclosure", inputField: "query" },
      { signingSecret: SECRET },
      [{ json: {} }],
    );
    assert.equal(notice.getNodeParameter("inputField", 0, "ignored"), "query");
    const approval = ctx(
      { operation: "art14_ask_human", inputField: "query", outputField: "chatInput" },
      { signingSecret: SECRET },
      [{ json: {} }],
    );
    assert.equal(approval.getNodeParameter("inputField", 0, "ignored"), "promptText");
    assert.equal(approval.getNodeParameter("outputField", 0, "ignored"), "outputText");
  });

  it("throws when the art50 output field is missing", async () => {
    const context = ctx(
      { operation: "art50_disclosure", outputField: "outputText", systemName: "Support bot" },
      { signingSecret: SECRET },
      [{ json: { promptText: PROMPT } }],
    );
    await assert.rejects(() => node.execute.call(context), /outputText/);
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
