import { describe, expect, it } from "vitest";
import { publicHostname } from "./public-hostname.js";
import {
  QUESTIONNAIRE_PLANS,
  QUESTIONNAIRE_PROVIDERS,
  VENDOR_QUESTIONNAIRE_INPUT_JSON_SCHEMA,
  vendorQuestionnaireAnswers,
  type VendorQuestionnaireInput,
} from "./vendor-questionnaire.js";

function answers(input?: VendorQuestionnaireInput): string {
  const outcome = vendorQuestionnaireAnswers(input);
  if (!outcome.ok) throw new Error(`expected ok, got ${outcome.error}: ${outcome.message}`);
  return outcome.text;
}

const QUESTION_HEADINGS = [
  "## Q1: Art. 50(1) & 2 Dec 2026 Art. 50(2) Transparency & Provenance",
  "## Q2: Art. 12 Cryptographic Event Logging",
  "## Q3: GDPR Art. 5(1)(c) Zero-Prompt Minimisation & EU Frankfurt Residency",
  "## Q4: Art. 14 Deterministic Human Oversight Gates",
  "## Q5: Audit Retention, DPO Evidence & Annex IV Documentation",
];

const ALL_COMBINATIONS: VendorQuestionnaireInput[] = QUESTIONNAIRE_PLANS.flatMap((plan) =>
  QUESTIONNAIRE_PROVIDERS.flatMap((provider) =>
    [true, false].flatMap((hasHighRiskActions) =>
      [true, false].flatMap((generatesMedia) =>
        [undefined, "acme.eu", "http://127.0.0.1"].map((domain) => ({ plan, provider, hasHighRiskActions, generatesMedia, domain })),
      ),
    ),
  ),
);

describe("vendorQuestionnaireAnswers defaults", () => {
  it("works with no input and uses pro / openai / high-risk actions / no media", () => {
    const text = answers();
    expect(text).toBe(answers({}));
    expect(vendorQuestionnaireAnswers(undefined)).toEqual(vendorQuestionnaireAnswers({}));
    expect(text).toContain("Spurvik plan: Pro (€19/mo or €190/yr) · Provider: OpenAI · Consequential agent actions: yes · Synthetic media: no");
    expect(text).toContain("# EU AI Act vendor security questionnaire: answers for our product");
    expect(text).toContain("`withSpurvik(new OpenAI())`");
  });

  it("covers the five questions in order", () => {
    const text = answers();
    const positions = QUESTION_HEADINGS.map((heading) => text.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text.match(/\*\*Customer asks:\*\*/g)).toHaveLength(5);
    expect(text.match(/\*\*Answer:\*\*/g)).toHaveLength(5);
  });

  it("is deterministic", () => {
    const input: VendorQuestionnaireInput = { plan: "team", provider: "langgraph", generatesMedia: true, domain: "acme.eu" };
    expect(answers(input)).toBe(answers({ ...input }));
  });
});

