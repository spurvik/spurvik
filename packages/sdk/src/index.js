export { SpurvikClient, provenanceOf, withSpurvik, withAegis } from "./client.js";
/**
 * @deprecated Use SpurvikClient, SpurvikConfig, SpurvikBound, and SpurvikProvenance.
 * Removed in the next release.
 */
export { SpurvikClient as AegisClient } from "./client.js";
export { HALT_REASON_WHEN_BLANK, RELEASE_REASON_WHEN_BLANK } from "./client.js";
export { SpurvikError, SpurvikConfigError, SpurvikApiError, SpurvikHaltedError, SpurvikOversightTimeoutError, SpurvikHitlTimeoutError, SpurvikHitlRejectedError, SpurvikTelemetryBufferError, } from "./errors.js";
/** @deprecated Use the Spurvik* error classes. Removed in the next release. */
export { SpurvikError as AegisError, SpurvikConfigError as AegisConfigError, SpurvikApiError as AegisApiError, SpurvikHaltedError as AegisHaltedError, SpurvikHitlTimeoutError as AegisHitlTimeoutError, SpurvikTelemetryBufferError as AegisTelemetryBufferError, } from "./errors.js";
export { MemoryTelemetryBuffer, KvTelemetryBuffer } from "./buffer.js";
export { verifyHitlWebhook } from "./webhook.js";
export { createSignedApprovalLinks, verifyChannelApprovalToken, verifySignedChannelCallback, buildChannelOutboundRequest, dispatchHumanApprovalChannel, createMultiChannelApprovalRouter, } from "./channels.js";
export { createSignedTextTrailerHook, readSignedTextTrailer, verifyProvenanceSignature } from "@spurvik/core";
