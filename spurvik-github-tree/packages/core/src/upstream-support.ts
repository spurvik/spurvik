import type { MarkingModality } from "./marking-registry.js";

/**
 * Dated notes on which model ids a public source lists as carrying a mark.
 * An empty `models` list means a model id alone is not enough.
 * Edit this file when a public source changes. `sourceReadOn` is the date the
 * page was read.
 */

export interface UpstreamSupportEntry {
  provider: string;
  modality: MarkingModality;
  /** Model ids the source lists. No wildcard. */
  models: readonly string[];
  sourceUrl: string;
  sourceReadOn: string;
  note: string;
}

/**
 * Help-center table read on 2026-10-17. These ids were listed without a text mark.
 * https://support.claude.com/en/articles/16266773-how-claude-marks-ai-generated-content
 */
export const ANTHROPIC_TEXT_MODELS_WITHOUT_MARK = [
  "claude-opus-4-5",
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-sonnet-4-5",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-mythos-5",
] as const;

export const UPSTREAM_SUPPORT: readonly UpstreamSupportEntry[] = [
  {
    provider: "openai",
    modality: "text",
    models: [],
    sourceUrl: "https://openai.com/index/eu-text-provenance/",
    sourceReadOn: "2026-10-17",
    note: "Opt-in for an API project or organization, and off by default. The public chat object has no per-request marking parameter and no model-id list. A model id alone stays unknown.",
  },
  {
    provider: "openai",
    modality: "image",
    models: [],
    sourceUrl: "https://developers.openai.com/api/docs/guides/content-provenance",
    sourceReadOn: "2026-10-17",
    note: "OpenAI states that API images include C2PA Content Credentials and SynthID. The chat completion object does not carry the file, and no model-id list is published here.",
  },
  {
    provider: "anthropic",
    modality: "text",
    models: [],
    sourceUrl: "https://support.claude.com/en/articles/16266773-how-claude-marks-ai-generated-content",
    sourceReadOn: "2026-10-17",
    note: "The help-center table read on this date does not show a text mark for Opus 4.5, 4.6, 4.7, Sonnet 4.5, 4.6, Haiku 4.5, or Mythos 5. Models it does not name stay unknown. Cloud-partner routes are not this table.",
  },
  {
    provider: "google",
    modality: "text",
    models: [],
    sourceUrl: "https://deepmind.google/models/synthid/",
    sourceReadOn: "2026-10-17",
    note: "SynthID text is described for the Gemini app and web experience. A Gemini API response flag for a text mark is not documented.",
  },
  {
    provider: "mistral",
    modality: "text",
    models: [],
    sourceUrl: "https://docs.mistral.ai/API",
    sourceReadOn: "2026-10-17",
    note: "The published Chat Completions reference does not document a marking parameter, a marking field, or a model-id list.",
  },
  {
    provider: "open_weight",
    modality: "text",
    models: [],
    sourceUrl: "https://ai.google.dev/responsible/docs/safeguards/synthid",
    sourceReadOn: "2026-10-17",
    note: "An open-weight model applies a mark only when the operator configures one. A typical chat response does not expose that configuration.",
  },
];

/** Bedrock, Vertex, Foundry, and Azure are not the provider's own API route. */
export function isCloudPartnerRoute(route: string): boolean {
  return /bedrock|vertex|foundry|azure/i.test(route);
}

/** How the call reached the model. `direct` is the provider's own API. */
export type UpstreamRouteKind = "direct" | "bedrock" | "vertex" | "azure" | "foundry";

/**
 * Classify a path or an explicit `upstreamRoute` setting.
 * Foundry is checked before Azure so an Azure AI Foundry path is not folded into Azure OpenAI.
 */
export function classifyUpstreamRoute(route: string): UpstreamRouteKind {
  const value = route.toLowerCase();
  if (value.includes("bedrock")) return "bedrock";
  if (value.includes("vertex")) return "vertex";
  if (value.includes("foundry")) return "foundry";
  if (value.includes("azure")) return "azure";
  return "direct";
}

export function supportInference(
  provider: string,
  model: string,
  modality: string,
  entries: readonly UpstreamSupportEntry[] = UPSTREAM_SUPPORT,
): boolean {
  const normalized = model.trim().toLowerCase();
  if (!normalized || normalized === "unknown") return false;
  return entries.some(
    (entry) =>
      entry.provider === provider &&
      entry.modality === modality &&
      entry.models.some((id) => id.toLowerCase() === normalized),
  );
}
