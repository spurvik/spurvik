import type { LanguageModelV2, LanguageModelV3, LanguageModelV4 } from "@ai-sdk/provider";
import { spurvikMiddleware, type SpurvikMiddleware } from "./ai.js";
import type { SpurvikConfig } from "./config.js";
import { SpurvikConfigError } from "./errors.js";

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

/**
 * Mastra adapter. Mastra 1.x accepts an AI SDK language model and calls
 * `doGenerate` / `doStream` (`@mastra/core` `resolveModelConfig`, then
 * `AISDKV7LanguageModel` for `specificationVersion` `v4`).
 *
 * This calls `wrapLanguageModel` with `spurvikMiddleware`. It does not
 * record the call itself. Halt checks, keyed fingerprints, and the receipt
 * on `providerMetadata.spurvik` are the middleware's. A marking hook runs
 * only when `config.marking` sets one. The helper does not mark content.
 *
 * The returned `model` is a function. Mastra 1.79 calls that function from
 * `Agent.getLLM` before `stream()` starts the loop. The function runs the
 * halt check there. A thrown `doStream` inside that loop becomes an empty
 * text stream, so the check cannot wait until `doStream`.
 *
 * `model` may be a language model object or a resolver
 * `({ requestContext, mastra }) => model`. A resolver is called only after
 * the halt check. One middleware is shared across those calls. A Mastra
 * model-router string such as `openai/gpt-4o` is rejected.
 */
async function wrapMastraModel(model: SpurvikMastraInputModel, middleware: SpurvikMiddleware): Promise<LanguageModelV4> {
  const { wrapLanguageModel } = await import("ai");
  return wrapLanguageModel({ model, middleware });
}

export function withSpurvikMastra(model: SpurvikMastraModelSource, config: SpurvikConfig): SpurvikMastraModel {
  if (typeof model !== "function" && (typeof model !== "object" || model === null)) {
    throw new SpurvikConfigError(
      "withSpurvikMastra requires an AI SDK language model object or a model resolver function, not a model-router string.",
    );
  }
  const middleware = spurvikMiddleware(config);
  if (typeof model === "function") {
    return {
      middleware,
      model: async (args) => {
        await middleware.prepare();
        const resolved = await model(args);
        if (typeof resolved !== "object" || resolved === null) {
          throw new SpurvikConfigError(
            "withSpurvikMastra model resolver must return an AI SDK language model object.",
          );
        }
        return wrapMastraModel(resolved, middleware);
      },
      flush: () => middleware.flush(),
    };
  }
  let wrapped: Promise<LanguageModelV4> | undefined;
  return {
    middleware,
    model: async () => {
      await middleware.prepare();
      wrapped ??= wrapMastraModel(model, middleware);
      return wrapped;
    },
    flush: () => middleware.flush(),
  };
}
