import type { HitlRecordWire, HitlStatus } from "@spurvik/core";
import type {
  Model,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelRetryAdviceRequest,
  StreamEvent,
} from "@openai/agents";
import { SpurvikClient, provenanceOf, type RequireHumanApprovalOptions, type SpurvikProvenance } from "./client.js";
import type { SpurvikConfig } from "./config.js";
import { SpurvikHitlRejectedError, SpurvikHitlTimeoutError } from "./errors.js";

export type { SpurvikConfig } from "./config.js";
export type { SpurvikProvenance } from "./client.js";
export { provenanceOf };

const RECEIPT_KEY = "spurvik";

/**
 * A `Model` from `@openai/agents` plus `flush()`.
 * `Agent.model` accepts this value when you already have a `Model` instance.
 */
export interface SpurvikAgentsModel extends Model {
  /** Send this model's queued telemetry. Does not stop the client. */
  flush(): Promise<void>;
  /** Send unique run interruptions to the human-oversight queue. */
  resolveInterruptions<T extends AgentApprovalInterruptionLike>(
    interruptions: readonly T[],
    options?: ResolveAgentInterruptionsOptions,
  ): Promise<ResolveAgentInterruptionsResult<T>>;
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
  resolveInterruptions<T extends AgentApprovalInterruptionLike>(
    interruptions: readonly T[],
    options?: ResolveAgentInterruptionsOptions,
  ): Promise<ResolveAgentInterruptionsResult<T>>;
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
export function withSpurvikModel(
  model: Model,
  config: SpurvikConfig,
  options?: SpurvikAgentsModelOptions,
): SpurvikAgentsModel {
  return new WrappedAgentsModel(model, new SpurvikClient(config), options?.modelId);
}

/**
 * Wrap a `ModelProvider`. Every `getModel` result shares one client, so
 * `flush()` sends the batch for each model this provider returned.
 */
export function withSpurvikModelProvider(
  provider: { getModel(modelName?: string): Model | Promise<Model> },
  config: SpurvikConfig,
  options?: SpurvikModelProviderOptions,
): SpurvikAgentsModelProvider {
  const client = new SpurvikClient(config);
  const fallback = options?.defaultModelId?.trim() ? options.defaultModelId.trim() : undefined;
  return {
    async getModel(modelName?: string): Promise<SpurvikAgentsModel> {
      const inner = await provider.getModel(modelName);
      const named = modelName?.trim();
      return new WrappedAgentsModel(inner, client, named ? named : fallback);
    },
    flush: () => client.flush(),
    resolveInterruptions: <T extends AgentApprovalInterruptionLike>(
      interruptions: readonly T[],
      options?: ResolveAgentInterruptionsOptions,
    ) => resolveAgentInterruptions(interruptions, client, options),
  };
}

/**
 * `needsApproval` callback for an Agents SDK tool.
 * A `SpurvikConfig` is turned into a client immediately, so a missing key throws at setup.
 * The callback checks the halt state, then returns true, or the `when` predicate when one was set.
 */
export function createSpurvikNeedsApproval(
  configOrClient: SpurvikConfig | SpurvikClient,
  options?: SpurvikNeedsApprovalOptions,
): (runContext: unknown, input: unknown, callId?: string) => Promise<boolean> {
  const client = configOrClient instanceof SpurvikClient ? configOrClient : new SpurvikClient(configOrClient);
  return async (_runContext, input, callId) => {
    if (options?.signal?.aborted) throw new SpurvikHitlTimeoutError("aborted");
    await client.assertNotHalted(options?.actionName);
    if (options?.signal?.aborted) throw new SpurvikHitlTimeoutError("aborted");
    if (options?.when) return Boolean(await options.when(input, callId));
    return true;
  };
}

/**
 * Map Agents `RunResult.interruptions` onto the human-oversight queue.
 * The first interruption for each `callId` is sent. Later copies are listed in `skippedDuplicateCallIds`.
 * Approved and overridden rows call `state.approve`. A rejected row calls `state.reject`.
 */
export async function resolveAgentInterruptions<TInterruption extends AgentApprovalInterruptionLike>(
  interruptions: readonly TInterruption[],
  configOrClient: SpurvikConfig | SpurvikClient,
  options?: ResolveAgentInterruptionsOptions,
): Promise<ResolveAgentInterruptionsResult<TInterruption>> {
  const client = configOrClient instanceof SpurvikClient ? configOrClient : new SpurvikClient(configOrClient);
  const seen = new Set<string>();
  const skippedDuplicateCallIds: string[] = [];
  const decisions: Array<AgentInterruptionDecision<TInterruption>> = [];
  for (let index = 0; index < interruptions.length; index += 1) {
    const item = interruptions[index] as TInterruption;
    const callId = interruptionCallId(item, index);
    if (seen.has(callId)) {
      skippedDuplicateCallIds.push(callId);
      continue;
    }
    seen.add(callId);
    const actionName = interruptionActionName(item, options?.defaultActionName);
    await client.assertNotHalted(actionName);
    const payload = approvalPayload(callId, actionName, interruptionArguments(item));
    try {
      const approval = await client.requireHumanApproval(actionName, payload, {
        timeoutMs: options?.timeoutMs,
        pollIntervalMs: options?.pollIntervalMs,
        signal: options?.signal,
      });
      if (approval.status === "approved" || approval.status === "overridden") {
        options?.state?.approve(item);
        decisions.push({
          callId,
          actionName,
          approved: true,
          status: approval.status,
          approval,
          interruption: item,
        });
        continue;
      }
      options?.state?.reject(item);
      decisions.push({
        callId,
        actionName,
        approved: false,
        status: approval.status,
        approval,
        interruption: item,
      });
    } catch (error) {
      if (!(error instanceof SpurvikHitlRejectedError)) throw error;
      options?.state?.reject(item);
      decisions.push({
        callId,
        actionName,
        approved: false,
        status: error.record.status,
        approval: error.record,
        interruption: item,
      });
      if (options?.throwOnReject === true) throw error;
    }
  }
  return {
    decisions,
    allApproved: decisions.every((decision) => decision.approved),
    skippedDuplicateCallIds,
  };
}

function interruptionCallId(item: AgentApprovalInterruptionLike, index: number): string {
  const candidates = [item.callId, item.rawItem?.callId, item.id, item.rawItem?.id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return `call_${index}`;
}

function interruptionActionName(item: AgentApprovalInterruptionLike, fallback: string | undefined): string {
  const candidates = [item.name, item.toolName, item.rawItem?.name, fallback];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  return "openai_agent_tool";
}

function interruptionArguments(item: AgentApprovalInterruptionLike): unknown {
  if (item.arguments !== undefined) return item.arguments;
  return item.rawItem?.arguments;
}

function approvalPayload(callId: string, actionName: string, rawArgs: unknown): Record<string, unknown> {
  return { callId, toolName: actionName, argumentKeys: argumentKeyList(rawArgs) };
}

function argumentKeyList(rawArgs: unknown): string[] {
  const parsed = typeof rawArgs === "string" ? parseJsonArguments(rawArgs) : rawArgs;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  return Object.keys(parsed as Record<string, unknown>)
    .filter((key) => key.trim().length > 0)
    .sort();
}

function parseJsonArguments(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Read the HMAC receipt stored on an Agents SDK model response.
 * This does not check the signature. Use `verifyProvenanceSignature` for that.
 * A match shows the signed fields still match the HMAC-SHA-256 signature made with your signing secret. It does not show that a notice was shown, that output is marked, or that your system meets the Act.
 */
export function provenanceFromAgentsResponse(
  response: { providerData?: Record<string, unknown> | undefined } | null | undefined,
): SpurvikProvenance | undefined {
  const data = response?.providerData;
  if (!data) return undefined;
  return receiptFromBag(data[RECEIPT_KEY]);
}

class WrappedAgentsModel implements SpurvikAgentsModel {
  readonly supportsPromptModelSelection: boolean;
  private readonly modelId: string;

  constructor(
    private readonly inner: Model,
    private readonly client: SpurvikClient,
    modelId: string | undefined,
  ) {
    this.supportsPromptModelSelection = inner.supportsPromptModelSelection ?? false;
    const trimmed = modelId?.trim();
    this.modelId = trimmed ? trimmed : "unknown";
  }

  flush(): Promise<void> {
    return this.client.flush();
  }

  resolveInterruptions<T extends AgentApprovalInterruptionLike>(
    interruptions: readonly T[],
    options?: ResolveAgentInterruptionsOptions,
  ): Promise<ResolveAgentInterruptionsResult<T>> {
    return resolveAgentInterruptions(interruptions, this.client, options);
  }

  getRetryAdvice(args: ModelRetryAdviceRequest) {
    return this.inner.getRetryAdvice?.(args);
  }

  async getResponse(request: ModelRequest): Promise<ModelResponse> {
    await this.client.beforeInference();
    const started = performance.now();
    const response = await this.inner.getResponse(request);
    const provenance = await this.record(
      request,
      response,
      textFromOutput(response.output),
      started,
      false,
      agentsFinishReason(response),
    );
    return withReceipt(response, provenance, this.client.applyMarkedTextToContent);
  }

  getStreamedResponse(request: ModelRequest): AsyncIterable<StreamEvent> {
    const client = this.client;
    const inner = this.inner;
    const pending = deferred<SpurvikProvenance>();
    pending.promise.catch(() => undefined);
    let recorded = false;
    let failed = false;
    const started = performance.now();
    const gate = client.beforeInference();
    void gate.catch((error: unknown) => {
      failed = true;
      pending.reject(error);
    });
    const record = this.record.bind(this);

    const iterable: AsyncIterable<StreamEvent> = {
      async *[Symbol.asyncIterator]() {
        const pieces: string[] = [];
        try {
          await gate;
          for await (const event of inner.getStreamedResponse(request)) {
            if (event.type === "output_text_delta") pieces.push(event.delta);
            const kind = event.type as string;
            if (kind === "response_done" || kind === "response_completed") {
              const response = asModelResponse((event as { response?: unknown }).response);
              const provenance = await record(
                request,
                response,
                outputText(response, pieces),
                started,
                true,
                agentsFinishReason(response),
              );
              recorded = true;
              pending.resolve(provenance);
              if (response) {
                const stamped = withReceipt(response, provenance, client.applyMarkedTextToContent);
                // The completed-response event requires `id`. ModelResponse does not
                // declare it, so keep the original response and add the receipt fields.
                const rawResponse = (event as { response?: object }).response ?? {};
                const done = {
                  ...rawResponse,
                  output: stamped.output,
                  providerData: stamped.providerData,
                };
                Object.defineProperty(done, "_spurvik_provenance", {
                  value: provenance,
                  enumerable: true,
                  configurable: true,
                  writable: true,
                });
                yield { ...event, response: done } as StreamEvent;
              } else {
                yield event;
              }
              continue;
            }
            yield event;
          }
        } catch (error) {
          failed = true;
          if (!recorded) pending.reject(error);
          throw error;
        } finally {
          if (!recorded && !failed) {
            try {
              const provenance = await record(
                request,
                undefined,
                pieces.length > 0 ? pieces.join("") : null,
                started,
                true,
              );
              recorded = true;
              pending.resolve(provenance);
            } catch (error) {
              pending.reject(error);
              throw error;
            }
          }
        }
      },
    };

    Object.defineProperty(iterable, "_spurvik_provenance", {
      value: pending.promise,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    return iterable;
  }

  private record(
    request: ModelRequest,
    response: ModelResponse | undefined,
    output: string | null,
    started: number,
    stream: boolean,
    finishReason?: string | null,
  ): Promise<SpurvikProvenance> {
    return this.client.finishCall({
      path: agentsPath(this.modelId, stream),
      request: {
        prompt: textFromRequest(request),
        model: this.modelId,
        temperature: typeof request.modelSettings.temperature === "number" ? request.modelSettings.temperature : null,
        stream,
      },
      requestBody: { modelSettings: request.modelSettings },
      response,
      output,
      modelVersion: this.modelId,
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      ...(finishReason ? { finishReason } : {}),
    });
  }
}

function agentsPath(modelId: string, stream: boolean): string[] {
  const id = modelId.toLowerCase();
  if (id.includes("claude")) return ["messages", stream ? "stream" : "create"];
  if (id.includes("gemini")) return [stream ? "generateContentStream" : "generateContent"];
  if (id.includes("mistral") || id.includes("codestral") || id.includes("pixtral")) {
    return ["chat", stream ? "stream" : "complete"];
  }
  if (id.startsWith("gpt-") || id.startsWith("chatgpt") || /^(o1|o3|o4)/.test(id)) {
    return ["responses", stream ? "stream" : "create"];
  }
  return ["agents", stream ? "getStreamedResponse" : "getResponse"];
}

function textFromRequest(request: ModelRequest): string | null {
  const parts: string[] = [];
  if (request.systemInstructions) parts.push(request.systemInstructions);
  if (typeof request.input === "string") {
    if (request.input) parts.push(request.input);
  } else {
    for (const item of request.input) collectMessageText(item, parts);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

function textFromOutput(output: readonly unknown[]): string | null {
  const parts: string[] = [];
  for (const item of output) collectOutputText(item, parts);
  return parts.length > 0 ? parts.join("") : null;
}

function outputText(response: ModelResponse | undefined, deltas: readonly string[]): string | null {
  if (response) {
    const text = textFromOutput(response.output);
    if (text !== null) return text;
  }
  return deltas.length > 0 ? deltas.join("") : null;
}

const SKIPPED_INPUT_TYPES = new Set([
  "function_call",
  "function_call_result",
  "hosted_tool_call",
  "tool_search_call",
]);

function collectMessageText(item: unknown, parts: string[]): void {
  if (!item || typeof item !== "object") return;
  const record = item as { type?: unknown; content?: unknown; rawContent?: unknown };
  if (typeof record.type === "string" && SKIPPED_INPUT_TYPES.has(record.type)) return;
  if (typeof record.content === "string") {
    if (record.content) parts.push(record.content);
  } else {
    collectInputParts(record.content, parts);
  }
  collectInputParts(record.rawContent, parts);
}

function collectInputParts(value: unknown, parts: string[]): void {
  if (!Array.isArray(value)) return;
  for (const part of value) {
    if (!part || typeof part !== "object") continue;
    const content = part as { type?: unknown; text?: unknown };
    if (
      (content.type === "input_text" || content.type === "output_text" || content.type === "reasoning_text") &&
      typeof content.text === "string"
    ) {
      parts.push(content.text);
    }
  }
}

function collectOutputText(item: unknown, parts: string[]): void {
  if (!item || typeof item !== "object") return;
  const record = item as { type?: unknown; content?: unknown };
  if (record.type === "function_call" || record.type === "hosted_tool_call" || record.type === "tool_search_call") {
    return;
  }
  if (!Array.isArray(record.content)) return;
  for (const part of record.content) {
    if (!part || typeof part !== "object") continue;
    const content = part as { type?: unknown; text?: unknown };
    if (content.type === "output_text" && typeof content.text === "string") parts.push(content.text);
  }
}

function agentsFinishReason(response: ModelResponse | undefined): string | null {
  if (!response) return null;
  const bag = response as { status?: unknown; incomplete_details?: unknown };
  if (bag.status === "incomplete" || bag.status === "interrupted") return "interrupted";
  if (bag.incomplete_details != null && bag.incomplete_details !== false) return "interrupted";
  return null;
}

function asModelResponse(value: unknown): ModelResponse | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as { output?: unknown; usage?: unknown };
  if (!Array.isArray(record.output) || !record.usage || typeof record.usage !== "object") return undefined;
  return value as ModelResponse;
}

function applyMarkedOutput(response: ModelResponse, marked: string): ModelResponse {
  let replaced = false;
  const output = response.output.map((item) => {
    if (replaced || !("role" in item) || item.role !== "assistant" || !Array.isArray(item.content)) return item;
    const content = item.content.map((part) => {
      if (replaced || part.type !== "output_text") return part;
      replaced = true;
      return { ...part, text: marked };
    });
    return { ...item, content };
  });
  return { ...response, output };
}

function withReceipt(response: ModelResponse, provenance: SpurvikProvenance, apply: boolean): ModelResponse {
  const next =
    apply && provenance.markedOutput !== undefined
      ? applyMarkedOutput(response, provenance.markedOutput)
      : { ...response, output: [...response.output] };
  const { markedOutput, ...record } = provenance;
  const finishReason = provenance.finishReason;
  const spurvik: Record<string, unknown> = {
    record: JSON.parse(JSON.stringify(record)) as Record<string, unknown>,
    ...(typeof finishReason === "string" ? { finishReason, interrupted: finishReason === "interrupted" } : {}),
  };
  if (markedOutput !== undefined) spurvik.markedOutput = markedOutput;
  next.providerData = {
    ...(response.providerData ?? {}),
    [RECEIPT_KEY]: spurvik,
  };
  Object.defineProperty(next, "_spurvik_provenance", {
    value: provenance,
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return next;
}

function receiptFromBag(value: unknown): SpurvikProvenance | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const spurvik = value as { record?: unknown; markedOutput?: unknown; finishReason?: unknown };
  if (!spurvik.record || typeof spurvik.record !== "object" || Array.isArray(spurvik.record)) return undefined;
  const receipt: SpurvikProvenance = {
    ...(spurvik.record as SpurvikProvenance),
    ...(typeof spurvik.markedOutput === "string" ? { markedOutput: spurvik.markedOutput } : {}),
  };
  if (typeof spurvik.finishReason === "string") {
    Object.defineProperty(receipt, "finishReason", {
      value: spurvik.finishReason,
      enumerable: false,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(receipt, "interrupted", {
      value: spurvik.finishReason === "interrupted",
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
  return receipt;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
