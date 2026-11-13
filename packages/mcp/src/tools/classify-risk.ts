import {
  CONCIERGE_PRICE,
  CONCIERGE_SIGNUP_URL,
  CONSOLE_ORIGIN,
  PRICE_NOTE,
  PRO_PRICE,
  PRO_SIGNUP_URL,
  RISK_CHECK_URL,
  TEAM_PRICE,
  TEAM_SIGNUP_URL,
} from "../links.js";

/**
 * Deterministic, zero-network EU AI Act risk-tier mapping for spurvik_classify_ai_act_risk.
 * Same input, same output. The use-case text is matched against fixed patterns and is never echoed back or logged.
 * Dates follow the hosted console copy (`components/obligations/copy.ts`).
 */

export const RISK_DOMAINS = [
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
export type RiskDomain = (typeof RISK_DOMAINS)[number];
export type AnnexIiiArea = Exclude<RiskDomain, "general">;

export const RISK_TIERS = ["prohibited_art5", "high_risk_annex_iii", "limited_transparency_art50", "minimal_risk"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export const MAX_USE_CASE_CHARS = 4000;
export const SCOPE_NOTE = "Engineering mapping aid; not legal advice.";

export interface ClassifyRiskInput {
  useCase: string;
  domain?: RiskDomain;
  interactsWithHumans?: boolean;
  generatesSyntheticMedia?: boolean;
  makesAutomatedDecisionsAboutPeople?: boolean;
}

export interface Signal {
  value: boolean;
  source: "input" | "useCase_keywords";
}

export interface Obligation {
  article: string;
  duty: string;
  appliesFrom: string;
}

export interface SpurvikControl {
  article: string;
  control: string;
  tool: string | null;
  plan: "free" | "pro" | "team" | null;
}

export interface UpgradeOffer {
  url: string;
  price: string;
  includes: string;
}

export interface ClassifyRiskResult {
  tool: "spurvik_classify_ai_act_risk";
  tier: RiskTier;
  tierLabel: string;
  annexIiiArea: AnnexIiiArea | null;
  annexIiiPoint: string | null;
  domainSource: "input" | "useCase_keywords" | null;
  prohibitedPractices: Array<{ id: string; article: string; label: string }>;
  signals: {
    interactsWithHumans: Signal;
    generatesSyntheticMedia: Signal;
    makesAutomatedDecisionsAboutPeople: Signal;
  };
  rationale: string[];
  reviewFlags: string[];
  obligations: Obligation[];
  recommendedSpurvikControls: SpurvikControl[];
  interactiveClassifierUrl: string;
  upgradeUrls: { pro: UpgradeOffer; team: UpgradeOffer; concierge: UpgradeOffer };
  scopeNote: string;
}

export type ClassifyRiskOutcome = { ok: true; result: ClassifyRiskResult } | { ok: false; error: string; message: string };

/** JSON Schema of the tool input, the same shape server.ts registers with zod. */
export const CLASSIFY_RISK_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    useCase: { type: "string", description: "One or two sentences on what the AI system does and for whom. Not stored or echoed." },
    domain: { type: "string", enum: [...RISK_DOMAINS], description: "Annex III area, or general. Defaults to general." },
    interactsWithHumans: { type: "boolean", description: "People talk to or chat with the system (Art. 50(1))." },
    generatesSyntheticMedia: { type: "boolean", description: "The system generates audio, images, video or text (Art. 50(2)/(4))." },
    makesAutomatedDecisionsAboutPeople: {
      type: "boolean",
      description: "The system decides about, ranks or scores natural persons, or materially influences such decisions.",
    },
  },
  required: ["useCase"],
  additionalProperties: false,
} as const;

const TIER_LABELS: Record<RiskTier, string> = {
  prohibited_art5: "Prohibited practice (Article 5)",
  high_risk_annex_iii: "High-risk (Article 6(2) and Annex III)",
  limited_transparency_art50: "Transparency duties only (Article 50)",
  minimal_risk: "Minimal risk",
};

