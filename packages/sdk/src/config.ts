import { isProjectApiKey, isReviewerToken, createSignedTextTrailerHook } from "@spurvik/core";
import type { ContentHashMode, MediaMarkingHook, RiskTier, TextMarkingHook, UpstreamRouteKind } from "@spurvik/core";
import type { DurableTelemetryBuffer } from "./buffer.js";
import { SpurvikConfigError } from "./errors.js";

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
    text?: TextMarkingHook | "signed-trailer" | ((input: { content: string }) => string | Promise<string>);
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
  hitl: { timeoutMs: number; pollIntervalMs: number };
  oversightCacheMs: number;
  oversightPushInvalidation: boolean;
  reviewerToken?: string;
  upstreamRoute: UpstreamRouteKind | null;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  registerProcessHooks: boolean;
  onTelemetryError?: ((error: unknown) => void) | undefined;
}

const MAX_TIMEOUT_MS = 120_000;

function textHookFromSetting(textSetting: unknown): TextMarkingHook | null {
  if (textSetting === "signed-trailer") return createSignedTextTrailerHook();
  if (typeof textSetting === "function") {
    const caller = textSetting as (input: { content: string }) => string | Promise<string>;
    return {
      id: "caller-text-hook",
      mark(text) {
        return caller({ content: text });
      },
    };
  }
  if (textSetting && typeof textSetting === "object" && "id" in textSetting && "mark" in textSetting) {
    return textSetting as TextMarkingHook;
  }
  return null;
}

function timeoutMs(name: string, value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
    throw new SpurvikConfigError(
      `${name} must be a finite positive integer up to ${MAX_TIMEOUT_MS} milliseconds.`,
    );
  }
  return value;
}

export function resolveConfig(config: SpurvikConfig): ResolvedSpurvikConfig {
  if (!isProjectApiKey(config.apiKey)) {
    throw new SpurvikConfigError("apiKey must be a spurvik_live_ project key.");
  }
  if (!config.signingSecret || config.signingSecret.length < 16) {
    throw new SpurvikConfigError("signingSecret must be a client-held secret of at least 16 characters.");
  }
  if (config.reviewerToken && !isReviewerToken(config.reviewerToken)) {
    throw new SpurvikConfigError("reviewerToken must be a spurvik_reviewer_ token.");
  }
  const contentHashMode = config.contentHash?.mode ?? "keyed";
  const contentHashSecret = config.contentHash?.secret;
  if (contentHashMode === "keyed" && (!contentHashSecret || contentHashSecret.length < 16)) {
    throw new SpurvikConfigError(
      "Keyed prompt and output fingerprints require contentHash.secret (a client-held secret or salt, at least 16 characters). It is not sent to the control plane.",
    );
  }
  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.NODE_ENV;
  if (!config.baseUrl && nodeEnv === "production") {
    throw new SpurvikConfigError(
      "baseUrl is required when NODE_ENV is production. Point it at the control plane you run.",
    );
  }
  const textHook = textHookFromSetting(config.marking?.text);
  return {
    apiKey: config.apiKey,
    baseUrl: (config.baseUrl ?? "http://127.0.0.1:43123").replace(/\/$/, ""),
    riskTier: config.riskTier,
    signingSecret: config.signingSecret,
    contentHashMode,
    ...(contentHashSecret ? { contentHashSecret } : {}),
    article50Disclosure: config.article50Disclosure ?? false,
    textHook,
    mediaHook: config.marking?.media ?? null,
    applyToMessageContent: config.marking?.applyToMessageContent ?? false,
    enforceHaltOnInference: config.enforceHaltOnInference ?? config.riskTier === "high_annex3",
    telemetry: {
      maxQueue: config.telemetry?.maxQueue ?? 500,
      maxBatch: config.telemetry?.maxBatch ?? 25,
      flushIntervalMs: config.telemetry?.flushIntervalMs ?? 1_000,
      maxRetries: config.telemetry?.maxRetries ?? 4,
      requestTimeoutMs: timeoutMs("telemetry.requestTimeoutMs", config.telemetry?.requestTimeoutMs, 5_000),
      flushTimeoutMs: timeoutMs("telemetry.flushTimeoutMs", config.telemetry?.flushTimeoutMs, 8_000),
      ...(config.telemetry?.durableBuffer ? { durableBuffer: config.telemetry.durableBuffer } : {}),
      strict: config.riskTier === "high_annex3",
    },
    hitl: {
      timeoutMs: config.hitl?.timeoutMs ?? 120_000,
      pollIntervalMs: config.hitl?.pollIntervalMs ?? 1_000,
    },
    oversightCacheMs: config.oversight?.cacheMs ?? config.oversightRefreshMs ?? 5_000,
    oversightPushInvalidation:
      config.oversight?.pushInvalidation ??
      (config.enforceHaltOnInference ?? config.riskTier === "high_annex3"),
    ...(config.reviewerToken ? { reviewerToken: config.reviewerToken } : {}),
    upstreamRoute: config.upstreamRoute ?? null,
    fetch: config.fetch ?? globalThis.fetch.bind(globalThis),
    // Retries and human-oversight polls are awaited. The timer must stay
    // referenced so the promise can settle. An unref'd sleep is not enough to
    // keep the event loop alive, and Node then exits with code 13
    // ("unsettled top-level await") while the caller is still waiting.
    // Background flush timers are unref'd separately in the telemetry queue.
    sleep:
      config.sleep ??
      ((ms: number) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        })),
    registerProcessHooks: config.registerProcessHooks ?? true,
    onTelemetryError: config.onTelemetryError,
  };
}
