import {
  BADGE_SCRIPT_SRC,
  C2PA_PAGE_URL,
  CONCIERGE_PRICE,
  CONCIERGE_SIGNUP_URL,
  CONSOLE_ORIGIN,
  conciergeSignupUrlFor,
  PRICE_NOTE,
  PRO_PRICE,
  PRO_SIGNUP_URL,
  proSignupUrlFor,
} from "../links.js";
import { MCP_USER_AGENT } from "../version.js";
import { euLanguage, inferLocaleFromDomain } from "./badge-copy.js";
import { isPublicIpLiteral, ScanTargetRejected, type ScanRejectionCode } from "./scan-live-url.js";

/**
 * spurvik_check_image_c2pa_url: the stdio twin of the hosted MCP tool #9 on console.spurvik.com/api/mcp.
 * A C2PA JUMBF manifest & CDN-strip checker. It reads; it never signs or adds a manifest.
 * The console fetches the image through its SSRF gate and reads the manifest in memory.
 */

export const C2PA_CHECK_PATH = "/api/v1/provenance/public-check-url";
/** Upstream check on the hosted console. The origin is fixed; only the JSON `url` value varies. */
export const C2PA_CHECK_ENDPOINT = `${CONSOLE_ORIGIN}${C2PA_CHECK_PATH}`;
/** The console allows 8 s for the image fetch, then reads the manifest; 15 s covers both. */
export const C2PA_CHECK_TIMEOUT_MS = 15_000;
export const C2PA_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const C2PA_MAX_IMAGE_LABEL = "4 MB";
const MAX_URL_CHARS = 2048;
const MAX_CLAIM_GENERATOR_CHARS = 100;
const MAX_VALIDATION_CODES = 20;
const MAX_FILE_NAME_CHARS = 80;

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/;
const BLOCKED_SUFFIXES = ["localhost", "local", "internal", "localdomain", "lan", "home.arpa", "intranet", "corp"];

/** Same calm texts as the console (`invalidUrlMessage`), so both MCP servers refuse with the same words. */
const ENTER_IMAGE_URL = "Enter the full URL of a PNG, JPEG or WebP image, for example https://example.com/hero.png.";
const HTTPS_ONLY = "Only https image URLs can be checked.";
const NO_CREDENTIALS = "Remove the user name and password from the URL.";
const PORT_443_ONLY = "Only the default https port (443) is allowed.";
const BLOCKED =
  "That host is not a public address. localhost, .local, .internal, private or reserved IPs are refused. Nothing was sent.";

/** JSON Schema of the tool input, the same shape server.ts registers with zod. */
export const CHECK_IMAGE_C2PA_URL_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    url: {
      type: "string",
      minLength: 1,
      maxLength: MAX_URL_CHARS,
      description: `Public https URL of a PNG, JPEG or WebP image up to ${C2PA_MAX_IMAGE_LABEL}, for example https://example.com/hero.png.`,
    },
  },
  required: ["url"],
  additionalProperties: false,
} as const;

export interface ImageTarget {
  /** https URL sent to the console, without the fragment. */
  url: string;
  /** Lower-case host without a trailing dot (an IPv6 literal has no brackets). */
  host: string;
}

export const C2PA_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type C2paMediaType = (typeof C2PA_MEDIA_TYPES)[number];

/** Console trust-list results. Unknown future codes pass through as short snake_case codes. */
export const TRUST_ANCHOR_TEXT: Readonly<Record<string, string>> = {
  not_on_trust_list: "Signer certificate is not on the C2PA trust list",
  no_failure_reported: "No trust-list failure reported",
  not_checked: "Not checked (no manifest)",
};

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
  imageProxy: { detected: boolean; name: string | null; fix: string | null };
  /** Why the manifest is missing or broken, or that it survived the optimizer. Null for a clean pass with no optimizer. */
  diagnosis: string | null;
  disclosure: { locale: string; language: string; react: string; script: string };
  links: { c2pa: string; pro: string; concierge: string };
  prices: { pro: string; concierge: string };
  note: string;
}

/**
 * `invalid_url` / `blocked_target` (refused here, nothing sent), `timeout`, `service_unreachable`,
 * `upstream_invalid_response`, or the console's own code (`image_too_large`, `unsupported_media`,
 * `upstream_status`, `upstream_timeout`, `unreachable`, `rate_limited`, ...).
 */
export type CheckImageC2paErrorCode = ScanRejectionCode | (string & {});

export type CheckImageC2paOutcome =
  | { ok: true; result: CheckImageC2paResult }
  | { ok: false; error: CheckImageC2paErrorCode; message: string };

