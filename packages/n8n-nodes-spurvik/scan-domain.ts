/**
 * Zero-key "Scan Live Domain" operation.
 *
 * Mirrors `packages/mcp/src/tools/scan-live-url.ts`: the hostname is checked locally before anything
 * leaves the machine, the console's public sandbox scan is called without credentials, every upstream
 * value is reduced to a known type, and any network or upstream trouble returns an offline result
 * instead of throwing. Nothing is logged: the input, the response and any error stay in memory.
 */

export const SPURVIK_CONSOLE_ORIGIN = "https://console.spurvik.com";
export const SPURVIK_BADGE_SCRIPT_SRC = "https://spurvik.com/badge.js";
export const SPURVIK_AGENCY_CALCULATOR_URL = "https://spurvik.com/eu-ai-act-for-agencies";
export const SPURVIK_SCAN_PATH = "/api/v1/sandbox/scan";
export const SPURVIK_SCAN_TIMEOUT_MS = 8000;

const MAX_INPUT_CHARS = 2048;
const MAX_HOST_CHARS = 253;
const MAX_LIST_ITEMS = 20;
const MAX_ITEM_CHARS = 120;
const MAX_BADGE_SYSTEM_CHARS = 64;

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const BLOCKED_SUFFIXES = ["localhost", "local", "internal", "lan", "home.arpa", "localdomain", "intranet", "corp"];

const INVALID = "Scan Live Domain needs a public domain or http(s) URL, for example stepnetwork.dk.";
const BLOCKED =
  "Scan Live Domain only scans public hostnames. localhost, IP addresses, internal names (.local, .internal, .lan, .home.arpa) and single-label hosts are refused.";
const SCHEME = "Scan Live Domain only accepts a bare domain or an http(s) URL.";
const USERINFO = "Scan Live Domain does not accept a user name or password in the URL.";
const PORT = "Scan Live Domain only scans the default http(s) port. Remove the :port from the URL.";

/** ccTLD to badge.js locale, the same table as the MCP server's `badge-copy.ts`. Anything else is English. */
const CCTLD_LOCALES: Readonly<Record<string, string>> = {
  dk: "da",
  de: "de",
  at: "de",
  se: "sv",
  nl: "nl",
  fr: "fr",
  be: "fr",
  es: "es",
  it: "it",
  pl: "pl",
  pt: "pt",
  fi: "fi",
  gr: "el",
  cz: "cs",
  ro: "ro",
  hu: "hu",
  bg: "bg",
  hr: "hr",
  sk: "sk",
  si: "sl",
  lt: "lt",
  lv: "lv",
  ee: "et",
};

export interface SpurvikScanMarkers {
  art50_1_disclosure: boolean;
  art50_2_provenance: boolean;
  art50_4_synthetic: boolean;
  art12_telemetry: boolean;
}

export interface SpurvikScanUpgradeUrls {
  proWhiteLabelEur19: string;
  teamAgencyEur79: string;
  doneForYou24hEur199: string;
}

export interface SpurvikScanDomainOutput {
  /** The validated hostname (lower case, no scheme, path, port or trailing dot). */
  domain: string;
  reachable: boolean;
  detectedWidgets: string[];
  detectedSdks: string[];
  art50NoticeDetected: boolean;
  badgeSnippet: string;
  reportUrl: string;
  sandboxUrl: string;
  agencyCalculatorUrl: string;
  upgradeUrls: SpurvikScanUpgradeUrls;
  /** `offline` when the console could not be reached or did not answer with a scan. */
  scanStatus: "measured" | "not_measured" | "unreachable" | "offline";
  /** Short upstream reason (for example `no_ai_surface`) or an offline code (for example `timeout`). */
  reason: string | null;
  markers: SpurvikScanMarkers | null;
}

export interface SpurvikScanDomainInput {
  domainOrUrl: unknown;
  /** Console base URL. Empty means https://console.spurvik.com. */
  consoleBaseUrl?: unknown;
}

