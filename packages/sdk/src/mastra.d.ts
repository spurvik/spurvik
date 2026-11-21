import type { LanguageModelV2, LanguageModelV3, LanguageModelV4 } from "@ai-sdk/provider";
import { type SpurvikMiddleware } from "./ai.js";
import type { SpurvikConfig } from "./config.js";
export type { SpurvikConfig } from "./config.js";
export type { SpurvikProvenance } from "./client.js";
export { provenanceFromMetadata, provenanceOf } from "./ai.js";
/**
 * A language model Mastra can take on `Agent`'s `model` field.
 * `wrapLanguageModel` accepts these three AI SDK shapes. A model-router
 * string such as `openai/gpt-4o` is not one of them.
 */
export type SpurvikMastraInputModel = LanguageModelV2 | LanguageModelV3 | LanguageModelV4;
/**
 * Mastra 1.x dynamic `model` resolver. `requestContext` and `mastra` are the
 * values Mastra passes when it resolves `Agent`'s `model` field.
 */
export type SpurvikMastraModelResolver = (args: {
    requestContext: unknown;
    mastra?: unknown;
}) => SpurvikMastraInputModel | Promise<SpurvikMastraInputModel>;
/** A static AI SDK language model, or a function that returns one per call. */
export type SpurvikMastraModelSource = SpurvikMastraInputModel | SpurvikMastraModelResolver;
/**
 * Wrapped model plus the middleware queue.
 * Pass `model` to Mastra. Keep this object and call `flush()` when a
 * serverless isolate can freeze before the process-exit hook runs.
 */
/**
 * Mastra resolves a function `model` in `getLLM`, before `agent.stream`
 * enters the loop that turns a thrown `doStream` into an empty text stream.
 * The function runs the halt check, then returns the wrapped language model.
 */
export type SpurvikMastraAgentModel = (args: {
    requestContext: unknown;
    mastra?: unknown;
}) => Promise<LanguageModelV4>;
export interface SpurvikMastraModel {
    /**
     * Pass this as Mastra `Agent` `model`. It is a resolver, not the language
     * model itself. A halt rejects `agent.stream` and `agent.generate` with
     * `SpurvikHaltedError`.
     */
    model: SpurvikMastraAgentModel;
    /** The middleware passed to `wrapLanguageModel`. */
    middleware: SpurvikMiddleware;
    /** Send this helper's queued telemetry. Does not stop the client. */
    flush(): Promise<void>;
}
export declare function withSpurvikMastra(model: SpurvikMastraModelSource, config: SpurvikConfig): SpurvikMastraModel;
