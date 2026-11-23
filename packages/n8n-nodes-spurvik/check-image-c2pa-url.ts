/**
 * Zero-key "Check Image C2PA & CDN Strip (Art. 50(2))" operation.
 *
 * Mirrors `packages/mcp/src/tools/check-image-c2pa-url.ts` (spurvik-mcp-server@1.0.7): a C2PA JUMBF
 * manifest & CDN-strip checker. It reads; it never signs or adds a manifest. The image URL and the
 * consoleBaseUrl are checked locally before anything leaves n8n, the console's public check is called
 * without credentials, every upstream value is reduced to a known type, and network or upstream trouble
 * returns `checkStatus: "not_checked"` instead of throwing. Nothing is logged.
 */

import {
  type SpurvikScanUpgradeUrls,
  EU_LOCALE_CODES,
  N8N_NODES_SPURVIK_USER_AGENT,
  SPURVIK_BADGE_SCRIPT_SRC,
  SPURVIK_CONSOLE_ORIGIN,
  SPURVIK_SCAN_PATH,
  localeForHost,
  resolveScanBaseUrl,
} from "./scan-domain";

// Defined in scan-domain.ts (shared by scan, C2PA and console sync); re-exported here for the package index.
export { N8N_NODES_SPURVIK_USER_AGENT, N8N_NODES_SPURVIK_VERSION } from "./scan-domain";
export const SPURVIK_C2PA_CHECK_PATH = "/api/v1/provenance/public-check-url";
/** Interactive checker (upload or URL) on the public console. */
export const SPURVIK_C2PA_CHECKER_URL = `${SPURVIK_CONSOLE_ORIGIN}/c2pa`;
/** The console allows 8 s for the image fetch, then reads the manifest; 15 s covers both (same as the MCP tool). */
export const SPURVIK_C2PA_TIMEOUT_MS = 15_000;
export const SPURVIK_C2PA_MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const MAX_URL_CHARS = 2048;
const MAX_HOST_CHARS = 253;
const MAX_CLAIM_GENERATOR_CHARS = 100;
const MAX_VALIDATION_CODES = 20;
const MAX_FILE_NAME_CHARS = 80;

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const BLOCKED_SUFFIXES = ["localhost", "local", "internal", "lan", "home.arpa", "localdomain", "intranet", "corp"];

const INVALID =
  "Check Image C2PA needs the full https URL of a PNG, JPEG or WebP image, for example https://example.com/hero.png.";
const HTTPS_ONLY = "Check Image C2PA only accepts https image URLs.";
const NO_CREDENTIALS = "Check Image C2PA does not accept a user name or password in the URL.";
const PORT_443_ONLY = "Check Image C2PA only allows the default https port (443). Remove the :port from the URL.";
const BLOCKED =
  "Check Image C2PA only checks public hosts. localhost, IP addresses, internal names (.local, .internal, .lan, .home.arpa) and single-label hosts are refused. Nothing was sent.";

export const SPURVIK_C2PA_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type SpurvikC2paMediaType = (typeof SPURVIK_C2PA_MEDIA_TYPES)[number];

export interface SpurvikC2paImageTarget {
  /** https URL sent to the console, without the fragment. */
  url: string;
  /** Lower-case host without a trailing dot. */
  host: string;
}

export interface SpurvikC2paCheckInput {
  imageUrl: unknown;
  /** Console base URL. Empty means https://console.spurvik.com. */
  consoleBaseUrl?: unknown;
}

