import type { LanguageModelV4Middleware, SharedV4ProviderMetadata } from "@ai-sdk/provider";
import { SpurvikClient, provenanceOf, type SpurvikProvenance } from "./client.js";
import type { SpurvikConfig } from "./config.js";
export type { SpurvikConfig } from "./config.js";
export type { SpurvikProvenance } from "./client.js";
export { provenanceOf };
/**
 * Read a finish reason from a string or from an AI SDK `{ unified, raw }` object.
 * `unified` wins when it is a non-empty string. Otherwise `raw` is used.
 */
export declare function extractFinishReason(value: unknown): string | null;
/** True when the finish reason is the AI SDK `"interrupted"` value. */
export declare function isInterruptedFinishReason(value: unknown): boolean;
/**
 * Keep the first approval response for each tool call.
 * Matches `ai` 7.0.149+ `convertToModelMessages`, which processes one response per call.
 * Items with no `toolCallId`, `approvalId`, or `id` are kept in order.
 */
export declare function dedupeToolApprovalResponses<T>(responses: readonly T[]): T[];
/**
 * Language-model middleware plus `flush()`.
 * `wrapLanguageModel` accepts this value. Keep the object so a serverless
 * handler can send the batch after the response.
 */
export interface SpurvikMiddleware extends LanguageModelV4Middleware {
    /** Send this middleware's queued telemetry. Does not stop the client. */
    flush(): Promise<void>;
    /**
     * Run the halt check before a framework starts its own model loop.
     * Mastra catches a thrown `doStream` and finishes an empty text stream, so
     * the Mastra adapter calls this while resolving the model.
     */
    prepare(): Promise<void>;
}
/**
 * Vercel AI SDK middleware (`ai` package, language-model middleware v4).
 *
 * Pass the result to `wrapLanguageModel`. The middleware records the call and
 * attaches an HMAC provenance receipt on `providerMetadata.spurvik`. It does
 * not mark content. A marking hook runs only when `config.marking` sets one.
 * The receipt is not an Article 50(2) finding.
 *
 * Telemetry is batched by this middleware's queue. It is not flushed on each
 * call. The queue sends when the batch is full, on its interval, on `flush()`,
 * and once when the process is about to exit if process hooks are on.
 * Create one middleware at module scope and call `flush()` from the platform's
 * `waitUntil` when the isolate can freeze before that exit hook runs.
 */
export declare function spurvikMiddleware(configOrClient: SpurvikConfig | SpurvikClient): SpurvikMiddleware;
/**
 * Read the HMAC receipt stored on AI SDK provider metadata.
 * This does not check the signature. Use `verifyProvenanceSignature` for that.
 * A match shows the signed fields still match the HMAC-SHA-256 signature made with your signing secret. It does not show that a notice was shown, that output is marked, or that your system meets the Act.
 */
export declare function provenanceFromMetadata(metadata: SharedV4ProviderMetadata | undefined): SpurvikProvenance | undefined;
