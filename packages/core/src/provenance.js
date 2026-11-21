import { canonicalJson } from "./canonical.js";
import { hmacSha256Hex, timingSafeEqualString } from "./hash.js";
export const PROVENANCE_KIND = "provenance_record";
export const SIGNATURE_ALG = "HMAC-SHA-256";
export const PROVENANCE_VERSION = 2;
export async function signProvenance(fields, signingSecret) {
    if (!signingSecret) {
        throw new Error("A client-held signing secret is required.");
    }
    const signedFields = completeSignedFields(fields);
    const signature = await hmacSha256Hex(signingSecret, canonicalJson(signedFields));
    return {
        ...signedFields,
        signature,
        signatureAlg: SIGNATURE_ALG,
    };
}
/**
 * Check that `signature` matches the signed fields under `signingSecret`.
 * A match shows the signed fields still match the HMAC-SHA-256 signature made with your signing secret. It does not show that a notice was shown, that output is marked, or that your system meets the Act.
 */
export async function verifyProvenanceSignature(record, signingSecret) {
    if (record.kind !== PROVENANCE_KIND || record.signatureAlg !== SIGNATURE_ALG)
        return false;
    const expected = await hmacSha256Hex(signingSecret, canonicalJson(signedMaterial(record)));
    return timingSafeEqualString(expected, record.signature);
}
function completeSignedFields(fields) {
    return {
        kind: fields.kind,
        eventId: fields.eventId,
        timestamp: fields.timestamp,
        modelId: fields.modelId,
        modelProvider: fields.modelProvider,
        contentHashMode: fields.contentHashMode,
        inputHash: fields.inputHash,
        outputHash: fields.outputHash,
        article50Disclosure: fields.article50Disclosure,
        markingHookId: fields.markingHookId,
        provenanceVersion: PROVENANCE_VERSION,
        markingApplied: fields.markingApplied ?? false,
        evidenceTrailerAttached: fields.evidenceTrailerAttached ?? false,
        upstreamMarking: fields.upstreamMarking ?? "unknown",
    };
}
/**
 * Version 2 records include the marking fields. Older records were signed
 * without them, and still check against that smaller set.
 */
function signedMaterial(record) {
    const base = {
        kind: record.kind,
        eventId: record.eventId,
        timestamp: record.timestamp,
        modelId: record.modelId,
        modelProvider: record.modelProvider,
        contentHashMode: record.contentHashMode,
        inputHash: record.inputHash,
        outputHash: record.outputHash,
        article50Disclosure: record.article50Disclosure,
        markingHookId: record.markingHookId,
    };
    if (record.provenanceVersion !== PROVENANCE_VERSION)
        return base;
    return {
        ...base,
        provenanceVersion: PROVENANCE_VERSION,
        markingApplied: record.markingApplied,
        evidenceTrailerAttached: record.evidenceTrailerAttached,
        upstreamMarking: record.upstreamMarking,
    };
}
