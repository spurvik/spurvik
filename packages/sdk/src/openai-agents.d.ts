import type { HitlRecordWire, HitlStatus } from "@spurvik/core";
import type { Model, ModelProvider } from "@openai/agents";
import { SpurvikClient, provenanceOf, type RequireHumanApprovalOptions, type SpurvikProvenance } from "./client.js";
import type { SpurvikConfig } from "./config.js";
export type { SpurvikConfig } from "./config.js";
export type { SpurvikProvenance } from "./client.js";
export { provenanceOf };
/**
 * A `Model` from `@openai/agents` plus `flush()`.
 * `Agent.model` accepts this value when you already have a `Model` instance.
 */
export interface SpurvikAgentsModel extends Model {
    /** Send this model's queued telemetry. Does not stop the client. */
    flush(): Promise<void>;
    /** Send unique run interruptions to the human-oversight queue. */
    resolveInterruptions<T extends AgentApprovalInterruptionLike>(interruptions: readonly T[], options?: ResolveAgentInterruptionsOptions): Promise<ResolveAgentInterruptionsResult<T>>;
}
/**
 * A `ModelProvider` plus `flush()`.
 * Pass this to `Runner` as `modelProvider`. String model names on an agent
 * are resolved through `getModel`, then wrapped.
 */
export interface SpurvikAgentsModelProvider extends Omit<ModelProvider, "getModel"> {
    /**
     * Resolve a model name and wrap it.
     * The return is a `Model`, so this provider still satisfies `ModelProvider`.
     */
    getModel(modelName?: string): Promise<SpurvikAgentsModel> | SpurvikAgentsModel;
    /** Send this provider's queued telemetry. Does not stop the client. */
    flush(): Promise<void>;
    /** Send unique run interruptions to the human-oversight queue. Shares this provider's client. */
    resolveInterruptions<T extends AgentApprovalInterruptionLike>(interruptions: readonly T[], options?: ResolveAgentInterruptionsOptions): Promise<ResolveAgentInterruptionsResult<T>>;
}
export interface SpurvikNeedsApprovalOptions {
    /** Action name checked against `/api/v1/oversight`. Defaults to the tool name or `"openai_agent_tool"`. */
    actionName?: string;
    /** Optional predicate. Approval is required when this returns true. Defaults to always true. */
    when?: (input: unknown, callId?: string) => boolean | Promise<boolean>;
    /** Ends the callback when the caller aborts. An aborted signal does not return true. */
    signal?: AbortSignal;
}
export interface SpurvikModelProviderOptions {
    /** Receipt model id when `getModel` is called without a name. */
    defaultModelId?: string;
}
export interface AgentApprovalInterruptionLike {
    id?: string;
    callId?: string;
    name?: string;
    toolName?: string;
    arguments?: unknown;
    rawItem?: {
        id?: string;
        callId?: string;
        name?: string;
        arguments?: unknown;
    };
}
export interface AgentRunStateLike<TInterruption = AgentApprovalInterruptionLike> {
    approve(interruption: TInterruption, ...args: unknown[]): unknown;
    reject(interruption: TInterruption, ...args: unknown[]): unknown;
}
export interface ResolveAgentInterruptionsOptions extends RequireHumanApprovalOptions {
    /** Optional Agents `RunState` (`result.state`). `.approve(item)` or `.reject(item)` runs for each unique interruption. */
    state?: AgentRunStateLike<any>;
    /** Fallback action name when an interruption has no tool name. Defaults to `"openai_agent_tool"`. */
    defaultActionName?: string;
    /**
     * When true, rethrows `SpurvikHitlRejectedError` after `state.reject(item)`.
     * Defaults to false so a rejected tool call can resume through `state.reject`.
     */
    throwOnReject?: boolean;
}
export interface AgentInterruptionDecision<TInterruption = AgentApprovalInterruptionLike> {
    callId: string;
    actionName: string;
    approved: boolean;
    status: HitlStatus;
    approval: HitlRecordWire;
    interruption: TInterruption;
}
export interface ResolveAgentInterruptionsResult<TInterruption = AgentApprovalInterruptionLike> {
    decisions: Array<AgentInterruptionDecision<TInterruption>>;
    allApproved: boolean;
    skippedDuplicateCallIds: string[];
}
export interface SpurvikAgentsModelOptions {
    /**
     * Model id stored on the receipt.
     * The `Model` interface does not expose the id the provider selected.
     * `withSpurvikModelProvider` sets this from the name passed to `getModel`.
     */
    modelId?: string;
}
/**
 * Wrap one Agents SDK `Model`.
 *
 * `getResponse` and `getStreamedResponse` are the model calls
 * (`@openai/agents` 0.21 `Model`). A tracing processor does not run before
 * those calls, so this wrapper does. The constructor throws when `apiKey`
 * or `signingSecret` is missing. It does not read the environment.
 *
 * The input fingerprint includes system instructions, string input,
 * `input_text`, `output_text`, and `reasoning_text` (including a reasoning
 * item's `rawContent`). It skips `function_call_result`, `function_call`,
 * `hosted_tool_call`, and `tool_search_call`, so tool results and tool-call
 * arguments are not included. The output fingerprint is assistant
 * `output_text` only. The control-plane body stores keyed fingerprints,
 * not the prompt or the output text. A marking hook runs only when
 * `config.marking` sets one. This wrapper does not mark content.
 */
export declare function withSpurvikModel(model: Model, config: SpurvikConfig, options?: SpurvikAgentsModelOptions): SpurvikAgentsModel;
/**
 * Wrap a `ModelProvider`. Every `getModel` result shares one client, so
 * `flush()` sends the batch for each model this provider returned.
 */
export declare function withSpurvikModelProvider(provider: {
    getModel(modelName?: string): Model | Promise<Model>;
}, config: SpurvikConfig, options?: SpurvikModelProviderOptions): SpurvikAgentsModelProvider;
/**
 * `needsApproval` callback for an Agents SDK tool.
 * A `SpurvikConfig` is turned into a client immediately, so a missing key throws at setup.
 * The callback checks the halt state, then returns true, or the `when` predicate when one was set.
 */
export declare function createSpurvikNeedsApproval(configOrClient: SpurvikConfig | SpurvikClient, options?: SpurvikNeedsApprovalOptions): (runContext: unknown, input: unknown, callId?: string) => Promise<boolean>;
/**
 * Map Agents `RunResult.interruptions` onto the human-oversight queue.
 * The first interruption for each `callId` is sent. Later copies are listed in `skippedDuplicateCallIds`.
 * Only an approved row calls `state.approve`. An overridden or rejected row calls `state.reject`.
 * Overridden means do not continue. That reject call includes a message that the decision was overridden.
 */
export declare function resolveAgentInterruptions<TInterruption extends AgentApprovalInterruptionLike>(interruptions: readonly TInterruption[], configOrClient: SpurvikConfig | SpurvikClient, options?: ResolveAgentInterruptionsOptions): Promise<ResolveAgentInterruptionsResult<TInterruption>>;
/**
 * Read the HMAC receipt stored on an Agents SDK model response.
 * This does not check the signature. Use `verifyProvenanceSignature` for that.
 * A match shows the signed fields still match the HMAC-SHA-256 signature made with your signing secret. It does not show that a notice was shown, that output is marked, or that your system meets the Act.
 */
export declare function provenanceFromAgentsResponse(response: {
    providerData?: Record<string, unknown> | undefined;
} | null | undefined): SpurvikProvenance | undefined;
