/**
 * `spurvik risk`: deterministic, zero-network EU AI Act risk-tier mapping & DPO self-assessment Markdown record.
 *
 * Bundled into the CLI only (not a root library export). Mirrors `packages/mcp/src/tools/classify-risk.ts`
 * (`spurvik_classify_ai_act_risk`): same tiers, Annex III points, Article 5 patterns, dates, and scope note.
 * Pure: no network, no fs, no credential, no logging. Free-text `useCase` is matched against fixed patterns
 * and is never echoed or stored. An invalid or private `siteDomain` is dropped and never echoed.
 */
import { questionnaireHostname } from "./vendor-questionnaire.js";

const CONSOLE_ORIGIN = "https://console.spurvik.com";
const RISK_CHECK_URL = `${CONSOLE_ORIGIN}/risk-check`;
const REPORT_URL = `${CONSOLE_ORIGIN}/report`;
const C2PA_URL = `${CONSOLE_ORIGIN}/c2pa`;
const SIGNUP_URL = `${CONSOLE_ORIGIN}/signup`;
const PRO_SIGNUP_URL = `${SIGNUP_URL}?plan=pro`;
const TEAM_SIGNUP_URL = `${SIGNUP_URL}?plan=team`;
const CONCIERGE_SIGNUP_URL = `${SIGNUP_URL}?plan=concierge`;
const BADGE_SCRIPT_SRC = "https://spurvik.com/badge.js";

export const SPURVIK_RISK_AREAS = [
  "general",
  "biometrics",
  "critical_infrastructure",
  "education",
  "employment_hr",
  "essential_services_credit",
  "law_enforcement",
  "migration_border",
  "justice_democracy",
] as const;
export type SpurvikRiskArea = (typeof SPURVIK_RISK_AREAS)[number];
export type SpurvikAnnexIiiArea = Exclude<SpurvikRiskArea, "general">;

export const SPURVIK_RISK_TIERS = [
  "prohibited_art5",
  "high_risk_annex_iii",
  "limited_transparency_art50",
  "minimal_risk",
] as const;
export type SpurvikRiskTier = (typeof SPURVIK_RISK_TIERS)[number];

export const MAX_RISK_USE_CASE_CHARS = 4000;
export const RISK_SCOPE_NOTE = "Engineering mapping aid; not legal advice.";

export interface SpurvikRiskSignal {
  value: boolean;
  source: "input" | "useCase_keywords" | "default";
}

export interface SpurvikRiskObligation {
  article: string;
  duty: string;
  appliesFrom: string;
}

export interface SpurvikRiskControl {
  article: string;
  control: string;
  tool: string | null;
  plan: "free" | "pro" | "team" | null;
}

export interface SpurvikRiskUpgradeOffer {
  url: string;
  price: string;
  includes: string;
}

export interface SpurvikClassifyRiskInput {
  /** Optional free-text description (max 4000 chars). Matched locally and never echoed. */
  useCase?: string;
  /** Optional Annex III area or `general` (default). */
  area?: SpurvikRiskArea;
  /** Optional public domain or http(s) URL to prefill links and badge locale. Private/invalid hosts are dropped. */
  siteDomain?: string;
  /** Optional explicit EU badge locale override (e.g. `fr`, `de`, `es`, `it`, `sv`, `nl`, `da`). */
  locale?: string;
  interactsWithHumans?: boolean;
  generatesSyntheticMedia?: boolean;
  makesAutomatedDecisionsAboutPeople?: boolean;
}