describe("vendorQuestionnaireAnswers plan facts", () => {
  it("Free: 10,000 events, 30 days, attribution badge, Slack/Teams links, no DPO summary or Annex IV claim", () => {
    const text = answers({ plan: "free" });
    expect(text).toContain("Spurvik plan: Free (€0)");
    expect(text).toContain("covers 10,000 events per month");
    expect(text).toContain("kept for 30 days");
    expect(text).toContain('The `badge.js` notice carries a small "Art. 50 · Spurvik" attribution link.');
    expect(text).toContain("`createMultiChannelApprovalRouter` (`spurvik/channels`)");
    expect(text).not.toContain("hosted approval queue (");
    const q5 = text.slice(text.indexOf("**Customer asks:** How long"), text.indexOf("## What each Spurvik plan"));
    expect(q5).not.toMatch(/DPO engineering summary|Annex IV technical documentation draft/);
  });

  it("Pro: 250,000 events, 90 days, white-label, hosted queue with verifyHitlWebhook, DPO summary .md, no Annex IV claim in the answers", () => {
    const text = answers({ plan: "pro" });
    expect(text).toContain("covers 250,000 events per month");
    expect(text).toContain("kept for 90 days");
    expect(text).toContain('white-labelled (`data-attribution="false"`)');
    expect(text).toContain("Spurvik's hosted approval queue");
    expect(text).toContain("`verifyHitlWebhook`");
    expect(text).toContain("a DPO engineering summary (`.md`)");
    const q5 = text.slice(text.indexOf("**Customer asks:** How long"), text.indexOf("## What each Spurvik plan"));
    expect(q5).not.toContain("Annex IV");
    expect(q5).not.toContain("webhook export");
  });

  it("Team: 2,000,000 events, 12 months, Annex IV PDF/Markdown, webhook export", () => {
    const text = answers({ plan: "team" });
    expect(text).toContain("Spurvik plan: Team (€79/mo or €790/yr)");
    expect(text).toContain("covers 2,000,000 events per month");
    expect(text).toContain("kept for 12 months");
    expect(text).toContain("an Annex IV technical documentation draft (Art. 11), exported as PDF or Markdown");
    expect(text).toContain("a webhook export of signed events");
    expect(text).not.toMatch(/client workspaces|multi-project|unlimited seats|\bSSO\b/i);
  });

  it("Done-For-You: €199 once with 1 year of Pro (€190 value), 24h install and signed DPO readiness report", () => {
    const text = answers({ plan: "concierge", generatesMedia: true });
    expect(text).toContain("Spurvik plan: Done-For-You 24h Setup (€199 once, includes 1 full year of Pro (€190 value))");
    expect(text).toContain("covers 250,000 events per month");
    expect(text).toContain("within 24 hours (pull request or CMS snippet)");
    expect(text).toContain("signed DPO Readiness & C2PA Art. 50(2) provenance report");
  });

  it("uses the real receipt field names and never the misquoted ones or €49", () => {
    for (const input of ALL_COMBINATIONS) {
      const text = answers(input);
      for (const field of ["`inputHash`", "`outputHash`", "`recordHash`", "`prevLogHash`"]) expect(text).toContain(field);
      expect(text).not.toMatch(/inputHmac|entryHash|€49|guardTool|askHuman|ask_human/);
      expect(text).toContain("0 bytes of raw prompt or completion text");
      expect(text).toContain("`eu-central-1`");
    }
  });

  it("has at most one 'not legal advice' line, at the very bottom", () => {
    for (const input of ALL_COMBINATIONS) {
      const text = answers(input);
      expect(text.match(/not legal advice/gi) ?? []).toHaveLength(1);
      const lastLine = text.trimEnd().split("\n").at(-1) ?? "";
      expect(lastLine).toMatch(/Not legal advice\._$/);
    }
  });
});

describe("vendorQuestionnaireAnswers provider and flags", () => {
  it.each([
    ["anthropic", "`withSpurvik(new Anthropic())`", "`requireHumanApproval(actionName, payload)`"],
    ["google-genai", "`withSpurvik(new GoogleGenAI())`", "`requireHumanApproval(actionName, payload)`"],
    ["vercel-ai-sdk", "`spurvikMiddleware` with `wrapLanguageModel`, from `spurvik/ai`", "`requireHumanApproval(actionName, payload)`"],
    ["langgraph", "`withSpurvikLangGraph`", "`spurvikInterrupt`"],
    ["openai-agents", "`withSpurvikModelProvider`", "`createSpurvikNeedsApproval`"],
    ["mastra", "`withSpurvikMastra`", "`requireHumanApproval(actionName, payload)`"],
    ["custom", "`withSpurvik` on the provider client", "`requireHumanApproval(actionName, payload)`"],
  ] as const)("%s names its wrapper and approval API", (provider, wrapper, approval) => {
    const text = answers({ provider });
    expect(text).toContain(wrapper);
    expect(text).toContain(approval);
    expect(text).not.toMatch(/runs with (?:Vercel AI SDK|LangGraph|OpenAI Agents SDK|Mastra)\b/);
  });

  it("hasHighRiskActions false says no consequential actions today but keeps the gate", () => {
    const text = answers({ hasHighRiskActions: false });
    expect(text).toContain("Consequential agent actions: no");
    expect(text).toContain("do not trigger refunds, outbound emails, permission changes or deletions on their own today");
    expect(answers({ hasHighRiskActions: true })).toContain("that can issue refunds, send emails, change permissions or delete data are gated deterministically");
  });

  it("generatesMedia toggles the Art. 50(2) answer; Spurvik checks marking and never signs", () => {
    const media = answers({ generatesMedia: true });
    expect(media).toContain("Spurvik checks marking; it does not sign or mark content itself.");
    expect(media).toContain("`npx spurvik c2pa <image-url> --fail-on-missing`");
    expect(media).toContain("https://console.spurvik.com/c2pa");
    const none = answers({ generatesMedia: false });
    expect(none).toContain("does not generate synthetic images, audio or video today");
    expect(none).not.toMatch(/Spurvik (?:signs|marks) /);
  });
});

