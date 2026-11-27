/**
 * Zero-key "Scan Live Domain" operation.
 *
 * Mirrors `packages/mcp/src/tools/scan-live-url.ts`: the hostname is checked locally before anything
 * leaves the machine, the console's public sandbox scan is called without credentials, every upstream
 * value is reduced to a known type, and any network or upstream trouble returns an offline result
 * instead of throwing. Nothing is logged: the input, the response and any error stay in memory.
 */

import { detectImageProxy, normalizeC2paImageUrl } from "./check-image-c2pa-url";

/** Package version, sent in the User-Agent. A test pins it to package.json. */
export const N8N_NODES_SPURVIK_VERSION = "1.0.15";
/**
 * First-party client User-Agent, sent on every console request (scan, C2PA check, console sync).
 * Recognised by the console's `FIRST_PARTY_CLIENT_USER_AGENT_RE`.
 */
export const N8N_NODES_SPURVIK_USER_AGENT = `n8n-nodes-spurvik/${N8N_NODES_SPURVIK_VERSION}`;

export const SPURVIK_CONSOLE_ORIGIN = "https://console.spurvik.com";
export const SPURVIK_BADGE_SCRIPT_SRC = "https://spurvik.com/badge.js";
export const SPURVIK_SHOPIFY_LIQUID_URL = "https://spurvik.com/r/spurvik-shopify-art50.liquid";
export const SPURVIK_WORDPRESS_PLUGIN_URL = "https://spurvik.com/r/spurvik-eu-ai-act-wp.zip";
export const SPURVIK_GTM_CONTAINER_URL = "https://spurvik.com/r/spurvik-gtm-art50-container.json";
export const SPURVIK_FRAMER_COMPONENT_URL = "https://spurvik.com/r/spurvik-framer-badge.tsx";
export const SPURVIK_SHADCN_REGISTRY_URL = "https://spurvik.com/r/article-50-badge.json";
export const SPURVIK_AGENCY_CALCULATOR_URL = "https://spurvik.com/eu-ai-act-for-agencies";
export const SPURVIK_PORTFOLIO_URL = `${SPURVIK_CONSOLE_ORIGIN}/portfolio`;
export const SPURVIK_STATUS_SHIELD_URL = `${SPURVIK_CONSOLE_ORIGIN}/api/v1/badge/status.svg`;
export const SPURVIK_SCAN_PATH = "/api/v1/sandbox/scan";
export const SPURVIK_SCAN_TIMEOUT_MS = 8000;
/** Same cap as the console /portfolio batch and the MCP server's batch tool. */
export const SPURVIK_BATCH_MAX_DOMAINS = 10;
export const SPURVIK_BATCH_CONCURRENCY = 4;

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
  freeApiKey10sEur0: string;
  proWhiteLabelEur19: string;
  proAnnual2MonthsFreeEur190: string;
  teamAgencyEur79: string;
  teamAnnual2MonthsFreeEur790: string;
  doneForYou24hEur199: string;
}

export type SpurvikWidgetDisclosureClass = "confirmed_ai" | "dual_use_helpdesk" | "none";

const CONFIRMED_AI_WIDGET_RE =
  /\b(?:fin|lyro|gorgias\s*ai|zendesk\s*ai|ultimate|ada|chatbase|voiceflow|botpress|customgpt|sierra|decagon|chatkit)\b/i;

export function classifyWidgetDisclosure(
  detectedWidgets: readonly string[],
  detectedSdks: readonly string[],
): SpurvikWidgetDisclosureClass {
  if (detectedSdks.length > 0 || detectedWidgets.some((w) => CONFIRMED_AI_WIDGET_RE.test(w))) {
    return "confirmed_ai";
  }
  if (detectedWidgets.length > 0) return "dual_use_helpdesk";
  return "none";
}