export interface CheckImageC2paDeps {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  /** Console origin. Defaults to https://console.spurvik.com; must be an https origin. Not reachable from tool input. */
  baseUrl?: string;
}

function normalizeHost(value: string): string {
  let host = value.trim().toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  return host;
}

/**
 * Client-side gate, run before any network call: an absolute https URL on port 443 with no credentials,
 * on a public DNS name or a public IP literal. localhost, .local, .internal (and the other internal
 * suffixes) and private, loopback, link-local, CGNAT, reserved or multicast literals are refused.
 * No DNS lookup here: the console resolves, pins and re-checks every redirect behind its own SSRF gate.
 */
export function normalizeImageUrl(raw: unknown): ImageTarget {
  if (typeof raw !== "string") throw new ScanTargetRejected("invalid_url", ENTER_IMAGE_URL);
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_CHARS || /[\u0000-\u001f\u007f-\u009f\s<>"'`\\]/.test(trimmed)) {
    throw new ScanTargetRejected("invalid_url", ENTER_IMAGE_URL);
  }
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme === undefined) {
    // `data:`, `javascript:`, `file:` and the like are not https; a bare `example.com/x.png` is just incomplete.
    throw new ScanTargetRejected("invalid_url", /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed) ? HTTPS_ONLY : ENTER_IMAGE_URL);
  }
  if (scheme !== "https") throw new ScanTargetRejected("invalid_url", HTTPS_ONLY);
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ScanTargetRejected("invalid_url", ENTER_IMAGE_URL);
  }
  if (url.protocol !== "https:") throw new ScanTargetRejected("invalid_url", HTTPS_ONLY);
  if (url.username || url.password) throw new ScanTargetRejected("invalid_url", NO_CREDENTIALS);
  const host = normalizeHost(url.hostname);
  if (!host) throw new ScanTargetRejected("invalid_url", ENTER_IMAGE_URL);
  const ipPublic = isPublicIpLiteral(host);
  if (ipPublic === false) throw new ScanTargetRejected("blocked_target", BLOCKED);
  if (ipPublic === null) {
    if (BLOCKED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
      throw new ScanTargetRejected("blocked_target", BLOCKED);
    }
    if (!HOSTNAME_RE.test(host)) {
      if (!host.includes(".")) throw new ScanTargetRejected("blocked_target", BLOCKED);
      throw new ScanTargetRejected("invalid_url", ENTER_IMAGE_URL);
    }
  }
  // WHATWG URL drops :443 for https, so any port left is not 443.
  if (url.port !== "") throw new ScanTargetRejected("invalid_url", PORT_443_ONLY);
  url.hash = "";
  if (!host.includes(":")) url.hostname = host;
  return { url: url.toString(), host };
}

type ImageProxy = { name: string; fix: string };

const REENCODE_FIX =
  "Re-check the untransformed original URL. If it also has no manifest, the CDN strips it on delivery: serve the signed file from your own origin.";

/** Optimizers that re-encode on the fly and drop the C2PA JUMBF boxes. Same rules as the hosted tool. */
export function detectImageProxy(rawUrl: string): ImageProxy | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.pathname.startsWith("/_next/image")) {
    return {
      name: "Next.js image optimizer (/_next/image)",
      fix: "Set `unoptimized` on that next/image <Image> (or `images.unoptimized` in next.config) so the original signed bytes are served.",
    };
  }
  if (url.pathname.includes("/cdn-cgi/image/")) return { name: "Cloudflare image resizing (/cdn-cgi/image/)", fix: REENCODE_FIX };
  if (host === "cloudinary.com" || host.endsWith(".cloudinary.com")) return { name: "Cloudinary", fix: REENCODE_FIX };
  if (host === "imgix.net" || host.endsWith(".imgix.net")) return { name: "imgix", fix: REENCODE_FIX };
  return null;
}

/** An image CDN host is not the customer's site, so it is not used as the signup appUrl. */
export function isImageCdnHost(host: string): boolean {
  return /(?:^|\.)(?:cloudinary\.com|imgix\.net)$/i.test(host);
}

/**
 * The claim generator is free text inside an attacker-controllable manifest and is read by an agent:
 * printable letters, digits and ` ._()/+:@-` only (no newlines, backticks or Markdown), single spaces, at most 100.
 */
export function safeClaimGenerator(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[^\p{L}\p{N} ._()/+:@-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CLAIM_GENERATOR_CHARS)
    .trim();
  return cleaned || null;
}