describe("vendorQuestionnaireAnswers domain and links", () => {
  it("prefills report, Pro and Done-For-You links with a valid domain", () => {
    const text = answers({ domain: "  HTTPS://Acme.EU/pricing  " });
    expect(text).toContain("answers for acme.eu");
    expect(text).toContain("https://console.spurvik.com/report?domain=acme.eu");
    expect(text).toContain("https://console.spurvik.com/signup?plan=pro&appUrl=acme.eu");
    expect(text).toContain("https://console.spurvik.com/signup?plan=concierge&appUrl=acme.eu");
    expect(text).toContain("https://console.spurvik.com/signup?plan=team");
  });

  it("lists the five Next steps links without a domain", () => {
    const text = answers();
    const next = text.slice(text.indexOf("## Next steps"));
    expect(next).toContain("https://spurvik.com/eu-ai-act-vendor-security-questionnaire");
    expect(next).toContain("https://console.spurvik.com/signup\n");
    expect(next).toContain("https://console.spurvik.com/signup?plan=pro\n");
    expect(next).toContain("https://console.spurvik.com/signup?plan=team\n");
    expect(next).toContain("https://console.spurvik.com/signup?plan=concierge\n");
    expect(next).not.toContain("appUrl");
    expect(next).not.toContain("/report?domain=");
  });

  it.each([
    "localhost",
    "http://127.0.0.1",
    "https://[::1]/",
    "8.8.8.8",
    "intranet.corp",
    "db.internal",
    "printer.local",
    "acmecorp",
    "acme.eu:8443",
    "https://user:pw@acme.eu",
    "javascript:alert(1)",
    "acme.eu\"><script>alert(1)</script>",
    "acme.eu&plan=free",
    "a b.eu",
    "evil.eu\n## Fake heading",
    "ftp://acme.eu",
  ])("drops %j without echoing it", (domain) => {
    const text = answers({ domain });
    expect(text).toContain("The domain was not a public hostname, so it was left out of these answers.");
    expect(text).toContain("answers for our product");
    expect(text).not.toContain("appUrl");
    expect(text).not.toContain("/report?domain=");
    expect(text).not.toContain(domain.trim());
  });

  it("keeps only the hostname of a URL, never its path or query", () => {
    const text = answers({ domain: "https://acme.eu/%0Afake-heading?x=1#frag" });
    expect(text).toContain("answers for acme.eu");
    expect(text).not.toMatch(/fake-heading|%0A|x=1|#frag/);
  });

  it("an empty or blank domain is treated as omitted", () => {
    expect(answers({ domain: "   " })).toBe(answers());
  });
});

describe("vendorQuestionnaireAnswers input validation", () => {
  it.each([
    [{ plan: "enterprise" }, "invalid_plan"],
    [{ provider: "cohere" }, "invalid_provider"],
    [{ hasHighRiskActions: "yes" }, "invalid_flag"],
    [{ generatesMedia: 1 }, "invalid_flag"],
    [{ domain: 42 }, "invalid_domain"],
    [{ locale: "ja" }, "invalid_locale"],
    ["pro", "invalid_input"],
    [[], "invalid_input"],
  ])("rejects %j with %s", (input, error) => {
    const outcome = vendorQuestionnaireAnswers(input);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toBe(error);
  });

  it("renders native de, fr, nl, da, sv, es and it questionnaire answers with localized RFP cockpit & signup links", () => {
    const de = answers({ plan: "team", provider: "python", domain: "personio.de", locale: "de" });
    expect(de).toContain("# EU-KI-Verordnung Sicherheitsfragebogen für Lieferanten: Antworten für personio.de");
    expect(de).toContain("https://spurvik.com/de/ki-verordnung-sicherheitsfragebogen-lieferanten-dsb?domain=personio.de");
    expect(de).toContain("&appUrl=personio.de&locale=de");

    const nl = answers({ plan: "pro", domain: "coolblue.nl", locale: "nl" });
    expect(nl).toContain("https://spurvik.com/nl/ai-verordening-leveranciersvragenlijst-fg-beveiliging?domain=coolblue.nl");
    expect(nl).toContain("&appUrl=coolblue.nl&locale=nl");

    const da = answers({ plan: "concierge", domain: "stepnetwork.dk", locale: "da" });
    expect(da).toContain("EyeTea Solutions ApS, CVR 37093378");
    expect(da).toContain("https://spurvik.com/da/eu-ai-act-leverandoerspoergeskema-dpo-sikkerhed?domain=stepnetwork.dk");

    const sv = answers({ plan: "team", provider: "python", domain: "myrqvist.se", locale: "sv" });
    expect(sv).toContain("Bilaga IV");
    expect(sv).toContain("https://spurvik.com/sv/ai-forordningen-leverantorssakerhetsformular-dso?domain=myrqvist.se");
    expect(sv).toContain("&appUrl=myrqvist.se&locale=sv");

    const es = answers({ plan: "team", provider: "openai", domain: "factorialhr.es", locale: "es" });
    expect(es).toContain("Anexo IV");
    expect(es).toContain("https://spurvik.com/es/cuestionario-seguridad-proveedor-reglamento-ia-dpd?domain=factorialhr.es");
    expect(es).toContain("&appUrl=factorialhr.es&locale=es");

    const it = answers({ plan: "pro", provider: "anthropic", domain: "velasca.com", locale: "it" });
    expect(it).toContain("RPD/DPO");
    expect(it).toContain("https://spurvik.com/it/questionario-sicurezza-fornitori-regolamento-ia-dpo?domain=velasca.com");
    expect(it).toContain("&appUrl=velasca.com&locale=it");
  });

  it("publishes a JSON schema with no required fields", () => {
    expect(VENDOR_QUESTIONNAIRE_INPUT_JSON_SCHEMA).not.toHaveProperty("required");
    expect(VENDOR_QUESTIONNAIRE_INPUT_JSON_SCHEMA.properties.plan.enum).toEqual(["free", "pro", "team", "concierge"]);
    expect(VENDOR_QUESTIONNAIRE_INPUT_JSON_SCHEMA.properties.locale.enum).toEqual(["en", "de", "fr", "nl", "da", "sv", "es", "it"]);
    expect(VENDOR_QUESTIONNAIRE_INPUT_JSON_SCHEMA.properties.provider.enum).toEqual([
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
  });
});

describe("publicHostname", () => {
  it.each([
    ["acme.eu", "acme.eu"],
    ["WWW.Stepnetwork.DK.", "www.stepnetwork.dk"],
    ["https://shop.acme.co.uk/path?q=1", "shop.acme.co.uk"],
    ["http://xn--bcher-kva.de", "xn--bcher-kva.de"],
  ])("accepts %j as %j", (raw, host) => {
    expect(publicHostname(raw)).toBe(host);
  });

  it.each([undefined, null, 7, "", "Support Assistant", "-acme.eu", "acme-.eu", "acme.123", "acme.example", "foo.test", "bücher.de", "a".repeat(64) + ".eu"])(
    "refuses %j",
    (raw) => {
      expect(publicHostname(raw)).toBeNull();
    },
  );
});