export interface SpurvikScanDomainOutput {
  /** The validated hostname (lower case, no scheme, path, port or trailing dot). */
  domain: string;
  reachable: boolean;
  detectedWidgets: string[];
  detectedSdks: string[];
  /**
   * H121 dual-use guardrail: `"confirmed_ai"` when a confirmed AI agent/SDK is detected;
   * `"dual_use_helpdesk"` when a generic chat widget (Intercom, Gorgias, Zendesk, Crisp, Tawk.to) is detected
   * without confirmed AI answers (human-staffed chat requires zero Art. 50(1) notice); `"none"` when empty.
   */
  widgetDisclosureClass: SpurvikWidgetDisclosureClass;
  /** Detected storefront, CMS, tag manager, or framework (`Shopify`, `WordPress`, `Google Tag Manager`, `Webflow`, `Framer`, `Next.js`), present when non-empty. */
  detectedPlatforms?: string[];
  /** 1-click zero-code CMS / storefront / Google Tag Manager installer download URLs, present when `detectedPlatforms` is non-empty. */
  platformInstallerUrls?: Record<string, string>;
  /** Present when the frontpage hero image runs through an image-optimizing CDN known to strip C2PA JUMBF manifests on re-encode (2 Dec 2026 Art. 50(2)). */
  heroImageProxy?: { name: string; fix: string; c2paCheckUrl: string };
  art50NoticeDetected: boolean;
  badgeSnippet: string;
  reportUrl: string;
  sandboxUrl: string;
  /** Multi-domain agency cockpit on the console (up to 10 domains per batch). */
  portfolioUrl: string;
  /** Live SVG status shield for this host. */
  statusShieldUrl: string;
  /** README Markdown: the status shield linked to `reportUrl`. */
  statusShieldMarkdown: string;
  /** Raw Markdown DPO & client readiness brief URL (`text/markdown`). */
  reportMarkdownUrl: string;
  /** Live 2 Dec 2026 Art. 50(2) C2PA SVG status shield URL. */
  c2paStatusShieldUrl: string;
  /** Live 460x148 Obsidian Harbor SaaS Trust Center / Notion SVG readiness card URL. */
  trustCenterCardUrl: string;
  /** Drop-in Shadow DOM interactive Trust-Center widget `<script>` tag. */
  trustWidgetScript: string;
  /** Machine-readable `/.well-known/ai-act.json` generator URL (`spurvik.ai-act-manifest.v1`). */
  aiActManifestUrl: string;
  agencyCalculatorUrl: string;
  /** Signup links with the scanned host prefilled as `appUrl`. */
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

export const EU_LOCALE_CODES: readonly string[] = [
  "en",
  "da",
  "de",
  "fr",
  "es",
  "nl",
  "sv",
  "pl",
  "it",
  "pt",
  "fi",
  "cs",
  "bg",
  "el",
  "et",
  "ga",
  "hr",
  "hu",
  "lt",
  "lv",
  "mt",
  "ro",
  "sk",
  "sl",
];

/** badge.js locale from the host's country-code TLD (`stepnetwork.dk` gives `da`). Anything else is `en`. */
export function localeForHost(host: string): string {
  const tld = host.slice(host.lastIndexOf(".") + 1);
  return Object.prototype.hasOwnProperty.call(CCTLD_LOCALES, tld) ? (CCTLD_LOCALES[tld] as string) : "en";
}

/** One-line badge.js tag, the same shape the MCP server's scan tool returns (dark, bottom-right, attribution on). */
export function badgeSnippetForDomain(host: string, htmlLocale?: unknown): string {
  const tldLocale = localeForHost(host);
  const locale =
    tldLocale === "en" && typeof htmlLocale === "string" && htmlLocale !== "en" && EU_LOCALE_CODES.includes(htmlLocale)
      ? htmlLocale
      : tldLocale;
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
> & { detectedPlatforms?: string[]; htmlLocale?: unknown; heroImageUrl?: string | null };

function sanitizeHeroImageUrl(raw: unknown): string | null {
  try {
    return normalizeC2paImageUrl(raw).url;
  } catch {
    return null;
  }
}

function wordpressCockpitUrlFor(host: string, locale: string): string {
  const slug =
    locale === "de"
      ? "/de/wordpress-elementor-webflow-ki-verordnung-plugin-artikel-50"
      : locale === "fr"
        ? "/fr/wordpress-elementor-webflow-plugin-reglement-ia-article-50"
        : locale === "nl"
          ? "/nl/wordpress-elementor-webflow-ai-verordening-plugin-artikel-50"
          : locale === "da"
            ? "/da/wordpress-elementor-webflow-eu-ai-act-plugin-artikel-50"
            : locale === "sv"
              ? "/sv/wordpress-elementor-webflow-ai-forordningen-plugin-artikel-50"
              : locale === "es"
                ? "/es/wordpress-elementor-webflow-plugin-reglamento-ia-articulo-50"
                : locale === "it"
                  ? "/it/wordpress-elementor-webflow-plugin-regolamento-ia-articolo-50"
                  : "/wordpress-shopify-webflow-eu-ai-act-badge";
  return `https://spurvik.com${slug}?domain=${encodeURIComponent(host)}`;
}

function platformInstallerUrlsFor(
  detectedPlatforms: readonly string[] | undefined,
  host: string,
  locale: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!detectedPlatforms || detectedPlatforms.length === 0) return out;
  for (const platform of detectedPlatforms) {
    if (platform === "Shopify") out.shopifyLiquid = SPURVIK_SHOPIFY_LIQUID_URL;
    else if (platform === "WordPress") out.wordpressPluginZip = SPURVIK_WORDPRESS_PLUGIN_URL;
    else if (platform === "PrestaShop") out.prestashopModuleZip = "https://spurvik.com/r/spurvik-prestashop-art50.zip";
    else if (platform === "Shopware") out.shopware6PluginZip = "https://spurvik.com/r/spurvik-shopware6-art50.zip";
    else if (platform === "Google Tag Manager") out.gtmContainerJson = SPURVIK_GTM_CONTAINER_URL;
    else if (platform === "Framer") out.framerComponentTsx = SPURVIK_FRAMER_COMPONENT_URL;
    else if (platform === "Webflow") out.webflowGuide = wordpressCockpitUrlFor(host, locale);
    else if (platform === "Next.js") out.nextjsShadcnRegistry = SPURVIK_SHADCN_REGISTRY_URL;
    else if (
      platform === "Wix" ||
      platform === "Squarespace" ||
      platform === "Magento" ||
      platform === "BigCommerce" ||
      platform === "Drupal" ||
      platform === "Ghost" ||
      platform === "HubSpot CMS"
    ) {
      out.customHtmlGuide = `${SPURVIK_CONSOLE_ORIGIN}/labels?domain=${encodeURIComponent(host)}`;
    }
  }
  return out;
}

/** Output in a fixed key order. Links use the public console origin and the encoded host only. */
function buildOutput(host: string, facts: ScanFacts): SpurvikScanDomainOutput {
  const encoded = encodeURIComponent(host);
  const reportUrl = `${SPURVIK_CONSOLE_ORIGIN}/report?domain=${encoded}`;
  const statusShieldUrl = `${SPURVIK_STATUS_SHIELD_URL}?domain=${encoded}`;
  const tldLocale = localeForHost(host);
  const effectiveLocale =
    tldLocale === "en" && typeof facts.htmlLocale === "string" && facts.htmlLocale !== "en" && EU_LOCALE_CODES.includes(facts.htmlLocale)
      ? facts.htmlLocale
      : tldLocale;
  const platformInstallerUrls = platformInstallerUrlsFor(facts.detectedPlatforms, host, effectiveLocale);
  const detectedHeroProxy = facts.heroImageUrl ? detectImageProxy(facts.heroImageUrl) : null;
  const locParam = effectiveLocale !== "en" ? `&locale=${encodeURIComponent(effectiveLocale)}` : "";
  return {
    domain: host,
    reachable: facts.reachable,
    detectedWidgets: facts.detectedWidgets,
    detectedSdks: facts.detectedSdks,
    widgetDisclosureClass: classifyWidgetDisclosure(facts.detectedWidgets, facts.detectedSdks),
    ...(facts.detectedPlatforms?.length ? { detectedPlatforms: facts.detectedPlatforms } : {}),
    ...(Object.keys(platformInstallerUrls).length > 0 ? { platformInstallerUrls } : {}),
    ...(detectedHeroProxy && facts.heroImageUrl
      ? {
          heroImageProxy: {
            name: detectedHeroProxy.name,
            fix: detectedHeroProxy.fix,
            c2paCheckUrl: `${SPURVIK_CONSOLE_ORIGIN}/c2pa?domain=${encoded}${locParam}&url=${encodeURIComponent(facts.heroImageUrl)}`,
          },
        }
      : {}),
    art50NoticeDetected: facts.art50NoticeDetected,
    badgeSnippet: badgeSnippetForDomain(host, facts.htmlLocale),
    reportUrl,
    sandboxUrl: `${SPURVIK_CONSOLE_ORIGIN}/sandbox?scan=${encoded}`,
    portfolioUrl: SPURVIK_PORTFOLIO_URL,
    statusShieldUrl,
    statusShieldMarkdown: `[![EU AI Act Art. 50](${statusShieldUrl})](${reportUrl})`,
    reportMarkdownUrl: `${SPURVIK_CONSOLE_ORIGIN}/api/v1/report/markdown?domain=${encoded}&format=raw`,
    c2paStatusShieldUrl: `${SPURVIK_CONSOLE_ORIGIN}/api/v1/c2pa/status.svg?domain=${encoded}`,
    trustCenterCardUrl: `${SPURVIK_CONSOLE_ORIGIN}/api/v1/badge/card.svg?domain=${encoded}`,
    trustWidgetScript: `<script src="https://spurvik.com/trust-widget.js" data-domain="${host}" defer></script>`,
    aiActManifestUrl: `${SPURVIK_CONSOLE_ORIGIN}/api/v1/badge/ai-act.json?domain=${encoded}`,
    agencyCalculatorUrl: SPURVIK_AGENCY_CALCULATOR_URL,
    upgradeUrls: {
      freeApiKey10sEur0: `${SPURVIK_CONSOLE_ORIGIN}/signup?appUrl=${encoded}`,
      proWhiteLabelEur19: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=pro&appUrl=${encoded}`,
      proAnnual2MonthsFreeEur190: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=pro&interval=annual&appUrl=${encoded}`,
      teamAgencyEur79: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=team&appUrl=${encoded}`,
      teamAnnual2MonthsFreeEur790: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=team&interval=annual&appUrl=${encoded}`,
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
    detectedPlatforms: pageRead ? stringList(scan.detectedPlatforms) : [],
    art50NoticeDetected: markers?.art50_1_disclosure === true,
    scanStatus: !reachable ? "unreachable" : scan.measured === true ? "measured" : "not_measured",
    reason: shortCode(scan.reason),
    markers,
    htmlLocale: pageRead ? scan.htmlLocale : undefined,
    heroImageUrl: pageRead ? sanitizeHeroImageUrl(scan.heroImageUrl) : null,
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
      headers: { accept: "application/json", "user-agent": N8N_NODES_SPURVIK_USER_AGENT },
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

export interface SpurvikBatchScanInput {
  /** Comma-, newline- or space-separated string, or an array of strings. 1 to 10 entries. */
  domainsList: unknown;
  /** Console base URL. Empty means https://console.spurvik.com. */
  consoleBaseUrl?: unknown;
}

export interface SpurvikBatchScanOutput {
  /** Distinct hosts scanned (duplicates after normalization are scanned once). */
  totalDomains: number;
  /** Reachable hosts with at least one detected widget and no Art. 50 notice detected. */
  gapsFound: number;
  /** One Scan Live Domain result per distinct host, in input order. */
  results: SpurvikScanDomainOutput[];
  /** RFC 4180 CSV table (with OWASP formula-injection guard) for Excel, Airtable, or n8n Write Binary File. */
  csv: string;
  /** Zero-key CSV export endpoint URL (`GET /api/v1/portfolio/scan?domains=...&format=csv`). */
  csvExportUrl: string;
  /** Live Google Sheets `=IMPORTDATA(...)` formula for the scanned domain batch. */
  googleSheetsFormula: string;
  portfolioUrl: string;
  /** Prefilled /portfolio?domains=... deep link opening all scanned hosts in the visual Agency Portfolio Cockpit. */
  prefilledPortfolioUrl: string;
  agencyCalculatorUrl: string;
  /** Plan signup links (no single host to prefill; each row carries its own `appUrl` links). */
  upgradeUrls: SpurvikScanUpgradeUrls;
}

const BATCH_COUNT = `Batch Scan needs 1 to ${SPURVIK_BATCH_MAX_DOMAINS} public domains, separated by commas, spaces or new lines.`;

/** Splits the list into trimmed, non-empty entries. Non-string array items stay in place so they fail validation. */
function splitDomainsList(raw: unknown): unknown[] {
  if (typeof raw === "string") return raw.split(/[\s,]+/).filter((entry) => entry.length > 0);
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => (typeof entry === "string" ? entry.trim() : entry))
      .filter((entry) => entry !== "");
  }
  throw new Error(BATCH_COUNT);
}

/**
 * Checks the whole list before anything leaves n8n: the entry count and every entry, then dedupes the
 * normalized hosts in input order. One refused entry refuses the batch. Errors name 1-based positions only and never repeat the input.
 */
export function parseBatchDomains(raw: unknown): string[] {
  const entries = splitDomainsList(raw);
  if (entries.length === 0 || entries.length > SPURVIK_BATCH_MAX_DOMAINS) throw new Error(BATCH_COUNT);
  const hosts: string[] = [];
  const refused: number[] = [];
  let firstReason = "";
  entries.forEach((entry, index) => {
    try {
      const host = normalizeScanDomain(entry);
      if (!hosts.includes(host)) hosts.push(host);
    } catch (error) {
      refused.push(index + 1);
      if (!firstReason) firstReason = error instanceof Error ? error.message : INVALID;
    }
  });
  if (refused.length > 0) {
    const which = refused.length === 1 ? `Entry ${refused[0]} was` : `Entries ${refused.join(", ")} were`;
    throw new Error(`Batch Scan scanned nothing: ${which} refused. ${firstReason}`);
  }
  return hosts;
}

/** Runs `worker` over `items` with at most `limit` in flight, keeping input order. */
async function mapPool<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await worker(items[index] as T);
    }
  });
  await Promise.all(lanes);
  return out;
}

