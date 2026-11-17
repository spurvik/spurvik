/**
 * Zero-credential "Answer Vendor Security Questionnaire (Art. 50/12/14 RFP)" operation.
 *
 * Mirrors `packages/mcp/src/tools/vendor-questionnaire.ts` (spurvik-mcp-server@1.0.8 tool #10): the same five
 * questions, plan facts and Markdown, built locally. Pure: no network, no fs, no credential, no logging.
 * Plan figures follow console `PLAN_LIMITS` and `upgrade-plans.ts`. Field names follow `@spurvik/core`
 * (inputHash, outputHash, recordHash, prevLogHash). An invalid or private domain is dropped and never echoed.
 */

const CONSOLE_ORIGIN = "https://console.spurvik.com";
const REPORT_URL = `${CONSOLE_ORIGIN}/report`;
const C2PA_PAGE_URL = `${CONSOLE_ORIGIN}/c2pa`;
const SIGNUP_URL = `${CONSOLE_ORIGIN}/signup`;
const PRO_SIGNUP_URL = `${SIGNUP_URL}?plan=pro`;
const TEAM_SIGNUP_URL = `${SIGNUP_URL}?plan=team`;
const CONCIERGE_SIGNUP_URL = `${SIGNUP_URL}?plan=concierge`;

/** Interactive EU AI Act vendor security questionnaire and DPO RFP auto-responder. */
export const SPURVIK_VENDOR_QUESTIONNAIRE_URL = "https://spurvik.com/eu-ai-act-vendor-security-questionnaire";

export const SPURVIK_QUESTIONNAIRE_PLANS = ["free", "pro", "team", "concierge"] as const;
export type SpurvikQuestionnairePlan = (typeof SPURVIK_QUESTIONNAIRE_PLANS)[number];

export const SPURVIK_QUESTIONNAIRE_PROVIDERS = [
  "openai",
  "anthropic",
  "google-genai",
  "vercel-ai-sdk",
  "langgraph",
  "openai-agents",
  "mastra",
  "custom",
] as const;
export type SpurvikQuestionnaireProvider = (typeof SPURVIK_QUESTIONNAIRE_PROVIDERS)[number];

export interface SpurvikVendorQuestionnaireInput {
  /** Defaults to `pro`. */
  plan?: unknown;
  /** Defaults to `openai`. */
  provider?: unknown;
  /** Defaults to `true`. */
  hasHighRiskActions?: unknown;
  /** Defaults to `false`. */
  generatesMedia?: unknown;
  /** Optional public domain or http(s) URL. Anything else is ignored. */
  domain?: unknown;
}

export interface SpurvikQuestionnaireUpgradeUrls {
  freeApiKey10sEur0: string;
  proWhiteLabelEur19: string;
  teamAgencyEur79: string;
  doneForYou24hEur199: string;
}

export interface SpurvikVendorQuestionnaireOutput {
  plan: SpurvikQuestionnairePlan;
  provider: SpurvikQuestionnaireProvider;
  hasHighRiskActions: boolean;
  generatesMedia: boolean;
  /** The public hostname used in the answers, or null when none was given or it was not a public hostname. */
  domain: string | null;
  /** Copy-paste Markdown answers to Q1–Q5, a plan table, and next steps. */
  markdown: string;
  interactiveUrl: string;
  /** Live Art. 50(1) report for `domain`, or null without a domain. */
  reportUrl: string | null;
  upgradeUrls: SpurvikQuestionnaireUpgradeUrls;
}

const MAX_DOMAIN_CHARS = 2048;
const MAX_HOSTNAME_CHARS = 253;
const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const BLOCKED_SUFFIXES = [
  "localhost",
  "local",
  "internal",
  "localdomain",
  "lan",
  "home.arpa",
  "intranet",
  "corp",
  "test",
  "invalid",
  "example",
];

/**
 * Bare public hostname (`acme.eu`) from a domain or an http(s) URL, or null.
 * Same rules as spurvik-mcp-server's `publicHostname`: IP literals (the TLD must be alphabetic, and IPv6 keeps
 * its brackets), localhost, internal suffixes, credentials, ports and non-ASCII names are refused, so a value
 * that is returned is safe to print and to put in a query string. Nothing is resolved; no request is made.
 */
export function questionnaireHostname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > MAX_DOMAIN_CHARS || /[\u0000- \u007f-￿<>"'`\\{}|^]/.test(trimmed)) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//.exec(trimmed)?.[1];
  if (scheme !== undefined && scheme !== "http" && scheme !== "https") return null;
  let url: URL;
  try {
    url = new URL(scheme === undefined ? `https://${trimmed}` : trimmed);
  } catch {
    return null;
  }
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.replace(/\.$/, "");
  if (!host || host.length > MAX_HOSTNAME_CHARS || host.startsWith("[")) return null;
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL_RE.test(label))) return null;
  if (!TLD_RE.test(labels[labels.length - 1] as string)) return null;
  if (BLOCKED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return null;
  return host;
}

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

