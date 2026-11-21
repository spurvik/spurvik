import type { ContentHashMode, ModelProvider } from "./types.js";
export declare const PROVENANCE_KIND: "provenance_record";
export declare const SIGNATURE_ALG: "HMAC-SHA-256";
export declare const PROVENANCE_VERSION: 2;
/**
 * What the wrapped call could see about upstream marking.
 * `requested` means a marking parameter was present on the request.
 * `provider_confirmed` means the response or a marking header said a mark was present.
 * `not_requested` means the request or response explicitly said marking was off.
 * `inferred` means the model id is on the dated support table and no signal was on the object.
 * `unknown` is the default: missing provider, model, route, or signal, including errors.
 * None of these show that a mark is robust, detectable, or adequate under Art. 50(2).
 */
export type UpstreamMarkingStatus = "requested" | "provider_confirmed" | "not_requested" | "inferred" | "unknown";
/**
 * Signed metadata about one model call.
 *
 * This is a provenance record. It is evidence a deployer can keep beside,
 * and optionally inside, an output. It is not an Article 50(2) machine-readable
 * marking by itself: a field on an API object does not travel with the content
 * once that object is discarded, and it is not a conformity finding.
 *
 * `article50Disclosure` is true only when the caller set it. It records that
 * configuration for Article 50(1) support. It does not mean a notice was shown
 * or that the notice was legally sufficient.
 */
export interface ProvenanceSignedFields {
    kind: typeof PROVENANCE_KIND;
    eventId: string;
    timestamp: string;
    modelId: string;
    modelProvider: ModelProvider;
    contentHashMode: ContentHashMode;
    inputHash: string | null;
    outputHash: string | null;
    article50Disclosure: boolean;
    markingHookId: string | null;
    provenanceVersion: typeof PROVENANCE_VERSION;
    /**
     * True only for a C2PA manifest that was embedded, a watermark hook that
     * changed the content, or upstream status `provider_confirmed`.
     * A signed text trailer does not set this. Covered by `signature`.
     */
    markingApplied: boolean;
    /**
     * True when our own text trailer or metadata hook was attached.
     * This is not an Art. 50(2) mark. Covered by `signature`.
     */
    evidenceTrailerAttached: boolean;
    /** Covered by `signature`. Defaults to `unknown`. */
    upstreamMarking: UpstreamMarkingStatus;
}
export interface ProvenanceRecord extends ProvenanceSignedFields {
    signature: string;
    signatureAlg: typeof SIGNATURE_ALG;
}
/** Fields a caller may omit. Omitted marking values stay false or `unknown`. */
export type ProvenanceSignInput = Omit<ProvenanceSignedFields, "provenanceVersion" | "markingApplied" | "evidenceTrailerAttached" | "upstreamMarking"> & Partial<Pick<ProvenanceSignedFields, "provenanceVersion" | "markingApplied" | "evidenceTrailerAttached" | "upstreamMarking">>;
export declare function signProvenance(fields: ProvenanceSignInput, signingSecret: string): Promise<ProvenanceRecord>;
/**
 * Check that `signature` matches the signed fields under `signingSecret`.
 * A match shows the signed fields still match the HMAC-SHA-256 signature made with your signing secret. It does not show that a notice was shown, that output is marked, or that your system meets the Act.
 */
export declare function verifyProvenanceSignature(record: ProvenanceRecord, signingSecret: string): Promise<boolean>;
