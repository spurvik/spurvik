import type { DisclosureRecordWire, HitlDecisionBody, HitlRecordWire, MediaMarkingResult, OversightStateWire, ProvenanceRecord } from "@spurvik/core";
import type { SpurvikConfig } from "./config.js";
import type { ResolvedSpurvikConfig } from "./config.js";
import { type RequestView } from "./extract.js";
export interface SpurvikProvenance extends ProvenanceRecord {
    /**
     * Text after a marking hook ran. Present for streams, which are not rewritten
     * in flight, and for non-streaming calls when the caller did not ask to
     * replace the provider payload. This is hook output, not an Article 50(2) finding.
     */
    markedOutput?: string;
    /**
     * Provider finish reason when the caller passed one.
     * Stored as a non-enumerable field so `Object.keys` and `JSON.stringify`
     * stay on the 16 signed provenance fields.
     */
    finishReason?: string;
    /**
     * True when `finishReason` is `"interrupted"`.
     * Non-enumerable, same as `finishReason`. Not part of the HMAC.
     */
    interrupted?: boolean;
}
export interface SpurvikBound {
    readonly _spurvik: SpurvikClient;
    /** @deprecated Read `_spurvik`. Removed in the next release. */
    readonly _aegis: SpurvikClient;
}
export interface HumanApprovalOptions {
    timeoutMs?: number;
    pollIntervalMs?: number;
    signal?: AbortSignal;
}
/** Options for `requireHumanApproval`. Same fields as `HumanApprovalOptions`. */
export type RequireHumanApprovalOptions = HumanApprovalOptions;
/**
 * Options for `engageKillSwitch` and `releaseKillSwitch`.
 * `reason` is optional. A missing or blank reason is replaced before the request.
 */
export interface KillSwitchOptions {
    reason?: string;
    actionName?: string;
}
/** Sent when `engageKillSwitch` is called with no reason or a blank one. */
export declare const HALT_REASON_WHEN_BLANK = "Halted via SDK (no reason given)";
/** Sent when `releaseKillSwitch` is called with no reason or a blank one. */
export declare const RELEASE_REASON_WHEN_BLANK = "Released via SDK (no reason given)";
export interface CompletionFinish {
    path: readonly string[];
    request: RequestView;
    /** Original request object. Used only to read marking settings. Prompt text is not stored. */
    requestBody?: unknown;
    /** SDK return value. Used only to read marking flags and headers. Output text is not stored. */
    response?: unknown;
    output: string | null;
    modelVersion: string | null;
    latencyMs: number;
    /** Provider finish reason. `"interrupted"` marks a stopped stream or run. */
    finishReason?: string | null;
}
/**
 * Client for the Spurvik control plane and the provenance recorder.
 * It is designed to support record-keeping and human oversight. It does not certify a system or assess conformity.
 */
export declare class SpurvikClient {
    readonly config: ResolvedSpurvikConfig;
    private readonly transport;
    private readonly queue;
    private readonly oversight;
    constructor(config: SpurvikConfig);
    get droppedTelemetry(): number;
    get applyMarkedTextToContent(): boolean;
    get enforcesHaltOnInference(): boolean;
    wrap<T extends object>(client: T): T & SpurvikBound;
    /** Refresh halt state and throw if a human stop is engaged. */
    assertNotHalted(actionName?: string): Promise<void>;
    /** Drop the cached stop flag so the next check reads the control plane. */
    invalidateHaltCache(): void;
    /**
     * supports human-oversight work (Article 14 applies to high-risk AI systems).
     * requireHumanApproval throws on 'rejected' and 'overridden'; continue only when it returns status 'approved'.
     * @throws {SpurvikHitlRejectedError} When the decision is rejected or overridden. Read `error.record.status`.
     * @throws {SpurvikHitlTimeoutError} When the wait ends before a decision.
     */
    requireHumanApproval(actionName: string, payload: unknown, options?: HumanApprovalOptions): Promise<HitlRecordWire>;
    submitHumanDecision(approvalId: string, decision: HitlDecisionBody): Promise<HitlRecordWire>;
    /**
     * supports human-oversight work (Article 14 applies to high-risk AI systems)
     */
    overrideHumanDecision(approvalId: string, input: {
        reason: string;
    }): Promise<HitlRecordWire>;
    /**
     * Halt a project, or one action when `actionName` is set.
     * A missing or blank reason is sent as "Halted via SDK (no reason given)".
     * The control plane refuses a halt that arrives with no reason.
     */
    engageKillSwitch(input?: KillSwitchOptions): Promise<OversightStateWire>;
    /**
     * Release a project halt, or one action when `actionName` is set.
     * Pass a reason when you have one. A missing or blank reason is sent as
     * "Released via SDK (no reason given)". The control plane does not fill that in.
     */
    releaseKillSwitch(input?: KillSwitchOptions): Promise<OversightStateWire>;
    /**
     * Record that an Article 50(1) interaction notice was presented.
     * This is a record of a notice event, not proof the notice met the article.
     */
    recordDisclosure(input: {
        sessionId: string;
        jurisdiction?: string;
        timestamp?: string;
    }): Promise<DisclosureRecordWire>;
    flush(): Promise<void>;
    shutdown(): Promise<void>;
    private requireReviewer;
    /** @internal Halt check used by the inference proxy. */
    beforeInference(): Promise<void>;
    /** @internal Build the provenance record and enqueue a telemetry event. */
    finishCall(input: CompletionFinish): Promise<SpurvikProvenance>;
    /**
     * Run the configured media hook (for example a C2PA writer).
     * `contentMarkingApplied` is true only when the hook embeds a manifest and the bytes change.
     */
    applyMediaMark(input: {
        bytes: Uint8Array;
        mediaType: string;
        modelVersion?: string | null;
    }): Promise<{
        result: MediaMarkingResult;
        provenance: SpurvikProvenance;
    }>;
    private signCall;
    private telemetryEvent;
    private fingerprint;
    /**
     * Field names only, plus a fingerprint. Do not put personal data in a key.
     * The control plane stores this document and rejects free text.
     */
    private summarizePayload;
}
/**
 * Wrap an OpenAI, Anthropic, or Gemini client.
 * Two calls are enough for the inference path: construct the wrapper, then
 * call the provider method you already use.
 */
export declare function withSpurvik<T extends object>(aiClient: T, config: SpurvikConfig): T & SpurvikBound;
/** @deprecated Use withSpurvik. Removed in the next release. */
export declare const withAegis: typeof withSpurvik;
/**
 * Read the provenance record on a wrapped response or stream: `provenanceOf(res)`.
 * A record means the signature can be checked. It is not a conformity assessment.
 * `_spurvik_provenance` is the current property. `_aegis_provenance` is still read.
 */
export declare function provenanceOf(value: unknown): SpurvikProvenance | Promise<SpurvikProvenance> | undefined;