export interface SpurvikScanDomainOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function isBlockedSuffix(host: string): boolean {
  return BLOCKED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/**
 * Returns the lower-case public hostname from a bare domain or an http(s) URL.
 * Throws for anything else. No DNS lookup is made: the console resolves and pins the address behind
 * its own SSRF gate. This check keeps localhost, IP literals and internal names from leaving n8n.
 * Error messages never repeat the input.
 */
export function normalizeScanDomain(raw: unknown): string {
  if (typeof raw !== "string") throw new Error(INVALID);
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_INPUT_CHARS || /[\u0000-\u001f\u007f\s<>"'`\\]/.test(trimmed)) {
    throw new Error(INVALID);
  }
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme !== undefined && scheme !== "http" && scheme !== "https") throw new Error(SCHEME);
  if (scheme === undefined && /^[^/?#]*@/.test(trimmed)) throw new Error(USERINFO);
  if (scheme === undefined && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed)) throw new Error(SCHEME);

  let url: URL;
  try {
    url = new URL(scheme === undefined ? `https://${trimmed.replace(/^\/\//, "")}` : trimmed);
  } catch {
    throw new Error(INVALID);
  }
  if (url.username || url.password) throw new Error(USERINFO);

  let host = url.hostname.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (!host) throw new Error(INVALID);
  // WHATWG URL rewrites decimal, hex and octal IPv4 forms to dotted decimal and keeps IPv6 in brackets.
  if (host.startsWith("[") || host.includes(":")) throw new Error(BLOCKED);
  const labels = host.split(".");
  const tld = labels[labels.length - 1] ?? "";
  if (/^[0-9.]+$/.test(host) || /^\d+$/.test(tld) || /^0x/i.test(tld)) throw new Error(BLOCKED);
  if (isBlockedSuffix(host)) throw new Error(BLOCKED);
  if (labels.length < 2) throw new Error(BLOCKED);
  if (host.length > MAX_HOST_CHARS || !labels.every((label) => LABEL_RE.test(label))) throw new Error(INVALID);
  // WHATWG URL drops the scheme's default port (80 for http, 443 for https), so any port left is non-default.
  if (url.port !== "") throw new Error(PORT);
  return host;
}

/** `https://…` console base without a trailing slash. `http://` only for localhost testing. */
export function resolveScanBaseUrl(raw: unknown): string {
  const text = (typeof raw === "string" ? raw.trim() : "") || SPURVIK_CONSOLE_ORIGIN;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error("Spurvik consoleBaseUrl must be a valid URL.");
  }
  const isLocal =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) {
    throw new Error("Spurvik consoleBaseUrl must use https:// (or http://localhost for local testing).");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Spurvik consoleBaseUrl must not contain a user name, password, query or fragment.");
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

/** One-line badge.js tag, the same shape the MCP server's scan tool returns (dark, bottom-right, attribution on). */
export function badgeSnippetForDomain(host: string): string {
  const tld = host.slice(host.lastIndexOf(".") + 1);
  const locale = Object.prototype.hasOwnProperty.call(CCTLD_LOCALES, tld) ? CCTLD_LOCALES[tld] : "en";
  const systemName = host.replace(/[^a-z0-9.-]/g, "").slice(0, MAX_BADGE_SYSTEM_CHARS) || "Support Assistant";
  return `<script src="${SPURVIK_BADGE_SCRIPT_SRC}" data-system="${systemName}" data-locale="${locale}" data-theme="dark" data-attribution="true" defer></script>`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const clean = item.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_ITEM_CHARS);
    if (clean && !out.includes(clean)) out.push(clean);
    if (out.length >= MAX_LIST_ITEMS) break;
  }
  return out;
}

function shortCode(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9_]{1,40}$/.test(value) ? value : null;
}

function errorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
}

/** Reads `{ ok, scan }`, `{ scan }` or a bare scan object. Null when the shape is wrong. */
function readUpstreamScan(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body)) return null;
  const scan = isRecord(body.scan) ? body.scan : body;
  return typeof scan.reachable === "boolean" ? scan : null;
}

type ScanFacts = Pick<
  SpurvikScanDomainOutput,
  "reachable" | "detectedWidgets" | "detectedSdks" | "art50NoticeDetected" | "scanStatus" | "reason" | "markers"
>;