export interface SpurvikC2paCheckOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface SpurvikC2paCheckOutput {
  /** The validated https URL that was sent (fragment removed). */
  imageUrl: string;
  imageHost: string;
  /** `not_checked` when the console could not be reached or did not return a readable report. */
  checkStatus: "manifest_valid" | "signature_mismatch" | "no_manifest" | "not_checked";
  /** Short code when not checked (`timeout`, `rate_limited`, `image_too_large`, `upstream_http_503`, ...). */
  reason: string | null;
  fileName: string | null;
  mediaType: SpurvikC2paMediaType | null;
  byteLength: number | null;
  /** Null when not checked, so a failed check never reads as "no manifest". */
  manifestFound: boolean | null;
  embedded: boolean | null;
  signatureMatches: boolean | null;
  trustAnchor: string | null;
  /** Unverified text from the manifest, reduced to plain printable characters. */
  claimGenerator: string | null;
  validationCodes: string[];
  /** The URL goes through an image optimizer that re-encodes and strips C2PA (/_next/image, /cdn-cgi/image/, Cloudinary, imgix). */
  cdnRewriteSuspected: boolean;
  cdnProvider: string | null;
  diagnosis: string | null;
  /** Visible "AI-generated" badge.js notice (data-notice="generated"). */
  art50GeneratedBadgeSnippet: string;
  c2paCheckerUrl: string;
  /** Signup links; `appUrl` is the image host unless that host is a shared image CDN. */
  upgradeUrls: SpurvikScanUpgradeUrls;
  /** Present when `imageUrl` was a bare domain or webpage URL and the hero image was auto-discovered in 1 hop. */
  discoveredFromPage?: boolean;
  requestedDomain?: string;
}

function isBlockedSuffix(host: string): boolean {
  return BLOCKED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/**
 * Client-side gate, run before any network call: an absolute https URL on port 443 with no credentials,
 * on a public DNS name. Fail-closed: every IPv4 and IPv6 literal is refused (WHATWG URL rewrites decimal,
 * hex and octal IPv4 forms to dotted decimal first), as are localhost, internal suffixes and single-label
 * hosts. No DNS lookup here: the console resolves, pins and re-checks redirects behind its own SSRF gate.
 * Error messages never repeat the input.
 */
export function normalizeC2paImageUrl(raw: unknown): SpurvikC2paImageTarget {
  if (typeof raw !== "string") throw new Error(INVALID);
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_CHARS || /[\u0000-\u001f\u007f-\u009f\s<>"'`\\]/.test(trimmed)) {
    throw new Error(INVALID);
  }
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme === undefined) {
    // `data:`, `javascript:`, `file:` and the like are not https; a bare `example.com/x.png` is just incomplete.
    throw new Error(/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed) ? HTTPS_ONLY : INVALID);
  }
  if (scheme !== "https") throw new Error(HTTPS_ONLY);
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(INVALID);
  }
  if (url.protocol !== "https:") throw new Error(HTTPS_ONLY);
  if (url.username || url.password) throw new Error(NO_CREDENTIALS);

  let host = url.hostname.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (!host) throw new Error(INVALID);
  if (host.startsWith("[") || host.includes(":")) throw new Error(BLOCKED);
  const labels = host.split(".");
  const tld = labels[labels.length - 1] ?? "";
  if (/^[0-9.]+$/.test(host) || /^\d+$/.test(tld) || /^0x/i.test(tld)) throw new Error(BLOCKED);
  if (isBlockedSuffix(host)) throw new Error(BLOCKED);
  if (labels.length < 2) throw new Error(BLOCKED);
  if (host.length > MAX_HOST_CHARS || !labels.every((label) => LABEL_RE.test(label))) throw new Error(INVALID);
  // WHATWG URL drops :443 for https, so any port left is not 443.
  if (url.port !== "") throw new Error(PORT_443_ONLY);
  url.hash = "";
  url.hostname = host;
  return { url: url.toString(), host };
}

export interface SpurvikImageProxy {
  name: string;
  fix: string;
}

const REENCODE_FIX =
  "Re-check the untransformed original URL. If it also has no manifest, the CDN strips it on delivery: serve the signed file from your own origin.";

