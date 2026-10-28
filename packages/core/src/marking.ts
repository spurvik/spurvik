import type { ProvenanceRecord } from "./provenance.js";

/**
 * Pluggable text marking.
 *
 * A hook embeds a provenance record into the text so the metadata can travel
 * with the content, not only on the response object. The built-in
 * `signed-text-trailer` hook is an application-level binding. It is not a
 * C2PA manifest and it is not, by itself, an Article 50(2) machine-readable
 * mark. Providers of systems placed on the market before 2 August 2026 have
 * until 2 December 2026 for the Article 50(2) marking and detection duty.
 * Signatories to the Code of Practice on Transparency of AI-generated Content
 * commit to interoperable detection by 2 February 2027.
 */
export interface TextMarkingHook {
  readonly id: string;
  mark(text: string, provenance: ProvenanceRecord): string | Promise<string>;
}

export interface MediaMarkingInput {
  bytes: Uint8Array;
  mediaType: string;
  provenance: ProvenanceRecord;
}

export interface MediaMarkingResult {
  bytes: Uint8Array;
  mediaType: string;
  manifestEmbedded: boolean;
}

/**
 * Extension point for C2PA manifests on images and other media.
 * `@spurvik/c2pa` ships an image writer. A text trailer is not this hook.
 */
export interface MediaMarkingHook {
  readonly id: string;
  mark(input: MediaMarkingInput): Promise<MediaMarkingResult>;
}

export const SIGNED_TEXT_TRAILER_ID = "signed-text-trailer";

/** A text hook with this id is a watermark. The signed trailer is not. */
export function isWatermarkHook(hookId: string): boolean {
  return hookId === "watermark" || hookId.startsWith("watermark:");
}
/** New marks use this literal. The parser also accepts the previous spelling. */
const TRAILER_PREFIX = "\n\n[[[spurvik-provenance-record:";
const LEGACY_TRAILER_PREFIX = "\n\n[[[aegis-provenance-record:";
const TRAILER_SUFFIX = "]]]";

export function createSignedTextTrailerHook(): TextMarkingHook {
  return {
    id: SIGNED_TEXT_TRAILER_ID,
    mark(text, provenance) {
      const encoded = base64UrlEncode(JSON.stringify(provenance));
      return `${text}${TRAILER_PREFIX}${encoded}${TRAILER_SUFFIX}`;
    },
  };
}

/**
 * True when a text hook changed `marked`.
 * The signed-text trailer counts only when the trailer can be read back.
 * That trailer is recorded as `evidenceTrailerAttached`, not as `markingApplied`.
 * A watermark hook counts only when the text changed.
 */
export function textMarkWasApplied(hookId: string, original: string, marked: string): boolean {
  if (marked === original) return false;
  if (hookId === SIGNED_TEXT_TRAILER_ID) return readSignedTextTrailer(marked) !== null;
  return true;
}

/**
 * True when a media hook embedded a manifest and the bytes changed.
 * `manifestEmbedded: false` (unsupported type, or the hook declined) is not a mark.
 */
export function mediaMarkWasApplied(original: Uint8Array, result: MediaMarkingResult): boolean {
  if (!result.manifestEmbedded) return false;
  if (original.byteLength !== result.bytes.byteLength) return true;
  for (let index = 0; index < original.byteLength; index += 1) {
    if (original[index] !== result.bytes[index]) return true;
  }
  return false;
}

export function readSignedTextTrailer(marked: string): ProvenanceRecord | null {
  return readTrailer(marked, TRAILER_PREFIX) ?? readTrailer(marked, LEGACY_TRAILER_PREFIX);
}

function readTrailer(marked: string, prefix: string): ProvenanceRecord | null {
  const start = marked.lastIndexOf(prefix);
  if (start < 0) return null;
  const end = marked.lastIndexOf(TRAILER_SUFFIX);
  if (end < start) return null;
  const encoded = marked.slice(start + prefix.length, end);
  try {
    const parsed: unknown = JSON.parse(base64UrlDecode(encoded));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as ProvenanceRecord;
  } catch {
    return null;
  }
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
