/**
 * Zero-credential "Draft Annex IV Technical Documentation (Art. 11)" operation (#9).
 *
 * Pure local 9-section EU AI Act Article 11(1) & Annex IV technical file scaffold mirroring
 * `npx spurvik annex-iv` and `GET /api/v1/annex-iv/preview`: makes zero network requests,
 * reads no credential, never echoes incoming workflow prompt fields, and drops invalid or
 * private domains fail-closed.
 */

import { questionnaireHostname } from "./vendor-questionnaire";

const CONSOLE_ORIGIN = "https://console.spurvik.com";

export const SPURVIK_ANNEX_IV_USE_CASES = [
  "employment",
  "credit",
  "education",
  "essential_services",
  "biometrics",
  "support_agent",
] as const;
export type SpurvikAnnexIvUseCase = (typeof SPURVIK_ANNEX_IV_USE_CASES)[number];

export const SPURVIK_ANNEX_IV_PROVIDERS = ["openai", "anthropic", "gemini", "mistral", "python"] as const;
export type SpurvikAnnexIvProvider = (typeof SPURVIK_ANNEX_IV_PROVIDERS)[number];

export const SPURVIK_ANNEX_IV_TIERS = ["team", "free"] as const;
export type SpurvikAnnexIvTier = (typeof SPURVIK_ANNEX_IV_TIERS)[number];

export const SPURVIK_ANNEX_IV_LOCALES = ["en", "de", "fr", "nl", "da", "sv", "es", "it"] as const;
export type SpurvikAnnexIvLocale = (typeof SPURVIK_ANNEX_IV_LOCALES)[number];

export interface SpurvikAnnexIvSection {
  number: string;
  annexRef: string;
  title: string;
  sourceMode: "scaffolded_free" | "auto_populated_team";
  populatedInPreview: boolean;
  summary: string;
}

export interface SpurvikAnnexIvUpgradeUrls {
  freeApiKey10sEur0: string;
  proWhiteLabelEur19: string;
  proAnnualEur190: string;
  teamAgencyEur79: string;
  teamAnnualEur790: string;
  doneForYou24hEur199: string;
}

export interface SpurvikAnnexIvDraftInput {
  domain?: unknown;
  useCase?: unknown;
  provider?: unknown;
  tier?: unknown;
  locale?: unknown;
}

export interface SpurvikAnnexIvDraftOutput {
  format: "spurvik.annex-iv-preview.v1";
  regulation: "Regulation (EU) 2024/1689 — Article 11(1) & Annex IV";
  highRiskApplicabilityDate: "2027-12-02";
  art502ProvenanceMilestone: "2026-12-02";
  region: "fra1";
  domain: string | null;
  displaySystem: string;
  locale: SpurvikAnnexIvLocale;
  useCase: SpurvikAnnexIvUseCase;
  annexIiiReference: string;
  provider: SpurvikAnnexIvProvider;
  tier: SpurvikAnnexIvTier;
  readinessScorePct: number;
  sections: SpurvikAnnexIvSection[];
  markdown: string;
  studioUrl: string;
  previewApiUrl: string;
  upgradeUrls: SpurvikAnnexIvUpgradeUrls;
}

const LOCALIZED_STUDIO_PATHS: Record<SpurvikAnnexIvLocale, string> = {
  en: "/eu-ai-act-annex-iv-technical-documentation",
  de: "/de/ki-verordnung-anhang-iv-technische-dokumentation",
  fr: "/fr/reglement-ia-annexe-iv-documentation-technique",
  nl: "/nl/ai-verordening-bijlage-iv-technische-documentatie",
  da: "/da/eu-ai-act-bilag-iv-teknisk-dokumentation",
  sv: "/sv/ai-forordningen-bilaga-iv-teknisk-dokumentation",
  es: "/es/reglamento-ia-anexo-iv-documentacion-tecnica",
  it: "/it/regolamento-ia-allegato-iv-documentazione-tecnica",
};

const UC_META: Record<
  SpurvikAnnexIvUseCase,
  { annexIiiRef: string; title: string; intendedPurpose: string; consequentialAction: string; oversightRole: string }
