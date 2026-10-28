import type { HitlRecordWire, HitlStatus } from "@spurvik/core";
import {
  SpurvikClient,
  provenanceOf,
  type RequireHumanApprovalOptions,
  type SpurvikProvenance,
} from "./client.js";
import type { SpurvikConfig } from "./config.js";
import { SpurvikConfigError, SpurvikHitlRejectedError } from "./errors.js";

export type { SpurvikConfig } from "./config.js";
export type { SpurvikProvenance } from "./client.js";
export { provenanceOf };

const SKIPPED_MESSAGE_KINDS = new Set(["tool", "function", "function_call_result"]);

/**
 * Compiled graph shape this adapter calls.
 * `@langchain/langgraph` is an optional peer. This file does not import it.
 */
export interface LangGraphRunnableLike<TInput = Record<string, unknown>, TOutput = Record<string, unknown>> {
  invoke(input: TInput, ...callOptions: unknown[]): PromiseLike<TOutput> | TOutput;
  stream?(input: TInput, ...callOptions: unknown[]): AsyncIterable<unknown> | PromiseLike<AsyncIterable<unknown>>;
}

export interface SpurvikLangGraphOptions {
  /** Model id stored on the receipt. Defaults to `"langgraph"`. */
  modelId?: string;
}

export interface SpurvikLangGraphInterruptRequest {
  actionName: string;
  callId?: string;
  payload?: Record<string, unknown>;
  /**
   * LangGraph `interrupt`. When the resume value is already a decision, it is returned.
   * Otherwise the adapter submits the action to the human-oversight queue.
   */
  interrupt?: (value: unknown) => unknown;
}

export interface SpurvikLangGraphResumeValue {
  approved: boolean;
  status: HitlStatus;
  approvalId: string;
  actionName?: string;
  callId?: string | null;
  approval?: HitlRecordWire;
}

export interface SpurvikLangGraphDecision {
  approved: boolean;
  status: HitlStatus;
  actionName: string;
  callId: string | null;
  approval?: HitlRecordWire;
  resume: SpurvikLangGraphResumeValue;
  command: { resume: SpurvikLangGraphResumeValue };
}

export interface SpurvikLangGraphInterruptOptions extends RequireHumanApprovalOptions {
  /** Fallback action name. Defaults to `"langgraph_interrupt"`. */
  defaultActionName?: string;
  /**
   * When true, rethrows `SpurvikHitlRejectedError`.
   * Defaults to false and returns `{ approved: false, command: { resume } }`.
   */
  throwOnReject?: boolean;
}

export interface LangGraphInterruptItemLike {
  id?: string;
  callId?: string;
  actionName?: string;
  value?: {
    actionName?: string;
    callId?: string;
    id?: string;
    payload?: Record<string, unknown>;
  };
}

export interface ResolveLangGraphInterruptsResult {
  decisions: SpurvikLangGraphDecision[];
  allApproved: boolean;
  skippedDuplicateIds: string[];
  resumeById: Record<string, SpurvikLangGraphResumeValue>;
  command: { resume: SpurvikLangGraphResumeValue | Record<string, SpurvikLangGraphResumeValue> };
}

/** Wrapped graph returned by `withSpurvikLangGraph`. */
export type SpurvikLangGraphRunnable<TInput = Record<string, unknown>, TOutput = Record<string, unknown>> =
  SpurvikLangGraph<TInput, TOutput>;

/**
 * A decision or a batch of decisions.
 * `result.command` is the object `new Command(result.command)` accepts.
 */
export type SpurvikLangGraphResumeResult = SpurvikLangGraphDecision | ResolveLangGraphInterruptsResult;

export interface SpurvikLangGraph<TInput = Record<string, unknown>, TOutput = Record<string, unknown>> {
  invoke(input: TInput, callOptions?: unknown): Promise<TOutput>;
  stream(input: TInput, callOptions?: unknown): Promise<AsyncIterable<unknown>>;
  flush(): Promise<void>;
  resolveInterrupts(
    interrupts: readonly LangGraphInterruptItemLike[],
    options?: SpurvikLangGraphInterruptOptions,
  ): Promise<ResolveLangGraphInterruptsResult>;
}

