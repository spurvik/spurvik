export declare const SPURVIK_RISK_AREAS: readonly ["general", "biometrics", "critical_infrastructure", "education", "employment_hr", "essential_services_credit", "law_enforcement", "migration_border", "justice_democracy"];
export type SpurvikRiskArea = (typeof SPURVIK_RISK_AREAS)[number];
export type SpurvikAnnexIiiArea = Exclude<SpurvikRiskArea, "general">;
export declare const SPURVIK_RISK_TIERS: readonly ["prohibited_art5", "high_risk_annex_iii", "limited_transparency_art50", "minimal_risk"];
export type SpurvikRiskTier = (typeof SPURVIK_RISK_TIERS)[number];
export declare const MAX_RISK_USE_CASE_CHARS = 4000;
export declare const RISK_SCOPE_NOTE = "Engineering mapping aid; not legal advice.";
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
    prohibitedPractices: Array<{
        id: string;
        article: string;
        label: string;
    }>;
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
export type SpurvikClassifyRiskOutcome = {
    ok: true;
    report: SpurvikClassifyRiskReport;
} | {
    ok: false;
    error: string;
    message: string;
};
export declare function classifySpurvikRisk(input: SpurvikClassifyRiskInput): SpurvikClassifyRiskOutcome;