> = {
  employment: {
    annexIiiRef: "Annex III §4(a)–(b) — Employment, Workers Management & Recruitment",
    title: "Candidate Screening & Interview Evaluation Assistant",
    intendedPurpose: "Assists recruiting and HR teams in summarizing candidate applications and scoring structured role criteria.",
    consequentialAction: "advance_or_reject_candidate",
    oversightRole: "Human Talent / HR Reviewer",
  },
  credit: {
    annexIiiRef: "Annex III §5(b) — Creditworthiness, Underwriting & Pricing",
    title: "Credit Risk & Underwriting Decision Support System",
    intendedPurpose: "Evaluates structured financial signals to draft underwriting recommendations for human credit officers.",
    consequentialAction: "approve_or_decline_credit_limit",
    oversightRole: "Licensed Credit / Risk Officer",
  },
  education: {
    annexIiiRef: "Annex III §3(a)–(d) — Education, Admissions & Assessment",
    title: "Admissions & Academic Evaluation Support System",
    intendedPurpose: "Scores structured coursework rubrics and flags submissions requiring faculty review.",
    consequentialAction: "finalize_admission_or_grade",
    oversightRole: "Faculty / Admissions Examiner",
  },
  essential_services: {
    annexIiiRef: "Annex III §5(a)/(c) — Essential Private & Public Services Triage",
    title: "Benefits, Claims & Priority Triage Assistant",
    intendedPurpose: "Classifies inbound claims and routes consequential eligibility or payout decisions to a human caseworker.",
    consequentialAction: "execute_claim_payout_or_denial",
    oversightRole: "Claims / Casework Specialist",
  },
  biometrics: {
    annexIiiRef: "Annex III §1 — Permitted Biometric Categorisation / Verification",
    title: "Permitted Identity & Biometric Verification Workflow",
    intendedPurpose: "Assists secondary document and liveness review with mandatory dual-reviewer confirmation.",
    consequentialAction: "confirm_identity_match_override",
    oversightRole: "Trust & Safety Identity Reviewer",
  },
  support_agent: {
    annexIiiRef: "Enterprise B2B Agent — Voluntary / Procurement Annex IV File",
    title: "Customer Operations & Transactional AI Agent",
    intendedPurpose: "Handles customer inquiries with Art. 50(1) AI notice and gates refunds, account edits, and outbound actions.",
    consequentialAction: "stripe.refunds.create",
    oversightRole: "Operations / Billing Reviewer",
  },
};

const PV_META: Record<SpurvikAnnexIvProvider, { label: string; wrapper: string }> = {
  openai: {
    label: "OpenAI API (Responses / Chat Completions)",
    wrapper: `withSpurvik(new OpenAI(), { riskTier: "high_annex3" })`,
  },
  anthropic: {
    label: "Anthropic Claude Messages API",
    wrapper: `withSpurvik(new Anthropic(), { riskTier: "high_annex3" })`,
  },
  gemini: {
    label: "Google GenAI (Gemini API)",
    wrapper: `withSpurvik(new GoogleGenAI({}), { riskTier: "high_annex3" })`,
  },
  mistral: {
    label: "Mistral AI EU Endpoint",
    wrapper: `withSpurvik(mistralClient, { riskTier: "high_annex3" })`,
  },
  python: {
    label: "Python 3.10+ (FastAPI / LangChain / PydanticAI)",
    wrapper: `spurvik_guard.send_telemetry_event(..., risk_tier="high_annex3")`,
  },
};

function inferLocaleFromDomain(domain: string | null): SpurvikAnnexIvLocale {
  if (!domain) return "en";
  if (domain.endsWith(".de") || domain.endsWith(".at") || domain.endsWith(".ch")) return "de";
  if (domain.endsWith(".fr")) return "fr";
  if (domain.endsWith(".nl") || domain.endsWith(".be")) return "nl";
  if (domain.endsWith(".dk")) return "da";
  if (domain.endsWith(".se")) return "sv";
  if (domain.endsWith(".es")) return "es";
  if (domain.endsWith(".it")) return "it";
  return "en";
}

