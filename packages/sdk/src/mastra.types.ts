import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import type { withSpurvikMastra } from "./mastra.js";

type Wrapped = ReturnType<typeof withSpurvikMastra>["model"];
type Resolved = Awaited<ReturnType<Wrapped>>;
type Input = Parameters<typeof withSpurvikMastra>[0];
type AgentModel = ConstructorParameters<typeof Agent>[0]["model"];

/**
 * Excluded from `tsc --noEmit` in tsconfig.json.
 * `@mastra/core` 1.79.0 ships its own nested `@ai-sdk/provider` types. Those are not
 * the same type identity as the `@ai-sdk/provider` this package depends on, so
 * `LanguageModelV4` is not assignable to `MastraModelConfig` and the wrapped model
 * is not assignable to `Agent`'s model argument. The adapter still returns that
 * model at runtime. This file records the assignability check; it is not imported
 * by the published build.
 *
 * Compiled against `@mastra/core` and `@ai-sdk/provider`.
 * `wrapLanguageModel` returns a `LanguageModelV4`. Mastra's `MastraModelConfig`
 * includes that shape. `Agent`'s `model` field is a `DynamicArgument`, so it
 * also accepts the resolver this adapter returns. Mastra calls that function
 * from `getLLM` before the stream loop.
 */
export function resolvedModelIsMastraConfig(model: Resolved): MastraModelConfig {
  return model;
}

export function languageModelIsMastraConfig(model: LanguageModelV4): MastraModelConfig {
  return model;
}

export function wrappedModelIsAgentModel(model: Wrapped): AgentModel {
  return model;
}

type StringRejected = string extends Input ? never : true;
const stringRejected: StringRejected = true;
export { stringRejected };