export interface SpurvikClassifyRiskReport {
  tool: "spurvik_classify_ai_act_risk";
  tier: SpurvikRiskTier;
  tierLabel: string;
  domain: string | null;
  locale: string;
  annexIiiArea: SpurvikAnnexIiiArea | null;
  annexIiiPoint: string | null;
  areaSource: "input" | "useCase_keywords" | null;
  prohibitedPractices: Array<{ id: string; article: string; label: string }>;
  signals: {
    interactsWithHumans: SpurvikRiskSignal;
    generatesSyntheticMedia: SpurvikRiskSignal;
    makesAutomatedDecisionsAboutPeople: SpurvikRiskSignal;
  };
  rationale: string[];
  reviewFlags: string[];
  obligations: SpurvikRiskObligation[];
  recommendedSpurvikControls: SpurvikRiskControl[];
  interactiveClassifierUrl: string;
  reportUrl: string | null;
  upgradeUrls: {
    free: SpurvikRiskUpgradeOffer;
    pro: SpurvikRiskUpgradeOffer;
    team: SpurvikRiskUpgradeOffer;
    concierge: SpurvikRiskUpgradeOffer;
  } | null;
  markdown: string;
  scopeNote: string;
}

export type SpurvikClassifyRiskOutcome =
  | { ok: true; report: SpurvikClassifyRiskReport }
  | { ok: false; error: string; message: string };

const TIER_LABELS: Record<SpurvikRiskTier, string> = {
  prohibited_art5: "Prohibited practice (Article 5)",
  high_risk_annex_iii: "High-risk (Article 6(2) and Annex III)",
  limited_transparency_art50: "Transparency duties only (Article 50)",
  minimal_risk: "Minimal risk",
};

const ANNEX_POINTS: Record<SpurvikAnnexIiiArea, string> = {
  biometrics: "Annex III point 1 (biometrics)",
  critical_infrastructure: "Annex III point 2 (critical infrastructure)",
  education: "Annex III point 3 (education and vocational training)",
  employment_hr: "Annex III point 4 (employment and workers management)",
  essential_services_credit: "Annex III point 5 (essential private and public services, credit)",
  law_enforcement: "Annex III point 6 (law enforcement)",
  migration_border: "Annex III point 7 (migration, asylum and border control)",
  justice_democracy: "Annex III point 8 (administration of justice and democratic processes)",
};

const PROHIBITED: ReadonlyArray<{ id: string; article: string; label: string; pattern: RegExp }> = [
  {
    id: "subliminal_manipulation",
    article: "Art. 5(1)(a)",
    label: "Subliminal, manipulative or deceptive techniques that distort behaviour",
    pattern:
      /\bsubliminal\b|\b(?:covert|deceptive) (?:manipulation|persuasion|nudg\w*)|\bmanipulat\w* (?:users?|people|customers?|voters?|consumers?) (?:into|to)\b/,
  },
  {
    id: "exploiting_vulnerabilities",
    article: "Art. 5(1)(b)",
    label: "Exploiting vulnerabilities due to age, disability or social or economic situation",
    pattern: /\bexploit\w* (?:the )?(?:vulnerab\w*|children|minors|elderly|disabilit\w*|financial hardship|poverty)/,
  },
  {
    id: "social_scoring",
    article: "Art. 5(1)(c)",
    label: "Social scoring",
    pattern: /\bsocial[- ]scor(?:e|es|ing)\b|\bcitizen[- ]scor(?:e|es|ing)\b|\bsocial credit (?:score|system)/,
  },
  {
    id: "predictive_policing_profiling",
    article: "Art. 5(1)(d)",
    label: "Predicting that a person will commit a crime based solely on profiling",
    pattern: /\bpredict\w*[^.]{0,60}\b(?:commit\w* (?:a )?(?:crimes?|criminal|offen[cs]es?)|re-?offend\w*)/,
  },
  {
    id: "untargeted_face_scraping",
    article: "Art. 5(1)(e)",
    label: "Untargeted scraping of facial images to build facial recognition databases",
    pattern: /\b(?:untargeted|mass|bulk) scrap\w*[^.]{0,50}\bfac(?:e|es|ial)\b|\bscrap\w*[^.]{0,50}\bfacial (?:images|recognition database)/,
  },
  {
    id: "emotion_recognition_work_education",
    article: "Art. 5(1)(f)",
    label: "Emotion recognition in the workplace or in education",
    pattern:
      /\bemotion(?:al)? (?:recognition|detection|inference|analysis|tracking)[^.]{0,60}\b(?:employees?|workers?|workplace|staff|students?|pupils?|classrooms?|schools?)\b|\b(?:employees?|workers?|workplace|staff|students?|pupils?|classrooms?|schools?)\b[^.]{0,60}\bemotion(?:al)? (?:recognition|detection|inference|analysis|tracking)/,
  },
  {
    id: "biometric_categorisation_sensitive",
    article: "Art. 5(1)(g)",
    label: "Biometric categorisation inferring race, political opinions, trade union membership, religion or sex life",
    pattern:
      /\bbiometric\w*[^.]{0,60}\b(?:race|racial|ethnic\w*|political (?:opinions?|views|affiliation)|trade union|religio\w*|sexual orientation|sex life)\b|\b(?:infer|predict|classif)\w*[^.]{0,40}\b(?:sexual orientation|religio\w*|political (?:opinions?|views)|race|ethnicity)\b[^.]{0,40}\bfrom (?:faces?|facial|biometric)/,
  },
  {
    id: "realtime_remote_biometric_identification",
    article: "Art. 5(1)(h)",
    label: "Real-time remote biometric identification in public spaces for law enforcement",
    pattern:
      /\breal[- ]time\b[^.]{0,40}\b(?:facial recognition|face identification|remote biometric identification)\b[^.]{0,80}\b(?:public|streets?|police|law enforcement)\b|\b(?:police|law enforcement)\b[^.]{0,80}\breal[- ]time (?:facial recognition|face identification|remote biometric identification)/,
  },
];