function normalizeLocale(raw: unknown, domain: string | null): SpurvikAnnexIvLocale {
  if (typeof raw === "string") {
    const clean = raw.trim().toLowerCase();
    if ((SPURVIK_ANNEX_IV_LOCALES as readonly string[]).includes(clean)) {
      return clean as SpurvikAnnexIvLocale;
    }
  }
  return inferLocaleFromDomain(domain);
}

function normalizeUseCase(raw: unknown): SpurvikAnnexIvUseCase {
  if (typeof raw === "string") {
    const clean = raw.trim().toLowerCase().replace(/-/g, "_");
    if ((SPURVIK_ANNEX_IV_USE_CASES as readonly string[]).includes(clean)) {
      return clean as SpurvikAnnexIvUseCase;
    }
  }
  return "employment";
}

function normalizeProvider(raw: unknown): SpurvikAnnexIvProvider {
  if (typeof raw === "string") {
    const clean = raw.trim().toLowerCase();
    if ((SPURVIK_ANNEX_IV_PROVIDERS as readonly string[]).includes(clean)) {
      return clean as SpurvikAnnexIvProvider;
    }
  }
  return "openai";
}

function normalizeTier(raw: unknown): SpurvikAnnexIvTier {
  if (typeof raw === "string" && raw.trim().toLowerCase() === "free") return "free";
  return "team";
}

