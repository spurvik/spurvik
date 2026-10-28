import { provenanceOf, withSpurvik } from "@spurvik/sdk";
import { provenanceFromMetadata, spurvikMiddleware } from "@spurvik/sdk/ai";
import { withSpurvikMastra } from "@spurvik/sdk/mastra";
import {
  createSpurvikNeedsApproval,
  provenanceFromAgentsResponse,
  resolveAgentInterruptions,
  withSpurvikModel,
  withSpurvikModelProvider,
} from "@spurvik/sdk/openai-agents";
import {
  provenanceFromLangGraphState,
  resolveLangGraphInterrupts,
  spurvikInterrupt,
  withSpurvikLangGraph,
} from "@spurvik/sdk/langgraph";

function liveExport(value: unknown, name: string): string {
  if (typeof value !== "function") {
    throw new Error(`Missing @spurvik/sdk export ${name}.`);
  }
  return name;
}

/** Names of the installed SDK functions. Snippets interpolate these bindings. */
export const sdkExportNames = {
  withSpurvik: liveExport(withSpurvik, "withSpurvik"),
  provenanceOf: liveExport(provenanceOf, "provenanceOf"),
  spurvikMiddleware: liveExport(spurvikMiddleware, "spurvikMiddleware"),
  provenanceFromMetadata: liveExport(provenanceFromMetadata, "provenanceFromMetadata"),
  withSpurvikMastra: liveExport(withSpurvikMastra, "withSpurvikMastra"),
  withSpurvikModelProvider: liveExport(withSpurvikModelProvider, "withSpurvikModelProvider"),
  withSpurvikModel: liveExport(withSpurvikModel, "withSpurvikModel"),
  provenanceFromAgentsResponse: liveExport(provenanceFromAgentsResponse, "provenanceFromAgentsResponse"),
  createSpurvikNeedsApproval: liveExport(createSpurvikNeedsApproval, "createSpurvikNeedsApproval"),
  resolveAgentInterruptions: liveExport(resolveAgentInterruptions, "resolveAgentInterruptions"),
  withSpurvikLangGraph: liveExport(withSpurvikLangGraph, "withSpurvikLangGraph"),
  spurvikInterrupt: liveExport(spurvikInterrupt, "spurvikInterrupt"),
  resolveLangGraphInterrupts: liveExport(resolveLangGraphInterrupts, "resolveLangGraphInterrupts"),
  provenanceFromLangGraphState: liveExport(provenanceFromLangGraphState, "provenanceFromLangGraphState"),
} as const;
