export { SpurvikClient, provenanceOf, withSpurvik, withAegis } from "./client.js";
/**
 * @deprecated Use SpurvikClient, SpurvikConfig, SpurvikBound, and SpurvikProvenance.
 * Removed in the next release.
 */
export { SpurvikClient as AegisClient } from "./client.js";
export type { SpurvikBound, SpurvikProvenance, HumanApprovalOptions, KillSwitchOptions } from "./client.js";
export { HALT_REASON_WHEN_BLANK, RELEASE_REASON_WHEN_BLANK } from "./client.js";
export type { SpurvikBound as AegisBound, SpurvikProvenance as AegisProvenance } from "./client.js";
export type { SpurvikConfig } from "./config.js";
export type { SpurvikConfig as AegisConfig } from "./config.js";
export {
  SpurvikError,
  SpurvikConfigError,
  SpurvikApiError,
  SpurvikHaltedError,
  SpurvikOversightTimeoutError,
  SpurvikHitlTimeoutError,
  SpurvikHitlRejectedError,
  SpurvikTelemetryBufferError,
} from "./errors.js";
/** @deprecated Use the Spurvik* error classes. Removed in the next release. */
export {
  SpurvikError as AegisError,
  SpurvikConfigError as AegisConfigError,
  SpurvikApiError as AegisApiError,
  SpurvikHaltedError as AegisHaltedError,
  SpurvikHitlTimeoutError as AegisHitlTimeoutError,
  SpurvikTelemetryBufferError as AegisTelemetryBufferError,
} from "./errors.js";
export { MemoryTelemetryBuffer, KvTelemetryBuffer } from "./buffer.js";
export type { DurableTelemetryBuffer, TelemetryKvStore } from "./buffer.js";
export { verifyHitlWebhook } from "./webhook.js";
export { createSignedTextTrailerHook, readSignedTextTrailer, verifyProvenanceSignature } from "@spurvik/core";
export type {
  ContentHashMode,
  HitlRecordWire,
  MediaMarkingHook,
  ProvenanceRecord,
  RiskTier,
  TextMarkingHook,
} from "@spurvik/core";
