import type { MarkingModality } from "./marking-registry.js";
/**
 * Dated notes on which model ids a public source lists as carrying a mark.
 * An empty `models` list means a model id alone is not enough.
 * Edit this file when a public source changes. `sourceReadOn` is the date the
 * page was read.
 */
export interface UpstreamSupportEntry {
    provider: string;
    modality: MarkingModality;
    /** Model ids the source lists. No wildcard. */
    models: readonly string[];
    sourceUrl: string;
    sourceReadOn: string;
    note: string;
}
/**
 * Help-center table read on 2026-10-17. These ids were listed without a text mark.
 * https://support.claude.com/en/articles/16266773-how-claude-marks-ai-generated-content
 */
export declare const ANTHROPIC_TEXT_MODELS_WITHOUT_MARK: readonly ["claude-opus-4-5", "claude-opus-4-6", "claude-opus-4-7", "claude-sonnet-4-5", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-mythos-5"];
export declare const UPSTREAM_SUPPORT: readonly UpstreamSupportEntry[];
/** Bedrock, Vertex, Foundry, and Azure are not the provider's own API route. */
export declare function isCloudPartnerRoute(route: string): boolean;
/** How the call reached the model. `direct` is the provider's own API. */
export type UpstreamRouteKind = "direct" | "bedrock" | "vertex" | "azure" | "foundry";
/**
 * Classify a path or an explicit `upstreamRoute` setting.
 * Foundry is checked before Azure so an Azure AI Foundry path is not folded into Azure OpenAI.
 */
export declare function classifyUpstreamRoute(route: string): UpstreamRouteKind;
export declare function supportInference(provider: string, model: string, modality: string, entries?: readonly UpstreamSupportEntry[]): boolean;