/** Output in a fixed key order. Links use the public console origin and the encoded host only. */
function buildOutput(host: string, facts: ScanFacts): SpurvikScanDomainOutput {
  const encoded = encodeURIComponent(host);
  return {
    domain: host,
    reachable: facts.reachable,
    detectedWidgets: facts.detectedWidgets,
    detectedSdks: facts.detectedSdks,
    art50NoticeDetected: facts.art50NoticeDetected,
    badgeSnippet: badgeSnippetForDomain(host),
    reportUrl: `${SPURVIK_CONSOLE_ORIGIN}/report?domain=${encoded}`,
    sandboxUrl: `${SPURVIK_CONSOLE_ORIGIN}/sandbox?scan=${encoded}`,
    agencyCalculatorUrl: SPURVIK_AGENCY_CALCULATOR_URL,
    upgradeUrls: {
      proWhiteLabelEur19: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=pro&appUrl=${encoded}`,
      teamAgencyEur79: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=team&appUrl=${encoded}`,
      doneForYou24hEur199: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=concierge&appUrl=${encoded}`,
    },
    scanStatus: facts.scanStatus,
    reason: facts.reason,
    markers: facts.markers,
  };
}

function offline(host: string, reason: string): SpurvikScanDomainOutput {
  return buildOutput(host, {
    reachable: false,
    detectedWidgets: [],
    detectedSdks: [],
    art50NoticeDetected: false,
    scanStatus: "offline",
    reason,
    markers: null,
  });
}

function fromUpstream(host: string, scan: Record<string, unknown>): SpurvikScanDomainOutput {
  const reachable = scan.reachable === true;
  // Same rule as the MCP tool: a page that answered with an error status was reached but not read.
  const pageRead = reachable && typeof scan.httpStatus !== "number";
  const markersRaw = pageRead && isRecord(scan.markers) ? scan.markers : null;
  const markers: SpurvikScanMarkers | null = markersRaw
    ? {
        art50_1_disclosure: markersRaw.art50_1_disclosure === true,
        art50_2_provenance: markersRaw.art50_2_provenance === true,
        art50_4_synthetic: markersRaw.art50_4_synthetic === true,
        art12_telemetry: markersRaw.art12_telemetry === true,
      }
    : null;
  return buildOutput(host, {
    reachable,
    detectedWidgets: pageRead ? stringList(scan.detectedWidgets) : [],
    detectedSdks: pageRead ? stringList(scan.detectedSdks) : [],
    art50NoticeDetected: markers?.art50_1_disclosure === true,
    scanStatus: !reachable ? "unreachable" : scan.measured === true ? "measured" : "not_measured",
    reason: shortCode(scan.reason),
    markers,
  });
}

/**
 * Scans one public site through the console's public sandbox scan. Reads no credential and sends no
 * Authorization header. Throws only for invalid input (domain or consoleBaseUrl). A timeout, a refused
 * connection, a redirect, a non-2xx answer, invalid JSON or `ok: false` return `scanStatus: "offline"`.
 */
export async function scanSpurvikDomain(
  input: SpurvikScanDomainInput,
  opts: SpurvikScanDomainOptions = {},
): Promise<SpurvikScanDomainOutput> {
  const host = normalizeScanDomain(input.domainOrUrl);
  const baseUrl = resolveScanBaseUrl(input.consoleBaseUrl);
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== "function") return offline(host, "fetch_unavailable");

  const signal = AbortSignal.timeout(opts.timeoutMs ?? SPURVIK_SCAN_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchFn(`${baseUrl}${SPURVIK_SCAN_PATH}?url=${encodeURIComponent(host)}`, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      signal,
    });
  } catch (error) {
    const name = errorName(error);
    return offline(host, name === "TimeoutError" || name === "AbortError" ? "timeout" : "network_error");
  }
  if (!response.ok) {
    response.body?.cancel().catch(() => undefined);
    return offline(host, `upstream_http_${response.status}`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    const name = errorName(error);
    return offline(host, name === "TimeoutError" || name === "AbortError" ? "timeout" : "upstream_invalid_json");
  }
  if (isRecord(body) && body.ok === false) return offline(host, "upstream_not_ok");
  const scan = readUpstreamScan(body);
  if (!scan) return offline(host, "upstream_invalid_shape");
  return fromUpstream(host, scan);
}
