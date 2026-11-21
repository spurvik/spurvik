import type { ContentHashMode, MediaMarkingHook, RiskTier, TextMarkingHook, UpstreamRouteKind } from "@spurvik/core";
import type { DurableTelemetryBuffer } from "./buffer.js";
export interface SpurvikConfig {
    apiKey: string;
    /**
     * Origin of the control plane you run.
     * Required when NODE_ENV is production. Development and tests may omit it
     * and use http://127.0.0.1:43123.
     */
    baseUrl?: string;
    /**
     * Your own risk classification (as provider or deployer). Spurvik does not classify the use case.
     * `high_annex3` turns on a fail-closed halt check before wrapped inference.
     */
    riskTier: RiskTier;
    /** HMAC key for provenance records. Stays on the client. Never sent. */
    signingSecret: string;
    /**
     * Prompt and output fingerprints. Default mode is `keyed`.
     * The secret or salt stays on the client and is never sent.
     */
    contentHash?: {
        mode?: ContentHashMode;
        secret?: string;
    };
    /**
     * Set true only when you state that an Article 50(1) interaction notice is shown.
     * This flag is configuration, not a finding that the notice is sufficient.
     * Defaults to false.
     */
    article50Disclosure?: boolean;
    marking?: {
        text?: TextMarkingHook | "signed-trailer" | ((input: {
            content: string;
        }) => string | Promise<string>);
        media?: MediaMarkingHook;
        /**
         * When true, non-streaming text fields are replaced with the hook output.
         * Streams are not rewritten in flight; the marked copy is returned on the
         * provenance record after the stream ends.
         */
        applyToMessageContent?: boolean;
    };
    /**
     * When true, a halted project blocks wrapped inference.
     * Defaults to true for `high_annex3` and false otherwise.
     * The first call refreshes halt state. Later calls use a short-lived cache
     * so the model request is not waiting on the control plane.
     */
    enforceHaltOnInference?: boolean;
    /**
     * Halt-cache window. `cacheMs: 0` refreshes on every inference call.
     * `pushInvalidation` opens a server-sent stream and drops the cache when
     * the control plane publishes a stop change. Defaults to on when halt
     * enforcement is on. The stream is single-process; a signed
     * `oversight.changed` webhook covers other instances.
     */
    oversight?: {
        cacheMs?: number;
        pushInvalidation?: boolean;
    };
    /**
     * Which route produced the model output. Set this for Bedrock, Vertex, Azure, or Foundry.
     * When omitted, the call path is used (`bedrock`, `vertex`, `azure`, `foundry`, otherwise direct).
     */
    upstreamRoute?: UpstreamRouteKind;
    /** Hashed member token sent as x-spurvik-reviewer on decision and oversight calls. */
    reviewerToken?: string;
    telemetry?: {
        maxQueue?: number;
        maxBatch?: number;
        flushIntervalMs?: number;
        maxRetries?: number;
        /**
         * Per-request control-plane HTTP timeout. Defaults to 5 seconds.
         * `flush()` is also bounded by `flushTimeoutMs`.
         */
        requestTimeoutMs?: number;
        /**
         * Total time one `flush()` may spend retrying. Concurrent callers share
         * the in-flight deadline. With nothing queued after a failed flush, process
         * exit keeps only the time left on that deadline. A new event during the
         * flush, or after it returns, gets a fresh one. Defaults to 8 seconds.
         */
        flushTimeoutMs?: number;
        /**
         * Where unsent events live. `high_annex3` opens an on-disk buffer on Node
         * when this is omitted. Pass a KV buffer on edge runtimes.
         */
        durableBuffer?: DurableTelemetryBuffer;
    };
    hitl?: {
        timeoutMs?: number;
        pollIntervalMs?: number;
    };
    oversightRefreshMs?: number;
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    /** Set false in tests so process hooks are not registered. */
    registerProcessHooks?: boolean;
    onTelemetryError?: (error: unknown) => void;
}
export interface ResolvedSpurvikConfig {
    apiKey: string;
    baseUrl: string;
    riskTier: RiskTier;
    signingSecret: string;
    contentHashMode: ContentHashMode;
    contentHashSecret?: string;
    article50Disclosure: boolean;
    textHook: TextMarkingHook | null;
    mediaHook: MediaMarkingHook | null;
    applyToMessageContent: boolean;
    enforceHaltOnInference: boolean;
    telemetry: {
        maxQueue: number;
        maxBatch: number;
        flushIntervalMs: number;
        maxRetries: number;
        requestTimeoutMs: number;
        flushTimeoutMs: number;
        durableBuffer?: DurableTelemetryBuffer;
        strict: boolean;
    };
    hitl: {
        timeoutMs: number;
        pollIntervalMs: number;
    };
    oversightCacheMs: number;
    oversightPushInvalidation: boolean;
    reviewerToken?: string;
    upstreamRoute: UpstreamRouteKind | null;
    fetch: typeof fetch;
    sleep: (ms: number) => Promise<void>;
    registerProcessHooks: boolean;
    onTelemetryError?: ((error: unknown) => void) | undefined;
}
export declare function resolveConfig(config: SpurvikConfig): ResolvedSpurvikConfig;
