import type { HitlRecordWire, HitlStatus } from "@spurvik/core";
import { SpurvikClient, provenanceOf, type RequireHumanApprovalOptions, type SpurvikProvenance } from "./client.js";
import type { SpurvikConfig } from "./config.js";
export type { SpurvikConfig } from "./config.js";
export type { SpurvikProvenance } from "./client.js";
export { provenanceOf };
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
    command: {
        resume: SpurvikLangGraphResumeValue;
    };
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
    command: {
        resume: SpurvikLangGraphResumeValue | Record<string, SpurvikLangGraphResumeValue>;
    };
}
/** Wrapped graph returned by `withSpurvikLangGraph`. */
export type SpurvikLangGraphRunnable<TInput = Record<string, unknown>, TOutput = Record<string, unknown>> = SpurvikLangGraph<TInput, TOutput>;
/**
 * A decision or a batch of decisions.
 * `result.command` is the object `new Command(result.command)` accepts.
 */
export type SpurvikLangGraphResumeResult = SpurvikLangGraphDecision | ResolveLangGraphInterruptsResult;
export interface SpurvikLangGraph<TInput = Record<string, unknown>, TOutput = Record<string, unknown>> {
    invoke(input: TInput, callOptions?: unknown): Promise<TOutput>;
    stream(input: TInput, callOptions?: unknown): Promise<AsyncIterable<unknown>>;
    flush(): Promise<void>;
    resolveInterrupts(interrupts: readonly LangGraphInterruptItemLike[], options?: SpurvikLangGraphInterruptOptions): Promise<ResolveLangGraphInterruptsResult>;
}
/**
 * Wrap a compiled LangGraph.
 * The constructor checks `apiKey` and `signingSecret` immediately.
 * `invoke` and `stream` run the halt check before the graph when enforcement is on.
 * A state with a non-empty `__interrupt__` array is recorded with finish reason `"interrupted"`.
 */
export declare function withSpurvikLangGraph<TInput = Record<string, unknown>, TOutput = Record<string, unknown>>(graph: LangGraphRunnableLike<TInput, TOutput>, config: SpurvikConfig, options?: SpurvikLangGraphOptions): SpurvikLangGraph<TInput, TOutput>;
/**
 * Pause a graph node on the human-oversight queue.
 * When `request.interrupt` returns a resume value that already has `approved`, `status`, and `approvalId`, that value is used.
 * A rejection or an overridden decision returns a `command` ready for `new Command(decision.command)` unless `throwOnReject` is set.
 * Only `approved` sets `approved`. Overridden means do not continue.
 */
export declare function spurvikInterrupt(request: SpurvikLangGraphInterruptRequest, configOrClient: SpurvikConfig | SpurvikClient, options?: SpurvikLangGraphInterruptOptions): Promise<SpurvikLangGraphDecision>;
/**
 * Resolve LangGraph `__interrupt__` items.
 * The first item for each id is sent to the queue. Later copies are listed in `skippedDuplicateIds`.
 * One interrupt returns `{ resume }` for that decision. Several return `{ resume: resumeById }`.
 */
export declare function resolveLangGraphInterrupts(interrupts: readonly LangGraphInterruptItemLike[] | LangGraphInterruptItemLike, configOrClient: SpurvikConfig | SpurvikClient, options?: SpurvikLangGraphInterruptOptions): Promise<ResolveLangGraphInterruptsResult>;
/** Read a settled receipt stored on a graph state. A pending stream promise is not returned. */
export declare function provenanceFromLangGraphState(state: unknown): SpurvikProvenance | undefined;