/**
 * Scans up to 10 public sites (agency roster) through the console's public sandbox scan, at most 4 in
 * flight. Every entry and the consoleBaseUrl are validated before the first request, so one localhost,
 * private or invalid entry throws with zero outbound requests. Per-host trouble returns that row as
 * `scanStatus: "offline"`; the batch itself only throws for invalid input. Nothing is logged.
 */
function escapeBatchCsvCell(raw: string): string {
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function batchScanSpurvikDomains(
  input: SpurvikBatchScanInput,
  opts: SpurvikScanDomainOptions = {},
): Promise<SpurvikBatchScanOutput> {
  const hosts = parseBatchDomains(input.domainsList);
  const consoleBaseUrl = resolveScanBaseUrl(input.consoleBaseUrl);
  const results = await mapPool(hosts, SPURVIK_BATCH_CONCURRENCY, (host) =>
    scanSpurvikDomain({ domainOrUrl: host, consoleBaseUrl }, opts),
  );
  const encodedDomains = hosts.map(encodeURIComponent).join(",");
  const csvExportUrl = `${SPURVIK_CONSOLE_ORIGIN}/api/v1/portfolio/scan?domains=${encodedDomains}&format=csv`;
  const googleSheetsFormula = `=IMPORTDATA("${csvExportUrl}")`;
  const csvHeader = [
    "Domain",
    "Reachable",
    "Scan_Status",
    "Widget_Class",
    "Detected_Widgets",
    "Art_50_Notice_Detected",
    "Report_URL",
    "Done_For_You_24h_EUR_199",
  ].join(",");
  const csvRows = results.map((row) =>
    [
      row.domain,
      row.reachable ? "yes" : "no",
      row.scanStatus,
      row.widgetDisclosureClass,
      row.detectedWidgets.join("; "),
      row.art50NoticeDetected ? "yes" : "no",
      row.reportUrl,
      row.upgradeUrls.doneForYou24hEur199,
    ]
      .map(escapeBatchCsvCell)
      .join(","),
  );
  const csv = `${[csvHeader, ...csvRows].join("\r\n")}\r\n`;
  return {
    totalDomains: results.length,
    gapsFound: results.filter((row) => row.reachable && row.detectedWidgets.length > 0 && !row.art50NoticeDetected)
      .length,
    results,
    csv,
    csvExportUrl,
    googleSheetsFormula,
    portfolioUrl: SPURVIK_PORTFOLIO_URL,
    prefilledPortfolioUrl: `${SPURVIK_PORTFOLIO_URL}?domains=${encodedDomains}`,
    agencyCalculatorUrl: SPURVIK_AGENCY_CALCULATOR_URL,
    upgradeUrls: {
      freeApiKey10sEur0: `${SPURVIK_CONSOLE_ORIGIN}/signup`,
      proWhiteLabelEur19: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=pro`,
      proAnnual2MonthsFreeEur190: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=pro&interval=annual`,
      teamAgencyEur79: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=team`,
      teamAnnual2MonthsFreeEur790: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=team&interval=annual`,
      doneForYou24hEur199: `${SPURVIK_CONSOLE_ORIGIN}/signup?plan=concierge`,
    },
  };
}
