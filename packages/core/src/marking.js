export const SIGNED_TEXT_TRAILER_ID = "signed-text-trailer";
/** A text hook with this id is a watermark. The signed trailer is not. */
export function isWatermarkHook(hookId) {
    return hookId === "watermark" || hookId.startsWith("watermark:");
}
/** New marks use this literal. The parser also accepts the previous spelling. */
const TRAILER_PREFIX = "\n\n[[[spurvik-provenance-record:";
const LEGACY_TRAILER_PREFIX = "\n\n[[[aegis-provenance-record:";
const TRAILER_SUFFIX = "]]]";
export function createSignedTextTrailerHook() {
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
export function textMarkWasApplied(hookId, original, marked) {
    if (marked === original)
        return false;
    if (hookId === SIGNED_TEXT_TRAILER_ID)
        return readSignedTextTrailer(marked) !== null;
    return true;
}
/**
 * True when a media hook embedded a manifest and the bytes changed.
 * `manifestEmbedded: false` (unsupported type, or the hook declined) is not a mark.
 */
export function mediaMarkWasApplied(original, result) {
    if (!result.manifestEmbedded)
        return false;
    if (original.byteLength !== result.bytes.byteLength)
        return true;
    for (let index = 0; index < original.byteLength; index += 1) {
        if (original[index] !== result.bytes[index])
            return true;
    }
    return false;
}
export function readSignedTextTrailer(marked) {
    return readTrailer(marked, TRAILER_PREFIX) ?? readTrailer(marked, LEGACY_TRAILER_PREFIX);
}
function readTrailer(marked, prefix) {
    const start = marked.lastIndexOf(prefix);
    if (start < 0)
        return null;
    const end = marked.lastIndexOf(TRAILER_SUFFIX);
    if (end < start)
        return null;
    const encoded = marked.slice(start + prefix.length, end);
    try {
        const parsed = JSON.parse(base64UrlDecode(encoded));
        if (!parsed || typeof parsed !== "object")
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function base64UrlEncode(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function base64UrlDecode(value) {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}
