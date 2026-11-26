import {
  C2PA_PAGE_URL,
  conciergeSignupUrlFor,
  CONCIERGE_SIGNUP_URL,
  PRO_SIGNUP_URL,
  proSignupUrlFor,
  reportUrlFor,
  SIGNUP_URL,
  TEAM_SIGNUP_URL,
  VENDOR_QUESTIONNAIRE_URL,
} from "../links.js";
import { publicHostname } from "./public-hostname.js";

/**
 * Zero-network, deterministic answers to the five EU AI Act questions enterprise buyers put in vendor
 * security questionnaires and DPO RFPs, for spurvik_vendor_questionnaire_answers (stdio) and the hosted
 * console. Every claim maps to a shipped control. Plan figures follow console `PLAN_LIMITS` and
 * `upgrade-plans.ts`. Field names follow `@spurvik/core` (inputHash, outputHash, recordHash, prevLogHash).
 * Pure: no fs, no network, no logging. An invalid domain is dropped and never echoed.
 */

export const QUESTIONNAIRE_PLANS = ["free", "pro", "team", "concierge"] as const;
export type QuestionnairePlan = (typeof QUESTIONNAIRE_PLANS)[number];

export const QUESTIONNAIRE_PROVIDERS = [
  "openai",
  "anthropic",
  "google-genai",
  "vercel-ai-sdk",
  "langgraph",
  "openai-agents",
  "mastra",
  "python",
  "custom",
] as const;
export type QuestionnaireProvider = (typeof QUESTIONNAIRE_PROVIDERS)[number];

export const QUESTIONNAIRE_LOCALES = ["en", "de", "fr", "nl", "da", "sv", "es", "it"] as const;
export type QuestionnaireLocale = (typeof QUESTIONNAIRE_LOCALES)[number];

const LOCALIZED_RFP_COCKPIT_URLS: Record<QuestionnaireLocale, string> = {
  en: VENDOR_QUESTIONNAIRE_URL,
  de: "https://spurvik.com/de/ki-verordnung-sicherheitsfragebogen-lieferanten-dsb",
  fr: "https://spurvik.com/fr/questionnaire-securite-reglement-ia-dpo-fournisseur",
  nl: "https://spurvik.com/nl/ai-verordening-leveranciersvragenlijst-fg-beveiliging",
  da: "https://spurvik.com/da/eu-ai-act-leverandoerspoergeskema-dpo-sikkerhed",
  sv: "https://spurvik.com/sv/ai-forordningen-leverantorssakerhetsformular-dso",
  es: "https://spurvik.com/es/cuestionario-seguridad-proveedor-reglamento-ia-dpd",
  it: "https://spurvik.com/it/questionario-sicurezza-fornitori-regolamento-ia-dpo",
};

export interface VendorQuestionnaireInput {
  plan?: QuestionnairePlan;
  provider?: QuestionnaireProvider;
  hasHighRiskActions?: boolean;
  generatesMedia?: boolean;
  domain?: string;
  locale?: QuestionnaireLocale;
}

export type VendorQuestionnaireOutcome = { ok: true; text: string } | { ok: false; error: string; message: string };

export const VENDOR_QUESTIONNAIRE_DEFAULTS = {
  plan: "pro",
  provider: "openai",
  hasHighRiskActions: true,
  generatesMedia: false,
} as const satisfies Required<Omit<VendorQuestionnaireInput, "domain" | "locale">>;

export const MAX_QUESTIONNAIRE_DOMAIN_CHARS = 2048;

/** JSON Schema of the tool input, the same shape server.ts registers with zod. Every field is optional. */
export const VENDOR_QUESTIONNAIRE_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    plan: { type: "string", enum: [...QUESTIONNAIRE_PLANS], description: "Spurvik plan the answers describe. Defaults to pro." },
    provider: {
      type: "string",
      enum: [...QUESTIONNAIRE_PROVIDERS],
      description: "Model provider or agent framework the product uses. Defaults to openai.",
    },
    hasHighRiskActions: {
      type: "boolean",
      description: "Agents or tools can trigger refunds, emails, permission changes or deletions. Defaults to true.",
    },
    generatesMedia: {
      type: "boolean",
      description: "The product generates synthetic images, audio or video (Art. 50(2)). Defaults to false.",
    },
    domain: {
      type: "string",
      maxLength: MAX_QUESTIONNAIRE_DOMAIN_CHARS,
      description: "Optional public hostname of the product, for example acme.eu. Used to prefill links; an invalid value is ignored.",
    },
    locale: {
      type: "string",
      enum: [...QUESTIONNAIRE_LOCALES],
      description:
        "Optional answer language: en (default), de (German DSB), fr (French DPO), nl (Dutch FG), da (Danish DPO), sv (Swedish DSO), es (Spanish DPD) or it (Italian RPD/DPO).",
    },
  },
  additionalProperties: false,
} as const;

interface PlanFacts {
  name: string;
  price: string;
  events: string;
  retention: string;
  whiteLabel: boolean;
  hostedQueue: boolean;
  dpoSummary: boolean;
  annexIv: boolean;
  webhookExport: boolean;
}

const PRO_FACTS: PlanFacts = {
  name: "Pro",
  price: "€19/mo or €190/yr",
  events: "250,000",
  retention: "90 days",
  whiteLabel: true,
  hostedQueue: true,
  dpoSummary: true,
  annexIv: false,
  webhookExport: false,
};

const PLAN_FACTS: Record<QuestionnairePlan, PlanFacts> = {
  free: {
    name: "Free",
    price: "€0",
    events: "10,000",
    retention: "30 days",
    whiteLabel: false,
    hostedQueue: false,
    dpoSummary: false,
    annexIv: false,
    webhookExport: false,
  },
  pro: PRO_FACTS,
  team: {
    name: "Team",
    price: "€79/mo or €790/yr",
    events: "2,000,000",
    retention: "12 months",
    whiteLabel: true,
    hostedQueue: true,
    dpoSummary: true,
    annexIv: true,
    webhookExport: true,
  },
  // Done-For-You includes one full year of Pro, so the running controls are Pro's.
  concierge: { ...PRO_FACTS, name: "Done-For-You 24h Setup", price: "€199 once, includes 1 full year of Pro (€190 value)" },
};

interface ProviderFacts {
  label: string;
  /** Who runs inference: the provider for a provider SDK, generic for a framework. */
  inference: string;
  wrapper: string;
  approval: string;
}

const CLIENT_APPROVAL = "`requireHumanApproval(actionName, payload)` on the Spurvik client";

const PROVIDER_FACTS: Record<QuestionnaireProvider, ProviderFacts> = {
  openai: { label: "OpenAI", inference: "OpenAI", wrapper: "`withSpurvik(new OpenAI())`", approval: CLIENT_APPROVAL },
  anthropic: { label: "Anthropic", inference: "Anthropic", wrapper: "`withSpurvik(new Anthropic())`", approval: CLIENT_APPROVAL },
  "google-genai": {
    label: "Google Gemini (Google Gen AI SDK)",
    inference: "Google",
    wrapper: "`withSpurvik(new GoogleGenAI())`",
    approval: CLIENT_APPROVAL,
  },
  "vercel-ai-sdk": {
    label: "Vercel AI SDK",
    inference: "our model provider",
    wrapper: "`spurvikMiddleware` with `wrapLanguageModel`, from `spurvik/ai`",
    approval: CLIENT_APPROVAL,
  },
  langgraph: {
    label: "LangGraph",
    inference: "our model provider",
    wrapper: "`withSpurvikLangGraph`, from `spurvik/langgraph`",
    approval: "`spurvikInterrupt` in the graph node, from `spurvik/langgraph`",
  },
  "openai-agents": {
    label: "OpenAI Agents SDK",
    inference: "our model provider",
    wrapper: "`withSpurvikModelProvider`, from `spurvik/openai-agents`",
    approval: "`createSpurvikNeedsApproval` on each tool and `resolveInterruptions`, from `spurvik/openai-agents`",
  },
  mastra: { label: "Mastra", inference: "our model provider", wrapper: "`withSpurvikMastra`, from `spurvik/mastra`", approval: CLIENT_APPROVAL },
  python: {
    label: "Python (FastAPI / LangChain / PydanticAI)",
    inference: "our model provider",
    wrapper: "`send_telemetry_event` from `spurvik_guard.py` (Python 3.10+ stdlib)",
    approval: "`request_human_approval(action_type, payload)` from `spurvik_guard.py`",
  },
  custom: { label: "our model provider", inference: "our model provider", wrapper: "`withSpurvik` on the provider client", approval: CLIENT_APPROVAL },
};

