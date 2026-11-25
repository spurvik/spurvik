import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { SpurvikEuAiActGuard, SpurvikN8nNodeDescription } from "../dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js";
import { SpurvikApi } from "../dist/credentials/SpurvikApi.credentials.js";
import { batchScanSpurvikDomains, scanSpurvikDomain } from "../dist/scan-domain.js";
import * as packageIndex from "../dist/index.js";

// First-party User-Agent on every console request; the version comes from package.json.
const USER_AGENT = `n8n-nodes-spurvik/${createRequire(import.meta.url)("../package.json").version}`;

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
      const consoleCalls = calls.filter((call) => call.url.startsWith("https://console.spurvik.com/api/v1/"));
      assert.deepEqual(
        consoleCalls.map((call) => new URL(call.url).pathname),
        ["/api/v1/disclosure", "/api/v1/telemetry", "/api/v1/hitl"],
      );
      for (const call of consoleCalls) {
        assert.deepEqual(call.headers, {
          authorization: `Bearer ${liveKey}`,
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": USER_AGENT,
        });
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
    "widgetDisclosureClass",
    "art50NoticeDetected",
    "badgeSnippet",
    "reportUrl",
    "sandboxUrl",
    "portfolioUrl",
    "statusShieldUrl",
    "statusShieldMarkdown",
    "reportMarkdownUrl",
    "c2paStatusShieldUrl",
    "trustCenterCardUrl",
    "trustWidgetScript",
    "aiActManifestUrl",
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
      portfolioUrl: `${CONSOLE}/portfolio`,
      statusShieldUrl: `${CONSOLE}/api/v1/badge/status.svg?domain=${encoded}`,
      statusShieldMarkdown: `[![EU AI Act Art. 50](${CONSOLE}/api/v1/badge/status.svg?domain=${encoded})](${CONSOLE}/report?domain=${encoded})`,
      reportMarkdownUrl: `${CONSOLE}/api/v1/report/markdown?domain=${encoded}&format=raw`,
      c2paStatusShieldUrl: `${CONSOLE}/api/v1/c2pa/status.svg?domain=${encoded}`,
      trustCenterCardUrl: `${CONSOLE}/api/v1/badge/card.svg?domain=${encoded}`,
      trustWidgetScript: `<script src="https://spurvik.com/trust-widget.js" data-domain="${host}" defer></script>`,
      aiActManifestUrl: `${CONSOLE}/api/v1/badge/ai-act.json?domain=${encoded}`,
      agencyCalculatorUrl: "https://spurvik.com/eu-ai-act-for-agencies",
      upgradeUrls: {
        freeApiKey10sEur0: `${CONSOLE}/signup?appUrl=${encoded}`,
        proWhiteLabelEur19: `${CONSOLE}/signup?plan=pro&appUrl=${encoded}`,
        proAnnual2MonthsFreeEur190: `${CONSOLE}/signup?plan=pro&interval=annual&appUrl=${encoded}`,
        teamAgencyEur79: `${CONSOLE}/signup?plan=team&appUrl=${encoded}`,
        teamAnnual2MonthsFreeEur790: `${CONSOLE}/signup?plan=team&interval=annual&appUrl=${encoded}`,
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
      widgetDisclosureClass: "none",
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

  it("keeps art50_disclosure as the default, the existing operations unchanged, and adds vendorQuestionnaireAnswers and gateSelfTest last", () => {
    const operation = SpurvikN8nNodeDescription.properties.find((property) => property.name === "operation");
    assert.equal(operation.default, "art50_disclosure");
    assert.deepEqual(
      operation.options.map((option) => [option.value, option.name]),
      [
        ["art50_disclosure", "Add an AI interaction notice"],
        ["art12_hmac_log", "Record an HMAC-SHA256 digest"],
        ["art14_ask_human", "Send an ask_human() approval request"],
        ["scanDomain", "Scan Live Domain (Art. 50 & Client Brief)"],
        ["batchScanDomains", "Batch Scan up to 10 Domains (Agency Roster)"],
        ["checkImageC2paUrl", "Check Image C2PA & CDN Strip (Art. 50(2))"],
        ["vendorQuestionnaireAnswers", "Answer Vendor Security Questionnaire (Art. 50/12/14 RFP)"],
        ["gateSelfTest", "Test Art. 14 Human Approval Blocking (6 Vectors)"],
        ["annexIvDraft", "Draft Annex IV Technical Documentation (Art. 11)"],
      ],
    );
    const domainOrUrl = SpurvikN8nNodeDescription.properties.find((property) => property.name === "domainOrUrl");
    assert.equal(domainOrUrl.type, "string");
    assert.equal(domainOrUrl.required, true);
    assert.deepEqual(domainOrUrl.displayOptions, { show: { operation: ["scanDomain"] } });
    const consoleBaseUrl = SpurvikN8nNodeDescription.properties.find((property) => property.name === "consoleBaseUrl");
    assert.equal(consoleBaseUrl.default, "https://console.spurvik.com");
    // Hidden only for pure local operations that make no network request.
    assert.deepEqual(consoleBaseUrl.displayOptions, {
      hide: { operation: ["vendorQuestionnaireAnswers", "gateSelfTest", "annexIvDraft"] },
    });
  });

  it("keeps spurvikApi required for the existing operations and not for scanDomain, batchScanDomains, checkImageC2paUrl, vendorQuestionnaireAnswers, gateSelfTest or annexIvDraft (n8n-workflow rules)", () => {
    const [credential] = SpurvikN8nNodeDescription.credentials;
    assert.equal(SpurvikN8nNodeDescription.credentials.length, 1);
    assert.equal(credential.name, "spurvikApi");
    assert.equal(credential.required, true);
    assert.deepEqual(credential.displayOptions, {
      hide: {
        operation: ["scanDomain", "batchScanDomains", "checkImageC2paUrl", "vendorQuestionnaireAnswers", "gateSelfTest", "annexIvDraft"],
      },
    });

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
    assert.deepEqual(missing({ operation: "batchScanDomains", domainsList: "folk.app, stepnetwork.dk" }), []);
    assert.deepEqual(missing({ operation: "checkImageC2paUrl", imageUrl: "https://example.com/hero.png" }), []);
    assert.deepEqual(missing({ operation: "vendorQuestionnaireAnswers" }), []);
    assert.deepEqual(missing({ operation: "gateSelfTest" }), []);
    assert.deepEqual(missing({ operation: "annexIvDraft" }), []);

    const resolved = (parameters) =>
      Object.keys(NodeHelpers.getNodeParameters(node.description.properties, parameters, true, false, nodeFor(parameters), node.description));
    assert.deepEqual(resolved({ operation: "scanDomain", domainOrUrl: "stepnetwork.dk" }), ["operation", "domainOrUrl", "consoleBaseUrl"]);
    assert.deepEqual(resolved({ operation: "batchScanDomains", domainsList: "folk.app" }), ["operation", "domainsList", "consoleBaseUrl"]);
    for (const operation of ["art50_disclosure", "art12_hmac_log", "art14_ask_human"]) {
      const keys = resolved({ operation });
      assert.ok(keys.includes("systemName"), operation);
      assert.ok(keys.includes("passThroughFields"), operation);
      assert.ok(keys.includes("consoleBaseUrl"), operation);
      assert.equal(keys.includes("domainOrUrl"), false, operation);
      assert.equal(keys.includes("domainsList"), false, operation);
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
          widgetDisclosureClass: "none",
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
        assert.deepEqual(init.headers, { accept: "application/json", "user-agent": USER_AGENT });
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
        // AbortSignal.timeout uses an unref'd timer. A real hanging fetch keeps the event loop alive
        // through its socket; this mock holds a ref'd timer instead, or node:test cancels the suite.
        fetchImpl: (_url, init) =>
          new Promise((_resolve, reject) => {
            const keepAlive = setTimeout(() => reject(new Error("mock fetch was never aborted")), 10_000);
            init.signal.addEventListener("abort", () => {
              clearTimeout(keepAlive);
              reject(init.signal.reason);
            });
          }),
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
          assert.equal(out[0].json.portfolioUrl, `${CONSOLE}/portfolio`);
          assert.ok(out[0].json.statusShieldMarkdown.startsWith(`[![EU AI Act Art. 50](${CONSOLE}/api/v1/badge/status.svg?`));
        },
      );
    }
  });

  it("adds portfolioUrl, the status shield, and appUrl on every upgrade link (live and offline)", async () => {
    for (const impl of [async () => json(LIVE_SCAN), async () => new Response("down", { status: 503 })]) {
      await withFetch(impl, async () => {
        const [out] = await node.execute.call(scanCtx({ domainOrUrl: "https://Shop.Example.co.uk/basket" }));
        const result = out[0].json;
        const host = "shop.example.co.uk";
        assert.equal(result.portfolioUrl, "https://console.spurvik.com/portfolio");
        assert.equal(result.statusShieldUrl, `https://console.spurvik.com/api/v1/badge/status.svg?domain=${host}`);
        assert.equal(
          result.statusShieldMarkdown,
          `[![EU AI Act Art. 50](https://console.spurvik.com/api/v1/badge/status.svg?domain=${host})](https://console.spurvik.com/report?domain=${host})`,
        );
        assert.deepEqual(Object.keys(result.upgradeUrls), [
          "freeApiKey10sEur0",
          "proWhiteLabelEur19",
          "proAnnual2MonthsFreeEur190",
          "teamAgencyEur79",
          "teamAnnual2MonthsFreeEur790",
          "doneForYou24hEur199",
        ]);
        for (const [key, link] of Object.entries(result.upgradeUrls)) {
          assert.ok(link.endsWith(`appUrl=${encodeURIComponent(host)}`), key);
          assert.equal(new URL(link).searchParams.get("appUrl"), host, key);
        }
        assert.deepEqual(Object.keys(result), OUTPUT_KEYS);
      });
    }
  });

  it("uses upstream htmlLocale on generic TLDs while preserving explicit EU ccTLDs and OUTPUT_KEYS", async () => {
    await withFetch(async () => json({ ok: true, scan: { ...LIVE_SCAN.scan, domain: "charlie-paris.com", htmlLocale: "fr" } }), async () => {
      const [out] = await node.execute.call(scanCtx({ domainOrUrl: "charlie-paris.com" }));
      assert.ok(out[0].json.badgeSnippet.includes('data-locale="fr"'));
      assert.deepEqual(Object.keys(out[0].json), OUTPUT_KEYS);
    });
    await withFetch(async () => json({ ok: true, scan: { ...LIVE_SCAN.scan, domain: "stepnetwork.dk", htmlLocale: "fr" } }), async () => {
      const [out] = await node.execute.call(scanCtx({ domainOrUrl: "stepnetwork.dk" }));
      assert.ok(out[0].json.badgeSnippet.includes('data-locale="da"'));
    });
  });

  it("maps detectedPlatforms to 1-click platformInstallerUrls when present and omits them when empty", async () => {
    await withFetch(
      async () =>
        json({
          ok: true,
          scan: {
            ...LIVE_SCAN.scan,
            domain: "charlie-paris.com",
            measured: true,
            detectedWidgets: ["Gorgias"],
            detectedPlatforms: ["Shopify", "Google Tag Manager", "WordPress", "Framer", "Webflow", "Next.js"],
            htmlLocale: "fr",
            heroImageUrl: "https://cdn.shopify.com/s/files/1/0001/hero.jpg",
          },
        }),
      async () => {
        const [out] = await node.execute.call(scanCtx({ domainOrUrl: "charlie-paris.com" }));
        const row = out[0].json;
        assert.deepEqual(row.detectedPlatforms, [
          "Shopify",
          "Google Tag Manager",
          "WordPress",
          "Framer",
          "Webflow",
          "Next.js",
        ]);
        assert.deepEqual(row.platformInstallerUrls, {
          shopifyLiquid: "https://spurvik.com/r/spurvik-shopify-art50.liquid",
          gtmContainerJson: "https://spurvik.com/r/spurvik-gtm-art50-container.json",
          wordpressPluginZip: "https://spurvik.com/r/spurvik-eu-ai-act-wp.zip",
          framerComponentTsx: "https://spurvik.com/r/spurvik-framer-badge.tsx",
          webflowGuide:
            "https://spurvik.com/fr/wordpress-elementor-webflow-plugin-reglement-ia-article-50?domain=charlie-paris.com",
          nextjsShadcnRegistry: "https://spurvik.com/r/article-50-badge.json",
        });
        assert.equal(row.widgetDisclosureClass, "dual_use_helpdesk");
        assert.equal(row.heroImageProxy.name, "Shopify CDN (/cdn/shop/)");
        assert.equal(
          row.heroImageProxy.c2paCheckUrl,
          "https://console.spurvik.com/c2pa?domain=charlie-paris.com&locale=fr&url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2F1%2F0001%2Fhero.jpg",
        );
      },
    );
    await withFetch(
      async () =>
        json({
          ok: true,
          scan: { ...LIVE_SCAN.scan, domain: "folk.app", measured: true, detectedWidgets: ["Intercom Fin"] },
        }),
      async () => {
        const [out] = await node.execute.call(scanCtx({ domainOrUrl: "folk.app" }));
        assert.equal(out[0].json.widgetDisclosureClass, "confirmed_ai");
      },
    );
  });

  describe("batchScanDomains (zero-key Batch Scan, agency roster)", () => {
    const BATCH_KEYS = [
      "totalDomains",
      "gapsFound",
      "results",
      "portfolioUrl",
      "prefilledPortfolioUrl",
      "agencyCalculatorUrl",
      "upgradeUrls",
    ];
    const BATCH_UPGRADES = {
      freeApiKey10sEur0: `${CONSOLE}/signup`,
      proWhiteLabelEur19: `${CONSOLE}/signup?plan=pro`,
      proAnnual2MonthsFreeEur190: `${CONSOLE}/signup?plan=pro&interval=annual`,
      teamAgencyEur79: `${CONSOLE}/signup?plan=team`,
      teamAnnual2MonthsFreeEur790: `${CONSOLE}/signup?plan=team&interval=annual`,
      doneForYou24hEur199: `${CONSOLE}/signup?plan=concierge`,
    };

    function batchCtx(params, items = [{ json: { promptText: PROMPT, ticketId: "T-88" } }]) {
      return scanCtx({ operation: "batchScanDomains", ...params }, items);
    }

    function scanFor(host, { widgets = [], sdks = [], notice = false, reachable = true, httpStatus = null } = {}) {
      return {
        ok: true,
        scan: {
          domain: host,
          reachable,
          measured: reachable && httpStatus === null,
          reason: null,
          httpStatus,
          detectedWidgets: widgets,
          detectedSdks: sdks,
          markers: { art50_1_disclosure: notice, art50_2_provenance: false, art50_4_synthetic: false, art12_telemetry: false },
        },
      };
    }

    const hostOf = (url) => new URL(url).searchParams.get("url");

    it("describes domainsList for batchScanDomains only and hides every non-scan field", () => {
      const byName = (name) => SpurvikN8nNodeDescription.properties.find((property) => property.name === name);
      const domainsList = byName("domainsList");
      assert.equal(domainsList.type, "string");
      assert.deepEqual(domainsList.typeOptions, { rows: 3 });
      assert.equal(domainsList.placeholder, "folk.app, stepnetwork.dk");
      assert.equal(domainsList.required, true);
      assert.deepEqual(domainsList.displayOptions, { show: { operation: ["batchScanDomains"] } });
      for (const name of ["systemName", "passThroughFields"]) {
        assert.deepEqual(
          byName(name).displayOptions,
          {
            hide: {
              operation: ["scanDomain", "batchScanDomains", "checkImageC2paUrl", "vendorQuestionnaireAnswers", "gateSelfTest", "annexIvDraft"],
            },
          },
          name,
        );
      }
      const shownFor = (operation) =>
        SpurvikN8nNodeDescription.properties
          .filter((property) => {
            const show = property.displayOptions?.show;
            const hide = property.displayOptions?.hide;
            const params = { operation, channel: "jira" };
            if (show && !Object.entries(show).every(([key, allowed]) => allowed.includes(params[key]))) return false;
            if (hide && Object.entries(hide).some(([key, hidden]) => hidden.includes(params[key]))) return false;
            return true;
          })
          .map((property) => property.name);
      assert.deepEqual(shownFor("batchScanDomains"), ["operation", "domainsList", "consoleBaseUrl"]);
      assert.deepEqual(shownFor("scanDomain"), ["operation", "domainOrUrl", "consoleBaseUrl"]);
    });

    it("exports batchScanSpurvikDomains from the package index", () => {
      assert.equal(packageIndex.batchScanSpurvikDomains, batchScanSpurvikDomains);
      assert.equal(typeof packageIndex.scanSpurvikDomain, "function");
    });

    it("scans a comma, space and newline list with no credential, dedupes, keeps order, and counts gaps", async () => {
      await withFetch(
        async (url) => {
          const host = hostOf(url);
          if (host === "folk.app") return json(scanFor(host, { widgets: ["Intercom"] }));
          if (host === "trengo.com") return json(scanFor(host, { widgets: ["Trengo"], notice: true }));
          if (host === "stepnetwork.dk") return json(scanFor(host));
          return json(scanFor(host, { widgets: ["Drift"] }));
        },
        async (calls) => {
          const context = batchCtx({
            domainsList: " folk.app,https://Trengo.com/pricing\nstepnetwork.dk  FOLK.APP,, http://www.example.org/x ",
            passThroughFields: "ticketId,promptText",
          });
          const [out] = await node.execute.call(context);
          assert.equal(context.credentialCalls, 0);
          assert.equal(out.length, 1);
          const batch = out[0].json;
          assert.deepEqual(Object.keys(batch), BATCH_KEYS);
          assert.equal(batch.totalDomains, 4);
          assert.equal(batch.gapsFound, 2);
          assert.deepEqual(
            batch.results.map((row) => row.domain),
            ["folk.app", "trengo.com", "stepnetwork.dk", "www.example.org"],
          );
          assert.deepEqual(
            calls.map((call) => hostOf(call.url)).sort(),
            ["folk.app", "stepnetwork.dk", "trengo.com", "www.example.org"],
          );
          assert.equal(batch.portfolioUrl, `${CONSOLE}/portfolio`);
          assert.equal(batch.agencyCalculatorUrl, "https://spurvik.com/eu-ai-act-for-agencies");
          assert.deepEqual(batch.upgradeUrls, BATCH_UPGRADES);
          for (const row of batch.results) {
            assert.deepEqual(Object.keys(row), OUTPUT_KEYS);
            assert.deepEqual({ ...row, ...links(row.domain) }, row, row.domain);
            assert.equal(row.badgeSnippet, badge(row.domain, row.domain.endsWith(".dk") ? "da" : "en"));
          }
          assert.equal(batch.results[0].scanStatus, "measured");
          for (const call of calls) {
            assert.equal(call.url, `${CONSOLE}/api/v1/sandbox/scan?url=${hostOf(call.url)}`);
            assert.equal(call.init.method, "GET");
            assert.equal(call.init.redirect, "error");
            assert.deepEqual(call.init.headers, { accept: "application/json", "user-agent": USER_AGENT });
            assert.equal(call.init.body, undefined);
          }
          const body = JSON.stringify(out);
          assert.equal(body.includes(PROMPT), false);
          assert.equal(body.includes("T-88"), false);
        },
      );
    });

    it("accepts an array of strings from an n8n expression", async () => {
      await withFetch(
        async (url) => json(scanFor(hostOf(url))),
        async (calls) => {
          const [out] = await node.execute.call(batchCtx({ domainsList: ["  folk.app ", "", "stepnetwork.dk"] }));
          assert.deepEqual(out[0].json.results.map((row) => row.domain), ["folk.app", "stepnetwork.dk"]);
          assert.equal(out[0].json.totalDomains, 2);
          assert.equal(out[0].json.gapsFound, 0);
          assert.equal(calls.length, 2);
        },
      );
    });

    it("counts a gap only for a reachable host with a widget and no Art. 50 notice", async () => {
      const cases = {
        "gap.example.com": json(scanFor("gap.example.com", { widgets: ["Intercom"] })),
        "noticed.example.com": json(scanFor("noticed.example.com", { widgets: ["Intercom"], notice: true })),
        "quiet.example.com": json(scanFor("quiet.example.com")),
        "sdk-only.example.com": json(scanFor("sdk-only.example.com", { sdks: ["openai"] })),
        "down.example.com": json(scanFor("down.example.com", { widgets: ["Intercom"], reachable: false })),
        "error-page.example.com": json(scanFor("error-page.example.com", { widgets: ["Intercom"], httpStatus: 403 })),
        "offline.example.com": new Response("SECRET_BODY_MARKER", { status: 502 }),
      };
      await withFetch(
        async (url) => cases[hostOf(url)],
        async () => {
          const [out] = await node.execute.call(batchCtx({ domainsList: Object.keys(cases).join("\n") }));
          const batch = out[0].json;
          assert.equal(batch.totalDomains, 7);
          assert.equal(batch.gapsFound, 1);
          const byHost = Object.fromEntries(batch.results.map((row) => [row.domain, row]));
          assert.deepEqual(byHost["offline.example.com"], offlineOutput("offline.example.com", "en", "upstream_http_502"));
          assert.equal(byHost["down.example.com"].scanStatus, "unreachable");
          assert.equal(byHost["error-page.example.com"].scanStatus, "not_measured");
          assert.equal(JSON.stringify(out).includes("SECRET_"), false);
        },
      );
    });

    it("keeps the batch going when hosts fail, and never throws for upstream trouble", async () => {
      await withFetch(
        async (url) => {
          const host = hostOf(url);
          if (host === "a.example.com") throw new TypeError("fetch failed SECRET_ERROR_MARKER");
          if (host === "b.example.com") throw new DOMException("SECRET_ERROR_MARKER", "TimeoutError");
          if (host === "c.example.com") return new Response("<html>SECRET_BODY_MARKER", { status: 200 });
          return json(scanFor(host, { widgets: ["Intercom"] }));
        },
        async (calls) => {
          const [out] = await node.execute.call(batchCtx({ domainsList: "a.example.com b.example.com c.example.com folk.app" }));
          const batch = out[0].json;
          assert.equal(calls.length, 4);
          assert.deepEqual(
            batch.results.map((row) => [row.domain, row.scanStatus, row.reason]),
            [
              ["a.example.com", "offline", "network_error"],
              ["b.example.com", "offline", "timeout"],
              ["c.example.com", "offline", "upstream_invalid_json"],
              ["folk.app", "measured", null],
            ],
          );
          assert.equal(batch.gapsFound, 1);
          assert.equal(JSON.stringify(out).includes("SECRET_"), false);
        },
      );
    });

    it("keeps at most 4 requests in flight for 10 domains", async () => {
      let inFlight = 0;
      let peak = 0;
      await withFetch(
        async (url) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight -= 1;
          return json(scanFor(hostOf(url), { widgets: ["Intercom"] }));
        },
        async (calls) => {
          const domains = Array.from({ length: 10 }, (_, n) => `site${n}.example.com`);
          const [out] = await node.execute.call(batchCtx({ domainsList: domains.join(",") }));
          assert.equal(calls.length, 10);
          assert.equal(peak, 4);
          assert.equal(out[0].json.totalDomains, 10);
          assert.equal(out[0].json.gapsFound, 10);
          assert.deepEqual(out[0].json.results.map((row) => row.domain), domains);
        },
      );
    });

    const countErrors = [
      ["an empty string", ""],
      ["only separators", " ,\n , "],
      ["an empty array", []],
      ["an array of blanks", ["", "   "]],
      ["11 entries", Array.from({ length: 11 }, (_, n) => `site${n}.example.com`).join(",")],
      ["11 entries that dedupe to 1", Array.from({ length: 11 }, () => "folk.app")],
      ["a number", 42],
      ["an object", { domains: ["folk.app"] }],
      ["null", null],
    ];
    for (const [label, domainsList] of countErrors) {
      it(`refuses ${label} with zero requests`, async () => {
        await withFetch(
          async () => json(LIVE_SCAN),
          async (calls) => {
            const context = batchCtx({ domainsList });
            await assert.rejects(() => node.execute.call(context), /^Error: Batch Scan needs 1 to 10 public domains/);
            assert.equal(calls.length, 0);
            assert.equal(context.credentialCalls, 0);
          },
        );
      });
    }

    const poisoned = [
      ["localhost", "folk.app, localhost, stepnetwork.dk", "Entry 2 was"],
      ["a private IPv4", "folk.app\n10.0.0.1", "Entry 2 was"],
      ["cloud metadata", "http://169.254.169.254/latest/meta-data stepnetwork.dk", "Entry 1 was"],
      ["an IPv6 literal", "folk.app,[::1]", "Entry 2 was"],
      ["an internal name", "folk.app nas.home.arpa printer.lan", "Entries 2, 3 were"],
      ["a user@host", "folk.app,user@example.com", "Entry 2 was"],
      ["a non-default port", "folk.app,example.com:8080", "Entry 2 was"],
      ["a non-http scheme", "folk.app,ftp://example.com", "Entry 2 was"],
      ["a non-string array item", ["folk.app", 7, "stepnetwork.dk"], "Entry 2 was"],
      ["the raw prompt", `folk.app,${PROMPT}`, "Entry 2 was"],
    ];
    for (const [label, domainsList, which] of poisoned) {
      it(`refuses the whole batch with zero requests when one entry is ${label}`, async () => {
        await withFetch(
          async () => json(LIVE_SCAN),
          async (calls) => {
            const context = batchCtx({ domainsList });
            await assert.rejects(() => node.execute.call(context), (error) => {
              assert.ok(error.message.startsWith(`Batch Scan scanned nothing: ${which} refused. Scan Live Domain `), error.message);
              // The refused entry is never echoed. (stepnetwork.dk is also the example in the standard message.)
              for (const entry of Array.isArray(domainsList) ? domainsList : domainsList.split(/[\s,]+/)) {
                if (typeof entry !== "string" || entry === "folk.app" || entry === "stepnetwork.dk") continue;
                if (entry.length > 9) assert.equal(error.message.includes(entry), false, entry);
              }
              assert.equal(error.message.includes(PROMPT), false);
              return true;
            });
            assert.equal(calls.length, 0);
            assert.equal(context.credentialCalls, 0);
          },
        );
      });
    }

    it("validates consoleBaseUrl before any request and keeps public links for a localhost base", async () => {
      await withFetch(
        async () => json(LIVE_SCAN),
        async (calls) => {
          await assert.rejects(
            () => node.execute.call(batchCtx({ domainsList: "folk.app,stepnetwork.dk", consoleBaseUrl: "http://console.spurvik.com" })),
            /consoleBaseUrl/,
          );
          assert.equal(calls.length, 0);
        },
      );
      await withFetch(
        async (url) => json(scanFor(hostOf(url))),
        async (calls) => {
          const [out] = await node.execute.call(
            batchCtx({ domainsList: "folk.app,stepnetwork.dk", consoleBaseUrl: "http://localhost:4010/" }),
          );
          assert.deepEqual(
            calls.map((call) => call.url),
            [
              "http://localhost:4010/api/v1/sandbox/scan?url=folk.app",
              "http://localhost:4010/api/v1/sandbox/scan?url=stepnetwork.dk",
            ],
          );
          assert.equal(JSON.stringify(out).includes("localhost"), false);
          assert.equal(out[0].json.portfolioUrl, `${CONSOLE}/portfolio`);
        },
      );
    });

    it("returns one batch per incoming item and never reads the credential", async () => {
      await withFetch(
        async (url) => json(scanFor(hostOf(url))),
        async (calls) => {
          const context = batchCtx({ domainsList: "folk.app" }, [
            { json: { promptText: PROMPT } },
            { json: { chatInput: PROMPT, ticketId: "T-1" } },
          ]);
          const [out] = await node.execute.call(context);
          assert.equal(out.length, 2);
          assert.equal(calls.length, 2);
          assert.equal(context.credentialCalls, 0);
          for (const entry of out) assert.deepEqual(Object.keys(entry.json), BATCH_KEYS);
          assert.equal(JSON.stringify(out).includes(PROMPT), false);
        },
      );
    });

    it("still reads the credential when another item in the same run needs it", async () => {
      const items = [{ json: { promptText: PROMPT } }, { json: { promptText: PROMPT } }];
      const context = ctx({ operation: "batchScanDomains", domainsList: "folk.app" }, undefined, items);
      const operations = ["batchScanDomains", "art12_hmac_log"];
      const getNodeParameter = context.getNodeParameter;
      context.getNodeParameter = (name, index, fallback) =>
        name === "operation" ? operations[index] : getNodeParameter(name, index, fallback);
      await withFetch(
        async () => json(LIVE_SCAN),
        async (calls) => {
          await assert.rejects(() => node.execute.call(context), /No credentials of type spurvikApi/);
          assert.equal(calls.length, 0);
        },
      );
    });

    // Isolated: injects fetchImpl (globalThis.fetch is untouched) and every mock request holds a ref'd timer that
    // the abort clears. AbortSignal.timeout alone is unref'd, and on Node 22 an idle event loop makes node:test
    // cancel the pending test and its siblings.
    it("aborts hanging hosts through AbortSignal.timeout and returns them offline", async () => {
      const started = Date.now();
      const timers = new Set();
      const batch = await batchScanSpurvikDomains(
        { domainsList: "folk.app, stepnetwork.dk" },
        {
          timeoutMs: 40,
          fetchImpl: (_url, init) =>
            new Promise((_resolve, reject) => {
              const keepAlive = setTimeout(() => reject(new Error("mock fetch was never aborted")), 10_000);
              timers.add(keepAlive);
              init.signal.addEventListener(
                "abort",
                () => {
                  clearTimeout(keepAlive);
                  timers.delete(keepAlive);
                  reject(init.signal.reason);
                },
                { once: true },
              );
            }),
        },
      );
      assert.equal(timers.size, 0);
      assert.deepEqual(batch.results, [
        offlineOutput("folk.app", "en", "timeout"),
        offlineOutput("stepnetwork.dk", "da", "timeout"),
      ]);
      assert.equal(batch.gapsFound, 0);
      assert.ok(Date.now() - started < 5000);
    });
  });
});

