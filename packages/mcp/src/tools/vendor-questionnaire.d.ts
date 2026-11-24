/**
 * Zero-network, deterministic answers to the five EU AI Act questions enterprise buyers put in vendor
 * security questionnaires and DPO RFPs, for spurvik_vendor_questionnaire_answers (stdio) and the hosted
 * console. Every claim maps to a shipped control. Plan figures follow console `PLAN_LIMITS` and
 * `upgrade-plans.ts`. Field names follow `@spurvik/core` (inputHash, outputHash, recordHash, prevLogHash).
 * Pure: no fs, no network, no logging. An invalid domain is dropped and never echoed.
 */
export declare const QUESTIONNAIRE_PLANS: readonly ["free", "pro", "team", "concierge"];
export type QuestionnairePlan = (typeof QUESTIONNAIRE_PLANS)[number];
export declare const QUESTIONNAIRE_PROVIDERS: readonly ["openai", "anthropic", "google-genai", "vercel-ai-sdk", "langgraph", "openai-agents", "mastra", "python", "custom"];
export type QuestionnaireProvider = (typeof QUESTIONNAIRE_PROVIDERS)[number];
export declare const QUESTIONNAIRE_LOCALES: readonly ["en", "de", "fr", "nl", "da", "sv", "es", "it"];
export type QuestionnaireLocale = (typeof QUESTIONNAIRE_LOCALES)[number];
export interface VendorQuestionnaireInput {
    plan?: QuestionnairePlan;
    provider?: QuestionnaireProvider;
    hasHighRiskActions?: boolean;
    generatesMedia?: boolean;
    domain?: string;
    locale?: QuestionnaireLocale;
}
export type VendorQuestionnaireOutcome = {
    ok: true;
    text: string;
} | {
    ok: false;
    error: string;
    message: string;
};
export declare const VENDOR_QUESTIONNAIRE_DEFAULTS: {
    readonly plan: "pro";
    readonly provider: "openai";
    readonly hasHighRiskActions: true;
    readonly generatesMedia: false;
};
export declare const MAX_QUESTIONNAIRE_DOMAIN_CHARS = 2048;
/** JSON Schema of the tool input, the same shape server.ts registers with zod. Every field is optional. */
export declare const VENDOR_QUESTIONNAIRE_INPUT_JSON_SCHEMA: {
    readonly type: "object";
    readonly properties: {
        readonly plan: {
            readonly type: "string";
            readonly enum: readonly ["free", "pro", "team", "concierge"];
            readonly description: "Spurvik plan the answers describe. Defaults to pro.";
        };
        readonly provider: {
            readonly type: "string";
            readonly enum: readonly ["openai", "anthropic", "google-genai", "vercel-ai-sdk", "langgraph", "openai-agents", "mastra", "python", "custom"];
            readonly description: "Model provider or agent framework the product uses. Defaults to openai.";
        };
        readonly hasHighRiskActions: {
            readonly type: "boolean";
            readonly description: "Agents or tools can trigger refunds, emails, permission changes or deletions. Defaults to true.";
        };
        readonly generatesMedia: {
            readonly type: "boolean";
            readonly description: "The product generates synthetic images, audio or video (Art. 50(2)). Defaults to false.";
        };
        readonly domain: {
            readonly type: "string";
            readonly maxLength: 2048;
            readonly description: "Optional public hostname of the product, for example acme.eu. Used to prefill links; an invalid value is ignored.";
        };
        readonly locale: {
            readonly type: "string";
            readonly enum: readonly ["en", "de", "fr", "nl", "da", "sv", "es", "it"];
            readonly description: "Optional answer language: en (default), de (German DSB), fr (French DPO), nl (Dutch FG), da (Danish DPO), sv (Swedish DSO), es (Spanish DPD) or it (Italian RPD/DPO).";
        };
    };
    readonly additionalProperties: false;
};
/** Copy-paste Markdown answers to the five EU AI Act vendor-questionnaire questions. Pure and deterministic. */
export declare function vendorQuestionnaireAnswers(rawInput?: unknown): VendorQuestionnaireOutcome;