/** Optimizers that re-encode on the fly and drop the C2PA JUMBF boxes. Same rules as the MCP tool. */
export function detectImageProxy(rawUrl: string): SpurvikImageProxy | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if (path.startsWith("/_next/image")) {
    return {
      name: "Next.js image optimizer (/_next/image)",
      fix: "Set `unoptimized` on that next/image <Image> (or `images.unoptimized` in next.config) so the original signed bytes are served.",
    };
  }
  if (path.includes("/cdn-cgi/image/")) return { name: "Cloudflare image resizing (/cdn-cgi/image/)", fix: REENCODE_FIX };
  if (host === "cdn.shopify.com" || host.endsWith(".shopify.com") || path.startsWith("/cdn/shop/")) {
    return { name: "Shopify CDN (/cdn/shop/)", fix: REENCODE_FIX };
  }
  if (/^i\d\.wp\.com$/i.test(host)) return { name: "WordPress Jetpack Photon CDN (i*.wp.com)", fix: REENCODE_FIX };
  if (host.endsWith(".website-files.com") || host.endsWith(".webflow.com")) {
    return { name: "Webflow Image CDN", fix: REENCODE_FIX };
  }
  if (host === "cloudinary.com" || host.endsWith(".cloudinary.com")) return { name: "Cloudinary", fix: REENCODE_FIX };
  if (host === "imgix.net" || host.endsWith(".imgix.net")) return { name: "imgix", fix: REENCODE_FIX };
  return null;
}

/** A shared image CDN host is not the customer's site, so it is not used as the signup appUrl or for the locale. */
export function isSharedImageCdnHost(host: string): boolean {
  return /(?:^|\.)(?:cloudinary\.com|imgix\.net|shopify\.com|wp\.com|website-files\.com|(?:uploads-ssl|assets)\.webflow\.com)$/i.test(host);
}

/**
 * The claim generator is free text inside an attacker-controllable manifest: printable letters, digits and
 * ` ._()/+:@-` only (no newlines, backticks, angle brackets or Markdown), single spaces, at most 100.
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

/** Validation codes are dotted identifiers (`claimSignature.mismatch`): anything else is dropped. At most 20. */
export function safeValidationCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((code): code is string => typeof code === "string" && /^[A-Za-z0-9._:-]{1,80}$/.test(code))
    .slice(0, MAX_VALIDATION_CODES);
}

const EXTENSION: Record<SpurvikC2paMediaType, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Display name only: `[A-Za-z0-9._-]`, no leading dot or underscore, at most 80 characters. */
export function safeFileName(value: unknown, mediaType: SpurvikC2paMediaType): string {
  const safe =
    typeof value === "string"
      ? value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(0, MAX_FILE_NAME_CHARS)
      : "";
  return safe || `image.${EXTENSION[mediaType]}`;
}

/** Visible notice for AI-generated images: the same badge.js tag as the MCP tool (`data-notice="generated"`). */
export function generatedBadgeSnippet(locale: string): string {
  return `<script src="${SPURVIK_BADGE_SCRIPT_SRC}" data-notice="generated" data-locale="${locale}" data-theme="auto" data-attribution="true" defer></script>`;
}

