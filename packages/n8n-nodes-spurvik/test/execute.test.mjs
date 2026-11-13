import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { SpurvikEuAiActGuard, SpurvikN8nNodeDescription } from "../dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js";
import { SpurvikApi } from "../dist/credentials/SpurvikApi.credentials.js";
import { scanSpurvikDomain } from "../dist/scan-domain.js";

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

  const passThroughCases = [
    { label: "exact match", inputField: "myPrompt", passThroughFields: "myPrompt,ticketId", copiedKey: "myPrompt" },
    { label: "different case", inputField: "myPrompt", passThroughFields: "MyPrompt,ticketId", copiedKey: "MyPrompt" },
    {
      label: "surrounding whitespace",
      inputField: "myPrompt",
      passThroughFields: " MyPrompt ",
      copiedKey: "MyPrompt",
    },
    {
      label: "inputField surrounding whitespace",
      inputField: " myPrompt ",
      passThroughFields: "MyPrompt,ticketId",
      copiedKey: "MyPrompt",
    },
  ];

  for (const operation of ["art50_disclosure", "art12_hmac_log"]) {
    for (const spec of passThroughCases) {
      it(`B-PT1: ${operation} skips passThroughFields on ${spec.label}`, async () => {
        const item = {
          myPrompt: PROMPT,
          outputText: "Invoice updated.",
          ticketId: "T-42",
        };
        if (spec.copiedKey !== "myPrompt") item[spec.copiedKey] = PROMPT;
        if (spec.inputField !== "myPrompt") item[spec.inputField] = PROMPT;
        const params = {
          operation,
          systemName: "Support bot",
          inputField: spec.inputField,
          passThroughFields: spec.passThroughFields,
        };
        if (operation === "art50_disclosure") {
          params.outputField = "outputText";
          params.noticeText = "You are interacting with an AI system.";
        }
        const context = ctx(params, { signingSecret: SECRET }, [{ json: item }]);
        const [out] = await node.execute.call(context);
        const body = JSON.stringify(out);
        assert.equal(body.split(PROMPT).length - 1, 0);
        assert.equal(Object.prototype.hasOwnProperty.call(out[0].json, "myPrompt"), false);
        assert.equal(Object.prototype.hasOwnProperty.call(out[0].json, "MyPrompt"), false);
        if (spec.passThroughFields.includes("ticketId")) {
          assert.equal(out[0].json.ticketId, "T-42");
        } else {
          assert.equal(Object.prototype.hasOwnProperty.call(out[0].json, "ticketId"), false);
        }
        if (operation === "art12_hmac_log") {
          const hashed = spec.inputField === "myPrompt" ? PROMPT : item[spec.inputField];
          const expected = createHmac("sha256", SECRET)
            .update(`spurvik:workflow:input:v1|${hashed}`, "utf8")
            .digest("hex");
          assert.equal(out[0].json.spurvik.art12Record.inputHmac, expected);
        }
      });
    }
  }

  it("says Monday.com creates an item only", () => {
    const channel = SpurvikN8nNodeDescription.properties.find((property) => property.name === "channel");
    const monday = channel.options.find((option) => option.value === "monday");
    assert.match(monday.description, /does not send Approve or Block links/);
  });

  it("masks the signing secret and every channel credential in the n8n UI", () => {
    const properties = new SpurvikApi().properties;
    const expected = [
      "signingSecret",
      "consoleApiKey",
      "slackWebhookUrl",
      "telegramBotToken",
      "resendApiKey",
      "discordWebhookUrl",
      "teamsWebhookUrl",
      "linearApiKey",
      "jiraApiToken",
      "mondayApiToken",
      "asanaAccessToken",
    ];
    assert.deepEqual(properties.map((property) => property.name), expected);
    for (const property of properties) {
      assert.equal(property.type, "string", property.name);
      assert.equal(property.typeOptions?.password, true, `${property.name} must set typeOptions.password`);
    }
  });

  it("syncs art50, art12, and art14 metadata to consoleBaseUrl when consoleApiKey is set and sends 0 prompt bytes", async () => {
    const liveKey = `${"spurvik"}_live_${"k".repeat(36)}`;
    const calls = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const target = String(url);
      const rawBody = typeof init?.body === "string" ? init.body : "";
      calls.push({ url: target, headers: init?.headers ?? {}, body: rawBody });
      if (target.endsWith("/api/v1/disclosure")) {
        return new Response(JSON.stringify({ data: { sessionId: "n8n_sess_1" } }), { status: 201 });
      }
      if (target.endsWith("/api/v1/telemetry")) {
        return new Response(JSON.stringify({ data: { inserted: 1, duplicates: 0 } }), { status: 200 });
      }
      if (target.endsWith("/api/v1/hitl")) {
        return new Response(JSON.stringify({ data: { id: "hitl_row_1" } }), { status: 201 });
      }
      return new Response(JSON.stringify({ ok: true, id: "msg_1" }), { status: 200 });
    };
    try {
      const [art50Out] = await node.execute.call(
        ctx(
          {
            operation: "art50_disclosure",
            systemName: "Support bot",
            outputField: "outputText",
            consoleBaseUrl: "https://console.spurvik.com/",
          },
          { signingSecret: SECRET, consoleApiKey: liveKey },
          [{ json: { promptText: PROMPT, outputText: "Invoice updated." } }],
        ),
      );
      assert.equal(art50Out[0].json.spurvik.consoleSync.endpoint, "/api/v1/disclosure");
      assert.equal(art50Out[0].json.spurvik.consoleSync.synced, true);
      assert.equal(art50Out[0].json.spurvik.consoleSync.remoteId, "n8n_sess_1");

      const [art12Out] = await node.execute.call(
        ctx(
          {
            operation: "art12_hmac_log",
            systemName: "Support bot",
            inputField: "promptText",
            consoleBaseUrl: "https://console.spurvik.com",
          },
          { signingSecret: SECRET, consoleApiKey: liveKey },
          [{ json: { promptText: PROMPT } }],
        ),
      );
      assert.equal(art12Out[0].json.spurvik.consoleSync.endpoint, "/api/v1/telemetry");
      assert.equal(art12Out[0].json.spurvik.consoleSync.synced, true);
      assert.equal(typeof art12Out[0].json.spurvik.consoleSync.remoteId, "string");

      const [art14Out] = await node.execute.call(
        ctx(
          {
            operation: "art14_ask_human",
            systemName: "Refund bot",
            channel: "slack",
            callbackBaseUrl: "https://approvals.example/hitl/callback",
            actionName: "stripe.refunds.create",
            actionSummary: "Refund order 4821",
            consoleBaseUrl: "https://console.spurvik.com",
          },
          {
            signingSecret: SECRET,
            consoleApiKey: liveKey,
            slackWebhookUrl: "https://hooks.slack.test/services/T/B/X",
          },
          [{ json: { promptText: PROMPT } }],
        ),
      );
      assert.equal(art14Out[0].json.spurvik.consoleSync.endpoint, "/api/v1/hitl");
      assert.equal(art14Out[0].json.spurvik.consoleSync.remoteId, "hitl_row_1");

      assert.equal(calls.length, 4);
      for (const call of calls) {
        assert.equal(call.body.includes(PROMPT), false);
        assert.equal(call.body.includes("Invoice updated."), false);
      }
      const telemetryPayload = JSON.parse(calls[1].body);
      assert.equal(telemetryPayload.events[0].contentHashMode, "keyed");
      assert.equal(telemetryPayload.events[0].inputHash, art12Out[0].json.spurvik.art12Record.inputHmac);

      const hitlPayload = JSON.parse(calls[3].body);
      const summary = JSON.parse(hitlPayload.payloadSummary);
      assert.equal(summary.schema, "spurvik.payload_summary.v1");
      assert.deepEqual(summary.keys, ["channel", "gateId"]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("rejects consoleApiKey with surrounding whitespace or bad prefix", async () => {
    const liveKey = `${"spurvik"}_live_${"k".repeat(36)}`;
    await assert.rejects(
      () =>
        node.execute.call(
          ctx(
            { operation: "art12_hmac_log", systemName: "Bot", inputField: "promptText" },
            { signingSecret: SECRET, consoleApiKey: ` ${liveKey}` },
            [{ json: { promptText: PROMPT } }],
          ),
        ),
      /consoleApiKey.*whitespace/,
    );
    await assert.rejects(
      () =>
        node.execute.call(
          ctx(
            { operation: "art12_hmac_log", systemName: "Bot", inputField: "promptText" },
            { signingSecret: SECRET, consoleApiKey: "invalid_short_key" },
            [{ json: { promptText: PROMPT } }],
          ),
        ),
      /consoleApiKey/,
    );
  });
});

describe("SpurvikEuAiActGuard scanDomain (zero-key Scan Live Domain)", () => {
  const node = new SpurvikEuAiActGuard();
  const require = createRequire(import.meta.url);
  const CONSOLE = "https://console.spurvik.com";
  const LIVE_SCAN = {
    ok: true,
    scan: {
      domain: "www.stepnetwork.dk",
      scannedUrl: "https://www.stepnetwork.dk/",
      reachable: true,
      measured: false,
      reason: "no_ai_surface",
      httpStatus: null,
      detectedWidgets: [],
      detectedSdks: [],
      markers: {
        art50_1_disclosure: false,
        art50_2_provenance: false,
        art50_4_synthetic: false,
        art12_telemetry: false,
      },
      readinessScore: null,
      gapsCount: null,
      cards: {},
      detectedStack: [],
      detectedModel: null,
      toggles: null,
    },
  };
  const OUTPUT_KEYS = [
    "domain",
    "reachable",
    "detectedWidgets",
    "detectedSdks",
    "art50NoticeDetected",
    "badgeSnippet",
    "reportUrl",
    "sandboxUrl",
    "agencyCalculatorUrl",
    "upgradeUrls",
    "scanStatus",
    "reason",
    "markers",
  ];

  function links(host) {
    const encoded = encodeURIComponent(host);
    return {
      reportUrl: `${CONSOLE}/report?domain=${encoded}`,
      sandboxUrl: `${CONSOLE}/sandbox?scan=${encoded}`,
      agencyCalculatorUrl: "https://spurvik.com/eu-ai-act-for-agencies",
      upgradeUrls: {
        proWhiteLabelEur19: `${CONSOLE}/signup?plan=pro&appUrl=${encoded}`,
        teamAgencyEur79: `${CONSOLE}/signup?plan=team&appUrl=${encoded}`,
        doneForYou24hEur199: `${CONSOLE}/signup?plan=concierge&appUrl=${encoded}`,
      },
    };
  }

  function badge(host, locale) {
    return `<script src="https://spurvik.com/badge.js" data-system="${host}" data-locale="${locale}" data-theme="dark" data-attribution="true" defer></script>`;
  }

  function offlineOutput(host, locale, reason) {
    return {
      domain: host,
      reachable: false,
      detectedWidgets: [],
      detectedSdks: [],
      art50NoticeDetected: false,
      badgeSnippet: badge(host, locale),
      ...links(host),
      scanStatus: "offline",
      reason,
      markers: null,
    };
  }

  /** Context with no spurvikApi credential. Counts getCredentials calls. */
  function scanCtx(params, items = [{ json: { promptText: PROMPT, ticketId: "T-77" } }]) {
    const context = ctx({ operation: "scanDomain", ...params }, undefined, items);
    const getCredentials = context.getCredentials;
    context.credentialCalls = 0;
    context.getCredentials = async (name) => {
      context.credentialCalls += 1;
      return getCredentials(name);
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

  it("keeps art50_disclosure as the default and the three existing operations unchanged", () => {
    const operation = SpurvikN8nNodeDescription.properties.find((property) => property.name === "operation");
    assert.equal(operation.default, "art50_disclosure");
    assert.deepEqual(
      operation.options.map((option) => [option.value, option.name]),
      [
        ["art50_disclosure", "Add an AI interaction notice"],
        ["art12_hmac_log", "Record an HMAC-SHA256 digest"],
        ["art14_ask_human", "Send an ask_human() approval request"],
        ["scanDomain", "Scan Live Domain (Art. 50 & Client Brief)"],
      ],
    );
    const domainOrUrl = SpurvikN8nNodeDescription.properties.find((property) => property.name === "domainOrUrl");
    assert.equal(domainOrUrl.type, "string");
    assert.equal(domainOrUrl.required, true);
    assert.deepEqual(domainOrUrl.displayOptions, { show: { operation: ["scanDomain"] } });
    const consoleBaseUrl = SpurvikN8nNodeDescription.properties.find((property) => property.name === "consoleBaseUrl");
    assert.equal(consoleBaseUrl.default, "https://console.spurvik.com");
    assert.equal(consoleBaseUrl.displayOptions, undefined);
  });

  it("keeps spurvikApi required for the existing operations and not for scanDomain (n8n-workflow rules)", () => {
    const [credential] = SpurvikN8nNodeDescription.credentials;
    assert.equal(SpurvikN8nNodeDescription.credentials.length, 1);
    assert.equal(credential.name, "spurvikApi");
    assert.equal(credential.required, true);
    assert.deepEqual(credential.displayOptions, { hide: { operation: ["scanDomain"] } });

    const { validateNodeCredentials, NodeHelpers } = require("n8n-workflow");
    const nodeFor = (parameters) => ({
      id: "1",
      name: "Spurvik",
      type: "n8n-nodes-spurvik.spurvikEuAiActGuard",
      typeVersion: 1,
      position: [0, 0],
      parameters,
    });
    const missing = (parameters) =>
      validateNodeCredentials(nodeFor(parameters), node).map((issue) => `${issue.type}:${issue.credentialName}`);
    // {} is a saved node whose operation equals the default and was dropped.
    for (const parameters of [{}, { operation: "art50_disclosure" }, { operation: "art12_hmac_log" }, { operation: "art14_ask_human" }]) {
      assert.deepEqual(missing(parameters), ["missing:spurvikApi"], JSON.stringify(parameters));
    }
    assert.deepEqual(missing({ operation: "scanDomain", domainOrUrl: "stepnetwork.dk" }), []);

    const resolved = (parameters) =>
      Object.keys(NodeHelpers.getNodeParameters(node.description.properties, parameters, true, false, nodeFor(parameters), node.description));
    assert.deepEqual(resolved({ operation: "scanDomain", domainOrUrl: "stepnetwork.dk" }), ["operation", "domainOrUrl", "consoleBaseUrl"]);
    for (const operation of ["art50_disclosure", "art12_hmac_log", "art14_ask_human"]) {
      const keys = resolved({ operation });
      assert.ok(keys.includes("systemName"), operation);
      assert.ok(keys.includes("passThroughFields"), operation);
      assert.ok(keys.includes("consoleBaseUrl"), operation);
      assert.equal(keys.includes("domainOrUrl"), false, operation);
    }
  });

  it("existing operations still read the spurvikApi credential", async () => {
    const context = ctx(
      { operation: "art12_hmac_log", systemName: "Bot", inputField: "promptText" },
      undefined,
      [{ json: { promptText: PROMPT } }],
    );
    await assert.rejects(() => node.execute.call(context), /No credentials of type spurvikApi/);
  });

  it("scans with no credential, no auth header, and maps the live response", async () => {
    await withFetch(
      async () => json(LIVE_SCAN),
      async (calls) => {
        const context = scanCtx({ domainOrUrl: "stepnetwork.dk", passThroughFields: "ticketId,promptText" });
        const [out] = await node.execute.call(context);
        assert.equal(context.credentialCalls, 0);
        assert.equal(out.length, 1);
        assert.deepEqual(Object.keys(out[0].json), OUTPUT_KEYS);
        assert.deepEqual(out[0].json, {
          domain: "stepnetwork.dk",
          reachable: true,
          detectedWidgets: [],
          detectedSdks: [],
          art50NoticeDetected: false,
          badgeSnippet: badge("stepnetwork.dk", "da"),
          ...links("stepnetwork.dk"),
          scanStatus: "not_measured",
          reason: "no_ai_surface",
          markers: {
            art50_1_disclosure: false,
            art50_2_provenance: false,
            art50_4_synthetic: false,
            art12_telemetry: false,
          },
        });
        const body = JSON.stringify(out);
        assert.equal(body.includes(PROMPT), false);
        assert.equal(body.includes("T-77"), false);

        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, `${CONSOLE}/api/v1/sandbox/scan?url=${encodeURIComponent("stepnetwork.dk")}`);
        const { init } = calls[0];
        assert.equal(init.method, "GET");
        assert.equal(init.redirect, "error");
        assert.ok(init.signal instanceof AbortSignal);
        assert.equal(init.signal.aborted, false);
        assert.deepEqual(init.headers, { accept: "application/json" });
        const headers = new Headers(init.headers);
        for (const name of ["authorization", "cookie", "x-api-key"]) assert.equal(headers.has(name), false, name);
        assert.equal(init.body, undefined);
      },
    );
  });

  it("normalizes a URL input to its lower-case hostname before building any URL", async () => {
    await withFetch(
      async () => json(LIVE_SCAN),
      async (calls) => {
        const [out] = await node.execute.call(scanCtx({ domainOrUrl: "  https://Www.StepNetwork.dk/path?x=1#top  " }));
        assert.equal(out[0].json.domain, "www.stepnetwork.dk");
        assert.equal(calls[0].url, `${CONSOLE}/api/v1/sandbox/scan?url=www.stepnetwork.dk`);
        assert.equal(new URL(calls[0].url).searchParams.get("url"), "www.stepnetwork.dk");
        assert.equal(out[0].json.reportUrl, `${CONSOLE}/report?domain=www.stepnetwork.dk`);
        assert.equal(out[0].json.sandboxUrl, `${CONSOLE}/sandbox?scan=www.stepnetwork.dk`);
        assert.equal(out[0].json.upgradeUrls.teamAgencyEur79, `${CONSOLE}/signup?plan=team&appUrl=www.stepnetwork.dk`);
        assert.equal(out[0].json.badgeSnippet, badge("www.stepnetwork.dk", "da"));
        assert.equal(JSON.stringify(out).includes("path"), false);
      },
    );
    for (const [input, host] of [
      ["http://example.com:80/", "example.com"],
      ["https://example.com:443", "example.com"],
      ["Example.COM.", "example.com"],
      ["//shop.example.de/cart", "shop.example.de"],
      ["xn--bcher-kva.example", "xn--bcher-kva.example"],
    ]) {
      await withFetch(
        async () => json(LIVE_SCAN),
        async () => {
          const [out] = await node.execute.call(scanCtx({ domainOrUrl: input }));
          assert.equal(out[0].json.domain, host, input);
        },
      );
    }
  });

  it("returns widgets, SDKs and the Art. 50 notice as sanitized strings", async () => {
    const many = Array.from({ length: 30 }, (_, n) => `sdk-${n}`);
    await withFetch(
      async () =>
        json({
          ok: true,
          scan: {
            reachable: true,
            measured: true,
            reason: "<b>bad reason</b>",
            httpStatus: null,
            detectedWidgets: ["Intercom", 42, null, { name: "x" }, "Intercom", "  Drift\u0000\u0007  ", "w".repeat(500)],
            detectedSdks: many,
            markers: { art50_1_disclosure: true, art50_2_provenance: "yes", art12_telemetry: true },
          },
        }),
      async () => {
        const [out] = await node.execute.call(scanCtx({ domainOrUrl: "shop.example.com" }));
        const result = out[0].json;
        assert.equal(result.reachable, true);
        assert.deepEqual(result.detectedWidgets, ["Intercom", "Drift", "w".repeat(120)]);
        assert.deepEqual(result.detectedSdks, many.slice(0, 20));
        assert.equal(result.art50NoticeDetected, true);
        assert.equal(result.scanStatus, "measured");
        assert.equal(result.reason, null);
        assert.deepEqual(result.markers, {
          art50_1_disclosure: true,
          art50_2_provenance: false,
          art50_4_synthetic: false,
          art12_telemetry: true,
        });
        assert.equal(result.badgeSnippet, badge("shop.example.com", "en"));
      },
    );
  });

  it("does not report a notice for a site the console could not read", async () => {
    const markers = { art50_1_disclosure: true, art50_2_provenance: true, art50_4_synthetic: true, art12_telemetry: true };
    for (const [scan, status] of [
      [{ reachable: false, measured: false, reason: "dns", detectedWidgets: ["Intercom"], markers }, "unreachable"],
      [{ reachable: true, measured: false, httpStatus: 404, detectedWidgets: ["Intercom"], markers }, "not_measured"],
    ]) {
      await withFetch(
        async () => json({ ok: true, scan }),
        async () => {
          const [out] = await node.execute.call(scanCtx({ domainOrUrl: "stepnetwork.dk" }));
          assert.equal(out[0].json.scanStatus, status);
          assert.deepEqual(out[0].json.detectedWidgets, []);
          assert.equal(out[0].json.art50NoticeDetected, false);
          assert.equal(out[0].json.markers, null);
        },
      );
    }
  });

  const offlineCases = [
    ["a rejected fetch", async () => Promise.reject(new TypeError("fetch failed SECRET_ERROR_MARKER")), "network_error"],
    ["a redirect", async () => Promise.reject(new TypeError("unexpected redirect SECRET_ERROR_MARKER")), "network_error"],
    ["a timeout", async () => Promise.reject(new DOMException("SECRET_ERROR_MARKER", "TimeoutError")), "timeout"],
    ["HTTP 500", async () => new Response("SECRET_BODY_MARKER", { status: 500 }), "upstream_http_500"],
    ["HTTP 404", async () => new Response("SECRET_BODY_MARKER", { status: 404 }), "upstream_http_404"],
    ["invalid JSON", async () => new Response("<html>SECRET_BODY_MARKER", { status: 200 }), "upstream_invalid_json"],
    ["ok: false", async () => json({ ok: false, error: "SECRET_BODY_MARKER" }), "upstream_not_ok"],
    ["a body without a scan", async () => json({ ok: true, note: "SECRET_BODY_MARKER" }), "upstream_invalid_shape"],
  ];
  for (const [label, impl, reason] of offlineCases) {
    it(`falls back offline on ${label} without throwing or echoing the error or body`, async () => {
      await withFetch(impl, async (calls) => {
        const [out] = await node.execute.call(scanCtx({ domainOrUrl: "https://www.stepnetwork.dk/" }));
        assert.equal(calls.length, 1);
        assert.deepEqual(out[0].json, offlineOutput("www.stepnetwork.dk", "da", reason));
        assert.deepEqual(Object.keys(out[0].json), OUTPUT_KEYS);
        const body = JSON.stringify(out);
        assert.equal(body.includes("SECRET_"), false);
        assert.equal(body.includes(PROMPT), false);
      });
    });
  }

  it("aborts a hanging request through AbortSignal.timeout and returns the offline result", async () => {
    const started = Date.now();
    const result = await scanSpurvikDomain(
      { domainOrUrl: "stepnetwork.dk" },
      {
        timeoutMs: 40,
        fetchImpl: (_url, init) =>
          new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))),
      },
    );
    assert.deepEqual(result, offlineOutput("stepnetwork.dk", "da", "timeout"));
    assert.ok(Date.now() - started < 5000);
  });

  const rejected = [
    "localhost",
    "LOCALHOST.",
    "localhost:3000",
    "127.0.0.1",
    "https://127.0.0.1/",
    "10.0.0.1",
    "192.168.1.10",
    "http://169.254.169.254/latest/meta-data",
    "[::1]",
    "https://[::1]:443/",
    "[::ffff:127.0.0.1]",
    "0x7f000001",
    "2130706433",
    "0177.0.0.1",
    "127.1",
    "user@host",
    "user@example.com",
    "https://user:pass@example.com/",
    "host:8080",
    "example.com:8080",
    "https://example.com:80/",
    "foo.internal",
    "foo.local",
    "printer.lan",
    "nas.home.arpa",
    "app.localhost",
    "intranet",
    "example",
    "ftp://example.com",
    "javascript:alert(1)",
    "exa_mple.com",
    "-bad.example.com",
    "bad-.example.com",
    `${"a".repeat(64)}.com`,
    `${Array.from({ length: 4 }, () => "a".repeat(63)).join(".")}.com`,
    "exa mple.com",
    "",
    "   ",
    PROMPT,
  ];
  for (const input of rejected) {
    it(`rejects ${JSON.stringify(input.length > 40 ? `${input.slice(0, 20)}...` : input)} before any request`, async () => {
      await withFetch(
        async () => json(LIVE_SCAN),
        async (calls) => {
          const context = scanCtx({ domainOrUrl: input });
          await assert.rejects(() => node.execute.call(context), (error) => {
            assert.match(error.message, /^Scan Live Domain /);
            if (input.length > 12) assert.equal(error.message.includes(input), false);
            return true;
          });
          assert.equal(calls.length, 0);
          assert.equal(context.credentialCalls, 0);
        },
      );
    });
  }

  it("requires an https consoleBaseUrl and allows http only for localhost", async () => {
    for (const consoleBaseUrl of [
      "http://console.spurvik.com",
      "ftp://console.spurvik.com",
      "https://user:pass@console.spurvik.com",
      "https://console.spurvik.com/?x=1",
      "not a url",
    ]) {
      await withFetch(
        async () => json(LIVE_SCAN),
        async (calls) => {
          await assert.rejects(
            () => node.execute.call(scanCtx({ domainOrUrl: "stepnetwork.dk", consoleBaseUrl })),
            /consoleBaseUrl/,
          );
          assert.equal(calls.length, 0);
        },
      );
    }
    for (const [consoleBaseUrl, expected] of [
      ["https://console.spurvik.com/", `${CONSOLE}/api/v1/sandbox/scan?url=stepnetwork.dk`],
      ["", `${CONSOLE}/api/v1/sandbox/scan?url=stepnetwork.dk`],
      ["http://localhost:4010/", "http://localhost:4010/api/v1/sandbox/scan?url=stepnetwork.dk"],
      ["http://127.0.0.1:4010", "http://127.0.0.1:4010/api/v1/sandbox/scan?url=stepnetwork.dk"],
    ]) {
      await withFetch(
        async () => json(LIVE_SCAN),
        async (calls) => {
          const [out] = await node.execute.call(scanCtx({ domainOrUrl: "stepnetwork.dk", consoleBaseUrl }));
          assert.equal(calls[0].url, expected);
          assert.equal(out[0].json.reportUrl, `${CONSOLE}/report?domain=stepnetwork.dk`);
        },
      );
    }
  });
});