function invalid(error: string, message: string): VendorQuestionnaireOutcome {
  return { ok: false, error, message };
}

interface Resolved {
  plan: QuestionnairePlan;
  provider: QuestionnaireProvider;
  hasHighRiskActions: boolean;
  generatesMedia: boolean;
  host: string | null;
  domainIgnored: boolean;
  locale: QuestionnaireLocale;
}

function resolve(rawInput: unknown): Resolved | VendorQuestionnaireOutcome {
  if (rawInput !== undefined && rawInput !== null && (typeof rawInput !== "object" || Array.isArray(rawInput))) {
    return invalid("invalid_input", "Pass an object; every field is optional.");
  }
  const record = (rawInput ?? {}) as Record<string, unknown>;
  const plan = record.plan ?? VENDOR_QUESTIONNAIRE_DEFAULTS.plan;
  if (!(QUESTIONNAIRE_PLANS as readonly unknown[]).includes(plan)) {
    return invalid("invalid_plan", `plan must be one of: ${QUESTIONNAIRE_PLANS.join(", ")}.`);
  }
  const provider = record.provider ?? VENDOR_QUESTIONNAIRE_DEFAULTS.provider;
  if (!(QUESTIONNAIRE_PROVIDERS as readonly unknown[]).includes(provider)) {
    return invalid("invalid_provider", `provider must be one of: ${QUESTIONNAIRE_PROVIDERS.join(", ")}.`);
  }
  for (const key of ["hasHighRiskActions", "generatesMedia"] as const) {
    if (record[key] !== undefined && typeof record[key] !== "boolean") return invalid("invalid_flag", `${key} must be true or false.`);
  }
  if (record.domain !== undefined && typeof record.domain !== "string") {
    return invalid("invalid_domain", "domain must be a string, for example acme.eu.");
  }
  const locale = record.locale ?? "en";
  if (!(QUESTIONNAIRE_LOCALES as readonly unknown[]).includes(locale)) {
    return invalid("invalid_locale", `locale must be one of: ${QUESTIONNAIRE_LOCALES.join(", ")}.`);
  }
  const rawDomain = typeof record.domain === "string" ? record.domain : "";
  const host = rawDomain.trim() ? publicHostname(rawDomain) : null;
  return {
    plan: plan as QuestionnairePlan,
    provider: provider as QuestionnaireProvider,
    hasHighRiskActions: (record.hasHighRiskActions as boolean | undefined) ?? VENDOR_QUESTIONNAIRE_DEFAULTS.hasHighRiskActions,
    generatesMedia: (record.generatesMedia as boolean | undefined) ?? VENDOR_QUESTIONNAIRE_DEFAULTS.generatesMedia,
    host,
    domainIgnored: rawDomain.trim() !== "" && host === null,
    locale: locale as QuestionnaireLocale,
  };
}

/** One question block: heading, the buyer's question, then the answer paragraphs, each followed by a blank line. */
function question(heading: string, asks: string, answer: string[]): string[] {
  const lines = [`## ${heading}`, "", `**Customer asks:** ${asks}`, ""];
  answer.forEach((paragraph, index) => lines.push(index === 0 ? `**Answer:** ${paragraph}` : paragraph, ""));
  return lines;
}

function q1(product: string, plan: PlanFacts, generatesMedia: boolean, isConcierge: boolean): string[] {
  const notice = plan.whiteLabel
    ? `The notice is white-labelled (\`data-attribution="false"\`): users see only ${product}'s own AI notice, with no third-party branding.`
    : 'The `badge.js` notice carries a small "Art. 50 · Spurvik" attribution link.';
  const media = generatesMedia
    ? [
        `Art. 50(2), from 2 December 2026: where ${product} generates synthetic images, audio or video, our own marking step (for example a C2PA signer) is plugged into the Spurvik SDK marking hook (\`marking.media\`), and each receipt records whether marking was applied (\`markingApplied\`). Spurvik checks marking; it does not sign or mark content itself.`,
        `We check that published media still carries its C2PA (JUMBF) manifest after CDN and CMS processing with ${C2PA_PAGE_URL}, and CI runs \`npx spurvik c2pa <image-url> --fail-on-missing\`, which fails the build when a manifest is missing or stripped.${
          isConcierge ? " Our Done-For-You setup includes a signed DPO Readiness & C2PA Art. 50(2) provenance report." : ""
        }`,
      ]
    : [
        `Art. 50(2), from 2 December 2026: ${product} does not generate synthetic images, audio or video today. If it starts to, our own C2PA marking plugs into the Spurvik SDK marking hook (\`marking.media\`), and CI checks published images with \`npx spurvik c2pa <image-url> --fail-on-missing\`.`,
      ];
  return question(
    "Q1: Art. 50(1) & 2 Dec 2026 Art. 50(2) Transparency & Provenance",
    "Do users know they are interacting with an AI system, and is AI-generated content marked in a machine-readable way?",
    [
      `Every AI feature in ${product} shows a visible notice, in the user's language (all 24 official EU languages), that they are interacting with an AI system (Art. 50(1)). It is rendered by Spurvik's \`badge.js\` script or the \`<AIDisclosureLabel />\` React component. ${notice}`,
      ...media,
    ],
  );
}

function q2(product: string, plan: PlanFacts, provider: ProviderFacts): string[] {
  return question(
    "Q2: Art. 12 Cryptographic Event Logging",
    "What do you log about AI interactions, and can the log be tampered with?",
    [
      `Every ${provider.label} model call made by ${product} is wrapped with the MIT-licensed Spurvik SDK (${provider.wrapper}), which records one event per call. Prompt and output text are replaced by keyed HMAC-SHA256 fingerprints (\`inputHash\`, \`outputHash\`), computed in our own infrastructure with a key that is never sent to Spurvik, and each call carries an HMAC-SHA256-signed provenance receipt.`,
      `Stored events form a hash chain: each event's SHA-256 \`recordHash\` is linked to the previous event by \`prevLogHash\`, so an edited, inserted or deleted event breaks verification. When events age out, a signed checkpoint keeps the remaining chain verifiable. Our Spurvik ${plan.name} plan covers ${plan.events} events per month.`,
    ],
  );
}

function q3(product: string, plan: PlanFacts, provider: ProviderFacts): string[] {
  return question(
    "Q3: GDPR Art. 5(1)(c) Zero-Prompt Minimisation & EU Frankfurt Residency",
    "Is customer prompt or output text stored, and where is AI-related data kept?",
    [
      `Data minimisation (GDPR Art. 5(1)(c)): 0 bytes of raw prompt or completion text are persisted by Spurvik. Only the keyed fingerprints and call metadata leave our systems. Keyed fingerprints are pseudonymised data (GDPR Art. 4(5)) while our key exists, not anonymised data.`,
      `Residency: event records are stored in Frankfurt, Germany (Vercel \`fra1\` for the API, Neon Postgres on AWS \`eu-central-1\`) and kept for ${plan.retention}. Spurvik is operated by EyeTea Solutions ApS, Denmark; its sub-processors are listed at https://spurvik.com/privacy. Model inference runs with ${provider.inference} under our own agreement; Spurvik is not in that data path.`,
    ],
  );
}