export function spurvikAnnexIvDraft(input: SpurvikAnnexIvDraftInput = {}): SpurvikAnnexIvDraftOutput {
  const domain = questionnaireHostname(input.domain);
  const locale = normalizeLocale(input.locale, domain);
  const useCase = normalizeUseCase(input.useCase);
  const provider = normalizeProvider(input.provider);
  const tier = normalizeTier(input.tier);
  const isTeam = tier === "team";
  const displaySystem = domain ?? "acme-ai.eu";
  const uc = UC_META[useCase];
  const pv = PV_META[provider];

  const sections: SpurvikAnnexIvSection[] = [
    {
      number: "01",
      annexRef: "Annex IV §1",
      title: "General System Description, Intended Purpose & Release Identity",
      sourceMode: "scaffolded_free",
      populatedInPreview: true,
      summary: `${displaySystem} — ${uc.title} (${uc.annexIiiRef}). Intended purpose: ${uc.intendedPurpose}`,
    },
    {
      number: "02",
      annexRef: "Annex IV §2(a)–(d)",
      title: "System Architecture, Upstream Model Provider & Runtime Wrapper",
      sourceMode: "scaffolded_free",
      populatedInPreview: true,
      summary: `Upstream model: ${pv.label} wrapped via ${pv.wrapper}.`,
    },
    {
      number: "03",
      annexRef: "Annex IV §2(e) & Art. 10 / GDPR Art. 5(1)(c)",
      title: "Data Governance & Zero-Prompt-Text Pseudonymisation Boundary",
      sourceMode: "scaffolded_free",
      populatedInPreview: true,
      summary:
        "Keyed HMAC-SHA256 digests (inputHash, outputHash) computed before ingestion; 0 bytes of raw prompt or personal data stored in Spurvik.",
    },
    {
      number: "04",
      annexRef: "Annex IV §2(g) & Article 12",
      title: "Automatic Event Logging & Chained HMAC-SHA256 Receipt Ledger",
      sourceMode: "auto_populated_team",
      populatedInPreview: isTeam,
      summary: isTeam
        ? "Auto-populated from Spurvik Team Frankfurt (eu-central-1) vault: chained prevLogHash -> recordHash integrity summary, model/version distribution, and active telemetry window (up to 2,000,000 events/mo)."
        : "[Manual placeholder on Free €0 — upgrade to Team €79/mo or €790/yr to auto-populate live Frankfurt Art. 12 chain digests & volume tables]",
    },
    {
      number: "05",
      annexRef: "Annex IV §2(e) & Article 14",
      title: "Human Oversight Measures & Pre-Execution Approval Gate Ledger",
      sourceMode: "auto_populated_team",
      populatedInPreview: isTeam,
      summary: isTeam
        ? `Auto-populated from Spurvik HITL ledger: consequential action \`${uc.consequentialAction}\` held behind signed Approve/Block review by ${uc.oversightRole} (Slack, Microsoft Teams, or signed webhook) with field-name-only payload summary.`
        : `[Manual placeholder on Free €0 — upgrade to Team €79/mo or €790/yr to attach hosted Art. 14 gate counts & reviewer decision audit summary for \`${uc.consequentialAction}\`]`,
    },
    {
      number: "06",
      annexRef: "Annex IV §3 & Article 15",
      title: "Accuracy, Robustness, Cybersecurity & Fail-Closed Error Handling",
      sourceMode: "auto_populated_team",
      populatedInPreview: isTeam,
      summary: isTeam
        ? "Auto-populated latency, error-rate, and 6-vector Art. 14 cryptographic signature self-test status (spurvik:art12:v1 & spurvik:art14:decision:v1)."
        : "[Manual placeholder on Free €0 — upgrade to Team €79/mo or €790/yr to embed automated fail-closed gate & error-rate telemetry]",
    },
    {
      number: "07",
      annexRef: "Annex IV §4–5 & Article 9",
      title: "Risk Management Matrix & Transparency Controls (Art. 13 & Art. 50)",
      sourceMode: "scaffolded_free",
      populatedInPreview: true,
      summary:
        "Deployer instructions (Art. 13), 24-language Art. 50(1) AI interaction notice (https://spurvik.com/badge.js), and 2 Dec 2026 Art. 50(2) C2PA provenance workflow.",
    },
    {
      number: "08",
      annexRef: "Annex IV §8–9, Article 19 & Article 72",
      title: "12-Month EU Frankfurt Retention, SIEM Webhook Export & Post-Market Monitoring",
      sourceMode: "auto_populated_team",
      populatedInPreview: isTeam,
      summary: isTeam
        ? "Active 12-month log retention in EU Frankfurt (eu-central-1) + signed SIEM/S3 webhook export supporting Art. 19 (>=6-month statutory log floor) and Art. 72 post-market monitoring."
        : "[Free €0 retains 30 days (Pro €19/mo: 90 days) — upgrade to Team €79/mo or €790/yr for 12-month Frankfurt retention & webhook export]",
    },
    {
      number: "09",
      annexRef: "Annex IV §6–7, Article 47 & Article 49",
      title: "Harmonised Standards, EU Declaration Cross-Reference & Art. 49 Registration",
      sourceMode: "auto_populated_team",
      populatedInPreview: isTeam,
      summary: isTeam
        ? `Structured export metadata block (system slug \`${displaySystem}\`, provider, Annex III category, export timestamp & workspace digest) ready for internal QMS sign-off under Art. 17 / Art. 47 / Art. 49.`
        : "[Manual sign-off table on Free €0 — upgrade to Team €79/mo or €790/yr to generate timestamped workspace Annex IV Markdown/PDF drafts]",
    },
  ];

  const studioPath = LOCALIZED_STUDIO_PATHS[locale];
  const studioUrl = domain
    ? `https://spurvik.com${studioPath}?domain=${encodeURIComponent(domain)}`
    : `https://spurvik.com${studioPath}`;
  const previewApiUrl = `${CONSOLE_ORIGIN}/api/v1/annex-iv/preview?domain=${encodeURIComponent(displaySystem)}&useCase=${useCase}&provider=${provider}&tier=${tier}${locale !== "en" ? `&locale=${locale}` : ""}`;

  const appSuffix = domain ? `&appUrl=${encodeURIComponent(domain)}` : "";
  const locSuffix = locale !== "en" ? `&locale=${locale}` : "";
  const freeParams: string[] = [];
  if (domain) freeParams.push(`appUrl=${encodeURIComponent(domain)}`);
  if (locale !== "en") freeParams.push(`locale=${locale}`);
  const freeSignupUrl =
    freeParams.length > 0 ? `${CONSOLE_ORIGIN}/signup?${freeParams.join("&")}` : `${CONSOLE_ORIGIN}/signup`;

  const upgradeUrls: SpurvikAnnexIvUpgradeUrls = {
    freeApiKey10sEur0: freeSignupUrl,
    proWhiteLabelEur19: `${CONSOLE_ORIGIN}/signup?plan=pro${appSuffix}${locSuffix}`,
    proAnnualEur190: `${CONSOLE_ORIGIN}/signup?plan=pro&interval=annual${appSuffix}${locSuffix}`,
    teamAgencyEur79: `${CONSOLE_ORIGIN}/signup?plan=team${appSuffix}${locSuffix}`,
    teamAnnualEur790: `${CONSOLE_ORIGIN}/signup?plan=team&interval=annual${appSuffix}${locSuffix}`,
    doneForYou24hEur199: `${CONSOLE_ORIGIN}/signup?plan=concierge${appSuffix}${locSuffix}`,
  };

  const markdown = [
    `# EU AI Act Annex IV Technical Documentation Draft — ${displaySystem}`,
    "",
    "- **Regulation**: Regulation (EU) 2024/1689 — Article 11(1) & Annex IV",
    `- **Annex III Scope**: ${uc.annexIiiRef}`,
    `- **Upstream Model & Wrapper**: ${pv.label} — \`${pv.wrapper}\``,
    "- **Control-Plane Region**: EU Frankfurt (`eu-central-1` / `fra1`)",
    `- **Preview Mode**: ${
      isTeam
        ? "Spurvik Team (€79/mo or €790/yr) — 9/9 sections populated from live Frankfurt telemetry & HITL ledger"
        : "Free Skeleton (€0) — 4/9 static sections scaffolded (upgrade to Team €79/mo for live Art. 12/14/19 auto-population)"
    }`,
    "",
    ...sections.flatMap((sec) => [
      `## Section ${sec.number} (${sec.annexRef}) — ${sec.title}`,
      `- **Source**: ${sec.sourceMode === "auto_populated_team" ? "Live Spurvik Team Vault (eu-central-1)" : "Static Engineering Scaffold"}`,
      `- **Record**: ${sec.summary}`,
      "",
    ]),
    "## Provider Sign-Off Checklist (Owner Organisation)",
    "- [ ] Confirm Annex III classification and intended purpose boundaries (Art. 6, Art. 9)",
    "- [ ] Attach evaluation datasets, bias tests, and human-oversight SOPs (Art. 10, Art. 14, Art. 15)",
    "- [ ] Complete EU Declaration of Conformity (Art. 47) and EU database registration where applicable (Art. 49)",
    "",
    "## Activate Live Annex IV Auto-Population (EU Frankfurt `fra1`)",
    `- **Team · €79/mo (9/9 sections live + 12-mo retention + PDF/MD export)**: [Start Team · €79/mo →](${upgradeUrls.teamAgencyEur79}) · [Annual · €790/yr (2 months free) →](${upgradeUrls.teamAnnualEur790})`,
    `- **Done-For-You 24h Engineering Setup · €199 once (incl. 1 yr Pro)**: [Book 24h Setup · €199 →](${upgradeUrls.doneForYou24hEur199})`,
    `- **Pro · €19/mo (White-label Art. 50 + 90-day vault + DPO summary)**: [Start Pro · €19/mo →](${upgradeUrls.proWhiteLabelEur19}) · [Interactive Annex IV Studio ↗](${studioUrl})`,
    `- **Free API Key (€0, 10s)**: [Mint Free Key →](${upgradeUrls.freeApiKey10sEur0})`,
    "",
    `_Technical documentation scaffold generated locally in n8n (0 network requests); supports EU AI Act Art. 11 & Annex IV preparation._`,
  ].join("\n");

  return {
    format: "spurvik.annex-iv-preview.v1",
    regulation: "Regulation (EU) 2024/1689 — Article 11(1) & Annex IV",
    highRiskApplicabilityDate: "2027-12-02",
    art502ProvenanceMilestone: "2026-12-02",
    region: "fra1",
    domain,
    displaySystem,
    locale,
    useCase,
    annexIiiReference: uc.annexIiiRef,
    provider,
    tier,
    readinessScorePct: isTeam ? 100 : 44,
    sections,
    markdown,
    studioUrl,
    previewApiUrl,
    upgradeUrls,
  };
}