/**
 * Wrap a compiled LangGraph.
 * The constructor checks `apiKey` and `signingSecret` immediately.
 * `invoke` and `stream` run the halt check before the graph when enforcement is on.
 * A state with a non-empty `__interrupt__` array is recorded with finish reason `"interrupted"`.
 */
export function withSpurvikLangGraph<TInput = Record<string, unknown>, TOutput = Record<string, unknown>>(
  graph: LangGraphRunnableLike<TInput, TOutput>,
  config: SpurvikConfig,
  options?: SpurvikLangGraphOptions,
): SpurvikLangGraph<TInput, TOutput> {
  const client = new SpurvikClient(config);
  const modelId = options?.modelId?.trim() ? options.modelId.trim() : "langgraph";

  return {
    async invoke(input, callOptions) {
      await client.beforeInference();
      const started = performance.now();
      const result = await graph.invoke(input, callOptions);
      const provenance = await recordGraph(client, {
        input,
        output: result,
        started,
        stream: false,
        modelId,
        interrupted: hasInterrupt(result),
      });
      applyMarked(result, provenance, client.applyMarkedTextToContent);
      attachProvenance(result, provenance);
      return result;
    },
    async stream(input, callOptions) {
      await client.beforeInference();
      if (!graph.stream) {
        throw new SpurvikConfigError("This graph does not expose stream().");
      }
      const started = performance.now();
      const inner = await graph.stream(input, callOptions);
      const pending = deferred<SpurvikProvenance>();
      pending.promise.catch(() => undefined);
      const iterable: AsyncIterable<unknown> = {
        async *[Symbol.asyncIterator]() {
          const pieces: string[] = [];
          let last: unknown;
          let failed = false;
          let completed = false;
          try {
            for await (const chunk of inner) {
              last = chunk;
              if (typeof chunk === "string") pieces.push(chunk);
              yield chunk;
            }
            completed = true;
          } catch (error) {
            failed = true;
            pending.reject(error);
            throw error;
          } finally {
            if (!failed) {
              try {
                const provenance = await recordGraph(client, {
                  input,
                  output: streamOutput(pieces, last),
                  started,
                  stream: true,
                  modelId,
                  interrupted: !completed || hasInterrupt(last),
                });
                applyMarked(last, provenance, client.applyMarkedTextToContent);
                attachProvenance(last, provenance);
                pending.resolve(provenance);
              } catch (error) {
                pending.reject(error);
                throw error;
              }
            }
          }
        },
      };
      attachProvenance(iterable, pending.promise);
      return iterable;
    },
    flush: () => client.flush(),
    resolveInterrupts: (interrupts, interruptOptions) =>
      resolveLangGraphInterrupts(interrupts, client, interruptOptions),
  };
}

/**
 * Pause a graph node on the human-oversight queue.
 * When `request.interrupt` returns a resume value that already has `approved`, `status`, and `approvalId`, that value is used.
 * A rejection returns a `command` ready for `new Command(decision.command)` unless `throwOnReject` is set.
 */
export async function spurvikInterrupt(
  request: SpurvikLangGraphInterruptRequest,
  configOrClient: SpurvikConfig | SpurvikClient,
  options?: SpurvikLangGraphInterruptOptions,
): Promise<SpurvikLangGraphDecision> {
  const client = clientFrom(configOrClient);
  const actionName = request.actionName.trim() || options?.defaultActionName || "langgraph_interrupt";
  await client.assertNotHalted(actionName);
  if (request.interrupt) {
    const resumed = await request.interrupt({
      kind: "spurvik_langgraph_interrupt",
      actionName,
      callId: request.callId ?? null,
    });
    const resume = asResumeValue(resumed);
    if (resume) return decisionFromResume(actionName, request.callId ?? resume.callId ?? null, resume);
  }
  const payload = request.payload ?? {};
  try {
    const approval = await client.requireHumanApproval(actionName, payload, {
      timeoutMs: options?.timeoutMs,
      pollIntervalMs: options?.pollIntervalMs,
      signal: options?.signal,
    });
    const approved = approval.status === "approved" || approval.status === "overridden";
    const resume = resumeValue(approved, approval.status, approval, actionName, request.callId ?? null);
    return {
      approved,
      status: approval.status,
      actionName,
      callId: request.callId ?? null,
      approval,
      resume,
      command: { resume },
    };
  } catch (error) {
    if (!(error instanceof SpurvikHitlRejectedError)) throw error;
    if (options?.throwOnReject === true) throw error;
    const resume = resumeValue(false, "rejected", error.record, actionName, request.callId ?? null);
    return {
      approved: false,
      status: "rejected",
      actionName,
      callId: request.callId ?? null,
      approval: error.record,
      resume,
      command: { resume },
    };
  }
}

