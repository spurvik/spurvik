/**
 * What each provider documents about output marking.
 * Edit this list when a public source changes. `sourceReadOn` is the date the
 * source was read. It is not a conformity check.
 */

export type MarkingProvider = "openai" | "anthropic" | "google" | "mistral" | "open_weight";

export type MarkingModality = "text" | "image" | "audio" | "video";

/** How the provider's own documentation describes the mark. */
export type DocumentedMarking = "default" | "opt_in" | "none" | "not_documented";

/** Whether a deployer can use a documented detector. */
export type DocumentedDetection = "public" | "restricted" | "none" | "not_documented";

export interface ProviderMarkingEntry {
  provider: MarkingProvider;
  modality: MarkingModality;
  marking: DocumentedMarking;
  detection: DocumentedDetection;
  /** Factual limit. Supports compliance work. Not a legal conclusion. */
  summary: string;
  sourceUrl: string;
  sourceReadOn: string;
}

export const MARKING_REGISTRY: readonly ProviderMarkingEntry[] = [
  {
    provider: "openai",
    modality: "text",
    marking: "opt_in",
    detection: "restricted",
    summary:
      "OpenAI documents text watermarking as opt-in for an API project or organization, and off by default. The public chat response does not include a watermark field. Detector access is limited to approved researchers and expert organizations. A wrapper cannot show from that response that a text watermark is present.",
    sourceUrl: "https://openai.com/index/eu-text-provenance/",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "openai",
    modality: "image",
    marking: "default",
    detection: "public",
    summary:
      "OpenAI states that images from ChatGPT, Codex, and the API include C2PA Content Credentials and SynthID. The Content Provenance API checks those image signals. A chat completion object does not carry the image file.",
    sourceUrl: "https://developers.openai.com/api/docs/guides/content-provenance",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "openai",
    modality: "audio",
    marking: "default",
    detection: "public",
    summary:
      "OpenAI states that audio from ChatGPT or the API includes a SynthID watermark, and that the Content Provenance API checks supported audio.",
    sourceUrl: "https://help.openai.com/en/articles/8912793-provenance-signals-in-openai-generated-content",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "openai",
    modality: "video",
    marking: "not_documented",
    detection: "not_documented",
    summary:
      "OpenAI's provenance note lists Content Credentials for video and says Sora is discontinued. A current video-marking field on an API response is not documented there.",
    sourceUrl: "https://help.openai.com/en/articles/8912793-provenance-signals-in-openai-generated-content",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "anthropic",
    modality: "text",
    marking: "default",
    detection: "restricted",
    summary:
      "Anthropic states that Claude models launched on or after 2 August 2026 watermark text by default, including on the API, and that the watermark is not a response field or header. Detection is in private preview for eligible organizations. A wrapper cannot show from the Messages response that the watermark is present.",
    sourceUrl: "https://www.anthropic.com/news/claude-text-watermark",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "anthropic",
    modality: "image",
    marking: "default",
    detection: "restricted",
    summary:
      "Anthropic states that generated files include Content Credentials (C2PA) where supported. Detection of those file marks is described with the same private-preview detector.",
    sourceUrl: "https://support.claude.com/en/articles/16266773-how-claude-marks-ai-generated-content",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "anthropic",
    modality: "audio",
    marking: "not_documented",
    detection: "not_documented",
    summary: "The Claude marking note does not describe an audio watermark or a public audio detector.",
    sourceUrl: "https://support.claude.com/en/articles/16266773-how-claude-marks-ai-generated-content",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "anthropic",
    modality: "video",
    marking: "not_documented",
    detection: "not_documented",
    summary: "The Claude marking note does not describe a video watermark or a public video detector.",
    sourceUrl: "https://support.claude.com/en/articles/16266773-how-claude-marks-ai-generated-content",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "google",
    modality: "text",
    marking: "not_documented",
    detection: "not_documented",
    summary:
      "Google describes SynthID text for the Gemini app and web experience. The public SynthID Detector accepts images, video, and audio. A Gemini API response flag for a text watermark is not documented, and a public text detector is not documented.",
    sourceUrl: "https://deepmind.google/models/synthid/",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "google",
    modality: "image",
    marking: "default",
    detection: "public",
    summary:
      "Google states that SynthID watermarks images and that the public SynthID Detector checks images. The Gemini API response used by this SDK does not include that file signal.",
    sourceUrl: "https://blog.google/innovation-and-ai/models-and-research/google-deepmind/synth-id-ai-content/",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "google",
    modality: "audio",
    marking: "default",
    detection: "public",
    summary: "Google states that SynthID watermarks audio and that the public SynthID Detector checks audio.",
    sourceUrl: "https://blog.google/innovation-and-ai/models-and-research/google-deepmind/synth-id-ai-content/",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "google",
    modality: "video",
    marking: "default",
    detection: "public",
    summary: "Google states that SynthID watermarks video and that the public SynthID Detector checks video.",
    sourceUrl: "https://blog.google/innovation-and-ai/models-and-research/google-deepmind/synth-id-ai-content/",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "mistral",
    modality: "text",
    marking: "not_documented",
    detection: "not_documented",
    summary:
      "The published Mistral Chat Completions reference documents the model, messages, and response format. It does not document a watermark parameter, a marking field, or a detector.",
    sourceUrl: "https://docs.mistral.ai/API",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "mistral",
    modality: "image",
    marking: "not_documented",
    detection: "not_documented",
    summary: "The published Mistral Chat Completions reference does not document image marking or a detector.",
    sourceUrl: "https://docs.mistral.ai/API",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "mistral",
    modality: "audio",
    marking: "not_documented",
    detection: "not_documented",
    summary: "The published Mistral Chat Completions reference does not document audio marking or a detector.",
    sourceUrl: "https://docs.mistral.ai/API",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "mistral",
    modality: "video",
    marking: "not_documented",
    detection: "not_documented",
    summary: "The published Mistral Chat Completions reference does not document video marking or a detector.",
    sourceUrl: "https://docs.mistral.ai/API",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "open_weight",
    modality: "text",
    marking: "none",
    detection: "none",
    summary:
      "An open-weight model does not apply a provider watermark unless the operator configures one. SynthID Text in Transformers is opt-in through watermarking_config on generate. A typical chat response does not expose that configuration.",
    sourceUrl: "https://ai.google.dev/responsible/docs/safeguards/synthid",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "open_weight",
    modality: "image",
    marking: "not_documented",
    detection: "not_documented",
    summary: "A raw open-weight server does not document an image mark on the chat response.",
    sourceUrl: "https://ai.google.dev/responsible/docs/safeguards/synthid",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "open_weight",
    modality: "audio",
    marking: "not_documented",
    detection: "not_documented",
    summary: "A raw open-weight server does not document an audio mark on the chat response.",
    sourceUrl: "https://ai.google.dev/responsible/docs/safeguards/synthid",
    sourceReadOn: "2026-10-17",
  },
  {
    provider: "open_weight",
    modality: "video",
    marking: "not_documented",
    detection: "not_documented",
    summary: "A raw open-weight server does not document a video mark on the chat response.",
    sourceUrl: "https://ai.google.dev/responsible/docs/safeguards/synthid",
    sourceReadOn: "2026-10-17",
  },
];

