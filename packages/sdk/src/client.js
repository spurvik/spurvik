import { buildPayloadSummary, canonicalJson, fingerprintContent, isWatermarkHook, mediaMarkWasApplied, observeUpstreamMarking, signProvenance, signUpstreamMarkingEvidence, } from "@spurvik/core";
import { resolveConfig } from "./config.js";
import { SpurvikConfigError, SpurvikHitlRejectedError, SpurvikHitlTimeoutError } from "./errors.js";
import { modalityFromPath, resolveProvider } from "./extract.js";
import { OversightCache } from "./oversight.js";
import { wrapClient } from "./proxy.js";
import { nodeProcess } from "./runtime.js";
import { TelemetryQueue } from "./telemetry.js";
import { ControlPlaneClient } from "./transport.js";
/** Sent when `engageKillSwitch` is called with no reason or a blank one. */
export const HALT_REASON_WHEN_BLANK = "Halted via SDK (no reason given)";
/** Sent when `releaseKillSwitch` is called with no reason or a blank one. */
export const RELEASE_REASON_WHEN_BLANK = "Released via SDK (no reason given)";
function reasonForOversight(reason, fallback) {
    const trimmed = reason?.trim() ?? "";
    if (trimmed.length > 0)
        return { reason: trimmed, reasonSource: "caller" };
    return { reason: fallback, reasonSource: "sdk_default" };
}
/**
 * Client for the Spurvik control plane and the provenance recorder.
 * It is designed to support record-keeping and human oversight. It does not certify a system or assess conformity.
 */
