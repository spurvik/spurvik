import { SIGNED_TEXT_TRAILER_ID, type MediaMarkingHook, type TextMarkingHook } from "@spurvik/core";
import { DOES_NOT_MARK, UNKNOWN_SURFACE } from "../copy.js";

export const SURFACES = ["text", "media", "both"] as const;
export type MarkingSurface = (typeof SURFACES)[number];

const textHook = {
  id: "customer-text-hook",
  mark(text: string, _provenance: Parameters<TextMarkingHook["mark"]>[1]): string {
    return text;
  },
} satisfies TextMarkingHook;

const mediaHook = {
  id: "customer-media-hook",
  async mark(input: Parameters<MediaMarkingHook["mark"]>[0]) {
    return { bytes: input.bytes, mediaType: input.mediaType, manifestEmbedded: false };
  },
} satisfies MediaMarkingHook;

function isSurface(value: string): value is MarkingSurface {
  return (SURFACES as readonly string[]).includes(value);
}

/** How a caller plugs in their own Article 50(2) marking. Spurvik does not mark content. */
export function markingHooksText(surface: string = "both"): string {
  if (!isSurface(surface)) throw new Error(UNKNOWN_SURFACE);
  const parts = [
    DOES_NOT_MARK,
    "withSpurvik and spurvikMiddleware log the call and attach an HMAC receipt. A marking hook runs only when you set config.marking.",
    "Leave marking unset when you have not provided a hook.",
  ];
  if (surface !== "media") {
    parts.push(
      "A text hook is marking.text. The hook id and mark function are yours.",
      [
        "marking: {",
        "  text: {",
        `    id: ${JSON.stringify(textHook.id)},`,
        "    mark(text, provenance) {",
        "      return text;",
        "    },",
        "  },",
        "}",
      ].join("\n"),
      `You can set marking.text to "signed-trailer". That opts into the built-in trailer whose id is ${SIGNED_TEXT_TRAILER_ID}. It is an application-level binding. It is not a C2PA manifest, and it is not, by itself, an Article 50(2) machine-readable mark.`,
      "Streams are not rewritten in flight. Hook output for a stream is on the receipt as markedOutput unless applyToMessageContent is true for a non-streaming call.",
    );
  }
  if (surface !== "text") {
    parts.push(
      "A media hook is marking.media. Your hook returns the bytes and whether a manifest was embedded.",
      [
        "marking: {",
        "  media: {",
        `    id: ${JSON.stringify(mediaHook.id)},`,
        "    async mark(input) {",
        "      return { bytes: input.bytes, mediaType: input.mediaType, manifestEmbedded: false };",
        "    },",
        "  },",
        "}",
      ].join("\n"),
      "@spurvik/c2pa implements a MediaMarkingHook for PNG and JPEG. This server does not call it.",
    );
  }
  parts.push(
    "markingApplied on the receipt is true only for a hook that changed the content in the way the SDK already records, or for upstream status provider_confirmed. Do not set it yourself.",
    `Article 50(2) marking is the hook you supply. ${DOES_NOT_MARK}`,
  );
  return `${parts.join("\n\n")}\n`;
}