function upgradeUrlsFor(siteHost: string | null): SpurvikScanUpgradeUrls {
  const appUrl = siteHost ? `&appUrl=${encodeURIComponent(siteHost)}` : "";
  const freeAppUrl = siteHost ? `?appUrl=${encodeURIComponent(siteHost)}` : "";
  return {
    freeApiKey10sEur0: `${SPURVIK_CONSOLE_ORIGIN}/signup${freeAppUrl}`,
    proWhiteLabelEur19: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=pro${appUrl}`,
    proAnnual2MonthsFreeEur190: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=pro&interval=annual${appUrl}`,
    teamAgencyEur79: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=team${appUrl}`,
    teamAnnual2MonthsFreeEur790: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=team&interval=annual${appUrl}`,
    doneForYou24hEur199: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=concierge${appUrl}`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function errorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
}

function isTimeout(error: unknown): boolean {
  const name = errorName(error);
  return name === "TimeoutError" || name === "AbortError";
}

interface UpstreamReport {
  mediaType: SpurvikC2paMediaType;
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
  const mediaType = SPURVIK_C2PA_MEDIA_TYPES.find((type) => type === data.mediaType);
  if (!mediaType) return null;
  const byteLength = data.byteLength;
  if (
    typeof byteLength !== "number" ||
    !Number.isInteger(byteLength) ||
    byteLength < 0 ||
    byteLength > SPURVIK_C2PA_MAX_IMAGE_BYTES
  ) {
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

function diagnose(report: UpstreamReport, proxy: SpurvikImageProxy | null): string | null {
  if (!report.manifestFound) {
    return proxy
      ? `This URL goes through ${proxy.name}. Image optimizers decode and re-encode the image, which drops the C2PA JUMBF boxes, so a signed original arrives unsigned. ${proxy.fix}`
      : `These bytes carry no C2PA manifest. If the original file was signed, a CMS, CDN or upload step re-encoded it on the way. Upload the original file at ${SPURVIK_C2PA_CHECKER_URL} and compare.`;
  }
  if (!report.signatureMatches) {
    return `A C2PA manifest is present, but its signature does not match: the bytes or the claim changed after signing.${
      proxy
        ? ` This URL goes through ${proxy.name}, which re-encodes images. ${proxy.fix}`
        : ` Upload the original file at ${SPURVIK_C2PA_CHECKER_URL} and compare.`
    }`;
  }
  return proxy ? `The manifest survived ${proxy.name}. Re-check after any change to its settings.` : null;
}

interface BuildOutputContext {
  requestedHost?: string;
  htmlLocale?: string;
  discoveredFromPage?: boolean;
}

/** Output in a fixed key order. Links use the public console origin and the encoded site/image host only. */
function buildOutput(
  target: SpurvikC2paImageTarget,
  report: UpstreamReport | null,
  reason: string | null,
  context?: BuildOutputContext,
): SpurvikC2paCheckOutput {
  const proxy = detectImageProxy(target.url);
  const effectiveHost = context?.requestedHost ?? target.host;
  const siteHost = isSharedImageCdnHost(effectiveHost) ? null : effectiveHost;
  const baseLocale = siteHost ? localeForHost(siteHost) : "en";
  const locale =
    baseLocale === "en" && context?.htmlLocale && EU_LOCALE_CODES.includes(context.htmlLocale)
      ? context.htmlLocale
      : baseLocale;
  const checkStatus: SpurvikC2paCheckOutput["checkStatus"] = !report
    ? "not_checked"
    : !report.manifestFound
      ? "no_manifest"
      : report.signatureMatches
        ? "manifest_valid"
        : "signature_mismatch";
  return {
    imageUrl: target.url,
    imageHost: target.host,
    checkStatus,
    reason: report ? null : reason,
    fileName: report?.fileName ?? null,
    mediaType: report?.mediaType ?? null,
    byteLength: report?.byteLength ?? null,
    manifestFound: report?.manifestFound ?? null,
    embedded: report?.embedded ?? null,
    signatureMatches: report?.signatureMatches ?? null,
    trustAnchor: report?.trustAnchor ?? null,
    claimGenerator: report?.claimGenerator ?? null,
    validationCodes: report?.validationCodes ?? [],
    cdnRewriteSuspected: proxy !== null,
    cdnProvider: proxy?.name ?? null,
    diagnosis: report
      ? diagnose(report, proxy)
      : `Nothing was checked. Try again later, or upload the image at ${SPURVIK_C2PA_CHECKER_URL}.`,
    art50GeneratedBadgeSnippet: generatedBadgeSnippet(locale),
    c2paCheckerUrl: SPURVIK_C2PA_CHECKER_URL,
    upgradeUrls: upgradeUrlsFor(siteHost),
    ...(context?.discoveredFromPage ? { discoveredFromPage: true, requestedDomain: effectiveHost } : {}),
  };
}

function resolveN8nC2paInput(raw: unknown): { target: SpurvikC2paImageTarget; bareDomain: boolean } {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (
      trimmed.length > 0 &&
      trimmed.length <= MAX_HOST_CHARS &&
      !trimmed.includes("/") &&
      !trimmed.includes(":") &&
      !trimmed.includes("?") &&
      !trimmed.includes("#") &&
      !trimmed.includes("@") &&
      !/[\u0000-\u001f\u007f-\u009f\s<>"'`\\]/.test(trimmed)
    ) {
      const target = normalizeC2paImageUrl(`https://${trimmed}/`);
      return { target, bareDomain: true };
    }
  }
  return { target: normalizeC2paImageUrl(raw), bareDomain: false };
}