const ANNEX_POINTS: Record<AnnexIiiArea, string> = {
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
    pattern: /\bsubliminal\b|\b(?:covert|deceptive) (?:manipulation|persuasion|nudg\w*)|\bmanipulat\w* (?:users?|people|customers?|voters?|consumers?) (?:into|to)\b/,
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

const ANNEX_KEYWORDS: ReadonlyArray<{ area: AnnexIiiArea; pattern: RegExp }> = [
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

function signal(explicit: boolean | undefined, text: string, pattern: RegExp): Signal {
  if (typeof explicit === "boolean") return { value: explicit, source: "input" };
  return { value: pattern.test(text), source: "useCase_keywords" };
}

function upgradeOffers(): ClassifyRiskResult["upgradeUrls"] {
  return {
    pro: { url: PRO_SIGNUP_URL, price: `${PRO_PRICE} (${PRICE_NOTE})`, includes: "White-label Art. 50 badge and hosted Slack/Teams approval gates (Art. 14)." },
    team: { url: TEAM_SIGNUP_URL, price: `${TEAM_PRICE} (${PRICE_NOTE})`, includes: "Annex IV technical documentation draft (Art. 11) and webhook export." },
    concierge: { url: CONCIERGE_SIGNUP_URL, price: `${CONCIERGE_PRICE} (${PRICE_NOTE})`, includes: "Done-For-You 24h setup, includes 1 year of Pro." },
  };
}

function validate(input: unknown): ClassifyRiskInput | { error: string; message: string } {
  if (!input || typeof input !== "object") return { error: "invalid_input", message: "Pass an object with useCase." };
  const record = input as Record<string, unknown>;
  if (typeof record.useCase !== "string" || !record.useCase.trim()) {
    return { error: "invalid_use_case", message: "Pass useCase as a non-empty string." };
  }
  if (record.useCase.length > MAX_USE_CASE_CHARS) {
    return { error: "invalid_use_case", message: `useCase is longer than ${MAX_USE_CASE_CHARS} characters.` };
  }
  if (record.domain !== undefined && !(RISK_DOMAINS as readonly unknown[]).includes(record.domain)) {
    return { error: "invalid_domain", message: `domain must be one of: ${RISK_DOMAINS.join(", ")}.` };
  }
  for (const key of ["interactsWithHumans", "generatesSyntheticMedia", "makesAutomatedDecisionsAboutPeople"] as const) {
    if (record[key] !== undefined && typeof record[key] !== "boolean") {
      return { error: "invalid_flag", message: `${key} must be true or false.` };
    }
  }
  return record as unknown as ClassifyRiskInput;
}

/** Maps one AI use case to an EU AI Act risk tier with duties, dates and Spurvik controls. Pure and deterministic. */
export function classifyAiActRisk(rawInput: unknown): ClassifyRiskOutcome {
  const checked = validate(rawInput);
  if ("error" in checked) return { ok: false, error: checked.error, message: checked.message };
  const input = checked;
  const text = input.useCase.toLowerCase().replace(/\s+/g, " ");
  const domain: RiskDomain = input.domain ?? "general";

  const signals = {
    interactsWithHumans: signal(input.interactsWithHumans, text, INTERACTS_RE),
    generatesSyntheticMedia: signal(input.generatesSyntheticMedia, text, SYNTHETIC_RE),
    makesAutomatedDecisionsAboutPeople: signal(input.makesAutomatedDecisionsAboutPeople, text, DECISIONS_RE),
  };
  const prohibited = PROHIBITED.filter((entry) => entry.pattern.test(text)).map(({ id, article, label }) => ({ id, article, label }));
  const keywordAreas = ANNEX_KEYWORDS.filter((entry) => entry.pattern.test(text)).map((entry) => entry.area);
  const annexArea: AnnexIiiArea | null = domain !== "general" ? domain : keywordAreas[0] ?? null;
  const domainSource = domain !== "general" ? "input" : annexArea ? "useCase_keywords" : null;
  const deepfake = DEEPFAKE_RE.test(text);
  const emotionOrBiometric = EMOTION_RE.test(text) || annexArea === "biometrics";

  const rationale: string[] = [];
  const reviewFlags: string[] = [];
  let tier: RiskTier;

  // Areas where the Annex III use itself is not a decision about a person.
  const areaWithoutPersonDecision = annexArea === "critical_infrastructure" || annexArea === "biometrics";
  const optedOut = input.makesAutomatedDecisionsAboutPeople === false && !areaWithoutPersonDecision;

  if (prohibited.length > 0) {
    tier = "prohibited_art5";
    rationale.push(`The use case matches ${prohibited.map((entry) => entry.article).join(", ")}.`);
    reviewFlags.push("Article 5 has narrow exceptions (for example medical or safety reasons for emotion recognition). Get legal advice before you go further.");
  } else if (annexArea && !optedOut) {
    tier = "high_risk_annex_iii";
    rationale.push(
      `${ANNEX_POINTS[annexArea]} ${domainSource === "input" ? "was selected" : "matches the use case"}${
        signals.makesAutomatedDecisionsAboutPeople.value ? " and the system decides about or ranks people" : ""
      }.`,
    );
    reviewFlags.push(
      "Article 6(3): an Annex III system is not high-risk when it only performs a narrow procedural task or does not materially influence decisions; document that assessment (Article 6(4)). A system that profiles natural persons is always high-risk.",
    );
    if (annexArea === "biometrics") {
      reviewFlags.push("Biometric verification whose only purpose is to confirm that a person is who they claim to be is not in Annex III point 1.");
    }
    if (signals.makesAutomatedDecisionsAboutPeople.source === "useCase_keywords" && !signals.makesAutomatedDecisionsAboutPeople.value) {
      reviewFlags.push("Pass makesAutomatedDecisionsAboutPeople: false when the system does not decide about, rank or score people.");
    }
  } else {
    if (annexArea && optedOut) {
      reviewFlags.push(
        `${ANNEX_POINTS[annexArea]} applies but no decisions about people were reported. Check that the use is not one listed in that point and keep the Article 6(3) assessment on file.`,
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

  const obligations: Obligation[] = [];
  const controls: SpurvikControl[] = [];

  if (tier === "prohibited_art5") {
    obligations.push({ article: "Art. 5", duty: "Do not place on the market, put into service or use this practice.", appliesFrom: ART5_FROM });
    controls.push({
      article: "Art. 5",
      control: "Spurvik does not offer a setup for a prohibited practice. Get legal advice before you go further.",
      tool: null,
      plan: null,
    });
  } else {
    if (signals.interactsWithHumans.value) {
      obligations.push({ article: "Art. 50(1)", duty: "Tell people they are interacting with an AI system (provider).", appliesFrom: ART50_FROM });
      controls.push({
        article: "Art. 50(1)",
        control: "Add the Art. 50(1) notice (badge.js <script>, Next.js <Script>, WordPress, Framer or shadcn).",
        tool: "spurvik_generate_art50_badge",
        plan: "free",
      });
    }
    if (signals.generatesSyntheticMedia.value) {
      obligations.push({
        article: "Art. 50(2)",
        duty: "Mark AI-generated audio, image, video or text output in a machine-readable format (provider).",
        appliesFrom: ART50_FROM,
      });
      controls.push({
        article: "Art. 50(2)",
        control: `Wrap model calls with withSpurvik for signed provenance records and plug your own marking into the marking hooks; check images at ${CONSOLE_ORIGIN}/c2pa. The provenance record supports, but does not replace, Art. 50(2) marking.`,
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
      obligations.push({ article: "Art. 50(4)", duty: "Disclose deepfake image, audio or video content as artificially generated (deployer).", appliesFrom: ART50_FROM });
    }
    if (emotionOrBiometric || deepfake) {
      controls.push({
        article: "Art. 50(3)/(4)",
        control: "Show the matching deployer notice next to the content or system.",
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
          control: "Log every model call with hash-chained HMAC receipts, then scan for unwrapped calls.",
          tool: "spurvik_setup_snippet",
          plan: "free",
        },
        { article: "Art. 12", control: "Find AI calls that bypass logging.", tool: "spurvik_find_unwrapped_calls", plan: "free" },
        { article: "Art. 14", control: "Route risky actions to Slack or Teams approval gates.", tool: null, plan: "pro" },
        { article: "Art. 11", control: "Export the Annex IV technical documentation draft from the console.", tool: null, plan: "team" },
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

  return {
    ok: true,
    result: {
      tool: "spurvik_classify_ai_act_risk",
      tier,
      tierLabel: TIER_LABELS[tier],
      annexIiiArea: tier === "prohibited_art5" ? null : annexArea,
      annexIiiPoint: tier === "prohibited_art5" || !annexArea ? null : ANNEX_POINTS[annexArea],
      domainSource: tier === "prohibited_art5" ? null : domainSource,
      prohibitedPractices: prohibited,
      signals,
      rationale,
      reviewFlags,
      obligations,
      recommendedSpurvikControls: controls,
      interactiveClassifierUrl: RISK_CHECK_URL,
      upgradeUrls: upgradeOffers(),
      scopeNote: SCOPE_NOTE,
    },
  };
}
