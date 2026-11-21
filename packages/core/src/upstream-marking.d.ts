import type { UpstreamMarkingStatus } from "./provenance.js";
import { supportInference, type UpstreamRouteKind } from "./upstream-support.js";
export declare const UPSTREAM_MARKING_KIND: "upstream_marking_evidence";
export type UpstreamApplied = "applied" | "not_applied" | "unknown";
export type UpstreamModality = "text" | "image" | "audio" | "video" | "unknown";
/** Where the marking signal was read. `none` means the call exposed no marking flag or header. */
export type MarkingEvidenceSource = "response" | "request" | "header" | "none";
export interface MarkingSignal {
    source: "request" | "response" | "header";
    name: string;
    value: string;
}
export interface UpstreamMarkingFields {
    eventId: string;
    timestamp: string;
    provider: string;
    model: string;
    modality: UpstreamModality;
    upstreamApplied: UpstreamApplied;
    /**
     * Finer status than `upstreamApplied`.
     * `provider_confirmed` is the only value that can make `markingApplied` true.
     */
    upstreamStatus: UpstreamMarkingStatus;
    /** Our own trailer or metadata hook. Not an Art. 50(2) mark. */
    evidenceTrailerAttached: boolean;
    localApplied: boolean;
    /** Direct provider API, or a cloud-partner route. */
    routeKind: UpstreamRouteKind;
    /** Which signal decided the status. Not a legal source of a mark. */
    markingSource: MarkingEvidenceSource;
    requested: MarkingSignal[];
    returned: MarkingSignal[];
}
export interface SignedUpstreamMarking extends UpstreamMarkingFields {
    signature: string;
    /** Canonical JSON that was signed, including `kind`. */
    signedPayload: string;
}
/**
 * Read marking settings the caller sent and flags or headers the SDK object
 * actually carries. Missing signals stay unknown. This does not call a detector
 * and does not treat a provider's documentation as a mark on this response.
 */
export declare function observeUpstreamMarking(input: {
    provider: string;
    model: string | null;
    modality: UpstreamModality;
    request: unknown;
    response: unknown;
    localApplied: boolean;
    /** SDK path, joined. Used to keep cloud-partner routes off the first-party table. */
    route?: string;
}): UpstreamMarkingFields;
/**
 * Map signals to a status. Response confirmation wins. A support-table match
 * is `inferred` and does not mean a mark was present on this response.
 * Unknown provider, model, or route stays `unknown`.
 */
export declare function classifyUpstreamMarking(input: {
    provider: string;
    model: string;
    modality: string;
    route: string;
    requested: readonly MarkingSignal[];
    returned: readonly MarkingSignal[];
}, support?: Parameters<typeof supportInference>[3]): UpstreamMarkingStatus;
export declare function appliedFromStatus(status: UpstreamMarkingStatus): UpstreamApplied;
/**
 * Sign one evidence event with the client-held secret.
 * A later match shows the payload still matches the HMAC-SHA-256 signature made with your signing secret. It is not a finding that a system meets the Act.
 */
export declare function signUpstreamMarkingEvidence(fields: UpstreamMarkingFields, secret: string): Promise<SignedUpstreamMarking>;
/** A match shows the stored payload still matches the HMAC-SHA-256 signature made with your signing secret. It is not a finding that a system meets the Act. */
export declare function verifyUpstreamMarkingEvidence(signedPayload: string, signature: string, secret: string): Promise<boolean>;
export declare function parseUpstreamMarkingPayload(signedPayload: string): UpstreamMarkingFields | null;
