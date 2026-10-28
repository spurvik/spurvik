import type { ContentHashMode, ModelProvider } from "./types.js";
import { canonicalJson } from "./canonical.js";
import { hmacSha256Hex, timingSafeEqualString } from "./hash.js";

export const PROVENANCE_KIND = "provenance_record" as const;
export const SIGNATURE_ALG = "HMAC-SHA-256" as const;
export const PROVENANCE_VERSION = 2 as const;

/**
 * What the wrapped call could see about upstream marking.
 * `requested` means a marking parameter was present on the request.
 * `provider_confirmed` means the response or a marking header said a mark was present.
 * `not_requested` means the request or response explicitly said marking was off.
 * `inferred` means the model id is on the dated support table and no signal was on the object.
 * `unknown` is the default: missing provider, model, route, or signal, including errors.
 * None of these show that a mark is robust, detectable, or adequate under Art. 50(2).
 */
export type UpstreamMarkingStatus =
  | "requested"
  | "provider_confirmed"
  | "not_requested"
  | "inferred"
  | "unknown";

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
export type ProvenanceSignInput = Omit<
  ProvenanceSignedFields,
  "provenanceVersion" | "markingApplied" | "evidenceTrailerAttached" | "upstreamMarking"
> &
  Partial<
    Pick<ProvenanceSignedFields, "provenanceVersion" | "markingApplied" | "evidenceTrailerAttached" | "upstreamMarking">
  >;

export async function signProvenance(
  fields: ProvenanceSignInput,
  signingSecret: string,
): Promise<ProvenanceRecord> {
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
export async function verifyProvenanceSignature(
  record: ProvenanceRecord,
  signingSecret: string,
): Promise<boolean> {
  if (record.kind !== PROVENANCE_KIND || record.signatureAlg !== SIGNATURE_ALG) return false;
  const expected = await hmacSha256Hex(signingSecret, canonicalJson(signedMaterial(record)));
  return timingSafeEqualString(expected, record.signature);
}

function completeSignedFields(fields: ProvenanceSignInput): ProvenanceSignedFields {
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
function signedMaterial(record: ProvenanceRecord): ProvenanceSignedFields | Omit<
  ProvenanceSignedFields,
  "provenanceVersion" | "markingApplied" | "evidenceTrailerAttached" | "upstreamMarking"
> {
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
  if (record.provenanceVersion !== PROVENANCE_VERSION) return base;
  return {
    ...base,
    provenanceVersion: PROVENANCE_VERSION,
    markingApplied: record.markingApplied,
    evidenceTrailerAttached: record.evidenceTrailerAttached,
    upstreamMarking: record.upstreamMarking,
  };
}
