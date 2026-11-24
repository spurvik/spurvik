import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { SpurvikEuAiActGuard, SpurvikN8nNodeDescription } from "../dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js";
import {
  questionnaireHostname,
  SPURVIK_QUESTIONNAIRE_PLANS,
  SPURVIK_QUESTIONNAIRE_PROVIDERS,
  SPURVIK_VENDOR_QUESTIONNAIRE_URL,
  spurvikVendorQuestionnaireAnswers,
} from "../dist/vendor-questionnaire.js";
import * as packageIndex from "../dist/index.js";

// The questionnaire is pure. globalThis.fetch is replaced by a spy that fails the test if anything calls it.

const require = createRequire(import.meta.url);
const PROMPT = "RAW_PROMPT_SHOULD_NOT_LEAK_RFP";
const CONSOLE = "https://console.spurvik.com";
const INTERACTIVE = "https://spurvik.com/eu-ai-act-vendor-security-questionnaire";
const OUTPUT_KEYS = [
  "plan",
  "provider",
  "hasHighRiskActions",
  "generatesMedia",
  "domain",
  "markdown",
  "interactiveUrl",
  "reportUrl",
  "upgradeUrls",
];
const PLAIN_UPGRADES = {
  freeApiKey10sEur0: `${CONSOLE}/signup`,
  proWhiteLabelEur19: `${CONSOLE}/signup?plan=pro`,
  teamAgencyEur79: `${CONSOLE}/signup?plan=team`,
  doneForYou24hEur199: `${CONSOLE}/signup?plan=concierge`,
};
const QUESTION_HEADINGS = [
  "## Q1: Art. 50(1) & 2 Dec 2026 Art. 50(2) Transparency & Provenance",
  "## Q2: Art. 12 Cryptographic Event Logging",
  "## Q3: GDPR Art. 5(1)(c) Zero-Prompt Minimisation & EU Frankfurt Residency",
  "## Q4: Art. 14 Deterministic Human Oversight Gates",
  "## Q5: Audit Retention, DPO Evidence & Annex IV Documentation",
];
const QUESTIONNAIRE_FIELDS = [
  "questionnairePlan",
  "questionnaireProvider",
  "hasHighRiskActions",
  "generatesMedia",
  "questionnaireDomain",
  "questionnaireLocale",
];
const PRIVATE_DOMAINS = [
  "http://127.0.0.1",
  "10.0.0.8",
  "192.168.1.20",
  "http://[::1]/",
  "[fd00::1]",
  "2130706433",
  "0x7f000001",
  "localhost",
  "http://localhost:3000",
  "intranet.corp",
  "printer.local",
  "db.internal",
  "nas.home.arpa",
  "router.lan",
  "https://user:pw@acme.eu",
  "acme.eu:8443",
  "ftp://acme.eu",
  "javascript:alert(1)",
  "acme",
  "bücher.de",
  "acme.example",
  "foo.test",
  "<script>alert(1)</script>.eu",
  `${"a".repeat(64)}.eu`,
];

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