const ANNEX_KEYWORDS: ReadonlyArray<{ area: SpurvikAnnexIiiArea; pattern: RegExp }> = [
  {
    area: "biometrics",
    pattern: /\b(?:remote biometric identification|facial recognition|face recognition|biometric categori[sz]ation|emotion(?:al)? recognition)\b/,
  },
  {
    area: "critical_infrastructure",
    pattern:
      /\b(?:safety component|control system)s?\b[^.]{0,60}\b(?:grid|electricity|gas|water|heating|traffic|critical (?:digital )?infrastructure)\b|\b(?:power grid|electricity grid|water supply|gas supply|heating supply|road traffic) (?:control|management|operation)/,
  },
  {
    area: "education",
    pattern:
      /\b(?:admissions? (?:decisions?|screening|scoring)|exam proctoring|proctoring|automated grading|grad(?:e|es|ing) (?:students?|exams?|essays?)|assess\w* (?:students?|learning outcomes)|student (?:assessment|evaluation|scoring))\b/,
  },
  {
    area: "employment_hr",
    pattern:
      /\b(?:cvs?|resumes?|résumés?|candidates?|applicants?|applications?) (?:screen\w*|rank\w*|filter\w*|scor\w*|shortlist\w*)|\b(?:screen\w*|rank\w*|filter\w*|scor\w*|shortlist\w*) (?:cvs?|resumes?|candidates?|job applicants?|applications?)\b|\b(?:recruit\w*|hiring) (?:decisions?|tool|platform|screening)\b|\bpromotion decisions?\b|\bterminat\w* (?:employees?|workers?|contracts)\b|\bperformance (?:evaluation|monitoring) of (?:employees?|workers?)\b|\bworker (?:monitoring|task allocation)\b/,
  },
  {
    area: "essential_services_credit",
    pattern:
      /\bcredit ?(?:scor\w*|worthiness|checks?|decisions?|limits?)\b|\bcreditworth\w*|\bloan (?:approval|decisions?|underwriting|eligibility)\b|\b(?:life|health) insurance (?:pricing|risk assessment|underwriting)\b|\b(?:public |social )?benefits? eligibility\b|\bwelfare eligibility\b|\bemergency (?:calls?|dispatch) (?:triage|classification|prioriti[sz]ation)\b/,
  },
  {
    area: "law_enforcement",
    pattern: /\b(?:police|law enforcement)\b[^.]{0,60}\b(?:risk assessment|evidence|polygraph|profil\w*|suspects?|victims?)\b|\bevidence reliability\b/,
  },
  {
    area: "migration_border",
    pattern: /\b(?:asylum|visa applications?|residence permits?|border control|migration risk|migrants?)\b/,
  },
  {
    area: "justice_democracy",
    pattern:
      /\b(?:court|judicial|judges?|sentencing|dispute resolution)\b[^.]{0,40}\b(?:decisions?|rulings?|research|interpret\w*|assist\w*)\b|\binfluenc\w*[^.]{0,30}\b(?:elections?|referend\w*|voting behaviou?r)\b/,
  },
];

