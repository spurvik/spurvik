import { Command } from "@langchain/langgraph";
import { withSpurvikLangGraph, } from "./langgraph.js";
/**
 * Compiled against `@langchain/langgraph`.
 * A compiled graph is a runnable. `withSpurvikLangGraph` returns `SpurvikLangGraphRunnable`.
 * `result.command` is the object `new Command(result.command)` accepts.
 */
export function compiledGraphIsRunnable(graph) {
    return graph;
}
export function wrappedRunnable(graph, config) {
    return withSpurvikLangGraph(graph, config);
}
const commandHasResume = true;
const interruptIsFn = true;
const resolveIsFn = true;
const fromStateIsFn = true;
export function resumeCommand(result) {
    return new Command(result.command);
}
export { commandHasResume, fromStateIsFn, interruptIsFn, resolveIsFn };