const PLAN_FACTS: Record<SpurvikQuestionnairePlan, PlanFacts> = {
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

const PROVIDER_FACTS: Record<SpurvikQuestionnaireProvider, ProviderFacts> = {
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
  custom: { label: "our model provider", inference: "our model provider", wrapper: "`withSpurvik` on the provider client", approval: CLIENT_APPROVAL },
};

function reportUrlFor(host: string): string {
  return `${REPORT_URL}?domain=${encodeURIComponent(host)}`;
}

function upgradeUrlsFor(host: string | null): SpurvikQuestionnaireUpgradeUrls {
  return {
    freeApiKey10sEur0: SIGNUP_URL,
    proWhiteLabelEur19: host ? `${PRO_SIGNUP_URL}&appUrl=${encodeURIComponent(host)}` : PRO_SIGNUP_URL,
    teamAgencyEur79: TEAM_SIGNUP_URL,
    doneForYou24hEur199: host ? `${CONCIERGE_SIGNUP_URL}&appUrl=${encodeURIComponent(host)}` : CONCIERGE_SIGNUP_URL,
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

function q3(plan: PlanFacts, provider: ProviderFacts): string[] {
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

function nextSteps(host: string | null, upgradeUrls: SpurvikQuestionnaireUpgradeUrls): string[] {
  const lines = ["## Next steps", `- Interactive questionnaire & DPO RFP auto-responder: ${SPURVIK_VENDOR_QUESTIONNAIRE_URL}`];
  if (host) lines.push(`- Live Art. 50(1) report for ${host}: ${reportUrlFor(host)}`);
  lines.push(
    `- Mint a Free SPURVIK_API_KEY in 10s (work email only, no password, EU Frankfurt fra1): ${upgradeUrls.freeApiKey10sEur0}`,
    `- White-label badge + 90-day Frankfurt vault + DPO engineering summary (Pro €19/mo): ${upgradeUrls.proWhiteLabelEur19}`,
    `- 12-month retention + Annex IV technical documentation draft (Team €79/mo): ${upgradeUrls.teamAgencyEur79}`,
    `- Done-For-You 24h setup (€199 once, incl. 1 yr Pro): ${upgradeUrls.doneForYou24hEur199}`,
    "",
  );
  return lines;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T, label: string): T {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  // The rejected value is not repeated.
  throw new Error(`Vendor questionnaire ${label} must be one of: ${allowed.join(", ")}.`);
}

function flag(value: unknown, fallback: boolean, label: string): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  throw new Error(`Vendor questionnaire ${label} must be true or false.`);
}

/**
 * Copy-paste answers to the five EU AI Act questions enterprise buyers put in vendor security questionnaires
 * and DPO RFPs. Pure and deterministic: no network call, no credential. Throws only for a plan, provider or flag
 * outside the allowed values (the value is not repeated). A domain that is not a public hostname is dropped.
 */
export function spurvikVendorQuestionnaireAnswers(input: SpurvikVendorQuestionnaireInput = {}): SpurvikVendorQuestionnaireOutput {
  const planKey = oneOf(input.plan, SPURVIK_QUESTIONNAIRE_PLANS, "pro", "plan");
  const providerKey = oneOf(input.provider, SPURVIK_QUESTIONNAIRE_PROVIDERS, "openai", "provider");
  const hasHighRiskActions = flag(input.hasHighRiskActions, true, "hasHighRiskActions");
  const generatesMedia = flag(input.generatesMedia, false, "generatesMedia");
  const rawDomain = typeof input.domain === "string" ? input.domain : "";
  const host = rawDomain.trim() ? questionnaireHostname(rawDomain) : null;
  const domainIgnored = rawDomain.trim() !== "" && host === null;

  const plan = PLAN_FACTS[planKey];
  const provider = PROVIDER_FACTS[providerKey];
  const isConcierge = planKey === "concierge";
  const product = host ?? "our product";
  const upgradeUrls = upgradeUrlsFor(host);
  const header = [
    `# EU AI Act vendor security questionnaire: answers for ${product}`,
    "",
    `Spurvik plan: ${plan.name} (${plan.price}) · Provider: ${provider.label} · Consequential agent actions: ${
      hasHighRiskActions ? "yes" : "no"
    } · Synthetic media: ${generatesMedia ? "yes" : "no"}`,
    "",
    "Paste each answer into the buyer's questionnaire, then check it against your own setup before you send it.",
    "",
  ];
  if (domainIgnored) {
    header.push("The domain was not a public hostname, so it was left out of these answers.", "");
  }
  const lines = [
    ...header,
    ...q1(product, plan, generatesMedia, isConcierge),
    ...q2(product, plan, provider),
    ...q3(plan, provider),
    ...q4(product, plan, provider, hasHighRiskActions),
    ...q5(product, plan, isConcierge),
    ...planTable(),
    ...nextSteps(host, upgradeUrls),
    "_Engineering answers based on Spurvik's shipped controls. Articles 12 and 14 bind high-risk systems (Art. 6, Annex III); that classification stays with you. Not legal advice._",
  ];
  return {
    plan: planKey,
    provider: providerKey,
    hasHighRiskActions,
    generatesMedia,
    domain: host,
    markdown: `${lines.join("\n")}\n`,
    interactiveUrl: SPURVIK_VENDOR_QUESTIONNAIRE_URL,
    reportUrl: host ? reportUrlFor(host) : null,
    upgradeUrls,
  };
}
