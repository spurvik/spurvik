/**
 * Product taxonomy for the control plane. It is not a legal classification.
 * The provider decides which tier matches the use.
 *
 * - `minimal`: no specific transparency or high-risk duties are being configured.
 * - `limited_art50`: Article 50 transparency (interaction notice and/or synthetic-content marking).
 * - `high_annex3`: High-risk (Annex III). Article 12 and Article 11 with Annex IV
 *   apply to those systems from 2 December 2027 (AI Omnibus timeline). Article 14 applies to high-risk AI systems listed in Annex III from 2 December 2027. Annex I systems
 *   embedded in regulated products follow a later date (2 August 2028) and are not a
 *   separate tier in this schema.
 */
export type RiskTier = "minimal" | "limited_art50" | "high_annex3";

/**
 * How prompt and output fingerprints are produced before anything is sent
 * to the control plane.
 *
 * - `off`: no content fingerprint is computed or stored.
 * - `on`: unsalted SHA-256 of the extracted text.
 * - `keyed`: HMAC-SHA-256 with a secret or salt that stays on the client.
 *
 * A fingerprint of text that relates to an identifiable person can still be
 * personal data. Keyed mode is designed to support pseudonymisation
 * (GDPR Article 4(5)): the additional information (the HMAC key) is held
 * only by the client and is not transmitted. Neither mode is anonymisation,
 * and neither should be described as non-personal data.
 */
export type ContentHashMode = "on" | "off" | "keyed";

export type ModelProvider = "openai" | "anthropic" | "google" | "mistral" | "open_weight" | "unknown";

export type HitlStatus = "pending" | "pending_confirmation" | "approved" | "rejected" | "overridden";

/**
 * Article 12(3) fields for Annex III point 1(a) remote biometric identification.
 * These are deployer references, not samples, images, embeddings, or templates.
 */
export interface BiometricLogFields {
  periodStart: string;
  periodEnd: string;
  referenceDatabase: string;
  inputReference: string;
  checkers: string[];
}

export type AuditHitlStatus = HitlStatus | "not_required";

/** Where a human decision was submitted. */
export type DecisionSource = "console" | "api";

/**
 * Pointer from a hash-chain row to a human-decision row.
 * The reason text stays on that row and is not part of this object.
 */
export interface DecisionRef {
  approvalId: string;
  status: Exclude<HitlStatus, "pending">;
  source: DecisionSource;
}

/**
 * Pointer from a hash-chain row to a halt or a release.
 * The reason text and any earlier reason stay on the row and are not part of this object.
 */
export interface OversightRef {
  op: "halt" | "release";
  scope: "project" | "action";
  target: string;
  priorHalted: boolean;
}

/** Logical fields covered by an audit record hash. `recordHash` is the output, not an input. */
export interface AuditLinkFields {
  id: string;
  projectId: string;
  seq: number;
  eventId: string;
  timestamp: string;
  modelProvider: string;
  modelVersion: string;
  inputHash: string | null;
  outputHash: string | null;
  contentHashMode: ContentHashMode;
  latencyMs: number;
  temperature: number | null;
  /**
   * True only for an embedded C2PA manifest, a watermark hook that changed the
   * content, or upstream status provider_confirmed. A signed text trailer does
   * not set this. This is not a finding that Article 50(2) is met.
   * Rows sealed before the rename hashed this boolean as `article50Watermarked`.
   */
  contentMarkingApplied: boolean;
  markingHookId: string | null;
  hitlStatus: AuditHitlStatus | null;
  prevLogHash: string | null;
  /**
   * Present only when the record carries Article 12(3) biometric references.
   * Omitted from the hash material when absent, so older rows still match.
   */
  biometric?: BiometricLogFields | null;
  /**
   * Present only on a human-decision chain row. Omitted when absent, so rows
   * sealed before this field still match. The reason text is not included.
   */
  decisionRef?: DecisionRef | null;
  /**
   * Present only on an oversight halt or release. Omitted when absent, so rows
   * sealed before this field still match. The reason text and the prior reason
   * are not included.
   */
  oversightRef?: OversightRef | null;
}

export interface AuditLink extends AuditLinkFields {
  recordHash: string;
}