const INTERACTS_RE =
  /\b(?:chat ?bots?|chat assistant|assistants?|virtual agents?|conversational|voice ?bots?|ai agents?|copilots?|customer (?:support|service) (?:bots?|agents?|ai)|talks? (?:to|with) (?:users|customers|people|visitors))\b/;
const SYNTHETIC_RE =
  /\bgenerat\w*[^.]{0,40}\b(?:images?|videos?|audio|voices?|speech|music|text|content|articles?|avatars?|copy|descriptions?|posts?|captions?|emails?|summar(?:y|ies)|stories|reports?)\b|\btext-to-(?:image|video|speech)\b|\bdeep ?fakes?\b|\bsynthetic (?:media|voices?|videos?|images?)\b|\bimage generator\b|\bvoice clon\w*/;
const DECISIONS_RE =
  /\b(?:approv|reject|den(?:y|ies)|rank|scor|screen|shortlist|select|filter|assess|evaluat|decid)\w*[^.]{0,40}\b(?:applicants?|candidates?|customers?|people|persons|individuals|students?|employees?|workers?|patients?|tenants?|borrowers?|claimants?|citizens?)\b/;
const DEEPFAKE_RE = /\bdeep ?fakes?\b|\b(?:face|voice) (?:swap\w*|clon\w*)\b|\bsynthetic (?:people|persons?|faces?)\b/;
const EMOTION_RE = /\bemotion(?:al)? (?:recognition|detection|inference|analysis|tracking)\b|\bbiometric categori[sz]ation\b/;

const ART50_FROM = "2026-08-02";
const ANNEX_III_FROM = "2027-12-02";
const ART5_FROM = "2025-02-02";

const TLD_LOCALE: Readonly<Record<string, string>> = {
  de: "de", at: "de", fr: "fr", nl: "nl", be: "nl", dk: "da", se: "sv", es: "es", it: "it",
  pl: "pl", pt: "pt", fi: "fi", cz: "cs", ro: "ro", hu: "hu", gr: "el", bg: "bg", hr: "hr",
  sk: "sk", si: "sl", lt: "lt", lv: "lv", ee: "et",
};

function inferLocale(domain: string | null, explicit?: string): string {
  if (explicit && /^[a-z]{2}$/.test(explicit)) return explicit;
  if (!domain) return "en";
  const tld = domain.split(".").pop() ?? "";
  return TLD_LOCALE[tld] ?? "en";
}

