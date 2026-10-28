import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import type { withSpurvikMastra } from "./mastra.js";

type Wrapped = ReturnType<typeof withSpurvikMastra>["model"];
type Resolved = Awaited<ReturnType<Wrapped>>;
type Input = Parameters<typeof withSpurvikMastra>[0];
type AgentModel = ConstructorParameters<typeof Agent>[0]["model"];

/**
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
