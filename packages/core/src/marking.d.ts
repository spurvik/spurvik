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
 * An image writer can implement this hook. A text trailer is not this hook.
 */
export interface MediaMarkingHook {
    readonly id: string;
    mark(input: MediaMarkingInput): Promise<MediaMarkingResult>;
}
export declare const SIGNED_TEXT_TRAILER_ID = "signed-text-trailer";
/** A text hook with this id is a watermark. The signed trailer is not. */
export declare function isWatermarkHook(hookId: string): boolean;
export declare function createSignedTextTrailerHook(): TextMarkingHook;
/**
 * True when a text hook changed `marked`.
 * The signed-text trailer counts only when the trailer can be read back.
 * That trailer is recorded as `evidenceTrailerAttached`, not as `markingApplied`.
 * A watermark hook counts only when the text changed.
 */
export declare function textMarkWasApplied(hookId: string, original: string, marked: string): boolean;
/**
 * True when a media hook embedded a manifest and the bytes changed.
 * `manifestEmbedded: false` (unsupported type, or the hook declined) is not a mark.
 */
export declare function mediaMarkWasApplied(original: Uint8Array, result: MediaMarkingResult): boolean;
export declare function readSignedTextTrailer(marked: string): ProvenanceRecord | null;