function buildMarkdown(report: Omit<SpurvikClassifyRiskReport, "markdown">): string {
  const heading = report.domain
    ? `# EU AI Act Risk Self-Assessment Record · ${report.domain}`
    : "# EU AI Act Risk Self-Assessment Record";
  const lines: string[] = [
    heading,
    "",
    `- **Classification**: ${report.tierLabel} (\`${report.tier}\`)`,
  ];
  if (report.annexIiiPoint) {
    lines.push(`- **Annex III area**: ${report.annexIiiPoint}`);
  }
  lines.push(
    `- **Signals**: interactsWithHumans=${report.signals.interactsWithHumans.value} (${report.signals.interactsWithHumans.source}), generatesSyntheticMedia=${report.signals.generatesSyntheticMedia.value} (${report.signals.generatesSyntheticMedia.source}), makesAutomatedDecisionsAboutPeople=${report.signals.makesAutomatedDecisionsAboutPeople.value} (${report.signals.makesAutomatedDecisionsAboutPeople.source})`,
  );
  if (report.prohibitedPractices.length > 0) {
    lines.push(
      `- **Matched Article 5 practices**: ${report.prohibitedPractices.map((p) => `${p.article} (${p.label})`).join("; ")}`,
    );
  }
  lines.push("", "## Rationale");
  for (const item of report.rationale) lines.push(`- ${item}`);

  if (report.reviewFlags.length > 0) {
    lines.push("", "## Engineering & DPO review flags");
    for (const flag of report.reviewFlags) lines.push(`- ${flag}`);
  }

  lines.push("", "## Applicable EU AI Act duties & milestones");
  if (report.obligations.length === 0) {
    lines.push("- No mandatory Article 5, Annex III or Article 50 duties matched; retain this self-assessment on file.");
  } else {
    for (const ob of report.obligations) {
      lines.push(`- **${ob.article}** (from \`${ob.appliesFrom}\`): ${ob.duty}`);
    }
  }

  lines.push("", "## Recommended Spurvik engineering controls");
  for (const ctrl of report.recommendedSpurvikControls) {
    const planTag = ctrl.plan ? ` [${ctrl.plan}]` : "";
    lines.push(`- **${ctrl.article}**${planTag}: ${ctrl.control}`);
  }

  if (report.tier !== "prohibited_art5" && report.signals.interactsWithHumans.value) {
    const sysAttr = report.domain ? ` data-system-name="${report.domain}"` : "";
    lines.push(
      "",
      `## Copy-paste Art. 50(1) notice snippet (\`${report.locale}\`, Free €0)`,
      "```html",
      `<script src="${BADGE_SCRIPT_SRC}" data-locale="${report.locale}"${sysAttr} defer></script>`,
      "```",
    );
  }

  if (report.upgradeUrls) {
    lines.push("", "## Next steps");
    lines.push(`- Interactive EU AI Act risk classifier: ${report.interactiveClassifierUrl}`);
    if (report.reportUrl) {
      lines.push(`- Live Art. 50(1) readiness report (${report.domain}): ${report.reportUrl}`);
    }
    lines.push(`- ${report.upgradeUrls.free.includes} (${report.upgradeUrls.free.price}): ${report.upgradeUrls.free.url}`);
    lines.push(`- ${report.upgradeUrls.pro.includes} (${report.upgradeUrls.pro.price}): ${report.upgradeUrls.pro.url}`);
    lines.push(`- ${report.upgradeUrls.team.includes} (${report.upgradeUrls.team.price}): ${report.upgradeUrls.team.url}`);
    lines.push(`- ${report.upgradeUrls.concierge.includes} (${report.upgradeUrls.concierge.price}): ${report.upgradeUrls.concierge.url}`);
  }

  lines.push("", RISK_SCOPE_NOTE, "");
  return lines.join("\n");
}

