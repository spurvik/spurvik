import { Command, type CompiledStateGraph } from "@langchain/langgraph";
import { withSpurvikLangGraph, type LangGraphRunnableLike, type SpurvikLangGraphResumeResult, type SpurvikLangGraphRunnable, type provenanceFromLangGraphState, type resolveLangGraphInterrupts, type spurvikInterrupt } from "./langgraph.js";
type Graph = CompiledStateGraph<any, any, any, any, any, any, any, any, any, any>;
type ResumeCommand = SpurvikLangGraphResumeResult["command"];
type Fn = (...args: never[]) => unknown;
/**
 * Compiled against `@langchain/langgraph`.
 * A compiled graph is a runnable. `withSpurvikLangGraph` returns `SpurvikLangGraphRunnable`.
 * `result.command` is the object `new Command(result.command)` accepts.
 */
export declare function compiledGraphIsRunnable(graph: Graph): LangGraphRunnableLike;
export declare function wrappedRunnable(graph: LangGraphRunnableLike, config: Parameters<typeof withSpurvikLangGraph>[1]): SpurvikLangGraphRunnable;
declare const commandHasResume: ResumeCommand extends {
    resume: unknown;
} ? true : never;
declare const interruptIsFn: typeof spurvikInterrupt extends Fn ? true : never;
declare const resolveIsFn: typeof resolveLangGraphInterrupts extends Fn ? true : never;
declare const fromStateIsFn: typeof provenanceFromLangGraphState extends Fn ? true : never;
export declare function resumeCommand(result: SpurvikLangGraphResumeResult): Command;
export { commandHasResume, fromStateIsFn, interruptIsFn, resolveIsFn };