export class SpurvikClient {
    config;
    transport;
    queue;
    oversight;
    constructor(config) {
        this.config = resolveConfig(config);
        this.transport = new ControlPlaneClient(this.config);
        const durable = this.config.telemetry.durableBuffer;
        this.queue = new TelemetryQueue({
            maxSize: this.config.telemetry.maxQueue,
            maxBatch: this.config.telemetry.maxBatch,
            flushIntervalMs: this.config.telemetry.flushIntervalMs,
            maxRetries: this.config.telemetry.maxRetries,
            flushTimeoutMs: this.config.telemetry.flushTimeoutMs,
            sleep: this.config.sleep,
            onError: this.config.onTelemetryError,
            ...(durable ? { durable } : {}),
            strict: this.config.telemetry.strict,
            ...(this.config.telemetry.strict && !durable && nodeProcess()
                ? {
                    openDurable: async () => {
                        const { openFileTelemetryBuffer } = await import("./buffer-node.js");
                        return openFileTelemetryBuffer(this.config.apiKey);
                    },
                }
                : {}),
            send: async (events, signal) => {
                await this.transport.post("/api/v1/telemetry", { events }, signal ? { signal } : {});
            },
        });
        this.oversight = new OversightCache(this.transport, this.config);
        if (this.config.registerProcessHooks)
            this.queue.bindProcessHooks();
        this.oversight.startBackgroundRefresh();
        this.oversight.startPushInvalidation();
    }
    get droppedTelemetry() {
        return this.queue.dropped;
    }
    get applyMarkedTextToContent() {
        return this.config.applyToMessageContent;
    }
    get enforcesHaltOnInference() {
        return this.config.enforceHaltOnInference;
    }
    wrap(client) {
        return wrapClient(client, this);
    }
    /** Refresh halt state and throw if a human stop is engaged. */
    assertNotHalted(actionName) {
        return this.oversight.assertNotHalted(actionName);
    }
    /** Drop the cached stop flag so the next check reads the control plane. */
    invalidateHaltCache() {
        this.oversight.invalidate();
    }
    /**
     * supports human-oversight work (Article 14 applies to high-risk AI systems).
     * requireHumanApproval throws on 'rejected' and 'overridden'; continue only when it returns status 'approved'.
     * @throws {SpurvikHitlRejectedError} When the decision is rejected or overridden. Read `error.record.status`.
     * @throws {SpurvikHitlTimeoutError} When the wait ends before a decision.
     */
    async requireHumanApproval(actionName, payload, options) {
        await this.oversight.assertNotHalted(actionName);
        const created = await this.transport.post("/api/v1/hitl", {
            actionName,
            payloadSummary: await this.summarizePayload(payload),
        });
        const timeoutMs = options?.timeoutMs ?? this.config.hitl.timeoutMs;
        let interval = options?.pollIntervalMs ?? this.config.hitl.pollIntervalMs;
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            if (options?.signal?.aborted) {
                throw new SpurvikHitlTimeoutError(created.id);
            }
            const current = await this.transport.get(`/api/v1/hitl/${created.id}`);
            if (current.status === "rejected" || current.status === "overridden")
                throw new SpurvikHitlRejectedError(current);
            if (current.status !== "pending" && current.status !== "pending_confirmation")
                return current;
            if (Date.now() >= deadline)
                break;
            await waitForPoll(this.config.sleep, interval, options?.signal);
            if (options?.signal?.aborted)
                throw new SpurvikHitlTimeoutError(created.id);
            interval = Math.min(5_000, Math.round(interval * 1.5) || 1);
        }
        throw new SpurvikHitlTimeoutError(created.id);
    }
    submitHumanDecision(approvalId, decision) {
        this.requireReviewer();
        return this.transport.post(`/api/v1/hitl/${approvalId}/decision`, decision, { reviewer: true });
    }
    /**
     * supports human-oversight work (Article 14 applies to high-risk AI systems)
     */
    overrideHumanDecision(approvalId, input) {
        return this.submitHumanDecision(approvalId, {
            status: "overridden",
            reason: input.reason,
        });
    }
    /**
     * Halt a project, or one action when `actionName` is set.
     * A missing or blank reason is sent as "Halted via SDK (no reason given)".
     * The control plane refuses a halt that arrives with no reason.
     */
    async engageKillSwitch(input = {}) {
        this.requireReviewer();
        const { reason, reasonSource } = reasonForOversight(input.reason, HALT_REASON_WHEN_BLANK);
        const state = await this.transport.post("/api/v1/oversight", {
            op: "halt",
            reason,
            reasonSource,
            actionName: input.actionName ?? null,
        }, { reviewer: true });
        this.oversight.noteLocal(input.actionName ?? null, true);
        return state;
    }
    /**
     * Release a project halt, or one action when `actionName` is set.
     * Pass a reason when you have one. A missing or blank reason is sent as
     * "Released via SDK (no reason given)". The control plane does not fill that in.
     */
    async releaseKillSwitch(input = {}) {
        this.requireReviewer();
        const { reason, reasonSource } = reasonForOversight(input.reason, RELEASE_REASON_WHEN_BLANK);
        const state = await this.transport.post("/api/v1/oversight", {
            op: "release",
            reason,
            reasonSource,
            actionName: input.actionName ?? null,
        }, { reviewer: true });
        this.oversight.noteLocal(input.actionName ?? null, false);
        return state;
    }
    /**
     * Record that an Article 50(1) interaction notice was presented.
     * This is a record of a notice event, not proof the notice met the article.
     */
    recordDisclosure(input) {
        return this.transport.post("/api/v1/disclosure", {
            sessionId: input.sessionId,
            jurisdiction: input.jurisdiction ?? "EU",
            ...(input.timestamp ? { timestamp: input.timestamp } : {}),
        });
    }
    flush() {
        return this.queue.flush();
    }
    async shutdown() {
        this.oversight.stop();
        await this.queue.shutdown();
    }
    requireReviewer() {
        if (!this.config.reviewerToken) {
            throw new SpurvikConfigError("Decision and oversight calls need reviewerToken (a spurvik_reviewer_ token for an organisation member).");
        }
    }
    /** @internal Halt check used by the inference proxy. */
    async beforeInference() {
        if (!this.config.enforceHaltOnInference)
            return;
        await this.oversight.assertNotHalted();
    }
    /** @internal Build the provenance record and enqueue a telemetry event. */
    async finishCall(input) {
        const inputHash = await this.fingerprint(input.request.prompt);
        const outputHash = await this.fingerprint(input.output);
        const hook = this.config.textHook;
        const markingHookId = hook?.id ?? null;
        const modelId = input.modelVersion ?? "unknown";
        const provider = resolveProvider(input.path, modelId === "unknown" ? null : modelId);
        const observed = observeUpstreamMarking({
            provider,
            model: modelId,
            modality: modalityFromPath(input.path),
            request: input.requestBody ?? null,
            response: input.response ?? null,
            localApplied: false,
            route: this.config.upstreamRoute ?? input.path.join("."),
        });
        const watermark = hook ? isWatermarkHook(hook.id) : false;
        let markedOutput;
        let watermarkApplied = false;
        if (hook && watermark && input.output !== null) {
            const draft = await this.signCall({
                modelId,
                provider,
                inputHash,
                outputHash,
                markingHookId,
                markingApplied: false,
                evidenceTrailerAttached: false,
                upstreamMarking: "unknown",
            });
            markedOutput = await hook.mark(input.output, draft);
            watermarkApplied = markedOutput !== input.output;
        }
        const evidenceTrailerAttached = Boolean(hook && !watermark && input.output !== null);
        const markingApplied = watermarkApplied || observed.upstreamStatus === "provider_confirmed";
        const signed = await this.signCall({
            modelId,
            provider,
            inputHash,
            outputHash,
            markingHookId,
            markingApplied,
            evidenceTrailerAttached,
            upstreamMarking: observed.upstreamStatus,
        });
        if (hook && !watermark && input.output !== null) {
            markedOutput = await hook.mark(input.output, signed);
        }
        const provenance = {
            ...signed,
            ...(markedOutput !== undefined ? { markedOutput } : {}),
        };
        if (typeof input.finishReason === "string" && input.finishReason.length > 0) {
            Object.defineProperty(provenance, "finishReason", {
                value: input.finishReason,
                enumerable: false,
                configurable: true,
                writable: true,
            });
            Object.defineProperty(provenance, "interrupted", {
                value: input.finishReason === "interrupted",
                enumerable: false,
                configurable: true,
                writable: true,
            });
        }
        const evidence = await signUpstreamMarkingEvidence({
            ...observed,
            eventId: signed.eventId,
            timestamp: signed.timestamp,
            localApplied: markingApplied,
            evidenceTrailerAttached,
        }, this.config.signingSecret);
        await this.queue.enqueue(this.telemetryEvent(signed, {
            inputHash,
            outputHash,
            latencyMs: input.latencyMs,
            temperature: input.request.temperature,
            contentMarkingApplied: markingApplied,
            evidenceTrailerAttached,
            markingHookId: markingApplied || evidenceTrailerAttached ? markingHookId : null,
            upstreamMarking: { signedPayload: evidence.signedPayload, signature: evidence.signature },
        }));
        return provenance;
    }
    /**
     * Run the configured media hook (for example a C2PA writer).
     * `contentMarkingApplied` is true only when the hook embeds a manifest and the bytes change.
     */
    async applyMediaMark(input) {
        const hook = this.config.mediaHook;
        if (!hook) {
            throw new SpurvikConfigError("No media marking hook is configured.");
        }
        const preview = await this.signCall({
            modelId: input.modelVersion ?? "unknown",
            provider: "unknown",
            inputHash: null,
            outputHash: null,
            markingHookId: hook.id,
            markingApplied: false,
            evidenceTrailerAttached: false,
            upstreamMarking: "unknown",
        });
        const result = await hook.mark({
            bytes: input.bytes,
            mediaType: input.mediaType,
            provenance: preview,
        });
        const markingApplied = mediaMarkWasApplied(input.bytes, result);
        const provenance = await this.signCall({
            modelId: input.modelVersion ?? "unknown",
            provider: "unknown",
            inputHash: null,
            outputHash: null,
            markingHookId: hook.id,
            markingApplied,
            evidenceTrailerAttached: false,
            upstreamMarking: "unknown",
        });
        await this.queue.enqueue(this.telemetryEvent(provenance, {
            inputHash: null,
            outputHash: null,
            latencyMs: 0,
            temperature: null,
            contentMarkingApplied: markingApplied,
            evidenceTrailerAttached: false,
            markingHookId: markingApplied ? hook.id : null,
        }));
        return { result, provenance };
    }
    signCall(input) {
        return signProvenance({
            kind: "provenance_record",
            eventId: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            modelId: input.modelId,
            modelProvider: input.provider,
            contentHashMode: this.config.contentHashMode,
            inputHash: input.inputHash,
            outputHash: input.outputHash,
            article50Disclosure: this.config.article50Disclosure,
            markingHookId: input.markingHookId,
            markingApplied: input.markingApplied,
            evidenceTrailerAttached: input.evidenceTrailerAttached,
            upstreamMarking: input.upstreamMarking,
        }, this.config.signingSecret);
    }
    telemetryEvent(signed, fields) {
        return {
            eventId: signed.eventId,
            timestamp: signed.timestamp,
            modelProvider: signed.modelProvider,
            modelVersion: signed.modelId,
            inputHash: fields.inputHash,
            outputHash: fields.outputHash,
            contentHashMode: this.config.contentHashMode,
            latencyMs: fields.latencyMs,
            temperature: fields.temperature,
            contentMarkingApplied: fields.contentMarkingApplied,
            evidenceTrailerAttached: fields.evidenceTrailerAttached,
            markingHookId: fields.markingHookId,
            hitlStatus: null,
            ...(fields.upstreamMarking ? { upstreamMarking: fields.upstreamMarking } : {}),
        };
    }
    async fingerprint(value) {
        if (this.config.contentHashMode === "off" || value === null)
            return null;
        return fingerprintContent(this.config.contentHashMode, value, this.config.contentHashSecret);
    }
    /**
     * Field names only, plus a fingerprint. Do not put personal data in a key.
     * The control plane stores this document and rejects free text.
     */
    async summarizePayload(payload) {
        const keys = payload && typeof payload === "object" && !Array.isArray(payload)
            ? Object.keys(payload)
            : [];
        const contentFingerprint = this.config.contentHashMode === "off"
            ? null
            : await fingerprintContent(this.config.contentHashMode, canonicalJson(payload), this.config.contentHashSecret);
        return buildPayloadSummary({ keys, contentFingerprint });
    }
}
/**
 * Wrap an OpenAI, Anthropic, or Gemini client.
 * Two calls are enough for the inference path: construct the wrapper, then
 * call the provider method you already use.
 */