function q4(product: string, plan: PlanFacts, provider: ProviderFacts, hasHighRiskActions: boolean): string[] {
  const gate = plan.hostedQueue
    ? [
        `The action is held in Spurvik's hosted approval queue (${provider.approval}) until a named reviewer decides. Our code continues only on an \`approved\` decision; a rejected, overridden or timed-out request does not run. The request carries a field-names-only payload summary, so reviewers see which fields an action touches, not their values.`,
        `Decision webhooks to our backend are verified with \`verifyHitlWebhook\` (HMAC-SHA-256 over the raw body), and each decision is recorded on the signed event, kept ${plan.retention} in Frankfurt. The same requests can reach reviewers in Slack or Microsoft Teams through signed approval links (\`spurvik/channels\`).`,
      ]
    : [
        "The action waits for a named reviewer to approve it through signed Slack or Microsoft Teams approval links, routed by `createMultiChannelApprovalRouter` (`spurvik/channels`) in our own stack. Only an explicit approval lets it run; a rejected or expired request does not.",
      ];
  const intro = hasHighRiskActions
    ? `AI agents and tools in ${product} that can issue refunds, send emails, change permissions or delete data are gated deterministically in code before they run, not by a model prompt.`
    : `AI features in ${product} do not trigger refunds, outbound emails, permission changes or deletions on their own today; they return output to a person who decides. Any such action we add is gated deterministically in code before it runs.`;
  return question(
    "Q4: Art. 14 Deterministic Human Oversight Gates",
    "How does a human oversee consequential actions taken by your AI features?",
    [intro, ...gate],
  );
}

function q5(product: string, plan: PlanFacts, isConcierge: boolean): string[] {
  const evidence: string[] = [];
  if (plan.dpoSummary) evidence.push("a DPO engineering summary (`.md`) downloaded from the signed event log");
  if (plan.annexIv) evidence.push("an Annex IV technical documentation draft (Art. 11), exported as PDF or Markdown");
  if (plan.webhookExport) evidence.push("a webhook export of signed events into our own systems");
  const answer = [
    `Signed AI events for ${product} are kept for ${plan.retention} in Frankfurt (Spurvik ${plan.name}, ${plan.events} events per month), and the hash chain can be re-verified at any point in that window.`,
  ];
  if (evidence.length > 0) answer.push(`Evidence we can share with your DPO: ${evidence.join("; ")}.`);
  else answer.push("Evidence we can share with your DPO: the event record and receipt fields described in Q2, on request.");
  if (isConcierge) {
    answer.push(
      "Our setup was installed by a Spurvik engineer within 24 hours (pull request or CMS snippet), and we hold a signed DPO Readiness & C2PA Art. 50(2) provenance report.",
    );
  }
  return question(
    "Q5: Audit Retention, DPO Evidence & Annex IV Documentation",
    "How long do you keep AI audit records, and what evidence can you share with our DPO?",
    answer,
  );
}

function planTable(): string[] {
  return [
    "## What each Spurvik plan puts on the questionnaire",
    "",
    "| Control | Free €0 | Pro €19/mo | Team €79/mo | Done-For-You €199 once |",
    "| --- | --- | --- | --- | --- |",
    "| AI events per month | 10,000 | 250,000 | 2,000,000 | 250,000 (1 yr Pro) |",
    "| Retention in Frankfurt (`fra1`) | 30 days | 90 days | 12 months | 90 days |",
    '| Art. 50(1) notice | `badge.js` with "Art. 50 · Spurvik" link | White-label (`data-attribution="false"`) | White-label | White-label |',
    "| Keyed HMAC receipts (`inputHash` + `recordHash`) | Yes | Yes | Yes | Yes |",
    "| Human approval gates | Slack / Teams links (`spurvik/channels`) | Hosted queue + `verifyHitlWebhook` | Hosted queue + `verifyHitlWebhook` | Hosted queue, gate set up for you |",
    "| DPO engineering summary (`.md`) | No | Yes | Yes | Yes + signed DPO readiness report |",
    "| Annex IV draft (Art. 11, PDF/Markdown) | No | No | Yes | No |",
    "| Webhook export of signed events | No | No | Yes | No |",
    "",
    "Annual: Pro €190/yr, Team €790/yr. Prices excl. VAT, B2B.",
    "",
  ];
}

function nextSteps(host: string | null): string[] {
  const lines = ["## Next steps", `- Interactive questionnaire & DPO RFP auto-responder: ${VENDOR_QUESTIONNAIRE_URL}`];
  if (host) lines.push(`- Live Art. 50(1) report for ${host}: ${reportUrlFor(host)}`);
  lines.push(
    `- White-label badge + 90-day Frankfurt vault + DPO engineering summary (Pro €19/mo): ${host ? proSignupUrlFor(host) : PRO_SIGNUP_URL}`,
    `- 12-month retention + Annex IV technical documentation draft (Team €79/mo): ${TEAM_SIGNUP_URL}`,
    `- Done-For-You 24h setup (€199 once, incl. 1 yr Pro): ${host ? conciergeSignupUrlFor(host) : CONCIERGE_SIGNUP_URL}`,
    `- Mint a Free SPURVIK_API_KEY in 10s (1-field email, no password, EU Frankfurt fra1): ${SIGNUP_URL}`,
    "",
  );
  return lines;
}

