import type { Agent, Model, ModelProvider, Runner } from "@openai/agents";
import type { withSpurvikModel, withSpurvikModelProvider } from "./openai-agents.js";
type WrappedModel = ReturnType<typeof withSpurvikModel>;
type WrappedProvider = ReturnType<typeof withSpurvikModelProvider>;
type RunnerConfigArg = NonNullable<ConstructorParameters<typeof Runner>[0]>;
/**
 * Compiled against `@openai/agents`.
 * `Agent.model` is `string | Model`. `Runner` takes a `ModelProvider`.
 */
declare const modelIsModel: WrappedModel extends Model ? true : never;
declare const providerIsProvider: WrappedProvider extends ModelProvider ? true : never;
declare const modelFitsAgent: WrappedModel extends Agent["model"] ? true : never;
declare const providerFitsRunner: WrappedProvider extends NonNullable<RunnerConfigArg["modelProvider"]> ? true : never;
export { modelFitsAgent, modelIsModel, providerFitsRunner, providerIsProvider };
