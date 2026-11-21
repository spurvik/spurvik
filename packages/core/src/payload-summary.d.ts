/** Structured HITL summary. Field names only. Do not put personal data in a key. */
export declare const PAYLOAD_SUMMARY_SCHEMA: "spurvik.payload_summary.v1";
export interface PayloadSummaryDocument {
    schema: typeof PAYLOAD_SUMMARY_SCHEMA;
    keys: string[];
    contentFingerprint: string | null;
}
/**
 * Canonical JSON for a human-approval summary.
 * Keys are identifier-shaped field names. Values are not included.
 * The fingerprint is a hex digest the caller already computed, or null.
 */
export declare function buildPayloadSummary(input: {
    keys: readonly string[];
    contentFingerprint: string | null;
}): string;
export declare function parsePayloadSummary(value: string): PayloadSummaryDocument | null;
export declare function isPayloadSummary(value: string): boolean;