function renderLocalizedQuestionnaire(
  locale: Exclude<QuestionnaireLocale, "en">,
  resolved: Resolved,
  plan: PlanFacts,
  provider: ProviderFacts,
): string {
  const isConcierge = resolved.plan === "concierge";
  const cockpitBase = LOCALIZED_RFP_COCKPIT_URLS[locale];
  const cockpitUrl = resolved.host ? `${cockpitBase}?domain=${encodeURIComponent(resolved.host)}` : cockpitBase;
  const appParam = resolved.host ? `&appUrl=${encodeURIComponent(resolved.host)}` : "";
  const locParam = `&locale=${locale}`;
  const freeUrl = `${SIGNUP_URL}?locale=${locale}${appParam}`;
  const proUrl = `${PRO_SIGNUP_URL}${appParam}${locParam}`;
  const proAnnualUrl = `${PRO_SIGNUP_URL}&interval=annual${appParam}${locParam}`;
  const teamUrl = `${TEAM_SIGNUP_URL}${appParam}${locParam}`;
  const teamAnnualUrl = `${TEAM_SIGNUP_URL}&interval=annual${appParam}${locParam}`;
  const conciergeUrl = `${CONCIERGE_SIGNUP_URL}${appParam}${locParam}`;
  const trustCenterMdUrl = resolved.host
    ? `https://console.spurvik.com/api/v1/badge/trust-center.md?domain=${encodeURIComponent(resolved.host)}&locale=${locale}${resolved.plan !== "free" ? `&plan=${resolved.plan}` : ""}`
    : null;

  if (locale === "de") {
    const product = resolved.host ?? "unser Produkt";
    const lines = [
      `# EU-KI-Verordnung Sicherheitsfragebogen für Lieferanten: Antworten für ${product}`,
      "",
      `Spurvik-Tarif: ${plan.name} (${plan.price}) · Modellanbieter: ${provider.label} · Konsequenzreiche Agent-Aktionen: ${resolved.hasHighRiskActions ? "ja" : "nein"} · Synthetische Medien: ${resolved.generatesMedia ? "ja" : "nein"}`,
      "",
      ...(resolved.domainIgnored ? ["Die angegebene Domain ist kein öffentlicher Hostname und wurde ausgelassen.", ""] : []),
      "## F1: Art. 50 Abs. 1 & 2. Dez. 2026 Art. 50 Abs. 2 Transparenz & Herkunftsnachweis",
      "",
      `**Antwort:** Jede KI-Funktion in ${product} zeigt einen sichtbaren KI-Hinweis in allen 24 EU-Amtssprachen (\`badge.js\` oder \`<AIDisclosureLabel />\`). ${plan.whiteLabel ? `Der Hinweis läuft im White-Label-Modus (\`data-attribution="false"\`) ohne Drittanbieter-Branding.` : 'Der Hinweis enthält den Link "Art. 50 · Spurvik".'} ${resolved.generatesMedia ? `Für synthetische Medien (Art. 50 Abs. 2 ab 2. Dezember 2026) prüft CI veröffentlichte Assets via \`npx spurvik c2pa <image-url> --fail-on-missing\` und ${C2PA_PAGE_URL} auf intakte C2PA-JUMBF-Manifeste (Spurvik prüft nur und signiert keine Medien selbst).` : `${product} erzeugt derzeit keine synthetischen Bilder, Audio- oder Videodateien; bei künftiger Einführung prüft \`npx spurvik c2pa <image-url> --fail-on-missing\` C2PA-Manifeste.`}`,
      "",
      "## F2: Art. 12 Kryptografische Ereignisprotokollierung",
      "",
      `**Antwort:** Jeder ${provider.label}-Aufruf in ${product} wird über das MIT-lizenzierte Spurvik-SDK (${provider.wrapper}) protokolliert. Prompt- und Ausgabetexte werden durch schlüsselbasierte HMAC-SHA256-Prüfsummen (\`inputHash\`, \`outputHash\`) ersetzt; jeder Eintrag bildet über SHA-256 \`recordHash\` und \`prevLogHash\` eine manipulationssichere Hash-Kette (${plan.events} Events/Monat).`,
      "",
      "## F3: DSGVO Art. 5 Abs. 1 lit. c Datenminimierung & EU-Speicherung Frankfurt",
      "",
      `**Antwort:** 0 Bytes Klartext-Prompts oder Ausgaben werden bei Spurvik gespeichert (pseudonymisierte HMAC-Digests gemäß DSGVO Art. 4 Nr. 5). Ereignisprotokolle liegen ausschließlich in Frankfurt am Main (Vercel \`fra1\`, Neon Postgres AWS \`eu-central-1\`) für ${plan.retention}; Betreiber ist EyeTea Solutions ApS, Dänemark (https://spurvik.com/privacy).`,
      "",
      "## F4: Art. 14 Deterministische menschliche Aufsicht",
      "",
      `**Antwort:** ${resolved.hasHighRiskActions ? `Aktionen mit Außenwirkung (Erstattungen, E-Mails, Berechtigungen, Löschungen) werden deterministisch im Code vor Ausführung angehalten` : `KI-Funktionen in ${product} lösen derzeit keine selbstständigen Erstattungen, E-Mails oder Löschungen aus; künftige Aktionen werden deterministisch vor Ausführung angehalten`} (${plan.hostedQueue ? `gehostete Freigabe-Warteschlange mit \`verifyHitlWebhook\` & ${provider.approval}` : "signierte Slack-/Teams-Freigabelinks über `spurvik/channels`"}).`,
      "",
      "## F5: Aufbewahrung, DSB-Nachweise & Anhang-IV-Dokumentation",
      "",
      `**Antwort:** Signierte Ereignisse für ${product} werden ${plan.retention} in Frankfurt aufbewahrt.${plan.dpoSummary ? " Ein DSB-Engineering-Bericht (`.md`) ist jederzeit exportierbar." : ""}${plan.annexIv ? " Ein technischer Dokumentationsentwurf nach Anhang IV (Art. 11, PDF/Markdown) und Webhook-Export sind enthalten." : ""}${isConcierge ? " Die Einrichtung erfolgte durch einen Spurvik-Ingenieur innerhalb von 24 Stunden inklusive DSB- & C2PA-Art.-50(2)-Bericht." : ""}`,
      "",
      "## Nächste Schritte",
      `- Pro (19 €/Monat oder 190 €/Jahr [2 Monate frei] — White-Label, 90 Tage Frankfurt, DSB-Bericht): ${proUrl} · ${proAnnualUrl}`,
      `- Team (79 €/Monat oder 790 €/Jahr [2 Monate frei] — 12 Monate, Anhang-IV-Entwurf, Webhook): ${teamUrl} · ${teamAnnualUrl}`,
      `- Done-For-You 24h-Setup (199 € einmalig, inkl. 1 Jahr Pro): ${conciergeUrl}`,
      `- Interaktiver DSB- & Lieferanten-Fragebogen: ${cockpitUrl}`,
      ...(resolved.host ? [`- Live-Art.-50(1)-Kurzbericht für ${resolved.host}: ${reportUrlFor(resolved.host)}`] : []),
      ...(trustCenterMdUrl ? [`- Kunden-/trust-Center Markdown-Kit: ${trustCenterMdUrl}`] : []),
      `- Kostenloser SPURVIK_API_KEY in 10 Sek. (Frankfurt fra1): ${freeUrl}`,
      "",
      "_Technische Antworten auf Basis der ausgelieferten Spurvik-Kontrollen (EyeTea Solutions ApS, CVR 37093378)._",
    ];
    return `${lines.join("\n")}\n`;
  }

  if (locale === "fr") {
    const product = resolved.host ?? "notre produit";
    const lines = [
      `# Questionnaire sécurité fournisseur Règlement IA (UE) : réponses pour ${product}`,
      "",
      `Offre Spurvik : ${plan.name} (${plan.price}) · Fournisseur : ${provider.label} · Actions conséquentes : ${resolved.hasHighRiskActions ? "oui" : "non"} · Médias synthétiques : ${resolved.generatesMedia ? "oui" : "non"}`,
      "",
      ...(resolved.domainIgnored ? ["Le domaine fourni n'étant pas un nom d'hôte public, il a été omis.", ""] : []),
      "## Q1 : Art. 50(1) & 2 déc. 2026 Art. 50(2) Transparence & provenance",
      "",
      `**Réponse :** Chaque fonctionnalité IA de ${product} affiche une mention visible dans les 24 langues officielles de l'UE (\`badge.js\` ou \`<AIDisclosureLabel />\`). ${plan.whiteLabel ? `La mention fonctionne en marque blanche (\`data-attribution="false"\`).` : 'La mention inclut le lien "Art. 50 · Spurvik".'} ${resolved.generatesMedia ? `Pour les médias synthétiques (art. 50(2) dès le 2 décembre 2026), la CI vérifie les manifestes C2PA JUMBF via \`npx spurvik c2pa <image-url> --fail-on-missing\` et ${C2PA_PAGE_URL} (vérification en lecture seule, sans signature par Spurvik).` : `${product} ne génère pas de médias synthétiques aujourd'hui ; en cas d'ajout, \`npx spurvik c2pa <image-url> --fail-on-missing\` vérifie les manifestes C2PA.`}`,
      "",
      "## Q2 : Art. 12 Journalisation cryptographique des événements",
      "",
      `**Réponse :** Chaque appel ${provider.label} de ${product} est encapsulé avec le SDK MIT Spurvik (${provider.wrapper}). Les prompts et réponses sont remplacés par des empreintes HMAC-SHA256 à clé secrète (\`inputHash\`, \`outputHash\`), chaînées par SHA-256 \`recordHash\` et \`prevLogHash\` (${plan.events} événements/mois).`,
      "",
      "## Q3 : RGPD art. 5(1)(c) Zéro texte de prompt & hébergement UE Francfort",
      "",
      `**Réponse :** 0 octet de prompt ou de complétion brut n'est stocké par Spurvik (empreintes pseudonymisées au sens du RGPD art. 4(5)). Les journaux sont hébergés à Francfort (Vercel \`fra1\`, Neon Postgres AWS \`eu-central-1\`) pendant ${plan.retention} ; opéré par EyeTea Solutions ApS, Danemark (https://spurvik.com/privacy).`,
      "",
      "## Q4 : Art. 14 Portes de validation humaine déterministes",
      "",
      `**Réponse :** ${resolved.hasHighRiskActions ? `Les actions d'agents à impact (remboursements, e-mails, permissions, suppressions) sont bloquées de façon déterministe dans le code avant exécution` : `Les fonctions IA de ${product} ne déclenchent pas d'actions autonomes aujourd'hui ; toute action sensible est bloquée dans le code avant exécution`} (${plan.hostedQueue ? `file d'approbation hébergée avec \`verifyHitlWebhook\` et ${provider.approval}` : "liens d'approbation signés Slack / Teams via `spurvik/channels`"}).`,
      "",
      "## Q5 : Rétention d'audit, preuves DPO & documentation Annexe IV",
      "",
      `**Réponse :** Les événements signés pour ${product} sont conservés ${plan.retention} à Francfort.${plan.dpoSummary ? " Une synthèse technique DPO (`.md`) est téléchargeable." : ""}${plan.annexIv ? " Un brouillon de documentation technique Annexe IV (art. 11, PDF/Markdown) et l'export webhook sont inclus." : ""}${isConcierge ? " L'installation a été réalisée en 24h par un ingénieur Spurvik avec rapport DPO & C2PA art. 50(2) signé." : ""}`,
      "",
      "## Prochaines étapes",
      `- Pro (19 €/mois ou 190 €/an [2 mois offerts] — marque blanche, 90 j Francfort, synthèse DPO) : ${proUrl} · ${proAnnualUrl}`,
      `- Team (79 €/mois ou 790 €/an [2 mois offerts] — 12 mois, brouillon Annexe IV, webhook) : ${teamUrl} · ${teamAnnualUrl}`,
      `- Installation clé en main 24h (199 € une fois, 1 an Pro inclus) : ${conciergeUrl}`,
      `- Questionnaire interactif DPO / RSSI : ${cockpitUrl}`,
      ...(resolved.host ? [`- Rapport Art. 50(1) en direct pour ${resolved.host} : ${reportUrlFor(resolved.host)}`] : []),
      ...(trustCenterMdUrl ? [`- Kit Markdown /trust client : ${trustCenterMdUrl}`] : []),
      `- Clé SPURVIK_API_KEY gratuite en 10 s (Francfort fra1) : ${freeUrl}`,
      "",
      "_Réponses techniques fondées sur les contrôles Spurvik déployés (EyeTea Solutions ApS, CVR 37093378)._",
    ];
    return `${lines.join("\n")}\n`;
  }

  if (locale === "nl") {
    const product = resolved.host ?? "ons product";
    const lines = [
      `# EU AI-verordening leveranciersvragenlijst (FG / CISO): antwoorden voor ${product}`,
      "",
      `Spurvik-pakket: ${plan.name} (${plan.price}) · Provider: ${provider.label} · Ingrijpende agent-acties: ${resolved.hasHighRiskActions ? "ja" : "nee"} · Synthetische media: ${resolved.generatesMedia ? "ja" : "nee"}`,
      "",
      ...(resolved.domainIgnored ? ["Het opgegeven domein is geen publieke hostnaam en is weggelaten.", ""] : []),
      "## V1: Art. 50 lid 1 & 2 dec. 2026 Art. 50 lid 2 Transparantie & herkomst",
      "",
      `**Antwoord:** Elke AI-functie in ${product} toont een zichtbare AI-melding in alle 24 officiële EU-talen (\`badge.js\` of \`<AIDisclosureLabel />\`). ${plan.whiteLabel ? `De melding draait white-label (\`data-attribution="false"\`).` : 'De melding bevat de "Art. 50 · Spurvik"-link.'} ${resolved.generatesMedia ? `Voor synthetische media (art. 50 lid 2 vanaf 2 december 2026) controleert CI gepubliceerde beelden met \`npx spurvik c2pa <image-url> --fail-on-missing\` en ${C2PA_PAGE_URL} op C2PA-JUMBF-manifesten (alleen-lezen controle; Spurvik ondertekent zelf geen media).` : `${product} genereert momenteel geen synthetische media; bij toekomstige uitrol controleert \`npx spurvik c2pa <image-url> --fail-on-missing\` C2PA-manifesten.`}`,
      "",
      "## V2: Art. 12 Cryptografische gebeurtenislogging",
      "",
      `**Antwoord:** Elke ${provider.label}-aanroep door ${product} wordt gewrapt met de MIT-gelicentieerde Spurvik SDK (${provider.wrapper}). Prompts en outputs worden vervangen door sleutelgebaseerde HMAC-SHA256-vingerafdrukken (\`inputHash\`, \`outputHash\`), gekoppeld via SHA-256 \`recordHash\` en \`prevLogHash\` (${plan.events} events/mnd).`,
      "",
      "## V3: AVG art. 5 lid 1 sub c Dataminimalisatie & EU-opslag Frankfurt",
      "",
      `**Antwoord:** 0 bytes ruwe prompt- of outputtekst worden door Spurvik opgeslagen (gepseudonimiseerde vingerafdrukken conform AVG art. 4 punt 5). Logrecords staan in Frankfurt, Duitsland (Vercel \`fra1\`, Neon Postgres AWS \`eu-central-1\`) gedurende ${plan.retention}; beheerd door EyeTea Solutions ApS, Denemarken (https://spurvik.com/privacy).`,
      "",
      "## V4: Art. 14 Deterministische menselijke goedkeuringspoorten",
      "",
      `**Antwoord:** ${resolved.hasHighRiskActions ? `Agent-acties zoals terugbetalingen, e-mails, rechtenwijzigingen of verwijderingen worden deterministisch in code tegengehouden vóór uitvoering` : `AI-functies in ${product} voeren momenteel geen zelfstandige terugbetalingen, e-mails of verwijderingen uit; toekomstige acties worden deterministisch in code tegengehouden`} (${plan.hostedQueue ? `gehoste goedkeuringswachtrij met \`verifyHitlWebhook\` en ${provider.approval}` : "ondertekende Slack-/Teams-goedkeuringslinks via `spurvik/channels`"}).`,
      "",
      "## V5: Bewaartermijn, FG-bewijsstukken & Bijlage-IV-documentatie",
      "",
      `**Antwoord:** Ondertekende AI-events voor ${product} worden ${plan.retention} bewaard in Frankfurt.${plan.dpoSummary ? " Een FG/DPO-samenvatting (`.md`) is direct te downloaden." : ""}${plan.annexIv ? " Een concept technische documentatie conform Bijlage IV (art. 11, PDF/Markdown) en webhook-export zijn inbegrepen." : ""}${isConcierge ? " De installatie is binnen 24 uur door een Spurvik-engineer uitgevoerd inclusief ondertekend FG/DPO- & C2PA-rapport." : ""}`,
      "",
      "## Volgende stappen",
      `- Pro (€19/mnd of €190/jaar [2 mnd gratis] — white-label, 90 dagen Frankfurt, FG-samenvatting): ${proUrl} · ${proAnnualUrl}`,
      `- Team (€79/mnd of €790/jaar [2 mnd gratis] — 12 maanden, Bijlage-IV-concept, webhook): ${teamUrl} · ${teamAnnualUrl}`,
      `- Done-For-You 24u-setup (€199 eenmalig, incl. 1 jaar Pro): ${conciergeUrl}`,
      `- Interactieve FG / CISO leveranciersvragenlijst: ${cockpitUrl}`,
      ...(resolved.host ? [`- Live Art. 50(1)-rapport voor ${resolved.host}: ${reportUrlFor(resolved.host)}`] : []),
      ...(trustCenterMdUrl ? [`- Klant-/trust-Center Markdown-kit: ${trustCenterMdUrl}`] : []),
      `- Gratis SPURVIK_API_KEY in 10 sec. (Frankfurt fra1): ${freeUrl}`,
      "",
      "_Technische antwoorden op basis van geleverde Spurvik-controles (EyeTea Solutions ApS, CVR 37093378)._",
    ];
    return `${lines.join("\n")}\n`;
  }

  if (locale === "sv") {
    const product = resolved.host ?? "vår produkt";
    const lines = [
      `# EU AI-förordningen säkerhetsformulär för leverantörer (DSO / DPO): svar för ${product}`,
      "",
      `Spurvik-plan: ${plan.name} (${plan.price}) · Modellleverantör: ${provider.label} · Konsekventa agentåtgärder: ${resolved.hasHighRiskActions ? "ja" : "nej"} · Syntetiska medier: ${resolved.generatesMedia ? "ja" : "nej"}`,
      "",
      ...(resolved.domainIgnored ? ["Den angivna domänen är inte ett publikt värdnamn och utelämnades.", ""] : []),
      "## F1: Art. 50.1 & 2 dec. 2026 Art. 50.2 Transparens & ursprung",
      "",
      `**Svar:** Varje AI-funktion i ${product} visar en tydlig AI-upplysning på alla 24 officiella EU-språk (\`badge.js\` eller \`<AIDisclosureLabel />\`). ${plan.whiteLabel ? `Märkningen körs som white-label (\`data-attribution="false"\`).` : 'Märkningen innehåller länken "Art. 50 · Spurvik".'} ${resolved.generatesMedia ? `För syntetiska medier (art. 50.2 från 2 december 2026) kontrollerar CI publicerade bilder med \`npx spurvik c2pa <image-url> --fail-on-missing\` och ${C2PA_PAGE_URL} avseende C2PA-JUMBF-manifest (skrivskyddad kontroll; Spurvik signerar inte medier).` : `${product} genererar inte syntetiska medier idag; vid framtida lansering kontrollerar \`npx spurvik c2pa <image-url> --fail-on-missing\` C2PA-manifest.`}`,
      "",
      "## F2: Art. 12 Kryptografisk händelseloggning",
      "",
      `**Svar:** Varje ${provider.label}-anrop från ${product} kapslas in med MIT-licensierade Spurvik SDK (${provider.wrapper}). Promptar och svar ersätts av nyckelbaserade HMAC-SHA256-fingeravtryck (\`inputHash\`, \`outputHash\`), kedjade med SHA-256 \`recordHash\` och \`prevLogHash\` (${plan.events} händelser/mån).`,
      "",
      "## F3: GDPR art. 5.1 c Uppgiftsminimering & EU-lagring i Frankfurt",
      "",
      `**Svar:** 0 byte rå prompt- eller svarstext lagras hos Spurvik (pseudonymiserade fingeravtryck enligt GDPR art. 4.5). Loggposter lagras i Frankfurt, Tyskland (Vercel \`fra1\`, Neon Postgres AWS \`eu-central-1\`) i ${plan.retention}; drivs av EyeTea Solutions ApS, Danmark (https://spurvik.com/privacy).`,
      "",
      "## F4: Art. 14 Deterministiska mänskliga godkännandegrindar",
      "",
      `**Svar:** ${resolved.hasHighRiskActions ? `Agentåtgärder såsom återbetalningar, mejl, behörighetsändringar och raderingar stoppas deterministiskt i kod före körning` : `AI-funktioner i ${product} utför inte självständiga återbetalningar, mejl eller raderingar idag; framtida åtgärder stoppas deterministiskt i kod`} (${plan.hostedQueue ? `hostad godkännandekö med \`verifyHitlWebhook\` och ${provider.approval}` : "signerade Slack-/Teams-länkar via `spurvik/channels`"}).`,
      "",
      "## F5: Lagringstid, DSO-underlag & Bilaga IV-dokumentation",
      "",
      `**Svar:** Signerade AI-händelser för ${product} lagras i ${plan.retention} i Frankfurt.${plan.dpoSummary ? " En teknisk DSO/DPO-sammanfattning (`.md`) kan laddas ner direkt." : ""}${plan.annexIv ? " Utkast till teknisk dokumentation enligt Bilaga IV (art. 11, PDF/Markdown) samt webhook-export ingår." : ""}${isConcierge ? " Installationen utfördes inom 24 timmar av en Spurvik-ingenjör inklusive signerad DSO/DPO- & C2PA-rapport." : ""}`,
      "",
      "## Nästa steg",
      `- Pro (19 €/mån eller 190 €/år [2 mån fria] — white-label, 90 dagar Frankfurt, DSO-rapport): ${proUrl} · ${proAnnualUrl}`,
      `- Team (79 €/mån eller 790 €/år [2 mån fria] — 12 månader, Bilaga IV-utkast, webhook): ${teamUrl} · ${teamAnnualUrl}`,
      `- Done-For-You 24h-installation (199 € engångsbelopp, inkl. 1 år Pro): ${conciergeUrl}`,
      `- Interaktivt svenskt DSO- & leverantörsformulär: ${cockpitUrl}`,
      ...(resolved.host ? [`- Live Art. 50(1)-rapport för ${resolved.host}: ${reportUrlFor(resolved.host)}`] : []),
      ...(trustCenterMdUrl ? [`- Kund-/trust-Center Markdown-kit: ${trustCenterMdUrl}`] : []),
      `- Gratis SPURVIK_API_KEY på 10 sek. (Frankfurt fra1): ${freeUrl}`,
      "",
      "_Tekniska svar baserade på levererade Spurvik-kontroller (EyeTea Solutions ApS, CVR 37093378)._",
    ];
    return `${lines.join("\n")}\n`;
  }

  if (locale === "es") {
    const product = resolved.host ?? "nuestro producto";
    const lines = [
      `# Cuestionario de seguridad para proveedores Reglamento de IA UE (DPD / DPO): respuestas para ${product}`,
      "",
      `Plan Spurvik: ${plan.name} (${plan.price}) · Proveedor: ${provider.label} · Acciones sensibles de agentes: ${resolved.hasHighRiskActions ? "sí" : "no"} · Medios sintéticos: ${resolved.generatesMedia ? "sí" : "no"}`,
      "",
      ...(resolved.domainIgnored ? ["El dominio indicado no es un nombre de host público y se omitió.", ""] : []),
      "## P1: Art. 50(1) y 2 dic. 2026 Art. 50(2) Transparencia y procedencia",
      "",
      `**Respuesta:** Cada función de IA en ${product} muestra un aviso de IA visible en los 24 idiomas oficiales de la UE (\`badge.js\` o \`<AIDisclosureLabel />\`). ${plan.whiteLabel ? `El aviso opera en marca blanca (\`data-attribution="false"\`).` : 'El aviso incluye el enlace "Art. 50 · Spurvik".'} ${resolved.generatesMedia ? `Para medios sintéticos (art. 50(2) desde el 2 de diciembre de 2026), CI comprueba las imágenes publicadas con \`npx spurvik c2pa <image-url> --fail-on-missing\` y ${C2PA_PAGE_URL} para manifiestos C2PA JUMBF (control de solo lectura; Spurvik no firma medios).` : `${product} no genera medios sintéticos actualmente; en caso de activarse, \`npx spurvik c2pa <image-url> --fail-on-missing\` comprueba los manifiestos C2PA.`}`,
      "",
      "## P2: Art. 12 Registro criptográfico de eventos",
      "",
      `**Respuesta:** Cada llamada a ${provider.label} desde ${product} se envuelve con el SDK MIT de Spurvik (${provider.wrapper}). Los prompts y respuestas se sustituyen por huellas HMAC-SHA256 con clave secreta (\`inputHash\`, \`outputHash\`), encadenadas mediante SHA-256 \`recordHash\` y \`prevLogHash\` (${plan.events} eventos/mes).`,
      "",
      "## P3: RGPD art. 5(1)(c) Minimización de datos y alojamiento UE en Fráncfort",
      "",
      `**Respuesta:** 0 bytes de texto bruto de prompts o respuestas se almacenan en Spurvik (huellas seudonimizadas según RGPD art. 4(5)). Los registros residen en Fráncfort, Alemania (Vercel \`fra1\`, Neon Postgres AWS \`eu-central-1\`) durante ${plan.retention}; operado por EyeTea Solutions ApS, Dinamarca (https://spurvik.com/privacy).`,
      "",
      "## P4: Art. 14 Compuertas deterministas de supervisión humana",
      "",
      `**Respuesta:** ${resolved.hasHighRiskActions ? `Las acciones de agentes como reembolsos, correos, cambios de permisos o borrados se detienen de forma determinista en código antes de ejecutarse` : `Las funciones de IA en ${product} no ejecutan reembolsos, correos ni borrados autónomos hoy; cualquier acción futura se detienen de forma determinista en código`} (${plan.hostedQueue ? `cola de aprobación alojada con \`verifyHitlWebhook\` y ${provider.approval}` : "enlaces firmados de Slack / Teams vía `spurvik/channels`"}).`,
      "",
      "## P5: Retención, evidencias DPD y documentación Anexo IV",
      "",
      `**Respuesta:** Los eventos firmados de ${product} se conservan durante ${plan.retention} en Fráncfort.${plan.dpoSummary ? " Un informe técnico DPD/DPO (`.md`) puede descargarse directamente." : ""}${plan.annexIv ? " Incluye borrador de documentación técnica del Anexo IV (art. 11, PDF/Markdown) y exportación por webhook." : ""}${isConcierge ? " La instalación fue realizada en 24 horas por un ingeniero de Spurvik incluyendo informe DPD y C2PA Art. 50(2)." : ""}`,
      "",
      "## Próximos pasos",
      `- Pro (19 €/mes o 190 €/año [2 meses gratis] — marca blanca, 90 días Fráncfort, resumen DPD): ${proUrl} · ${proAnnualUrl}`,
      `- Team (79 €/mes o 790 €/año [2 meses gratis] — 12 meses, borrador Anexo IV, webhook): ${teamUrl} · ${teamAnnualUrl}`,
      `- Instalación 24h llave en mano (199 € pago único, 1 año Pro incluido): ${conciergeUrl}`,
      `- Cuestionario interactivo DPD / compras: ${cockpitUrl}`,
      ...(resolved.host ? [`- Informe Art. 50(1) en vivo para ${resolved.host}: ${reportUrlFor(resolved.host)}`] : []),
      ...(trustCenterMdUrl ? [`- Kit Markdown /trust para clientes: ${trustCenterMdUrl}`] : []),
      `- SPURVIK_API_KEY gratuita en 10 s (Fráncfort fra1): ${freeUrl}`,
      "",
      "_Respuestas técnicas basadas en los controles implementados de Spurvik (EyeTea Solutions ApS, CVR 37093378)._",
    ];
    return `${lines.join("\n")}\n`;
  }

  if (locale === "it") {
    const product = resolved.host ?? "il nostro prodotto";
    const lines = [
      `# Questionario sicurezza fornitori Regolamento IA UE (RPD / DPO): risposte per ${product}`,
      "",
      `Piano Spurvik: ${plan.name} (${plan.price}) · Provider: ${provider.label} · Azioni sensibili degli agenti: ${resolved.hasHighRiskActions ? "sì" : "no"} · Media sintetici: ${resolved.generatesMedia ? "sì" : "no"}`,
      "",
      ...(resolved.domainIgnored ? ["Il dominio indicato non è un nome host pubblico ed è stato omesso.", ""] : []),
      "## D1: Art. 50(1) e 2 dic. 2026 Art. 50(2) Trasparenza e provenienza",
      "",
      `**Risposta:** Ogni funzione IA in ${product} mostra un’informativa IA visibile in tutte le 24 lingue ufficiali dell’UE (\`badge.js\` o \`<AIDisclosureLabel />\`). ${plan.whiteLabel ? `L’informativa opera in modalità white-label (\`data-attribution="false"\`).` : 'L’informativa include il link "Art. 50 · Spurvik".'} ${resolved.generatesMedia ? `Per i media sintetici (art. 50(2) dal 2 dicembre 2026), la CI controlla le immagini pubblicate con \`npx spurvik c2pa <image-url> --fail-on-missing\` e ${C2PA_PAGE_URL} per i manifesti C2PA JUMBF (controllo in sola lettura; Spurvik non firma i media).` : `${product} non genera media sintetici oggi; in caso di attivazione futura, \`npx spurvik c2pa <image-url> --fail-on-missing\` controlla i manifesti C2PA.`}`,
      "",
      "## D2: Art. 12 Registrazione crittografica degli eventi",
      "",
      `**Risposta:** Ogni chiamata ${provider.label} da ${product} è incapsulata con lo Spurvik SDK con licenza MIT (${provider.wrapper}). Prompt e risposte sono sostituiti da impronte HMAC-SHA256 con chiave segreta (\`inputHash\`, \`outputHash\`), concatenate tramite SHA-256 \`recordHash\` e \`prevLogHash\` (${plan.events} eventi/mese).`,
      "",
      "## D3: GDPR art. 5(1)(c) Minimizzazione dei dati e residenza UE a Francoforte",
      "",
      `**Risposta:** 0 byte di testo grezzo di prompt o risposte sono memorizzati da Spurvik (impronte pseudonimizzate ai sensi del GDPR art. 4(5)). I log risiedono a Francoforte, Germania (Vercel \`fra1\`, Neon Postgres AWS \`eu-central-1\`) per ${plan.retention}; gestito da EyeTea Solutions ApS, Danimarca (https://spurvik.com/privacy).`,
      "",
      "## D4: Art. 14 Varchi deterministici di sorveglianza umana",
      "",
      `**Risposta:** ${resolved.hasHighRiskActions ? `Le azioni degli agenti come rimborsi, email, modifiche di permessi o cancellazioni vengono bloccate in modo deterministico nel codice prima dell’esecuzione` : `Le funzioni IA in ${product} non eseguono rimborsi, email o cancellazioni autonome oggi; eventuali azioni future sono bloccate in modo deterministico nel codice`} (${plan.hostedQueue ? `coda di approvazione ospitata con \`verifyHitlWebhook\` e ${provider.approval}` : "link firmati Slack / Teams tramite `spurvik/channels`"}).`,
      "",
      "## D5: Conservazione, prove RPD/DPO e documentazione Allegato IV",
      "",
      `**Risposta:** Gli eventi firmati di ${product} sono conservati per ${plan.retention} a Francoforte.${plan.dpoSummary ? " Un riepilogo tecnico RPD/DPO (`.md`) è scaricabile direttamente." : ""}${plan.annexIv ? " Include bozza di documentazione tecnica Allegato IV (art. 11, PDF/Markdown) ed esportazione webhook." : ""}${isConcierge ? " L’installazione è stata completata in 24 ore da un ingegnere Spurvik con report RPD/DPO e C2PA Art. 50(2)." : ""}`,
      "",
      "## Prossimi passi",
      `- Pro (19 €/mese o 190 €/anno [2 mesi gratis] — white-label, 90 gg Francoforte, riepilogo RPD): ${proUrl} · ${proAnnualUrl}`,
      `- Team (79 €/mese o 790 €/anno [2 mesi gratis] — 12 mesi, bozza Allegato IV, webhook): ${teamUrl} · ${teamAnnualUrl}`,
      `- Setup 24h chiavi in mano (199 € una tantum, 1 anno Pro incluso): ${conciergeUrl}`,
      `- Questionario interattivo RPD / DPO fornitori: ${cockpitUrl}`,
      ...(resolved.host ? [`- Report Art. 50(1) live per ${resolved.host}: ${reportUrlFor(resolved.host)}`] : []),
      ...(trustCenterMdUrl ? [`- Kit Markdown /trust clienti: ${trustCenterMdUrl}`] : []),
      `- SPURVIK_API_KEY gratuita in 10 s (Francoforte fra1): ${freeUrl}`,
      "",
      "_Risposte tecniche basate sui controlli Spurvik distribuiti (EyeTea Solutions ApS, CVR 37093378)._",
    ];
    return `${lines.join("\n")}\n`;
  }

  const product = resolved.host ?? "vores produkt";
  const lines = [
    `# EU AI Act leverandørspørgeskema (DPO / IT-sikkerhed): svar for ${product}`,
    "",
    `Spurvik-plan: ${plan.name} (${plan.price}) · Udbyder: ${provider.label} · Konsekvensfyldte agent-handlinger: ${resolved.hasHighRiskActions ? "ja" : "nej"} · Syntetiske medier: ${resolved.generatesMedia ? "ja" : "nej"}`,
    "",
    ...(resolved.domainIgnored ? ["Det angivne domæne er ikke et offentligt værtsnavn og blev udeladt.", ""] : []),
    "## S1: Art. 50, stk. 1 & 2. dec. 2026 Art. 50, stk. 2 Gennemsigtighed & oprindelse",
    "",
    `**Svar:** Hver AI-funktion i ${product} viser en synlig AI-oplysning på alle 24 officielle EU-sprog (\`badge.js\` eller \`<AIDisclosureLabel />\`). ${plan.whiteLabel ? `Mærkningen kører white-label (\`data-attribution="false"\`).` : 'Mærkningen indeholder linket "Art. 50 · Spurvik".'} ${resolved.generatesMedia ? `For syntetiske medier (art. 50, stk. 2 fra 2. december 2026) kontrollerer CI publicerede billeder med \`npx spurvik c2pa <image-url> --fail-on-missing\` og ${C2PA_PAGE_URL} for C2PA-JUMBF-manifester (skrivebeskyttet kontrol; Spurvik signerer ikke selv medier).` : `${product} genererer ikke syntetiske medier i dag; ved fremtidig brug tjekker \`npx spurvik c2pa <image-url> --fail-on-missing\` C2PA-manifester.`}`,
    "",
    "## S2: Art. 12 Kryptografisk hændelseslogning",
    "",
    `**Svar:** Hvert ${provider.label}-kald fra ${product} indkapsles med MIT-licenseret Spurvik SDK (${provider.wrapper}). Prompts og svar erstattes af nøglebaserede HMAC-SHA256-fingeraftryk (\`inputHash\`, \`outputHash\`), kædet via SHA-256 \`recordHash\` og \`prevLogHash\` (${plan.events} hændelser/md.).`,
    "",
    "## S3: GDPR art. 5, stk. 1, litra c Dataminimering & EU-lagring i Frankfurt",
    "",
    `**Svar:** 0 bytes rå prompt- eller svartekst gemmes hos Spurvik (pseudonymiserede fingeraftryk jf. GDPR art. 4, nr. 5). Hændelseslogfiler opbevares i Frankfurt, Tyskland (Vercel \`fra1\`, Neon Postgres AWS \`eu-central-1\`) i ${plan.retention}; drevet af danske EyeTea Solutions ApS, CVR 37093378 (https://spurvik.com/privacy).`,
    "",
    "## S4: Art. 14 Deterministisk menneskeligt tilsyn",
    "",
    `**Svar:** ${resolved.hasHighRiskActions ? `Agent-handlinger såsom refunderinger, e-mails, rettighedsændringer og sletninger bremses deterministisk i kode før udførelse` : `AI-funktioner i ${product} udløser ikke selvstændige refunderinger, e-mails eller sletninger i dag; fremtidige handlinger bremses deterministisk i kode`} (${plan.hostedQueue ? `hostet godkendelseskø med \`verifyHitlWebhook\` og ${provider.approval}` : "signerede Slack-/Teams-godkendelseslinks via `spurvik/channels`"}).`,
    "",
    "## S5: Opbevaring, DPO-dokumentation & Bilag IV-udkast",
    "",
    `**Svar:** Signerede AI-hændelser for ${product} opbevares i ${plan.retention} i Frankfurt.${plan.dpoSummary ? " Et teknisk DPO-resumé (`.md`) kan eksporteres direkte." : ""}${plan.annexIv ? " Udkast til teknisk dokumentation efter Bilag IV (art. 11, PDF/Markdown) og webhook-eksport er inkluderet." : ""}${isConcierge ? " Opsætningen blev udført inden for 24 timer af en Spurvik-ingeniør inkl. underskrevet DPO- & C2PA-rapport." : ""}`,
    "",
    "## Næste skridt",
    `- Pro (19 €/md. eller 190 €/år [2 mdr. gratis] — white-label, 90 dage Frankfurt, DPO-resumé): ${proUrl} · ${proAnnualUrl}`,
    `- Team (79 €/md. eller 790 €/år [2 mdr. gratis] — 12 måneder, Bilag IV-udkast, webhook): ${teamUrl} · ${teamAnnualUrl}`,
    `- Done-For-You 24t-setup (199 € én gang, inkl. 1 års Pro): ${conciergeUrl}`,
    `- Interaktivt dansk DPO- & leverandørspørgeskema: ${cockpitUrl}`,
    ...(resolved.host ? [`- Live Art. 50(1)-rapport for ${resolved.host}: ${reportUrlFor(resolved.host)}`] : []),
    ...(trustCenterMdUrl ? [`- Kunde-/trust-Center Markdown-kit: ${trustCenterMdUrl}`] : []),
    `- Gratis SPURVIK_API_KEY på 10 sek. (Frankfurt fra1): ${freeUrl}`,
    "",
    "_Tekniske svar baseret på leverede Spurvik-kontroller (EyeTea Solutions ApS, CVR 37093378)._",
  ];
  return `${lines.join("\n")}\n`;
}

/** Copy-paste Markdown answers to the five EU AI Act vendor-questionnaire questions. Pure and deterministic. */
export function vendorQuestionnaireAnswers(rawInput: unknown = {}): VendorQuestionnaireOutcome {
  const resolved = resolve(rawInput);
  if ("ok" in resolved) return resolved;
  const plan = PLAN_FACTS[resolved.plan];
  const provider = PROVIDER_FACTS[resolved.provider];
  if (resolved.locale !== "en") {
    return { ok: true, text: renderLocalizedQuestionnaire(resolved.locale, resolved, plan, provider) };
  }
  const isConcierge = resolved.plan === "concierge";
  const product = resolved.host ?? "our product";
  const header = [
    `# EU AI Act vendor security questionnaire: answers for ${product}`,
    "",
    `Spurvik plan: ${plan.name} (${plan.price}) · Provider: ${provider.label} · Consequential agent actions: ${
      resolved.hasHighRiskActions ? "yes" : "no"
    } · Synthetic media: ${resolved.generatesMedia ? "yes" : "no"}`,
    "",
    "Paste each answer into the buyer's questionnaire, then check it against your own setup before you send it.",
    "",
  ];
  if (resolved.domainIgnored) {
    header.push("The domain was not a public hostname, so it was left out of these answers.", "");
  }
  const lines = [
    ...header,
    ...q1(product, plan, resolved.generatesMedia, isConcierge),
    ...q2(product, plan, provider),
    ...q3(product, plan, provider),
    ...q4(product, plan, provider, resolved.hasHighRiskActions),
    ...q5(product, plan, isConcierge),
    ...planTable(),
    ...nextSteps(resolved.host),
    "_Engineering answers based on Spurvik's shipped controls. Articles 12 and 14 bind high-risk systems (Art. 6, Annex III); that classification stays with you. Not legal advice._",
  ];
  return { ok: true, text: `${lines.join("\n")}\n` };
}
