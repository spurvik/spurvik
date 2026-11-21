import { spurvikMiddleware } from "./ai.js";
import { SpurvikConfigError } from "./errors.js";
export { provenanceFromMetadata, provenanceOf } from "./ai.js";
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
async function wrapMastraModel(model, middleware) {
    const { wrapLanguageModel } = await import("ai");
    return wrapLanguageModel({ model, middleware });
}
export function withSpurvikMastra(model, config) {
    if (typeof model !== "function" && (typeof model !== "object" || model === null)) {
        throw new SpurvikConfigError("withSpurvikMastra requires an AI SDK language model object or a model resolver function, not a model-router string.");
    }
    const middleware = spurvikMiddleware(config);
    if (typeof model === "function") {
        return {
            middleware,
            model: async (args) => {
                await middleware.prepare();
                const resolved = await model(args);
                if (typeof resolved !== "object" || resolved === null) {
                    throw new SpurvikConfigError("withSpurvikMastra model resolver must return an AI SDK language model object.");
                }
                return wrapMastraModel(resolved, middleware);
            },
            flush: () => middleware.flush(),
        };
    }
    let wrapped;
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