export function markingRegistryEntry(
  provider: string,
  modality: MarkingModality,
): ProviderMarkingEntry | null {
  return MARKING_REGISTRY.find((entry) => entry.provider === provider && entry.modality === modality) ?? null;
}

export interface MarkingCoverageEvent {
  provider: string;
  model: string;
  modality: string;
  upstreamApplied: "applied" | "not_applied" | "unknown";
  localApplied: boolean;
}

export interface MarkingCoverageRow {
  provider: string;
  model: string;
  modality: string;
  calls: number;
  upstreamApplied: number;
  upstreamNotApplied: number;
  upstreamUnknown: number;
  localApplied: number;
}

export function markingCoverage(events: readonly MarkingCoverageEvent[]): MarkingCoverageRow[] {
  const rows = new Map<string, MarkingCoverageRow>();
  for (const event of events) {
    const key = `${event.provider}\u0000${event.model}\u0000${event.modality}`;
    const row = rows.get(key) ?? {
      provider: event.provider,
      model: event.model,
      modality: event.modality,
      calls: 0,
      upstreamApplied: 0,
      upstreamNotApplied: 0,
      upstreamUnknown: 0,
      localApplied: 0,
    };
    row.calls += 1;
    if (event.upstreamApplied === "applied") row.upstreamApplied += 1;
    else if (event.upstreamApplied === "not_applied") row.upstreamNotApplied += 1;
    else row.upstreamUnknown += 1;
    if (event.localApplied) row.localApplied += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((left, right) =>
    `${left.provider}:${left.model}:${left.modality}`.localeCompare(`${right.provider}:${right.model}:${right.modality}`),
  );
}

/**
 * Text-output limits for a project. Robust provider marking is treated as
 * something these records cannot show when the public SDK exposes no mark
 * and the documented detector is not public.
 */
export function documentedTextLimits(events: readonly MarkingCoverageEvent[]): string {
  const textEntries = MARKING_REGISTRY.filter((entry) => entry.modality === "text");
  const textEvents = events.filter((event) => event.modality === "text");
  const lines = [
    "Documented limits for text outputs",
    "",
    "This statement supports compliance work for a deployer that wraps a third-party model. Commission guidance on Article 50 allows reliance on a provider's output marking only when the deployer can show that the marking works. The lines below say what each provider documents, and what a wrapped SDK response actually exposes. This is not a conformity assessment.",
    "",
  ];
  for (const entry of textEntries) {
    const feasible = entry.marking === "default" && entry.detection === "public";
    lines.push(`Text, ${providerLabel(entry.provider)}. ${entry.summary}`);
    lines.push(
      feasible
        ? "The provider documents a public detector for this modality. These records still count only signals present on the SDK response."
        : "Robust marking is not something these records can show for this provider's text. The SDK response does not expose a mark a deployer can check, and a public detector is not documented.",
    );
    lines.push(`Source read ${entry.sourceReadOn}: ${entry.sourceUrl}`);
    lines.push("");
  }
  if (textEvents.length === 0) {
    lines.push("No wrapped text calls are stored for this project yet. The limits above are the ones a wrapper can currently record.");
  } else {
    lines.push("Recorded text calls");
    for (const row of markingCoverage(textEvents)) {
      lines.push(
        `- ${row.provider} / ${row.model}: ${row.calls} calls, upstream mark present on ${row.upstreamApplied}, explicitly absent on ${row.upstreamNotApplied}, unknown on ${row.upstreamUnknown}, local mark on ${row.localApplied}.`,
      );
    }
    const exposed = textEvents.some((event) => event.upstreamApplied === "applied");
    lines.push("");
    lines.push(
      exposed
        ? "At least one stored text call carried an upstream marking signal on the SDK response. That signal is evidence the field was present. It does not show that the mark meets Article 50."
        : "No stored text call exposed an upstream marking flag or header. A local Spurvik mark, when one was applied, is recorded separately and is not a finding that Article 50(2) is met.",
    );
  }
  return lines.join("\n");
}

export function providerLabel(provider: string): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "google":
      return "Google";
    case "mistral":
      return "Mistral";
    case "open_weight":
      return "Open-weight";
    default:
      return provider;
  }
}
