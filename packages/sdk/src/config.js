import { isProjectApiKey, isReviewerToken, createSignedTextTrailerHook } from "@spurvik/core";
import { SpurvikConfigError } from "./errors.js";
const MAX_TIMEOUT_MS = 120_000;
function textHookFromSetting(textSetting) {
    if (textSetting === "signed-trailer")
        return createSignedTextTrailerHook();
    if (typeof textSetting === "function") {
        const caller = textSetting;
        return {
            id: "caller-text-hook",
            mark(text) {
                return caller({ content: text });
            },
        };
    }
    if (textSetting && typeof textSetting === "object" && "id" in textSetting && "mark" in textSetting) {
        return textSetting;
    }
    return null;
}
function timeoutMs(name, value, fallback) {
    if (value === undefined)
        return fallback;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
        throw new SpurvikConfigError(`${name} must be a finite positive integer up to ${MAX_TIMEOUT_MS} milliseconds.`);
    }
    return value;
}
export function resolveConfig(config) {
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
        throw new SpurvikConfigError("Keyed prompt and output fingerprints require contentHash.secret (a client-held secret or salt, at least 16 characters). It is not sent to the control plane.");
    }
    const nodeEnv = globalThis.process?.env
        ?.NODE_ENV;
    if (!config.baseUrl && nodeEnv === "production") {
        throw new SpurvikConfigError("baseUrl is required when NODE_ENV is production. Point it at the control plane you run.");
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
        oversightPushInvalidation: config.oversight?.pushInvalidation ??
            (config.enforceHaltOnInference ?? config.riskTier === "high_annex3"),
        ...(config.reviewerToken ? { reviewerToken: config.reviewerToken } : {}),
        upstreamRoute: config.upstreamRoute ?? null,
        fetch: config.fetch ?? globalThis.fetch.bind(globalThis),
        // Retries and human-oversight polls are awaited. The timer must stay
        // referenced so the promise can settle. An unref'd sleep is not enough to
        // keep the event loop alive, and Node then exits with code 13
        // ("unsettled top-level await") while the caller is still waiting.
        // Background flush timers are unref'd separately in the telemetry queue.
        sleep: config.sleep ??
            ((ms) => new Promise((resolve) => {
                setTimeout(resolve, ms);
            })),
        registerProcessHooks: config.registerProcessHooks ?? true,
        onTelemetryError: config.onTelemetryError,
    };
}
