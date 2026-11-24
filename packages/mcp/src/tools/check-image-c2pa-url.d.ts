import { type ScanRejectionCode } from "./scan-live-url.js";
/**
 * spurvik_check_image_c2pa_url: the stdio twin of the hosted MCP tool #9 on console.spurvik.com/api/mcp.
 * A C2PA JUMBF manifest & CDN-strip checker. It reads; it never signs or adds a manifest.
 * The console fetches the image through its SSRF gate and reads the manifest in memory.
 */
export declare const C2PA_CHECK_PATH = "/api/v1/provenance/public-check-url";
export declare const C2PA_SCAN_PATH = "/api/v1/sandbox/scan";
/** Upstream check on the hosted console. The origin is fixed; only the JSON `url` value varies. */
export declare const C2PA_CHECK_ENDPOINT = "https://console.spurvik.com/api/v1/provenance/public-check-url";
/** The console allows 8 s for the image fetch, then reads the manifest; 15 s covers both. */
export declare const C2PA_CHECK_TIMEOUT_MS = 15000;
export declare const C2PA_MAX_IMAGE_BYTES: number;
export declare const C2PA_MAX_IMAGE_LABEL = "4 MB";
/** JSON Schema of the tool input, the same shape server.ts registers with zod. */
export declare const CHECK_IMAGE_C2PA_URL_INPUT_JSON_SCHEMA: {
    readonly type: "object";
    readonly properties: {
        readonly url: {
            readonly type: "string";
            readonly minLength: 1;
            readonly maxLength: 2048;
            readonly description: "Public https URL of a PNG, JPEG or WebP image up to 4 MB (e.g. https://example.com/hero.png), or a bare public domain / https store page URL (e.g. charlie-paris.com) to auto-discover its hero image.";
        };
    };
    readonly required: readonly ["url"];
    readonly additionalProperties: false;
};
export interface ImageTarget {
    /** https URL sent to the console, without the fragment. */
    url: string;
    /** Lower-case host without a trailing dot (an IPv6 literal has no brackets). */
    host: string;
}
export declare const C2PA_MEDIA_TYPES: readonly ["image/png", "image/jpeg", "image/webp"];
export type C2paMediaType = (typeof C2PA_MEDIA_TYPES)[number];
/** Console trust-list results. Unknown future codes pass through as short snake_case codes. */
export declare const TRUST_ANCHOR_TEXT: Readonly<Record<string, string>>;
export type C2paStatus = "manifest_valid" | "signature_mismatch" | "no_manifest";
export interface CheckImageC2paResult {
    tool: "spurvik_check_image_c2pa_url";
    /** The headline: a manifest with a matching signature, a manifest that no longer matches, or none. */
    status: C2paStatus;
    host: string;
    fileName: string;
    mediaType: C2paMediaType;
    byteLength: number;
    c2pa: {
        manifestFound: boolean;
        embedded: boolean;
        /** From the manifest: unverified text, reduced to plain printable characters. */
        claimGenerator: string | null;
        signatureMatches: boolean;
        trustAnchor: string;
        trustAnchorText: string;
        validationCodes: string[];
    };
    imageProxy: {
        detected: boolean;
        name: string | null;
        fix: string | null;
    };
    /** Why the manifest is missing or broken, or that it survived the optimizer. Null for a clean pass with no optimizer. */
    diagnosis: string | null;
    disclosure: {
        locale: string;
        language: string;
        react: string;
        script: string;
    };
    links: {
        c2pa: string;
        pro: string;
        concierge: string;
    };
    prices: {
        pro: string;
        concierge: string;
    };
    note: string;
    /** Present when `url` was a bare domain or webpage and the hero image was auto-discovered in 1 hop. */
    imageUrl?: string;
    discoveredFromPage?: boolean;
}
/**
 * `invalid_url` / `blocked_target` (refused here, nothing sent), `timeout`, `service_unreachable`,
 * `upstream_invalid_response`, or the console's own code (`image_too_large`, `unsupported_media`,
 * `upstream_status`, `upstream_timeout`, `unreachable`, `rate_limited`, ...).
 */
export type CheckImageC2paErrorCode = ScanRejectionCode | (string & {});
export type CheckImageC2paOutcome = {
    ok: true;
    result: CheckImageC2paResult;
} | {
    ok: false;
    error: CheckImageC2paErrorCode;
    message: string;
};
export interface CheckImageC2paDeps {
    fetch?: typeof globalThis.fetch;
    timeoutMs?: number;
    /** Console origin. Defaults to https://console.spurvik.com; must be an https origin. Not reachable from tool input. */
    baseUrl?: string;
}
/**
 * Client-side gate, run before any network call: an absolute https URL on port 443 with no credentials,
 * on a public DNS name or a public IP literal. localhost, .local, .internal (and the other internal
 * suffixes) and private, loopback, link-local, CGNAT, reserved or multicast literals are refused.
 * No DNS lookup here: the console resolves, pins and re-checks every redirect behind its own SSRF gate.
 */
export declare function normalizeImageUrl(raw: unknown): ImageTarget;
type ImageProxy = {
    name: string;
    fix: string;
};
/** Optimizers that re-encode on the fly and drop the C2PA JUMBF boxes. Same rules as the hosted tool. */
export declare function detectImageProxy(rawUrl: string): ImageProxy | null;
/** An image CDN host is not the customer's site, so it is not used as the signup appUrl. */
export declare function isImageCdnHost(host: string): boolean;
/**
 * The claim generator is free text inside an attacker-controllable manifest and is read by an agent:
 * printable letters, digits and ` ._()/+:@-` only (no newlines, backticks or Markdown), single spaces, at most 100.
 */
export declare function safeClaimGenerator(value: unknown): string | null;
/** Validation codes are dotted identifiers (`claimSignature.mismatch`): anything else is dropped. */
export declare function safeValidationCodes(value: unknown): string[];
/** Display name only: `[A-Za-z0-9._-]`, no leading dot or underscore, at most 80 characters. */
export declare function safeFileName(value: unknown, mediaType: C2paMediaType): string;
/** Visible Art. 50 notice for generated images: the same React snippet the hosted tool returns. */
export declare function generatedNoticeReactSnippet(locale: string): string;
/** badge.js tag for generated content: the same tag the hosted tool returns. */
export declare function generatedNoticeScript(locale: string): string;
/**
 * Resolves either a bare public domain (`charlie-paris.com`) for 1-hop hero-image discovery,
 * or a full `https://` URL checked via `normalizeImageUrl`.
 */
export declare function resolveC2paInput(raw: unknown): {
    target: ImageTarget;
    bareDomain: boolean;
};
/**
 * C2PA JUMBF manifest & CDN-strip check of one public https image URL (or 1-hop store domain hero image)
 * through the hosted console. The URL is checked here first; a refused URL never leaves the machine.
 * Never throws: network trouble, a refusal or an unreadable answer returns `{ ok: false, error, message }`.
 */
export declare function checkImageC2paUrl(rawUrl: unknown, deps?: CheckImageC2paDeps): Promise<CheckImageC2paOutcome>;
export {};