function looksLikeImageAssetPath(rawUrl: string): boolean {
  try {
    return /\.(?:png|jpe?g|webp|gif|svg|avif|bmp|ico)$/i.test(new URL(rawUrl).pathname);
  } catch {
    return false;
  }
}

async function discoverHeroFromPage(
  pageUrl: string,
  scanEndpoint: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<{ heroTarget: SpurvikC2paImageTarget; htmlLocale?: string } | null> {
  const res = await fetchFn(`${scanEndpoint}?url=${encodeURIComponent(pageUrl)}`, {
    method: "GET",
    headers: { Accept: "application/json", "User-Agent": N8N_NODES_SPURVIK_USER_AGENT },
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status !== 200) return null;
  const body = (await res.json().catch(() => null)) as unknown;
  if (!isRecord(body)) return null;
  const scan = isRecord(body.scan) ? body.scan : body;
  if (scan.reachable !== true || typeof scan.heroImageUrl !== "string" || !scan.heroImageUrl.trim()) return null;
  const heroTarget = normalizeC2paImageUrl(scan.heroImageUrl);
  const htmlLocale =
    typeof scan.htmlLocale === "string" && EU_LOCALE_CODES.includes(scan.htmlLocale) ? scan.htmlLocale : undefined;
  return { heroTarget, htmlLocale };
}

async function postC2paCheck(
  imageUrl: string,
  endpoint: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<{ ok: true; response: Response; body: unknown; jsonFailed: boolean } | { ok: false; reason: string }> {
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": N8N_NODES_SPURVIK_USER_AGENT,
      },
      body: JSON.stringify({ url: imageUrl }),
      redirect: "error",
      signal,
    });
  } catch (error) {
    return { ok: false, reason: isTimeout(error) ? "timeout" : "network_error" };
  }
  try {
    const body: unknown = await response.json();
    return { ok: true, response, body, jsonFailed: false };
  } catch (error) {
    if (isTimeout(error)) return { ok: false, reason: "timeout" };
    return { ok: true, response, body: null, jsonFailed: true };
  }
}

/**
 * Read-only C2PA JUMBF manifest & CDN-strip check of one public https image URL (or 1-hop store domain hero image)
 * through the console's public check. Reads no credential and sends no Authorization header. Throws only for
 * invalid input (imageUrl or consoleBaseUrl), before any request. A timeout, a refused connection, a redirect,
 * a console refusal, invalid JSON or an unreadable report return `checkStatus: "not_checked"` with a short `reason`.
 * The upstream error text and body are never copied to the output.
 */
