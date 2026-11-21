/**
 * `spurvik rfp`: EU AI Act vendor security questionnaire & DPO RFP answers, built locally.
 *
 * Bundled into the CLI only (not a library export). Same module as `n8n-nodes-spurvik/vendor-questionnaire.ts`,
 * and the Markdown matches `packages/mcp/src/tools/vendor-questionnaire.ts` (spurvik-mcp-server@1.0.8 tool #10):
 * the same five questions and plan facts. Pure: no network, no fs, no credential, no logging.
 * Plan figures follow console `PLAN_LIMITS` and `upgrade-plans.ts`. Field names follow `@spurvik/core`
 * (inputHash, outputHash, recordHash, prevLogHash). An invalid or private domain is dropped and never echoed.
 */
/** Interactive EU AI Act vendor security questionnaire and DPO RFP auto-responder. */
export declare const SPURVIK_VENDOR_QUESTIONNAIRE_URL = "https://spurvik.com/eu-ai-act-vendor-security-questionnaire";
export declare const SPURVIK_QUESTIONNAIRE_PLANS: readonly ["free", "pro", "team", "concierge"];
export type SpurvikQuestionnairePlan = (typeof SPURVIK_QUESTIONNAIRE_PLANS)[number];
export declare const SPURVIK_QUESTIONNAIRE_PROVIDERS: readonly ["openai", "anthropic", "google-genai", "vercel-ai-sdk", "langgraph", "openai-agents", "mastra", "python", "custom"];
export type SpurvikQuestionnaireProvider = (typeof SPURVIK_QUESTIONNAIRE_PROVIDERS)[number];
export declare const SPURVIK_QUESTIONNAIRE_LOCALES: readonly ["en", "de", "fr", "nl", "da", "sv", "es", "it"];
export type SpurvikQuestionnaireLocale = (typeof SPURVIK_QUESTIONNAIRE_LOCALES)[number];
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
    /** Optional answer language: `en` (default), `de`, `fr`, `nl`, `da`. */
    locale?: unknown;
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
/**
 * Bare public hostname (`acme.eu`) from a domain or an http(s) URL, or null.
 * Same rules as spurvik-mcp-server's `publicHostname`: IP literals (the TLD must be alphabetic, and IPv6 keeps
 * its brackets), localhost, internal suffixes, credentials, ports and non-ASCII names are refused, so a value
 * that is returned is safe to print and to put in a query string. Nothing is resolved; no request is made.
 */
export declare function questionnaireHostname(raw: unknown): string | null;
/**
 * Copy-paste answers to the five EU AI Act questions enterprise buyers put in vendor security questionnaires
 * and DPO RFPs. Pure and deterministic: no network call, no credential. Throws only for a plan, provider or flag
 * outside the allowed values (the value is not repeated). A domain that is not a public hostname is dropped.
 */
export declare function spurvikVendorQuestionnaireAnswers(input?: SpurvikVendorQuestionnaireInput): SpurvikVendorQuestionnaireOutput;