export function classifySpurvikRisk(input: SpurvikClassifyRiskInput): SpurvikClassifyRiskOutcome {
  const area: SpurvikRiskArea = input.area ?? "general";
  if (!(SPURVIK_RISK_AREAS as readonly string[]).includes(area)) {
    return { error: "invalid_area", message: `--area must be one of ${SPURVIK_RISK_AREAS.join(", ")}`, ok: false };
  }
  const hasExplicitUseCase = typeof input.useCase === "string" && input.useCase.trim().length > 0;
  if (typeof input.useCase === "string" && input.useCase.length > MAX_RISK_USE_CASE_CHARS) {
    return {
      ok: false,
      error: "invalid_use_case",
      message: `--use-case must be at most ${MAX_RISK_USE_CASE_CHARS} characters.`,
    };
  }

  const domain = questionnaireHostname(input.siteDomain);
  const locale = inferLocale(domain, input.locale);
  const rawText = hasExplicitUseCase
    ? input.useCase!.toLowerCase().replace(/\s+/g, " ")
    : "";

  const defaultInteracts =
    !hasExplicitUseCase &&
    area === "general" &&
    input.interactsWithHumans === undefined &&
    input.generatesSyntheticMedia === undefined &&
    input.makesAutomatedDecisionsAboutPeople === undefined;

  const signals: SpurvikClassifyRiskReport["signals"] = {
    interactsWithHumans:
      typeof input.interactsWithHumans === "boolean"
        ? { value: input.interactsWithHumans, source: "input" }
        : hasExplicitUseCase
          ? { value: INTERACTS_RE.test(rawText), source: "useCase_keywords" }
          : { value: defaultInteracts, source: "default" },
    generatesSyntheticMedia:
      typeof input.generatesSyntheticMedia === "boolean"
        ? { value: input.generatesSyntheticMedia, source: "input" }
        : hasExplicitUseCase
          ? { value: SYNTHETIC_RE.test(rawText), source: "useCase_keywords" }
          : { value: false, source: "default" },
    makesAutomatedDecisionsAboutPeople:
      typeof input.makesAutomatedDecisionsAboutPeople === "boolean"
        ? { value: input.makesAutomatedDecisionsAboutPeople, source: "input" }
        : hasExplicitUseCase
          ? { value: DECISIONS_RE.test(rawText), source: "useCase_keywords" }
          : { value: false, source: "default" },
  };

  const prohibited = PROHIBITED.filter((entry) => entry.pattern.test(rawText)).map(({ id, article, label }) => ({
    id,
    article,
    label,
  }));
  const keywordAreas = ANNEX_KEYWORDS.filter((entry) => entry.pattern.test(rawText)).map((entry) => entry.area);
  const annexArea: SpurvikAnnexIiiArea | null = area !== "general" ? area : keywordAreas[0] ?? null;
  const areaSource: "input" | "useCase_keywords" | null =
    area !== "general" ? "input" : annexArea ? "useCase_keywords" : null;
  const deepfake = DEEPFAKE_RE.test(rawText);
  const emotionOrBiometric = EMOTION_RE.test(rawText) || annexArea === "biometrics";

  const rationale: string[] = [];
  const reviewFlags: string[] = [];
  let tier: SpurvikRiskTier;

  const areaWithoutPersonDecision = annexArea === "critical_infrastructure" || annexArea === "biometrics";
  const optedOut = input.makesAutomatedDecisionsAboutPeople === false && !areaWithoutPersonDecision;

  if (prohibited.length > 0) {
    tier = "prohibited_art5";
    rationale.push(`The use case matches ${prohibited.map((entry) => entry.article).join(", ")}.`);
    reviewFlags.push(
      "Article 5 has narrow exceptions (for example medical or safety reasons for emotion recognition). Get legal advice before you go further.",
    );
  } else if (annexArea && !optedOut) {
    tier = "high_risk_annex_iii";
    rationale.push(
      `${ANNEX_POINTS[annexArea]} ${areaSource === "input" ? "was selected" : "matches the use case"}${
        signals.makesAutomatedDecisionsAboutPeople.value ? " and the system decides about or ranks people" : ""
      }.`,
    );
    reviewFlags.push(
      "Article 6(3): an Annex III system is not high-risk when it only performs a narrow procedural task or does not materially influence decisions; document that assessment (Article 6(4)). A system that profiles natural persons is always high-risk.",
    );
    if (annexArea === "biometrics") {
      reviewFlags.push("Biometric verification whose only purpose is to confirm that a person is who they claim to be is not in Annex III point 1.");
    }
    if (signals.makesAutomatedDecisionsAboutPeople.source !== "input" && !signals.makesAutomatedDecisionsAboutPeople.value) {
      reviewFlags.push("Pass --no-decisions when the system does not decide about, rank or score people.");
    }
  } else {
    if (annexArea && optedOut) {
      reviewFlags.push(
        `${ANNEX_POINTS[annexArea]} applies but --no-decisions was passed. Check that the use is not one listed in that point and keep the Article 6(3) assessment on file.`,
      );
    }
    const transparency =
      signals.interactsWithHumans.value || signals.generatesSyntheticMedia.value || deepfake || emotionOrBiometric;
    tier = transparency ? "limited_transparency_art50" : "minimal_risk";
    rationale.push(
      transparency
        ? "No Article 5 practice and no Annex III use matched; an Article 50 transparency trigger applies."
        : "No Article 5 practice, Annex III use or Article 50 trigger matched.",
    );
  }

  const obligations: SpurvikRiskObligation[] = [];
  const controls: SpurvikRiskControl[] = [];

  if (tier === "prohibited_art5") {
    obligations.push({
      article: "Art. 5",
      duty: "Do not place on the market, put into service or use this practice.",
      appliesFrom: ART5_FROM,
    });
    controls.push({
      article: "Art. 5",
      control: "Spurvik does not offer a setup for a prohibited practice. Get legal advice before you go further.",
      tool: null,
      plan: null,
    });
  } else {
    if (signals.interactsWithHumans.value) {
      obligations.push({
        article: "Art. 50(1)",
        duty: "Tell people they are interacting with an AI system (provider).",
        appliesFrom: ART50_FROM,
      });
      controls.push({
        article: "Art. 50(1)",
        control: "Add the 24-language Art. 50(1) notice (npx spurvik badge, Next.js <Script>, Shopify, WordPress or React).",
        tool: "spurvik_generate_art50_badge",
        plan: "free",
      });
    }
    if (signals.generatesSyntheticMedia.value) {
      obligations.push({
        article: "Art. 50(2)",
        duty: "Mark AI-generated audio, image, video or text output in a machine-readable format (provider; 2 Dec 2026 milestone).",
        appliesFrom: ART50_FROM,
      });
      controls.push({
        article: "Art. 50(2)",
        control: `Wrap model calls with withSpurvik for signed HMAC-SHA256 provenance records and check live images with npx spurvik c2pa (${C2PA_URL}). The provenance record supports, but does not replace, Art. 50(2) marking.`,
        tool: "spurvik_setup_snippet",
        plan: "free",
      });
    }
    if (emotionOrBiometric) {
      obligations.push({
        article: "Art. 50(3)",
        duty: "Tell people exposed to emotion recognition or biometric categorisation (deployer).",
        appliesFrom: ART50_FROM,
      });
    }
    if (deepfake) {
      obligations.push({
        article: "Art. 50(4)",
        duty: "Disclose deepfake image, audio or video content as artificially generated (deployer).",
        appliesFrom: ART50_FROM,
      });
    }
    if (emotionOrBiometric || deepfake) {
      controls.push({
        article: "Art. 50(3)/(4)",
        control: "Show the matching deployer notice next to the content or system (npx spurvik badge).",
        tool: "spurvik_generate_art50_badge",
        plan: "free",
      });
    }
    if (tier === "high_risk_annex_iii") {
      obligations.push(
        { article: "Art. 9-15", duty: "Risk management, data governance, accuracy and robustness for the high-risk system.", appliesFrom: ANNEX_III_FROM },
        { article: "Art. 11 + Annex IV", duty: "Technical documentation.", appliesFrom: ANNEX_III_FROM },
        { article: "Art. 12", duty: "Automatic logging of events over the system's lifetime.", appliesFrom: ANNEX_III_FROM },
        { article: "Art. 14", duty: "Human oversight measures.", appliesFrom: ANNEX_III_FROM },
        { article: "Art. 26", duty: "Deployer duties, including log retention and monitoring.", appliesFrom: ANNEX_III_FROM },
      );
      controls.push(
        {
          article: "Art. 12",
          control: "Log every model call with hash-chained HMAC-SHA256 receipts (npx spurvik setup), then scan with npx spurvik audit.",
          tool: "spurvik_setup_snippet",
          plan: "free",
        },
        { article: "Art. 12", control: "Find AI calls that bypass logging (npx spurvik audit . --fail-on-gap).", tool: "spurvik_find_unwrapped_calls", plan: "free" },
        { article: "Art. 14", control: "Route consequential actions to Slack or Teams human approval gates.", tool: null, plan: "pro" },
        { article: "Art. 11", control: "Export the Annex IV technical documentation draft from the Frankfurt console.", tool: null, plan: "team" },
      );
    }
    if (tier === "minimal_risk") {
      controls.push({
        article: "Voluntary",
        control: "Keep a record of this self-assessment. Optional: add the Free Art. 50 badge so users know when AI is involved.",
        tool: "spurvik_generate_art50_badge",
        plan: "free",
      });
    }
  }

  const localeParam = locale !== "en" ? `&locale=${encodeURIComponent(locale)}` : "";
  const appQuery = `${domain ? `&appUrl=${encodeURIComponent(domain)}` : ""}${localeParam}`;
  const freeParams = [
    ...(domain ? [`appUrl=${encodeURIComponent(domain)}`] : []),
    ...(locale !== "en" ? [`locale=${encodeURIComponent(locale)}`] : []),
  ];
  const freeSignupUrl = freeParams.length > 0 ? `${SIGNUP_URL}?${freeParams.join("&")}` : SIGNUP_URL;
  const interactiveClassifierUrl = domain ? `${RISK_CHECK_URL}?domain=${encodeURIComponent(domain)}` : RISK_CHECK_URL;
  const reportUrl = domain ? `${REPORT_URL}?domain=${encodeURIComponent(domain)}${localeParam}` : null;

  const upgradeUrls =
    tier === "prohibited_art5"
      ? null
      : {
          free: {
            url: freeSignupUrl,
            price: "€0/mo",
            includes: "Mint a Free SPURVIK_API_KEY in 10s (1-field email, EU Frankfurt fra1)",
          },
          pro: {
            url: `${PRO_SIGNUP_URL}${appQuery}`,
            price: "€19/mo (excl. VAT)",
            includes: "White-label Art. 50 badge, 90-day Frankfurt vault & Slack/Teams approval gates",
          },
          team: {
            url: `${TEAM_SIGNUP_URL}${appQuery}`,
            price: "€79/mo (excl. VAT)",
            includes: "2M events/mo, 12-month retention, webhook export & Annex IV technical documentation draft",
          },
          concierge: {
            url: `${CONCIERGE_SIGNUP_URL}${appQuery}`,
            price: "€199 once (excl. VAT, incl. 1 yr Pro)",
            includes: "Done-For-You 24h engineer installation & signed DPO readiness report",
          },
        };

  const base: Omit<SpurvikClassifyRiskReport, "markdown"> = {
    tool: "spurvik_classify_ai_act_risk",
    tier,
    tierLabel: TIER_LABELS[tier],
    domain,
    locale,
    annexIiiArea: tier === "prohibited_art5" ? null : annexArea,
    annexIiiPoint: tier === "prohibited_art5" || !annexArea ? null : ANNEX_POINTS[annexArea],
    areaSource: tier === "prohibited_art5" ? null : areaSource,
    prohibitedPractices: prohibited,
    signals,
    rationale,
    reviewFlags,
    obligations,
    recommendedSpurvikControls: controls,
    interactiveClassifierUrl,
    reportUrl,
    upgradeUrls,
    scopeNote: RISK_SCOPE_NOTE,
  };

  return {
    ok: true,
    report: {
      ...base,
      markdown: buildMarkdown(base),
    },
  };
}
