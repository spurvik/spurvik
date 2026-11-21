/**
 * What each provider documents about output marking.
 * Edit this list when a public source changes. `sourceReadOn` is the date the
 * source was read. It is not a conformity check.
 */
export type MarkingProvider = "openai" | "anthropic" | "google" | "mistral" | "open_weight";
export type MarkingModality = "text" | "image" | "audio" | "video";
/** How the provider's own documentation describes the mark. */
export type DocumentedMarking = "default" | "opt_in" | "none" | "not_documented";
/** Whether a deployer can use a documented detector. */
export type DocumentedDetection = "public" | "restricted" | "none" | "not_documented";
export interface ProviderMarkingEntry {
    provider: MarkingProvider;
    modality: MarkingModality;
    marking: DocumentedMarking;
    detection: DocumentedDetection;
    /** Factual limit. Designed to support record-keeping. Not a legal conclusion. */
    summary: string;
    sourceUrl: string;
    sourceReadOn: string;
}
export declare const MARKING_REGISTRY: readonly ProviderMarkingEntry[];
export declare function markingRegistryEntry(provider: string, modality: MarkingModality): ProviderMarkingEntry | null;
export interface MarkingCoverageEvent {
    provider: string;
    model: string;
    modality: string;
    upstreamApplied: "applied" | "not_applied" | "unknown";
    localApplied: boolean;
}
export interface MarkingCoverageRow {
    provider: string;
    model: string;
    modality: string;
    calls: number;
    upstreamApplied: number;
    upstreamNotApplied: number;
    upstreamUnknown: number;
    localApplied: number;
}
export declare function markingCoverage(events: readonly MarkingCoverageEvent[]): MarkingCoverageRow[];
/**
 * Text-output limits for a project. Robust provider marking is treated as
 * something these records cannot show when the public SDK exposes no mark
 * and the documented detector is not public.
 */
export declare function documentedTextLimits(events: readonly MarkingCoverageEvent[]): string;
export declare function providerLabel(provider: string): string;
