import type { Agent, Model, ModelProvider, Runner } from "@openai/agents";
import type { withSpurvikModel, withSpurvikModelProvider } from "./openai-agents.js";

type WrappedModel = ReturnType<typeof withSpurvikModel>;
type WrappedProvider = ReturnType<typeof withSpurvikModelProvider>;
type RunnerConfigArg = NonNullable<ConstructorParameters<typeof Runner>[0]>;

/**
 * Compiled against `@openai/agents`.
 * `Agent.model` is `string | Model`. `Runner` takes a `ModelProvider`.
 */
const modelIsModel: WrappedModel extends Model ? true : never = true;
const providerIsProvider: WrappedProvider extends ModelProvider ? true : never = true;
const modelFitsAgent: WrappedModel extends Agent["model"] ? true : never = true;
const providerFitsRunner: WrappedProvider extends NonNullable<RunnerConfigArg["modelProvider"]> ? true : never = true;

export { modelFitsAgent, modelIsModel, providerFitsRunner, providerIsProvider };