/** Validation codes are dotted identifiers (`claimSignature.mismatch`): anything else is dropped. */
export function safeValidationCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((code): code is string => typeof code === "string" && /^[A-Za-z0-9._:-]{1,80}$/.test(code))
    .slice(0, MAX_VALIDATION_CODES);
}

const EXTENSION: Record<C2paMediaType, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Display name only: `[A-Za-z0-9._-]`, no leading dot or underscore, at most 80 characters. */
export function safeFileName(value: unknown, mediaType: C2paMediaType): string {
  const safe =
    typeof value === "string"
      ? value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(0, MAX_FILE_NAME_CHARS)
      : "";
  return safe || `image.${EXTENSION[mediaType]}`;
}

/** Upstream error text: no control, bidi, zero-width, tag or Markdown-breaking characters, at most 200. */
function cleanMessage(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff\u{e0000}-\u{e007f}`<>]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

interface UpstreamReport {
  mediaType: C2paMediaType;
  byteLength: number;
  manifestFound: boolean;
  embedded: boolean;
  claimGenerator: string | null;
  signatureMatches: boolean;
  trustAnchor: string;
  validationCodes: string[];
  fileName: string;
}

/** Reads `{ data: PublicC2paReport, fileName }`. Null when the shape is wrong. */
function readUpstreamReport(body: unknown): UpstreamReport | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const data = body.data;
  const mediaType = C2PA_MEDIA_TYPES.find((type) => type === data.mediaType);
  if (!mediaType) return null;
  const byteLength = data.byteLength;
  if (typeof byteLength !== "number" || !Number.isInteger(byteLength) || byteLength < 0 || byteLength > C2PA_MAX_IMAGE_BYTES) {
    return null;
  }
  if (typeof data.manifestFound !== "boolean") return null;
  const manifestFound = data.manifestFound;
  const trustAnchor =
    typeof data.trustAnchor === "string" && /^[a-z_]{1,40}$/.test(data.trustAnchor)
      ? data.trustAnchor
      : manifestFound
        ? "no_failure_reported"
        : "not_checked";
  return {
    mediaType,
    byteLength,
    manifestFound,
    embedded: manifestFound && data.embedded === true,
    claimGenerator: manifestFound ? safeClaimGenerator(data.claimGenerator) : null,
    // No manifest means nothing was signed, so nothing can match.
    signatureMatches: manifestFound && data.signatureMatches === true,
    trustAnchor,
    validationCodes: safeValidationCodes(data.validationCodes),
    fileName: safeFileName(body.fileName, mediaType),
  };
}

/** Visible Art. 50 notice for generated images: the same React snippet the hosted tool returns. */
export function generatedNoticeReactSnippet(locale: string): string {
  return [
    'import { AIDisclosureLabel } from "spurvik/react";',
    "",
    "<AIDisclosureLabel",
    '  notice="generated"',
    `  locale="${euLanguage(locale).code}"`,
    '  presentation="block"',
    "/>",
  ].join("\n");
}

/** badge.js tag for generated content: the same tag the hosted tool returns. */
export function generatedNoticeScript(locale: string): string {
  return `<script src="${BADGE_SCRIPT_SRC}" data-notice="generated" data-locale="${euLanguage(locale).code}" data-theme="auto" data-attribution="true" defer></script>`;
}

function diagnose(report: UpstreamReport, proxy: ImageProxy | null): string | null {
  if (!report.manifestFound) {
    return proxy
      ? `This URL goes through ${proxy.name}. Image optimizers decode and re-encode the image, which drops the C2PA JUMBF boxes, so a signed original arrives unsigned. ${proxy.fix}`
      : `These bytes carry no C2PA manifest. If the original file was signed, a CMS, CDN or upload step re-encoded it on the way. Upload the original file at ${C2PA_PAGE_URL} and compare.`;
  }
  if (!report.signatureMatches) {
    return `A C2PA manifest is present, but its signature does not match: the bytes or the claim changed after signing.${
      proxy ? ` This URL goes through ${proxy.name}, which re-encodes images. ${proxy.fix}` : ` Upload the original file at ${C2PA_PAGE_URL} and compare.`
    }`;
  }
  return proxy ? `The manifest survived ${proxy.name}. Re-check after any change to its settings.` : null;
}

function buildResult(target: ImageTarget, report: UpstreamReport): CheckImageC2paResult {
  const proxy = detectImageProxy(target.url);
  const siteHost = isImageCdnHost(target.host) ? null : target.host;
  const locale = inferLocaleFromDomain(siteHost ?? "");
  const status: C2paStatus = !report.manifestFound ? "no_manifest" : report.signatureMatches ? "manifest_valid" : "signature_mismatch";
  return {
    tool: "spurvik_check_image_c2pa_url",
    status,
    host: target.host,
    fileName: report.fileName,
    mediaType: report.mediaType,
    byteLength: report.byteLength,
    c2pa: {
      manifestFound: report.manifestFound,
      embedded: report.embedded,
      claimGenerator: report.claimGenerator,
      signatureMatches: report.signatureMatches,
      trustAnchor: report.trustAnchor,
      trustAnchorText: TRUST_ANCHOR_TEXT[report.trustAnchor] ?? report.trustAnchor,
      validationCodes: report.validationCodes,
    },
    imageProxy: { detected: proxy !== null, name: proxy?.name ?? null, fix: proxy?.fix ?? null },
    diagnosis: diagnose(report, proxy),
    disclosure: {
      locale,
      language: euLanguage(locale).label,
      react: generatedNoticeReactSnippet(locale),
      script: generatedNoticeScript(locale),
    },
    links: {
      c2pa: C2PA_PAGE_URL,
      pro: siteHost ? proSignupUrlFor(siteHost) : PRO_SIGNUP_URL,
      concierge: siteHost ? conciergeSignupUrlFor(siteHost) : CONCIERGE_SIGNUP_URL,
    },
    prices: { pro: PRO_PRICE, concierge: `${CONCIERGE_PRICE}, incl. 1 year of Pro` },
    note: `Read-only C2PA check: Spurvik did not sign or change the image, and the URL and bytes were not stored. claimGenerator is unverified text from the manifest. Not legal advice. ${PRICE_NOTE}`,
  };
}

function endpointFor(baseUrl: string | undefined): string | null {
  if (baseUrl === undefined) return C2PA_CHECK_ENDPOINT;
  try {
    const origin = new URL(baseUrl);
    if (origin.protocol !== "https:" || origin.username || origin.password) return null;
    return `${origin.origin}${C2PA_CHECK_PATH}`;
  } catch {
    return null;
  }
}

const FALLBACK_HINT = `Upload the image at ${C2PA_PAGE_URL} instead.`;

/**
 * C2PA JUMBF manifest & CDN-strip check of one public https image URL through the hosted console.
 * The URL is checked here first; a refused URL never leaves the machine. Never throws: network trouble,
 * a refusal or an unreadable answer returns `{ ok: false, error, message }`. Nothing is logged.
 */
export async function checkImageC2paUrl(rawUrl: unknown, deps: CheckImageC2paDeps = {}): Promise<CheckImageC2paOutcome> {
  let target: ImageTarget;
  try {
    target = normalizeImageUrl(rawUrl);
  } catch (error) {
    if (error instanceof ScanTargetRejected) return { ok: false, error: error.code, message: error.message };
    return { ok: false, error: "invalid_url", message: ENTER_IMAGE_URL };
  }
  const endpoint = endpointFor(deps.baseUrl);
  if (!endpoint) return { ok: false, error: "invalid_base_url", message: "The console base URL must be an https origin." };
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return { ok: false, error: "service_unreachable", message: `This Node.js has no fetch. ${FALLBACK_HINT}` };
  }
  const timeoutMs = deps.timeoutMs ?? C2PA_CHECK_TIMEOUT_MS;
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": MCP_USER_AGENT },
      body: JSON.stringify({ url: target.url }),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return name === "TimeoutError" || name === "AbortError"
      ? { ok: false, error: "timeout", message: `console.spurvik.com did not answer within ${Math.round(timeoutMs / 1000)} s. Nothing was checked. ${FALLBACK_HINT}` }
      : { ok: false, error: "service_unreachable", message: `console.spurvik.com could not be reached. Nothing was checked. ${FALLBACK_HINT}` };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.status !== 200) {
    const upstream = isRecord(body) && isRecord(body.error) ? body.error : {};
    const code = typeof upstream.code === "string" && /^[a-z_]{1,40}$/.test(upstream.code) ? upstream.code : `upstream_http_${response.status}`;
    const message = cleanMessage(upstream.message) || `The check service answered HTTP ${response.status}.`;
    return { ok: false, error: code, message: `${message} ${FALLBACK_HINT}` };
  }
  const report = readUpstreamReport(body);
  if (!report) {
    return { ok: false, error: "upstream_invalid_response", message: `The check service sent an answer this server cannot read. ${FALLBACK_HINT}` };
  }
  return { ok: true, result: buildResult(target, report) };
}
