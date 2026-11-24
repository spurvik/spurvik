/**
 * Deterministic, zero-network EU AI Act risk-tier mapping for spurvik_classify_ai_act_risk.
 * Same input, same output. The use-case text is matched against fixed patterns and is never echoed back or logged.
 * Dates follow the hosted console copy (`components/obligations/copy.ts`).
 */
export declare const RISK_DOMAINS: readonly ["general", "biometrics", "critical_infrastructure", "education", "employment_hr", "essential_services_credit", "law_enforcement", "migration_border", "justice_democracy"];
export type RiskDomain = (typeof RISK_DOMAINS)[number];
export type AnnexIiiArea = Exclude<RiskDomain, "general">;
export declare const RISK_TIERS: readonly ["prohibited_art5", "high_risk_annex_iii", "limited_transparency_art50", "minimal_risk"];
export type RiskTier = (typeof RISK_TIERS)[number];
export declare const MAX_USE_CASE_CHARS = 4000;
export declare const SCOPE_NOTE = "Engineering mapping aid; not legal advice.";
export interface ClassifyRiskInput {
    useCase: string;
    domain?: RiskDomain;
    interactsWithHumans?: boolean;
    generatesSyntheticMedia?: boolean;
    makesAutomatedDecisionsAboutPeople?: boolean;
    siteDomain?: string;
    locale?: string;
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
    prohibitedPractices: Array<{
        id: string;
        article: string;
        label: string;
    }>;
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
    /** Deep link to /risk-check with ?preset=cv-screener|media-generator|support-chatbot preselected for 1-click colleague sharing. */
    prefilledRiskCheckUrl: string;
    reportUrl?: string;
    selfAssessmentMarkdown?: string;
    upgradeUrls: {
        pro: UpgradeOffer;
        team: UpgradeOffer;
        concierge: UpgradeOffer;
    };
    scopeNote: string;
}
export type ClassifyRiskOutcome = {
    ok: true;
    result: ClassifyRiskResult;
} | {
    ok: false;
    error: string;
    message: string;
};
/** JSON Schema of the tool input, the same shape server.ts registers with zod. */
export declare const CLASSIFY_RISK_INPUT_JSON_SCHEMA: {
    readonly type: "object";
    readonly properties: {
        readonly useCase: {
            readonly type: "string";
            readonly description: "One or two sentences on what the AI system does and for whom. Not stored or echoed.";
        };
        readonly domain: {
            readonly type: "string";
            readonly enum: readonly ["general", "biometrics", "critical_infrastructure", "education", "employment_hr", "essential_services_credit", "law_enforcement", "migration_border", "justice_democracy"];
            readonly description: "Annex III area, or general. Defaults to general.";
        };
        readonly interactsWithHumans: {
            readonly type: "boolean";
            readonly description: "People talk to or chat with the system (Art. 50(1)).";
        };
        readonly generatesSyntheticMedia: {
            readonly type: "boolean";
            readonly description: "The system generates audio, images, video or text (Art. 50(2)/(4)).";
        };
        readonly makesAutomatedDecisionsAboutPeople: {
            readonly type: "boolean";
            readonly description: "The system decides about, ranks or scores natural persons, or materially influences such decisions.";
        };
        readonly siteDomain: {
            readonly type: "string";
            readonly maxLength: 2048;
            readonly description: "Optional public hostname of the app or store (for example personio.de). Prefills Console links and selfAssessmentMarkdown.";
        };
        readonly locale: {
            readonly type: "string";
            readonly maxLength: 16;
            readonly description: "Optional 2-letter EU locale (for example en, de, fr, nl, da, sv, es, it, fi, pl) for Console links.";
        };
    };
    readonly required: readonly ["useCase"];
    readonly additionalProperties: false;
};
/** Maps one AI use case to an EU AI Act risk tier with duties, dates and Spurvik controls. Pure and deterministic. */
export declare function classifyAiActRisk(rawInput: unknown): ClassifyRiskOutcome;