/**
 * Resolve LangGraph `__interrupt__` items.
 * The first item for each id is sent to the queue. Later copies are listed in `skippedDuplicateIds`.
 * One interrupt returns `{ resume }` for that decision. Several return `{ resume: resumeById }`.
 */
export async function resolveLangGraphInterrupts(
  interrupts: readonly LangGraphInterruptItemLike[] | LangGraphInterruptItemLike,
  configOrClient: SpurvikConfig | SpurvikClient,
  options?: SpurvikLangGraphInterruptOptions,
): Promise<ResolveLangGraphInterruptsResult> {
  const client = clientFrom(configOrClient);
  const items = normalizeInterrupts(interrupts);
  const seen = new Set<string>();
  const skippedDuplicateIds: string[] = [];
  const decisions: SpurvikLangGraphDecision[] = [];
  const resumeById: Record<string, SpurvikLangGraphResumeValue> = {};
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] as LangGraphInterruptItemLike;
    const id = interruptId(item, index);
    if (seen.has(id)) {
      skippedDuplicateIds.push(id);
      continue;
    }
    seen.add(id);
    const actionName = interruptActionName(item, options?.defaultActionName);
    const decision = await spurvikInterrupt(
      {
        actionName,
        callId: id,
        payload: interruptPayload(item, id, actionName),
      },
      client,
      options,
    );
    decisions.push(decision);
    resumeById[id] = decision.resume;
  }
  const command =
    decisions.length === 1 && decisions[0]
      ? { resume: decisions[0].resume }
      : { resume: resumeById };
  return {
    decisions,
    allApproved: decisions.every((decision) => decision.approved),
    skippedDuplicateIds,
    resumeById,
    command,
  };
}

/** Read a settled receipt stored on a graph state. A pending stream promise is not returned. */
export function provenanceFromLangGraphState(state: unknown): SpurvikProvenance | undefined {
  const found = provenanceOf(state);
  if (!found || found instanceof Promise) return undefined;
  return found;
}

function clientFrom(configOrClient: SpurvikConfig | SpurvikClient): SpurvikClient {
  return configOrClient instanceof SpurvikClient ? configOrClient : new SpurvikClient(configOrClient);
}

async function recordGraph(
  client: SpurvikClient,
  input: {
    input: unknown;
    output: unknown;
    started: number;
    stream: boolean;
    modelId: string;
    interrupted: boolean;
  },
): Promise<SpurvikProvenance> {
  return client.finishCall({
    path: ["langgraph", input.stream ? "stream" : "invoke"],
    request: {
      prompt: textFromInput(input.input),
      model: input.modelId,
      temperature: null,
      stream: input.stream,
    },
    requestBody: input.input,
    response: input.output,
    output: textFromOutput(input.output),
    modelVersion: input.modelId,
    latencyMs: Math.max(0, Math.round(performance.now() - input.started)),
    ...(input.interrupted ? { finishReason: "interrupted" } : {}),
  });
}

function hasInterrupt(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const interrupts = (result as { __interrupt__?: unknown }).__interrupt__;
  return Array.isArray(interrupts) && interrupts.length > 0;
}

