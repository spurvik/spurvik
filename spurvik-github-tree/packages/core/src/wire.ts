import type { AuditHitlStatus, BiometricLogFields, ContentHashMode, HitlStatus } from "./types.js";

/**
 * Control-plane ingestion bodies. These carry fingerprints and operational
 * metadata. They must not contain prompt or output text.
 */
export interface TelemetryIngestEvent {
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
   * True only when a machine-readable mark was applied to the content.
   * False when no mark was applied. Not an Article 50(2) finding.
   */
  contentMarkingApplied: boolean;
  /**
   * True when a signed text trailer or metadata hook was attached.
   * Omitted by older clients. Not part of the audit-record hash.
   * This is not an Art. 50(2) mark.
   */
  evidenceTrailerAttached?: boolean;
  markingHookId: string | null;
  hitlStatus: AuditHitlStatus | null;
  /** Stable id for one SDK process. Used to notice missing client sequence numbers. */
  clientInstanceId?: string;
  /** Monotonic sequence for `clientInstanceId`, starting at 1. */
  clientSeq?: number;
  /**
   * Article 12(3) references for remote biometric identification.
   * A URI or keyed fingerprint. Not a sample, image, embedding, or template.
   */
  biometric?: BiometricLogFields | null;
  /**
   * Signed upstream-marking evidence for this call.
   * Omitted by older clients. Not part of the audit-record hash.
   */
  upstreamMarking?: {
    signedPayload: string;
    signature: string;
  };
}

export interface TelemetryIngestBody {
  events: TelemetryIngestEvent[];
}

export interface TelemetryIngestResult {
  inserted: number;
  duplicates: number;
  /** Chain-gap records written because a client sequence jumped. */
  gaps: number;
}

export interface HitlCreateBody {
  actionName: string;
  payloadSummary: string;
}

export interface HitlDecisionBody {
  status: Exclude<HitlStatus, "pending" | "pending_confirmation">;
  /** Required for approve, reject, and override. Stored beside the chain, not inside the record hash. */
  reason: string;
}

export interface HitlRecordWire {
  id: string;
  projectId: string;
  actionName: string;
  payloadSummary: string;
  status: HitlStatus;
  reviewerId: string | null;
  decidedAt: string | null;
  overrideReason: string | null;
  decisionReason: string | null;
  /** `console` for the oversight page. `api` for `submitHumanDecision()`. */
  decisionSource: "console" | "api" | null;
  createdAt: string;
}

export interface OversightWriteBody {
  op: "halt" | "release";
  actionName?: string | null;
  reason?: string;
  /**
   * `caller` when the request included a reason.
   * `sdk_default` when the SDK substituted its blank-reason sentence.
   * The value is client-asserted. The server does not verify it.
   * Console writes store NULL. A raw API call that omits the field stores NULL.
   * Not part of the oversight response.
   */
  reasonSource?: "caller" | "sdk_default";
}

export interface OversightStateWire {
  projectHalted: boolean;
  actionName: string | null;
  actionHalted: boolean;
  /**
   * On a release response, the reason just recorded.
   * On a halt response, the reason stored for this stop.
   * On a later read, the halt reason left on the control row. A release does not clear it.
   */
  reason: string | null;
  /**
   * On a release response, the halt reason that was in effect.
   * Null on a halt response. Null on a later read, including a read after a release.
   */
  previousReason: string | null;
  reviewerId: string | null;
  updatedAt: string | null;
  /** Increments when a human stop is engaged or released. */
  epoch: number;
}

export type DisclosureNoticeKind =
  | "interaction"
  | "generated"
  | "deepfake"
  | "public_interest_text"
  | "emotion_biometric";

export interface DisclosureWriteBody {
  sessionId: string;
  jurisdiction: string;
  timestamp?: string;
  noticeKind?: DisclosureNoticeKind;
}

export interface DisclosureRecordWire {
  id: string;
  projectId: string;
  sessionId: string;
  jurisdiction: string;
  timestamp: string;
  noticeKind: DisclosureNoticeKind;
}

/** Signed body posted when a human records an Article 14 decision. */
export interface HitlWebhookEnvelope {
  type: "hitl.decision";
  deliveryId: string;
  projectId: string;
  approval: HitlRecordWire;
}

/** Signed body posted when a human stop is engaged or released. */
export interface OversightWebhookEnvelope {
  type: "oversight.changed";
  deliveryId: string;
  projectId: string;
  epoch: number;
  state: OversightStateWire;
}

/**
 * Signed notice that telemetry was stored.
 * Counts and event ids only. No prompt or output text.
 */
export interface TelemetryWebhookEnvelope {
  type: "telemetry.ingested";
  deliveryId: string;
  projectId: string;
  inserted: number;
  duplicates: number;
  eventIds: string[];
}

export type WebhookEnvelope = HitlWebhookEnvelope | OversightWebhookEnvelope | TelemetryWebhookEnvelope;