export function withSpurvik(aiClient, config) {
    return new SpurvikClient(config).wrap(aiClient);
}
/** @deprecated Use withSpurvik. Removed in the next release. */
export const withAegis = withSpurvik;
/**
 * Read the provenance record on a wrapped response or stream: `provenanceOf(res)`.
 * A record means the signature can be checked. It is not a conformity assessment.
 * `_spurvik_provenance` is the current property. `_aegis_provenance` is still read.
 */
export function provenanceOf(value) {
    if (!value || typeof value !== "object")
        return undefined;
    const record = value;
    if ("_spurvik_provenance" in record && record._spurvik_provenance !== undefined)
        return record._spurvik_provenance;
    if ("_aegis_provenance" in record && record._aegis_provenance !== undefined)
        return record._aegis_provenance;
    return provenanceFromProviderMetadata(value);
}
/**
 * Mastra returns the middleware receipt on `providerMetadata.spurvik`.
 * A direct `_spurvik_provenance` property wins when both are present.
 */
function provenanceFromProviderMetadata(value) {
    const spurvik = value.providerMetadata?.spurvik;
    if (!spurvik || typeof spurvik !== "object" || Array.isArray(spurvik))
        return undefined;
    const bag = spurvik;
    if (!bag.record || typeof bag.record !== "object" || Array.isArray(bag.record))
        return undefined;
    const receipt = {
        ...bag.record,
        ...(typeof bag.markedOutput === "string" ? { markedOutput: bag.markedOutput } : {}),
    };
    if (typeof bag.finishReason === "string") {
        Object.defineProperty(receipt, "finishReason", {
            value: bag.finishReason,
            enumerable: false,
            configurable: true,
            writable: true,
        });
        Object.defineProperty(receipt, "interrupted", {
            value: bag.finishReason === "interrupted",
            enumerable: false,
            configurable: true,
            writable: true,
        });
    }
    return receipt;
}
function waitForPoll(sleep, ms, signal) {
    if (!signal)
        return sleep(ms);
    if (signal.aborted)
        return Promise.resolve();
    return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled)
                return;
            settled = true;
            signal.removeEventListener("abort", finish);
            resolve();
        };
        signal.addEventListener("abort", finish, { once: true });
        void sleep(ms).then(finish, finish);
    });
}