/** n8n context with no spurvikApi credential. Counts getCredentials calls. */
function rfpCtx(params = {}, items = [{ json: { promptText: PROMPT, ticketId: "T-RFP" } }], operations = null) {
  const all = { operation: "vendorQuestionnaireAnswers", ...params };
  const context = {
    credentialCalls: 0,
    getInputData: () => items,
    getNodeParameter: (name, index, fallback) => {
      const resolvedParams = operations ? { ...all, operation: operations[index] } : all;
      if (name === "operation") return resolvedParams.operation;
      const property = byName(name);
      if (property && !parameterShown(property, resolvedParams)) return property.default;
      if (Object.prototype.hasOwnProperty.call(resolvedParams, name)) return resolvedParams[name];
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

/** Runs `run` with a fetch spy. Returns the spy's call list. */
async function withNoNetwork(run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    throw new Error("network is not allowed in this test");
  };
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
  return calls;
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

function allCombinations() {
  const out = [];
  for (const plan of SPURVIK_QUESTIONNAIRE_PLANS) {
    for (const provider of SPURVIK_QUESTIONNAIRE_PROVIDERS) {
      for (const hasHighRiskActions of [true, false]) {
        for (const generatesMedia of [true, false]) {
          for (const domain of ["", "acme.eu", "http://127.0.0.1"]) {
            out.push({ plan, provider, hasHighRiskActions, generatesMedia, domain });
          }
        }
      }
    }
  }
  return out;
}

describe("vendorQuestionnaireAnswers descriptor (zero-credential operation #7)", () => {
  const node = new SpurvikEuAiActGuard();

  it("adds the operation as #7 and keeps art50_disclosure as the default", () => {
    const operation = byName("operation");
    assert.equal(operation.default, "art50_disclosure");
    assert.equal(operation.options.length, 8);
    const option = operation.options[6];
    assert.equal(option.value, "vendorQuestionnaireAnswers");
    assert.equal(option.name, "Answer Vendor Security Questionnaire (Art. 50/12/14 RFP)");
    assert.match(option.description, /no request, no credential or API key/);
  });

  it("describes the five questionnaire parameters, shown only for vendorQuestionnaireAnswers", () => {
    const plan = byName("questionnairePlan");
    assert.equal(plan.type, "options");
    assert.equal(plan.default, "pro");
    assert.deepEqual(plan.options.map((option) => option.value), ["free", "pro", "team", "concierge"]);
    assert.deepEqual(plan.options.map((option) => option.name), [
      "Free (€0, 10,000 events/mo, 30 days)",
      "Pro (€19/mo, 250,000 events/mo, 90 days)",
      "Team (€79/mo, 2,000,000 events/mo, 12 months)",
      "Done-For-You 24h Setup (€199 once, incl. 1 yr Pro)",
    ]);

    const provider = byName("questionnaireProvider");
    assert.equal(provider.type, "options");
    assert.equal(provider.default, "openai");
    assert.deepEqual(provider.options.map((option) => option.value), [
      "openai",
      "anthropic",
      "google-genai",
      "vercel-ai-sdk",
      "langgraph",
      "openai-agents",
      "mastra",
      "python",
      "custom",
    ]);

    assert.equal(byName("hasHighRiskActions").type, "boolean");
    assert.equal(byName("hasHighRiskActions").default, true);
    assert.equal(byName("generatesMedia").type, "boolean");
    assert.equal(byName("generatesMedia").default, false);

    const domain = byName("questionnaireDomain");
    assert.equal(domain.type, "string");
    assert.equal(domain.default, "");
    assert.equal(domain.required, undefined);
    assert.equal(domain.placeholder, "acme.eu");
    assert.match(domain.description, /never sent anywhere/);

    const locale = byName("questionnaireLocale");
    assert.equal(locale.type, "options");
    assert.equal(locale.default, "en");
    assert.deepEqual(locale.options.map((option) => option.value), ["en", "de", "fr", "nl", "da", "sv", "es", "it"]);

    const de = spurvikVendorQuestionnaireAnswers({ plan: "team", provider: "python", domain: "personio.de", locale: "de" });
    assert.equal(de.interactiveUrl, "https://spurvik.com/de/ki-verordnung-sicherheitsfragebogen-lieferanten-dsb?domain=personio.de");
    assert.match(de.markdown, /EU-KI-Verordnung Sicherheitsfragebogen/);
    assert.match(de.upgradeUrls.proWhiteLabelEur19, /locale=de/);

    const sv = spurvikVendorQuestionnaireAnswers({ plan: "team", provider: "openai", domain: "nudiejeans.com", locale: "sv" });
    assert.equal(sv.interactiveUrl, "https://spurvik.com/sv/ai-forordningen-leverantorssakerhetsformular-dso?domain=nudiejeans.com");
    assert.match(sv.markdown, /Bilaga IV/);
    assert.match(sv.upgradeUrls.proWhiteLabelEur19, /locale=sv/);

    const es = spurvikVendorQuestionnaireAnswers({ plan: "team", provider: "anthropic", domain: "hawkersco.com", locale: "es" });
    assert.equal(es.interactiveUrl, "https://spurvik.com/es/cuestionario-seguridad-proveedor-reglamento-ia-dpd?domain=hawkersco.com");
    assert.match(es.markdown, /Anexo IV/);
    assert.match(es.upgradeUrls.proWhiteLabelEur19, /locale=es/);

    const it = spurvikVendorQuestionnaireAnswers({ plan: "team", provider: "python", domain: "velasca.com", locale: "it" });
    assert.equal(it.interactiveUrl, "https://spurvik.com/it/questionario-sicurezza-fornitori-regolamento-ia-dpo?domain=velasca.com");
    assert.match(it.markdown, /Allegato IV/);
    assert.match(it.upgradeUrls.proWhiteLabelEur19, /locale=it/);

    for (const name of QUESTIONNAIRE_FIELDS) {
      assert.deepEqual(byName(name).displayOptions, { show: { operation: ["vendorQuestionnaireAnswers"] } }, name);
    }
    const literal = JSON.stringify(SpurvikN8nNodeDescription);
    assert.equal(count(literal, "€49"), 0);
  });

  it("hides spurvikApi, systemName, passThroughFields and consoleBaseUrl, and shows only the questionnaire fields (n8n-workflow rules)", () => {
    const hide = { hide: { operation: ["scanDomain", "batchScanDomains", "checkImageC2paUrl", "vendorQuestionnaireAnswers", "gateSelfTest"] } };
    assert.deepEqual(SpurvikN8nNodeDescription.credentials[0].displayOptions, hide);
    assert.deepEqual(byName("systemName").displayOptions, hide);
    assert.deepEqual(byName("passThroughFields").displayOptions, hide);
    assert.deepEqual(byName("consoleBaseUrl").displayOptions, { hide: { operation: ["vendorQuestionnaireAnswers", "gateSelfTest"] } });

    const shownFor = (operation) =>
      SpurvikN8nNodeDescription.properties
        .filter((property) => {
          const show = property.displayOptions?.show;
          const hidden = property.displayOptions?.hide;
          const params = { operation, channel: "jira" };
          if (show && !Object.entries(show).every(([key, allowed]) => allowed.includes(params[key]))) return false;
          if (hidden && Object.entries(hidden).some(([key, values]) => values.includes(params[key]))) return false;
          return true;
        })
        .map((property) => property.name);
    assert.deepEqual(shownFor("vendorQuestionnaireAnswers"), ["operation", ...QUESTIONNAIRE_FIELDS]);
    for (const operation of ["art50_disclosure", "art12_hmac_log", "art14_ask_human", "scanDomain", "batchScanDomains", "checkImageC2paUrl"]) {
      const shown = shownFor(operation);
      for (const name of QUESTIONNAIRE_FIELDS) assert.equal(shown.includes(name), false, `${operation} shows ${name}`);
      assert.ok(shown.includes("consoleBaseUrl"), operation);
    }

    const { validateNodeCredentials, NodeHelpers } = require("n8n-workflow");
    const parameters = { operation: "vendorQuestionnaireAnswers", questionnairePlan: "team", questionnaireDomain: "acme.eu" };
    const n8nNode = {
      id: "1",
      name: "Spurvik RFP",
      type: "n8n-nodes-spurvik.spurvikEuAiActGuard",
      typeVersion: 1,
      position: [0, 0],
      parameters,
    };
    assert.deepEqual(validateNodeCredentials(n8nNode, node), []);
    const resolved = NodeHelpers.getNodeParameters(node.description.properties, parameters, true, false, n8nNode, node.description);
    assert.deepEqual(Object.keys(resolved), ["operation", ...QUESTIONNAIRE_FIELDS]);
    assert.equal(resolved.questionnairePlan, "team");
    assert.equal(resolved.questionnaireProvider, "openai");
    assert.equal(resolved.hasHighRiskActions, true);
    assert.equal(resolved.generatesMedia, false);
  });

  it("exports the questionnaire API from the package index", () => {
    assert.equal(packageIndex.spurvikVendorQuestionnaireAnswers, spurvikVendorQuestionnaireAnswers);
    assert.equal(packageIndex.questionnaireHostname, questionnaireHostname);
    assert.equal(packageIndex.SPURVIK_VENDOR_QUESTIONNAIRE_URL, INTERACTIVE);
    assert.deepEqual([...packageIndex.SPURVIK_QUESTIONNAIRE_PLANS], ["free", "pro", "team", "concierge"]);
    assert.equal(packageIndex.SPURVIK_QUESTIONNAIRE_PROVIDERS.length, 9);
    assert.equal(SPURVIK_VENDOR_QUESTIONNAIRE_URL, INTERACTIVE);
  });
});

describe("vendorQuestionnaireAnswers execute", () => {
  const node = new SpurvikEuAiActGuard();

  it("answers with the defaults, no credential, no request, and nothing from the incoming item", async () => {
    let out;
    const context = rfpCtx();
    const calls = await withNoNetwork(async () => {
      [out] = await node.execute.call(context);
    });
    assert.equal(calls.length, 0);
    assert.equal(context.credentialCalls, 0);
    assert.equal(out.length, 1);
    const result = out[0].json;
    assert.deepEqual(Object.keys(result), OUTPUT_KEYS);
    assert.equal(result.plan, "pro");
    assert.equal(result.provider, "openai");
    assert.equal(result.hasHighRiskActions, true);
    assert.equal(result.generatesMedia, false);
    assert.equal(result.domain, null);
    assert.equal(result.interactiveUrl, INTERACTIVE);
    assert.equal(result.reportUrl, null);
    assert.deepEqual(result.upgradeUrls, PLAIN_UPGRADES);
    assert.deepEqual(Object.keys(result.upgradeUrls), ["freeApiKey10sEur0", "proWhiteLabelEur19", "teamAgencyEur79", "doneForYou24hEur199"]);
    assert.equal(JSON.stringify(out).includes(PROMPT), false);
    assert.equal(JSON.stringify(out).includes("T-RFP"), false);
    assert.match(result.markdown, /^# EU AI Act vendor security questionnaire: answers for our product\n/);
    assert.ok(
      result.markdown.includes(
        "Spurvik plan: Pro (€19/mo or €190/yr) · Provider: OpenAI · Consequential agent actions: yes · Synthetic media: no",
      ),
    );
    assert.ok(result.markdown.includes("`withSpurvik(new OpenAI())`"));
    assert.ok(result.markdown.endsWith("Not legal advice._\n"));
  });

  it("returns the five questions in order, each with one question and one answer", () => {
    const { markdown } = spurvikVendorQuestionnaireAnswers();
    const positions = QUESTION_HEADINGS.map((heading) => markdown.indexOf(heading));
    assert.ok(positions.every((position) => position >= 0), JSON.stringify(positions));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
    assert.equal(count(markdown, "**Customer asks:**"), 5);
    assert.equal(count(markdown, "**Answer:**"), 5);
  });

  it("states the exact plan facts for free, pro, team and concierge", () => {
    const free = spurvikVendorQuestionnaireAnswers({ plan: "free" }).markdown;
    assert.ok(free.includes("Spurvik plan: Free (€0)"));
    assert.ok(free.includes("Our Spurvik Free plan covers 10,000 events per month."));
    assert.ok(free.includes("kept for 30 days"));
    assert.ok(free.includes('carries a small "Art. 50 · Spurvik" attribution link'));
    assert.ok(free.includes("`createMultiChannelApprovalRouter` (`spurvik/channels`)"));
    assert.equal(free.includes("`verifyHitlWebhook` (HMAC-SHA-256 over the raw body)"), false);
    assert.ok(free.includes("Evidence we can share with your DPO: the event record and receipt fields described in Q2, on request."));

    const pro = spurvikVendorQuestionnaireAnswers({ plan: "pro" }).markdown;
    assert.ok(pro.includes("Spurvik plan: Pro (€19/mo or €190/yr)"));
    assert.ok(pro.includes("250,000 events per month"));
    assert.ok(pro.includes("kept for 90 days"));
    assert.ok(pro.includes('white-labelled (`data-attribution="false"`)'));
    assert.ok(pro.includes("hosted approval queue (`requireHumanApproval(actionName, payload)` on the Spurvik client)"));
    assert.ok(pro.includes("`verifyHitlWebhook`"));
    assert.ok(pro.includes("a DPO engineering summary (`.md`) downloaded from the signed event log."));
    assert.equal(pro.includes("an Annex IV technical documentation draft (Art. 11)"), false);

    const team = spurvikVendorQuestionnaireAnswers({ plan: "team" }).markdown;
    assert.ok(team.includes("Spurvik plan: Team (€79/mo or €790/yr)"));
    assert.ok(team.includes("2,000,000 events per month"));
    assert.ok(team.includes("kept for 12 months"));
    assert.ok(team.includes("an Annex IV technical documentation draft (Art. 11), exported as PDF or Markdown"));
    assert.ok(team.includes("a webhook export of signed events into our own systems"));

    const concierge = spurvikVendorQuestionnaireAnswers({ plan: "concierge", generatesMedia: true }).markdown;
    assert.ok(concierge.includes("Spurvik plan: Done-For-You 24h Setup (€199 once, includes 1 full year of Pro (€190 value))"));
    assert.ok(concierge.includes("250,000 events per month"));
    assert.ok(concierge.includes("installed by a Spurvik engineer within 24 hours"));
    assert.ok(concierge.includes("signed DPO Readiness & C2PA Art. 50(2) provenance report"));

    for (const text of [free, pro, team, concierge]) {
      assert.ok(text.includes("| AI events per month | 10,000 | 250,000 | 2,000,000 | 250,000 (1 yr Pro) |"));
      assert.ok(text.includes("| Retention in Frankfurt (`fra1`) | 30 days | 90 days | 12 months | 90 days |"));
      assert.ok(text.includes("Annual: Pro €190/yr, Team €790/yr. Prices excl. VAT, B2B."));
    }
  });

  it("names the right wrapper and approval API per provider", () => {
    const text = (provider) => spurvikVendorQuestionnaireAnswers({ provider }).markdown;
    assert.ok(text("anthropic").includes("`withSpurvik(new Anthropic())`"));
    assert.ok(text("google-genai").includes("`withSpurvik(new GoogleGenAI())`"));
    assert.ok(text("vercel-ai-sdk").includes("`spurvikMiddleware` with `wrapLanguageModel`, from `spurvik/ai`"));
    assert.ok(text("langgraph").includes("`spurvikInterrupt` in the graph node, from `spurvik/langgraph`"));
    assert.ok(text("langgraph").includes("`withSpurvikLangGraph`"));
    assert.ok(text("openai-agents").includes("`createSpurvikNeedsApproval` on each tool and `resolveInterruptions`"));
    assert.ok(text("openai-agents").includes("`withSpurvikModelProvider`"));
    assert.ok(text("mastra").includes("`withSpurvikMastra`, from `spurvik/mastra`"));
    assert.ok(text("custom").includes("`withSpurvik` on the provider client"));
    assert.ok(text("openai").includes("Model inference runs with OpenAI under our own agreement"));
    assert.ok(text("langgraph").includes("Model inference runs with our model provider under our own agreement"));
  });

  it("uses the core field names and none of the names that do not exist", () => {
    for (const input of allCombinations()) {
      const { markdown } = spurvikVendorQuestionnaireAnswers(input);
      for (const name of ["`inputHash`", "`outputHash`", "`recordHash`", "`prevLogHash`"]) {
        assert.ok(markdown.includes(name), `${JSON.stringify(input)} misses ${name}`);
      }
      for (const wrong of ["inputHmac", "entryHash", "guardTool", "askHuman", "SSO", "€49", "unlimited seats"]) {
        assert.equal(markdown.includes(wrong), false, `${JSON.stringify(input)} says ${wrong}`);
      }
      assert.equal(count(markdown.toLowerCase(), "not legal advice"), 1, JSON.stringify(input));
    }
  });

  it("switches Q1 and Q4 on generatesMedia and hasHighRiskActions", () => {
    const media = spurvikVendorQuestionnaireAnswers({ generatesMedia: true }).markdown;
    assert.ok(media.includes("Synthetic media: yes"));
    assert.ok(media.includes("(`marking.media`), and each receipt records whether marking was applied (`markingApplied`)"));
    assert.ok(media.includes(`with ${CONSOLE}/c2pa, and CI runs \`npx spurvik c2pa <image-url> --fail-on-missing\``));
    const noMedia = spurvikVendorQuestionnaireAnswers({ generatesMedia: false }).markdown;
    assert.ok(noMedia.includes("does not generate synthetic images, audio or video today"));

    const risky = spurvikVendorQuestionnaireAnswers({ hasHighRiskActions: true }).markdown;
    assert.ok(risky.includes("Consequential agent actions: yes"));
    assert.ok(risky.includes("are gated deterministically in code before they run, not by a model prompt."));
    const calm = spurvikVendorQuestionnaireAnswers({ hasHighRiskActions: false }).markdown;
    assert.ok(calm.includes("Consequential agent actions: no"));
    assert.ok(calm.includes("do not trigger refunds, outbound emails, permission changes or deletions on their own today"));
  });

  it("reads plan, provider, flags and domain from the node parameters", async () => {
    let out;
    await withNoNetwork(async () => {
      [out] = await node.execute.call(
        rfpCtx({
          questionnairePlan: "team",
          questionnaireProvider: "langgraph",
          hasHighRiskActions: false,
          generatesMedia: true,
          questionnaireDomain: "https://WWW.Acme.EU/pricing?ref=rfp#q1",
        }),
      );
    });
    const result = out[0].json;
    assert.equal(result.plan, "team");
    assert.equal(result.provider, "langgraph");
    assert.equal(result.hasHighRiskActions, false);
    assert.equal(result.generatesMedia, true);
    assert.equal(result.domain, "www.acme.eu");
    assert.equal(result.reportUrl, `${CONSOLE}/report?domain=www.acme.eu`);
    assert.deepEqual(result.upgradeUrls, {
      freeApiKey10sEur0: `${CONSOLE}/signup`,
      proWhiteLabelEur19: `${CONSOLE}/signup?plan=pro&appUrl=www.acme.eu`,
      teamAgencyEur79: `${CONSOLE}/signup?plan=team`,
      doneForYou24hEur199: `${CONSOLE}/signup?plan=concierge&appUrl=www.acme.eu`,
    });
    assert.ok(result.markdown.startsWith("# EU AI Act vendor security questionnaire: answers for www.acme.eu\n"));
    assert.ok(result.markdown.includes(`- Live Art. 50(1) report for www.acme.eu: ${CONSOLE}/report?domain=www.acme.eu`));
    assert.ok(result.markdown.includes(`(Pro €19/mo): ${CONSOLE}/signup?plan=pro&appUrl=www.acme.eu`));
    assert.ok(result.markdown.includes(`(€199 once, incl. 1 yr Pro): ${CONSOLE}/signup?plan=concierge&appUrl=www.acme.eu`));
    for (const removed of ["pricing", "ref=rfp", "#q1", "WWW.Acme"]) assert.equal(JSON.stringify(result).includes(removed), false, removed);
  });

  it("lists the next-step links in order", () => {
    const { markdown } = spurvikVendorQuestionnaireAnswers({ domain: "acme.eu" });
    const tail = markdown.slice(markdown.indexOf("## Next steps"));
    assert.deepEqual(tail.split("\n").filter((line) => line.startsWith("- ")), [
      `- Interactive questionnaire & DPO RFP auto-responder: ${INTERACTIVE}`,
      `- Live Art. 50(1) report for acme.eu: ${CONSOLE}/report?domain=acme.eu`,
      `- Mint a Free SPURVIK_API_KEY in 10s (1-field email, no password, EU Frankfurt fra1): ${CONSOLE}/signup`,
      `- White-label badge + 90-day Frankfurt vault + DPO engineering summary (Pro €19/mo): ${CONSOLE}/signup?plan=pro&appUrl=acme.eu`,
      `- 12-month retention + Annex IV technical documentation draft (Team €79/mo): ${CONSOLE}/signup?plan=team`,
      `- Done-For-You 24h setup (€199 once, incl. 1 yr Pro): ${CONSOLE}/signup?plan=concierge&appUrl=acme.eu`,
    ]);
  });

  for (const raw of PRIVATE_DOMAINS) {
    it(`drops ${JSON.stringify(raw.length > 40 ? `${raw.slice(0, 20)}...` : raw)} without echoing it or making a request`, async () => {
      let out;
      const calls = await withNoNetwork(async () => {
        [out] = await node.execute.call(rfpCtx({ questionnaireDomain: raw }));
      });
      assert.equal(calls.length, 0);
      const result = out[0].json;
      assert.equal(result.domain, null);
      assert.equal(result.reportUrl, null);
      assert.deepEqual(result.upgradeUrls, PLAIN_UPGRADES);
      assert.ok(result.markdown.includes("The domain was not a public hostname, so it was left out of these answers."));
      assert.ok(result.markdown.includes("answers for our product"));
      const body = JSON.stringify(out);
      assert.equal(body.includes(raw), false);
      assert.equal(body.includes(JSON.stringify(raw).slice(1, -1)), false);
    });
  }

  it("treats an empty or whitespace domain as no domain, without the ignored note", () => {
    for (const domain of [undefined, "", "   "]) {
      const result = spurvikVendorQuestionnaireAnswers({ domain });
      assert.equal(result.domain, null);
      assert.equal(result.markdown.includes("left out of these answers"), false);
    }
  });

  it("ignores a non-string domain from an expression", () => {
    for (const domain of [42, true, ["acme.eu"], { host: "acme.eu" }]) {
      const result = spurvikVendorQuestionnaireAnswers({ domain });
      assert.equal(result.domain, null);
      assert.equal(result.reportUrl, null);
    }
  });

  it("throws for a plan, provider or flag outside the options, without repeating the value", async () => {
    const cases = [
      [{ questionnairePlan: "enterprise-sso-49" }, /plan must be one of: free, pro, team, concierge\./],
      [{ questionnaireProvider: "cohere-secret-x" }, /provider must be one of: openai, anthropic, google-genai, vercel-ai-sdk, langgraph, openai-agents, mastra, python, custom\./],
      [{ hasHighRiskActions: "yes-please" }, /hasHighRiskActions must be true or false\./],
      [{ generatesMedia: 1 }, /generatesMedia must be true or false\./],
    ];
    for (const [params, pattern] of cases) {
      await withNoNetwork(async () => {
        await assert.rejects(
          () => node.execute.call(rfpCtx(params)),
          (error) => {
            assert.match(error.message, pattern);
            for (const value of Object.values(params)) assert.equal(error.message.includes(String(value)), false);
            return true;
          },
        );
      });
    }
  });

  it("is deterministic for the same input", () => {
    const input = { plan: "team", provider: "mastra", hasHighRiskActions: true, generatesMedia: true, domain: "acme.eu" };
    assert.deepEqual(spurvikVendorQuestionnaireAnswers(input), spurvikVendorQuestionnaireAnswers({ ...input }));
  });

  it("returns one answer per item and never reads the credential when items mix zero-key operations", async () => {
    const items = [{ json: { promptText: PROMPT } }, { json: { promptText: PROMPT } }];
    const original = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({ ok: true, scan: { reachable: true, measured: false, reason: "no_ai_surface", detectedWidgets: [], detectedSdks: [] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    try {
      const context = rfpCtx({ domainOrUrl: "example.com", questionnaireDomain: "acme.eu" }, items, ["vendorQuestionnaireAnswers", "scanDomain"]);
      const [out] = await node.execute.call(context);
      assert.equal(context.credentialCalls, 0);
      assert.equal(calls.length, 1, "only the scan item calls the console");
      assert.ok(calls[0].includes("/api/v1/sandbox/scan"));
      assert.equal(out[0].json.domain, "acme.eu");
      assert.deepEqual(Object.keys(out[0].json), OUTPUT_KEYS);
      assert.equal(out[1].json.domain, "example.com");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("still reads the credential when another item in the same run needs it", async () => {
    const items = [{ json: { promptText: PROMPT } }, { json: { promptText: PROMPT } }];
    const context = rfpCtx({}, items, ["vendorQuestionnaireAnswers", "art12_hmac_log"]);
    const calls = await withNoNetwork(async () => {
      await assert.rejects(() => node.execute.call(context), /No credentials of type spurvikApi/);
    });
    assert.equal(context.credentialCalls, 1);
    assert.equal(calls.length, 0);
  });
});

describe("questionnaireHostname", () => {
  it("keeps the lower-case public hostname of a domain or http(s) URL", () => {
    assert.equal(questionnaireHostname("acme.eu"), "acme.eu");
    assert.equal(questionnaireHostname("  ACME.eu.  "), "acme.eu");
    assert.equal(questionnaireHostname("http://shop.acme.co.uk/path?q=1"), "shop.acme.co.uk");
    assert.equal(questionnaireHostname("https://xn--bcher-kva.de"), "xn--bcher-kva.de");
  });

  it("returns null for everything else", () => {
    for (const raw of [...PRIVATE_DOMAINS, undefined, null, 7, "", "Support Assistant", "-acme.eu", "acme-.eu", "acme.123", "x".repeat(2049)]) {
      assert.equal(questionnaireHostname(raw), null, JSON.stringify(raw));
    }
  });
});