function textFromInput(input: unknown): string | null {
  if (typeof input === "string") return input.length > 0 ? input : null;
  if (!input || typeof input !== "object") return null;
  const record = input as { messages?: unknown; prompt?: unknown; input?: unknown };
  const parts: string[] = [];
  if (Array.isArray(record.messages)) {
    for (const message of record.messages) collectMessageText(message, parts);
  } else if (typeof record.prompt === "string" && record.prompt) {
    parts.push(record.prompt);
  } else if (typeof record.input === "string" && record.input) {
    parts.push(record.input);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

function collectMessageText(message: unknown, parts: string[]): void {
  if (typeof message === "string") {
    if (message) parts.push(message);
    return;
  }
  if (Array.isArray(message)) {
    const role = typeof message[0] === "string" ? message[0] : "";
    if (SKIPPED_MESSAGE_KINDS.has(role)) return;
    if (typeof message[1] === "string" && message[1]) parts.push(message[1]);
    return;
  }
  if (!message || typeof message !== "object") return;
  const record = message as { role?: unknown; type?: unknown; content?: unknown };
  const role = typeof record.role === "string" ? record.role : "";
  const type = typeof record.type === "string" ? record.type : "";
  if (SKIPPED_MESSAGE_KINDS.has(role) || SKIPPED_MESSAGE_KINDS.has(type)) return;
  pushContent(record.content, parts);
}

function pushContent(content: unknown, parts: string[]): void {
  if (typeof content === "string") {
    if (content) parts.push(content);
    return;
  }
  if (!Array.isArray(content)) return;
  for (const part of content) {
    if (typeof part === "string") {
      if (part) parts.push(part);
      continue;
    }
    if (!part || typeof part !== "object") continue;
    const text = (part as { text?: unknown }).text;
    if (typeof text === "string" && text) parts.push(text);
  }
}

function normalizeInterrupts(
  interrupts: readonly LangGraphInterruptItemLike[] | LangGraphInterruptItemLike,
): LangGraphInterruptItemLike[] {
  if (Array.isArray(interrupts)) return [...interrupts];
  return [interrupts as LangGraphInterruptItemLike];
}

function streamOutput(pieces: readonly string[], last: unknown): unknown {
  if (pieces.length > 0) return pieces.join("");
  if (isLangGraphTuple(last)) return textFromLangGraphTuple(last);
  return last;
}

function isLangGraphTuple(chunk: unknown): chunk is [string, unknown] {
  return Array.isArray(chunk) && chunk.length >= 2 && typeof chunk[0] === "string";
}

function textFromLangGraphTuple(chunk: unknown): string | null {
  if (!isLangGraphTuple(chunk)) return null;
  const mode = chunk[0];
  const payload = chunk[1];
  if (mode === "messages") return textFromMessagesPayload(payload);
  if (mode === "updates") return textFromUpdatesPayload(payload);
  if (mode === "values") return textFromOutput(payload);
  return null;
}

function textFromMessagesPayload(payload: unknown): string | null {
  if (Array.isArray(payload)) return contentText(payload[0]);
  return contentText(payload);
}

function textFromUpdatesPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  let found: string | null = null;
  for (const node of Object.values(payload as Record<string, unknown>)) {
    if (!node || typeof node !== "object") continue;
    const text = textFromOutput(node) ?? contentText(node);
    if (text) found = text;
  }
  return found;
}

function contentText(message: unknown): string | null {
  if (typeof message === "string") return message.length > 0 ? message : null;
  if (!message || typeof message !== "object" || Array.isArray(message)) return null;
  const record = message as { role?: unknown; type?: unknown; content?: unknown };
  const role = typeof record.role === "string" ? record.role : "";
  const type = typeof record.type === "string" ? record.type : "";
  if (SKIPPED_MESSAGE_KINDS.has(role) || SKIPPED_MESSAGE_KINDS.has(type)) return null;
  if (typeof record.content === "string" && record.content) return record.content;
  return null;
}

function textFromOutput(result: unknown): string | null {
  if (typeof result === "string") return result.length > 0 ? result : null;
  if (!result || typeof result !== "object") return null;
  const record = result as { output?: unknown; messages?: unknown };
  if (typeof record.output === "string" && record.output) return record.output;
  if (!Array.isArray(record.messages)) return null;
  for (let index = record.messages.length - 1; index >= 0; index -= 1) {
    const text = assistantText(record.messages[index]);
    if (text) return text;
  }
  return null;
}

function assistantText(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;
  if (Array.isArray(message)) {
    const role = message[0];
    if (role !== "assistant" && role !== "ai") return null;
    return typeof message[1] === "string" && message[1] ? message[1] : null;
  }
  const record = message as { role?: unknown; type?: unknown; content?: unknown };
  const role = typeof record.role === "string" ? record.role : "";
  const type = typeof record.type === "string" ? record.type : "";
  if (role !== "assistant" && role !== "ai" && type !== "assistant" && type !== "ai") return null;
  if (typeof record.content === "string" && record.content) return record.content;
  return null;
}

function applyMarked(result: unknown, provenance: SpurvikProvenance, apply: boolean): void {
  if (!apply || provenance.markedOutput === undefined || !result || typeof result !== "object") return;
  const marked = provenance.markedOutput;
  const record = result as { output?: unknown; messages?: unknown[] };
  if (typeof record.output === "string") {
    record.output = marked;
    return;
  }
  if (!Array.isArray(record.messages)) return;
  for (let index = record.messages.length - 1; index >= 0; index -= 1) {
    const message = record.messages[index];
    if (!message || typeof message !== "object" || Array.isArray(message)) continue;
    const item = message as { role?: unknown; type?: unknown; content?: unknown };
    const role = typeof item.role === "string" ? item.role : "";
    const type = typeof item.type === "string" ? item.type : "";
    if (role !== "assistant" && role !== "ai" && type !== "assistant" && type !== "ai") continue;
    if (typeof item.content !== "string") continue;
    item.content = marked;
    return;
  }
}

function attachProvenance(target: unknown, provenance: SpurvikProvenance | Promise<SpurvikProvenance>): void {
  if (!target || typeof target !== "object") return;
  Object.defineProperty(target, "_spurvik_provenance", {
    value: provenance,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function asResumeValue(value: unknown): SpurvikLangGraphResumeValue | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<SpurvikLangGraphResumeValue>;
  if (typeof record.approved !== "boolean") return undefined;
  if (typeof record.status !== "string" || record.status.length === 0) return undefined;
  if (typeof record.approvalId !== "string" || record.approvalId.length === 0) return undefined;
  return {
    approved: record.approved,
    status: record.status as HitlStatus,
    approvalId: record.approvalId,
    ...(record.actionName ? { actionName: record.actionName } : {}),
    ...(record.callId !== undefined ? { callId: record.callId } : {}),
    ...(record.approval ? { approval: record.approval } : {}),
  };
}

function decisionFromResume(
  actionName: string,
  callId: string | null,
  resume: SpurvikLangGraphResumeValue,
): SpurvikLangGraphDecision {
  return {
    approved: resume.approved,
    status: resume.status,
    actionName: resume.actionName ?? actionName,
    callId,
    ...(resume.approval ? { approval: resume.approval } : {}),
    resume,
    command: { resume },
  };
}

function resumeValue(
  approved: boolean,
  status: HitlStatus,
  approval: HitlRecordWire,
  actionName: string,
  callId: string | null,
): SpurvikLangGraphResumeValue {
  return {
    approved,
    status,
    approvalId: approval.id,
    actionName,
    callId,
    approval,
  };
}

function interruptId(item: LangGraphInterruptItemLike, index: number): string {
  const candidates = [item.callId, item.value?.callId, item.id, item.value?.id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return `interrupt_${index}`;
}

function interruptActionName(item: LangGraphInterruptItemLike, fallback: string | undefined): string {
  const candidates = [item.actionName, item.value?.actionName, fallback];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  return "langgraph_interrupt";
}

function interruptPayload(
  item: LangGraphInterruptItemLike,
  callId: string,
  actionName: string,
): Record<string, unknown> {
  const raw = item.value?.payload;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return { ...raw, callId, actionName };
  return { callId, actionName };
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