describe("upgradeUrls on art50_disclosure, art12_hmac_log and art14_ask_human (1.0.8)", () => {
  const node = new SpurvikEuAiActGuard();
  const CONSOLE = "https://console.spurvik.com";
  const UPGRADE_KEYS = ["freeApiKey10sEur0", "proWhiteLabelEur19", "teamAgencyEur79", "doneForYou24hEur199"];
  const linksOn = (base) => ({
    freeApiKey10sEur0: `${base}/signup`,
    proWhiteLabelEur19: `${base}/signup?plan=pro`,
    teamAgencyEur79: `${base}/signup?plan=team`,
    doneForYou24hEur199: `${base}/signup?plan=concierge`,
  });
  const liveKey = `${"spurvik"}_live_${"u".repeat(36)}`;
  const PARAMS = {
    art50_disclosure: { operation: "art50_disclosure", systemName: "Support bot", outputField: "outputText" },
    art12_hmac_log: { operation: "art12_hmac_log", systemName: "Support bot", inputField: "promptText" },
    art14_ask_human: {
      operation: "art14_ask_human",
      systemName: "Refund bot",
      channel: "slack",
      callbackBaseUrl: "https://approvals.example/hitl/callback",
      actionName: "stripe.refunds.create",
      actionSummary: "Refund order 4821",
    },
  };
  const credentialsFor = (extra = {}) => ({
    signingSecret: SECRET,
    slackWebhookUrl: "https://hooks.slack.test/services/T/B/X",
    ...extra,
  });
  const ITEM = [{ json: { promptText: PROMPT, outputText: "Invoice updated." } }];

  async function withFetchStub(run) {
    const original = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url) => {
      const target = String(url);
      calls.push(target);
      if (target.endsWith("/api/v1/disclosure")) return new Response(JSON.stringify({ data: { sessionId: "n8n_sess_9" } }), { status: 201 });
      if (target.endsWith("/api/v1/telemetry")) return new Response(JSON.stringify({ data: { inserted: 1 } }), { status: 200 });
      if (target.endsWith("/api/v1/hitl")) return new Response(JSON.stringify({ data: { id: "hitl_row_9" } }), { status: 201 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    try {
      return await run(calls);
    } finally {
      globalThis.fetch = original;
    }
  }

  for (const operation of Object.keys(PARAMS)) {
    it(`${operation}: sets the four signup links on the default console when no consoleApiKey is set`, async () => {
      await withFetchStub(async (calls) => {
        const [out] = await node.execute.call(ctx(PARAMS[operation], credentialsFor(), ITEM));
        const result = out[0].json.spurvik;
        assert.equal(result.consoleSync, null);
        assert.deepEqual(result.upgradeUrls, linksOn(CONSOLE));
        assert.deepEqual(Object.keys(result.upgradeUrls), UPGRADE_KEYS);
        assert.equal(Object.keys(result).at(-1), "upgradeUrls");
        assert.equal(calls.some((url) => url.startsWith(CONSOLE)), false, "no console request without a key");
        assert.equal(JSON.stringify(out).includes(PROMPT), false);
      });
    });

    it(`${operation}: uses the configured consoleBaseUrl for the links`, async () => {
      await withFetchStub(async () => {
        const [out] = await node.execute.call(
          ctx({ ...PARAMS[operation], consoleBaseUrl: "https://console.example.eu/eu/" }, credentialsFor(), ITEM),
        );
        assert.deepEqual(out[0].json.spurvik.upgradeUrls, linksOn("https://console.example.eu/eu"));
      });
    });

    it(`${operation}: sets upgradeUrls to null once a consoleApiKey syncs`, async () => {
      await withFetchStub(async (calls) => {
        const [out] = await node.execute.call(ctx(PARAMS[operation], credentialsFor({ consoleApiKey: liveKey }), ITEM));
        const result = out[0].json.spurvik;
        assert.equal(result.consoleSync.synced, true);
        assert.equal(result.upgradeUrls, null);
        assert.ok(calls.some((url) => url.startsWith(`${CONSOLE}/api/v1/`)));
      });
    });
  }

  it("falls back to https://console.spurvik.com for an empty or unsafe consoleBaseUrl without throwing", async () => {
    for (const consoleBaseUrl of [
      "",
      "   ",
      "not a url",
      "http://console.example.eu",
      "javascript:alert(1)",
      "https://user:pw@console.example.eu",
      "https://console.example.eu/?next=evil",
      "https://console.example.eu/#frag",
      "ftp://console.example.eu",
    ]) {
      await withFetchStub(async () => {
        const [out] = await node.execute.call(ctx({ ...PARAMS.art12_hmac_log, consoleBaseUrl }, credentialsFor(), ITEM));
        assert.deepEqual(out[0].json.spurvik.upgradeUrls, linksOn(CONSOLE), JSON.stringify(consoleBaseUrl));
      });
    }
  });

  it("allows http://localhost only, for local testing", async () => {
    await withFetchStub(async () => {
      const [out] = await node.execute.call(ctx({ ...PARAMS.art12_hmac_log, consoleBaseUrl: "http://localhost:3000" }, credentialsFor(), ITEM));
      assert.deepEqual(out[0].json.spurvik.upgradeUrls, linksOn("http://localhost:3000"));
    });
  });

  it("exports workflowUpgradeUrls from the package index", () => {
    assert.equal(typeof packageIndex.workflowUpgradeUrls, "function");
    assert.deepEqual(packageIndex.workflowUpgradeUrls(undefined), linksOn(CONSOLE));
    assert.deepEqual(packageIndex.workflowUpgradeUrls(42), linksOn(CONSOLE));
  });

  it("executeSpurvikWorkflowStep returns upgradeUrls directly too", async () => {
    const result = await packageIndex.executeSpurvikWorkflowStep(
      { operation: "art50_disclosure", hmacSecret: SECRET, systemName: "Bot", outputText: "Hi." },
      { fetchImpl: async () => assert.fail("no request without a console key") },
    );
    assert.deepEqual(result.upgradeUrls, linksOn(CONSOLE));
  });

  it("art14_ask_human with a Free-plan consoleApiKey (HTTP 402 on /api/v1/hitl) keeps Slack approval and returns synced:false + upgradeUrls instead of throwing", async () => {
    const liveKey = "spurvik_live_" + "k".repeat(36);
    const result = await packageIndex.executeSpurvikWorkflowStep(
      {
        operation: "art14_ask_human",
        hmacSecret: SECRET,
        systemName: "Bot",
        actionName: "stripe.refund",
        actionSummary: "Approve refund",
        callbackBaseUrl: "https://app.example.eu/api/callback",
        channel: { type: "slack", webhookUrl: "https://hooks.slack.com/services/T0/B0/X0" },
        consoleApiKey: liveKey,
        consoleBaseUrl: "https://console.spurvik.com",
      },
      {
        fetchImpl: async (url) => {
          if (String(url).includes("/api/v1/hitl")) {
            return new Response(
              JSON.stringify({ error: { code: "plan_required", requiredPlan: "pro" } }),
              { status: 402, headers: { "content-type": "application/json" } },
            );
          }
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        },
      },
    );
    assert.equal(result.art14Gate.status, "pending_human_approval");
    assert.equal(result.consoleSync?.httpStatus, 402);
    assert.equal(result.consoleSync?.synced, false);
    assert.equal(result.consoleSync?.planRequired, "pro");
    assert.equal(result.upgradeUrls?.proWhiteLabelEur19, "https://console.spurvik.com/signup?plan=pro");
  });
});