export async function checkSpurvikImageC2paUrl(
  input: SpurvikC2paCheckInput,
  opts: SpurvikC2paCheckOptions = {},
): Promise<SpurvikC2paCheckOutput> {
  const { target, bareDomain } = resolveN8nC2paInput(input.imageUrl);
  const baseUrl = resolveScanBaseUrl(input.consoleBaseUrl);
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== "function") return buildOutput(target, null, "fetch_unavailable");

  const timeoutMs = opts.timeoutMs ?? SPURVIK_C2PA_TIMEOUT_MS;
  const checkEndpoint = `${baseUrl}${SPURVIK_C2PA_CHECK_PATH}`;
  const scanEndpoint = `${baseUrl}${SPURVIK_SCAN_PATH}`;

  if (bareDomain) {
    let discovered: { heroTarget: SpurvikC2paImageTarget; htmlLocale?: string } | null = null;
    try {
      discovered = await discoverHeroFromPage(target.url, scanEndpoint, fetchFn, timeoutMs);
    } catch (error) {
      return buildOutput(target, null, isTimeout(error) ? "timeout" : "network_error", { requestedHost: target.host });
    }
    if (!discovered) {
      return buildOutput(target, null, "no_hero_image", { requestedHost: target.host });
    }
    const ctx: BuildOutputContext = {
      requestedHost: target.host,
      htmlLocale: discovered.htmlLocale,
      discoveredFromPage: true,
    };
    const checked = await postC2paCheck(discovered.heroTarget.url, checkEndpoint, fetchFn, timeoutMs);
    if (!checked.ok) return buildOutput(discovered.heroTarget, null, checked.reason, ctx);
    if (checked.jsonFailed) {
      return buildOutput(
        discovered.heroTarget,
        null,
        checked.response.status === 200 ? "upstream_invalid_json" : `upstream_http_${checked.response.status}`,
        ctx,
      );
    }
    if (checked.response.status !== 200) {
      const upstream = isRecord(checked.body) && isRecord(checked.body.error) ? checked.body.error : {};
      const code =
        typeof upstream.code === "string" && /^[a-z_]{1,40}$/.test(upstream.code)
          ? upstream.code
          : `upstream_http_${checked.response.status}`;
      return buildOutput(discovered.heroTarget, null, code, ctx);
    }
    const report = readUpstreamReport(checked.body);
    if (!report) return buildOutput(discovered.heroTarget, null, "upstream_invalid_shape", ctx);
    return buildOutput(discovered.heroTarget, report, null, ctx);
  }

  const initial = await postC2paCheck(target.url, checkEndpoint, fetchFn, timeoutMs);
  if (!initial.ok) return buildOutput(target, null, initial.reason);
  if (initial.response.status === 415 && !looksLikeImageAssetPath(target.url)) {
    try {
      const discovered = await discoverHeroFromPage(target.url, scanEndpoint, fetchFn, timeoutMs);
      if (discovered) {
        const heroChecked = await postC2paCheck(discovered.heroTarget.url, checkEndpoint, fetchFn, timeoutMs);
        if (heroChecked.ok && !heroChecked.jsonFailed && heroChecked.response.status === 200) {
          const heroReport = readUpstreamReport(heroChecked.body);
          if (heroReport) {
            return buildOutput(discovered.heroTarget, heroReport, null, {
              requestedHost: target.host,
              htmlLocale: discovered.htmlLocale,
              discoveredFromPage: true,
            });
          }
        }
      }
    } catch {
      // Keep original 415 refusal when page scan or hero check fails.
    }
  }
  if (initial.jsonFailed) {
    return buildOutput(
      target,
      null,
      initial.response.status === 200 ? "upstream_invalid_json" : `upstream_http_${initial.response.status}`,
    );
  }
  if (initial.response.status !== 200) {
    const upstream = isRecord(initial.body) && isRecord(initial.body.error) ? initial.body.error : {};
    const code =
      typeof upstream.code === "string" && /^[a-z_]{1,40}$/.test(upstream.code)
        ? upstream.code
        : `upstream_http_${initial.response.status}`;
    return buildOutput(target, null, code);
  }
  const report = readUpstreamReport(initial.body);
  if (!report) return buildOutput(target, null, "upstream_invalid_shape");
  return buildOutput(target, report, null);
}
