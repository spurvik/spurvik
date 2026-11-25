import {
  aiActManifestUrlFor,
  c2paCheckUrlFor,
  c2paStatusShieldMarkdownFor,
  c2paStatusShieldUrlFor,
  conciergeSignupUrlFor,
  CONSOLE_ORIGIN,
  ecommerceCockpitUrlFor,
  freeSignupUrlFor,
  platformInstallerUrlsFor,
  PORTFOLIO_URL,
  PRICE_NOTE,
  proAnnualSignupUrlFor,
  proSignupUrlFor,
  reportMarkdownUrlFor,
  reportUrlFor,
  rfpQuestionnaireUrlFor,
  sandboxUrlFor,
  statusShieldMarkdownFor,
  statusShieldUrlFor,
  supportWidgetCockpitUrlFor,
  teamAnnualSignupUrlFor,
  teamSignupUrlFor,
  trustCenterCardMarkdownFor,
  trustCenterCardUrlFor,
  trustWidgetScriptFor,
  wellKnownStudioUrlFor,
} from "../links.js";
import { MCP_USER_AGENT } from "../version.js";
import { buildBadgeScript, EU_LOCALE_CODES, euLanguage, inferLocaleFromDomain } from "./badge-copy.js";
import { detectImageProxy } from "./check-image-c2pa-url.js";

/** Upstream scan endpoint on the hosted console. The origin is fixed; only the `url` query value varies. */
export const SCAN_ENDPOINT = `${CONSOLE_ORIGIN}/api/v1/sandbox/scan`;
export const SCAN_TIMEOUT_MS = 8000;
const MAX_URL_CHARS = 2048;
const MAX_LIST_ITEMS = 50;
const MAX_ITEM_CHARS = 120;

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/;

/** JSON Schema of the tool input, the same shape server.ts registers with zod. */
export const SCAN_LIVE_URL_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    url: {
      type: "string",
      description: "Public http(s) URL or bare domain, for example stepnetwork.dk. localhost, private IPs and internal hosts are refused.",
    },
  },
  required: ["url"],
  additionalProperties: false,
} as const;

export interface ScanTarget {
  /** Normalized https URL sent to the console. */
  url: string;
  /** Lower-case host without a trailing dot (an IPv6 literal has no brackets). */
  host: string;
}

export type ScanRejectionCode = "invalid_url" | "blocked_target";

export class ScanTargetRejected extends Error {
  readonly code: ScanRejectionCode;
  constructor(code: ScanRejectionCode, message: string) {
    super(message);
    this.name = "ScanTargetRejected";
    this.code = code;
  }
}

export interface ScanLiveUrlLinks {
  reportUrl: string;
  /** 1-page Markdown export (`text/markdown`) for Notion, Confluence, Linear, Jira & GitHub PRs. */
  reportMarkdownUrl: string;
  sandboxUrl: string;
  /** Multi-domain cockpit for agencies (up to 10 domains per batch). */
  portfolioUrl: string;
  /** Interactive C2PA JUMBF provenance checker (Art. 50(2), 2 Dec 2026 transition) prefilled with domain & heroImageUrl. */
  c2paCheckUrl: string;
  /** 8-language EU AI Act vendor security questionnaire & DPO RFP answers prefilled with `?domain=`. */
  rfpQuestionnaireUrl: string;
  /** 8-language Intercom Fin, Zendesk AI, Tidio Lyro, HubSpot Breeze, Dixa & Trengo AI notice cockpit prefilled with `?domain=`. */
  supportWidgetCockpitUrl: string;
  /** 8-language Shopify, Gorgias, Crisp, WooCommerce & Shopware e-commerce AI notice cockpit prefilled with `?domain=`. */
  ecommerceCockpitUrl: string;
  /** Live Art. 50 status shield SVG for this host. */
  statusShieldUrl: string;
  /** README Markdown: the status shield linked to reportUrl. */
  statusShieldMarkdown: string;
  /** Live 2 Dec 2026 Art. 50(2) C2PA status shield SVG for this host. */
  c2paStatusShieldUrl: string;
  /** README Markdown: the Art. 50(2) C2PA shield linked to c2paCheckUrl. */
  c2paStatusShieldMarkdown: string;
  /** Live 460x148 10-language SaaS Trust Center / Notion SVG readiness card for this host. */
  trustCenterCardUrl: string;
  /** Markdown embed for the 460x148 SaaS Trust Center / Notion SVG readiness card. */
  trustCenterCardMarkdown: string;
  /** Machine-readable `/.well-known/ai-act.json` generator URL (`spurvik.ai-act-manifest.v1`). */
  aiActManifestUrl: string;
  /** 8-language interactive `/.well-known/ai-act.json` & SaaS `/trust` Center Widget Studio URL. */
  wellKnownStudioUrl: string;
  /** Drop-in Shadow DOM interactive Trust-Center widget `<script>` tag. */
  trustWidgetScript: string;
  /** Signup links with the scanned host prefilled as `appUrl`. */
  upgradeUrls: {
    freeApiKey: string;
    proWhiteLabelAndAuditVault: string;
    proAnnual2MonthsFree: string;
    teamAuditAndAnnexIv: string;
    teamAnnual2MonthsFree: string;
    doneForYou24hSetup: string;
  };
}

export interface ScanLiveUrlResult extends ScanLiveUrlLinks {
  tool: "spurvik_scan_live_url";
  host: string;
  scannedUrl: string;
  offlineFallback: boolean;
  /** offline_fallback when the console could not be reached or answered without a scan. */
  status: "measured" | "not_measured" | "unreachable" | "offline_fallback";
  /** Upstream reason, for example no_ai_surface or http_status. A short code for a fallback. */
  reason: string | null;
  httpStatus: number | null;
  /** Readiness score 0-100 from the console, null when not measured. */
  score: number | null;
  detectedWidgets: string[];
  detectedSdks: string[];
  /** Detected storefront, CMS, tag manager, or frontend framework (`Shopify`, `WordPress`, `Google Tag Manager`, `Webflow`, `Framer`, `Next.js`). */
  detectedPlatforms?: string[];
  /** 1-click CMS / storefront / Google Tag Manager installer download URLs when `detectedPlatforms` is non-empty. */
  platformInstallerUrls?: Record<string, string>;
  detectedModel: string | null;
  /** True when an AI-native bot or model SDK was detected; false when only dual-use human/AI helpdesk widgets or none were seen; null when unread. */
  confirmedAiSurface: boolean | null;
  /** First public HTTPS raster hero/OG image URL discovered on the frontpage for Art. 50(2) C2PA inspection. */
  heroImageUrl: string | null;
  /** Present when `heroImageUrl` is served through an image-optimizing CDN known to strip C2PA JUMBF manifests on re-encode (2 Dec 2026 Art. 50(2)). */
  heroImageProxy?: { name: string; fix: string; c2paCheckUrl: string };
  art50NoticeDetected: boolean | null;
  markers: { art50_1_disclosure: boolean; art50_2_provenance: boolean; art50_4_synthetic: boolean; art12_telemetry: boolean } | null;
  suggestedLocale: string;
  suggestedLanguage: string;
  badgeSnippet: string;
  note: string;
}

export type ScanLiveUrlOutcome =
  | { ok: true; result: ScanLiveUrlResult }
  | { ok: false; error: ScanRejectionCode; message: string };

export interface ScanLiveUrlDeps {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

const INVALID = "The URL is not valid. Pass a public http(s) URL or a bare domain, for example stepnetwork.dk.";
const BLOCKED = "That host is not a public address. localhost, private or reserved IPs and internal hosts are not scanned.";

function normalizeHost(value: string): string {
  let host = value.trim().toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  return host;
}

function isBlockedHostname(host: string): boolean {
  const suffixes = ["localhost", "local", "internal", "localdomain", "lan", "home.arpa", "intranet", "corp"];
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function parseIpv4(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || (part.length > 1 && part.startsWith("0"))) return null;
    const num = Number(part);
    if (num > 255) return null;
    out = out * 256 + num;
  }
  return out;
}

const IPV4_PRIVATE: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function ipv4Public(ip: number): boolean {
  return !IPV4_PRIVATE.some(([literal, bits]) => {
    const base = parseIpv4(literal) ?? 0;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((ip >>> 0) & mask) === ((base >>> 0) & mask);
  });
}

function parseIpv6Groups(value: string): number[] | null {
  let text = value;
  if (text.includes(".")) {
    const lastColon = text.lastIndexOf(":");
    if (lastColon === -1) return null;
    const v4 = parseIpv4(text.slice(lastColon + 1));
    if (v4 === null) return null;
    text = `${text.slice(0, lastColon)}:${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && head.length !== 8) return null;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 && missing < 1) return null;
  const groups = halves.length === 2 ? [...head, ...Array<string>(missing).fill("0"), ...tail] : head;
  if (groups.length !== 8) return null;
  const nums: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    nums.push(Number.parseInt(group, 16));
  }
  return nums;
}

function ipv6Public(groups: number[]): boolean {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;
  const firstFiveZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (firstFiveZero && g5 === 0xffff) return ipv4Public(((g6 << 16) | g7) >>> 0);
  if (firstFiveZero && g5 === 0) return false;
  if ((g0 & 0xfe00) === 0xfc00) return false;
  if ((g0 & 0xffc0) === 0xfe80) return false;
  if ((g0 & 0xff00) === 0xff00) return false;
  if (g0 === 0x2001 && g1 === 0x0db8) return false;
  if (g0 === 0x0064 && g1 === 0xff9b) return false;
  if (g0 === 0x2002) return false;
  if (g0 === 0x2001 && (g1 & 0xfe00) === 0x0000) return false;
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return false;
  return true;
}

/** IP literal check: true or false for an IPv4/IPv6 literal, null when the host is a name. */
export function isPublicIpLiteral(host: string): boolean | null {
  const normalized = normalizeHost(host);
  if (!normalized) return null;
  if (normalized.includes("%")) return false;
  if (normalized.includes(":")) {
    const groups = parseIpv6Groups(normalized);
    return groups ? ipv6Public(groups) : false;
  }
  const v4 = parseIpv4(normalized);
  if (v4 !== null) return ipv4Public(v4);
  if (/^[0-9.]+$/.test(normalized)) return false;
  return null;
}

/**
 * Normalizes a bare domain or http(s) URL to an https URL on a public host.
 * No DNS lookup is made here: the console resolves and pins the address behind its own SSRF gate.
 * This pre-check keeps localhost, private IPs and internal hostnames from leaving the machine.
 */
export function normalizeScanTarget(raw: unknown): ScanTarget {
  if (typeof raw !== "string") throw new ScanTargetRejected("invalid_url", INVALID);
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_CHARS || /[\u0000-\u001f\u007f\s<>"'`\\]/.test(trimmed)) {
    throw new ScanTargetRejected("invalid_url", INVALID);
  }
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme !== undefined && scheme !== "http" && scheme !== "https") {
    throw new ScanTargetRejected("invalid_url", "Only http and https URLs can be scanned.");
  }
  if (scheme === undefined && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed) && !trimmed.startsWith("[")) {
    throw new ScanTargetRejected("invalid_url", "Only http and https URLs can be scanned.");
  }
  let url: URL;
  try {
    url = new URL(scheme === undefined ? `https://${trimmed.replace(/^\/\//, "")}` : trimmed);
  } catch {
    throw new ScanTargetRejected("invalid_url", INVALID);
  }
  if (url.username || url.password) {
    throw new ScanTargetRejected("invalid_url", "Credentials are not allowed in a scan URL.");
  }
  // WHATWG URL drops the scheme's default port (80 for http, 443 for https), so any port left is non-default.
  const nonDefaultPort = url.port !== "";
  url.protocol = "https:";
  url.hash = "";
  const host = normalizeHost(url.hostname);
  if (!host) throw new ScanTargetRejected("invalid_url", INVALID);
  const ipPublic = isPublicIpLiteral(host);
  if (ipPublic === false) throw new ScanTargetRejected("blocked_target", BLOCKED);
  if (ipPublic === null) {
    if (isBlockedHostname(host)) throw new ScanTargetRejected("blocked_target", BLOCKED);
    if (!HOSTNAME_RE.test(host)) {
      if (!host.includes(".")) throw new ScanTargetRejected("blocked_target", BLOCKED);
      throw new ScanTargetRejected("invalid_url", INVALID);
    }
  }
  if (nonDefaultPort) throw new ScanTargetRejected("invalid_url", "Only the default http(s) port is allowed.");
  return { url: url.toString(), host };
}

const CONFIRMED_AI_RE =
  /\b(?:Intercom Fin|Zendesk AI|Ultimate|Tidio Lyro|Lyro|Gorgias AI|Botpress|Voiceflow|ElevenLabs ConvAI|Chatbase|OpenAI ChatKit|Ada|CustomGPT|Sierra|Decagon|Vercel AI SDK|OpenAI|Anthropic|Google Gemini|LangChain|Mastra)\b/i;

function sanitizeHeroImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 1024 || !/^https:\/\//i.test(trimmed)) return null;
  try {
    return normalizeScanTarget(trimmed).url;
  } catch {
    return null;
  }
}

function scanLinks(host: string, locale = inferLocaleFromDomain(host), heroImageUrl: string | null = null): ScanLiveUrlLinks {
  const tldLocale = inferLocaleFromDomain(host);
  const extraLocale = locale !== "en" && locale !== tldLocale ? locale : undefined;
  return {
    reportUrl: reportUrlFor(host, extraLocale),
    reportMarkdownUrl: reportMarkdownUrlFor(host, extraLocale),
    sandboxUrl: sandboxUrlFor(host),
    portfolioUrl: PORTFOLIO_URL,
    c2paCheckUrl: c2paCheckUrlFor(host, heroImageUrl, locale),
    rfpQuestionnaireUrl: rfpQuestionnaireUrlFor(host, locale),
    supportWidgetCockpitUrl: supportWidgetCockpitUrlFor(host, locale),
    ecommerceCockpitUrl: ecommerceCockpitUrlFor(host, locale),
    statusShieldUrl: statusShieldUrlFor(host),
    statusShieldMarkdown: statusShieldMarkdownFor(host),
    c2paStatusShieldUrl: c2paStatusShieldUrlFor(host),
    c2paStatusShieldMarkdown: c2paStatusShieldMarkdownFor(host),
    trustCenterCardUrl: trustCenterCardUrlFor(host, extraLocale),
    trustCenterCardMarkdown: trustCenterCardMarkdownFor(host, extraLocale),
    aiActManifestUrl: aiActManifestUrlFor(host, extraLocale),
    wellKnownStudioUrl: wellKnownStudioUrlFor(host, locale),
    trustWidgetScript: trustWidgetScriptFor(host, extraLocale),
    upgradeUrls: {
      freeApiKey: freeSignupUrlFor(host, extraLocale),
      proWhiteLabelAndAuditVault: proSignupUrlFor(host, extraLocale),
      proAnnual2MonthsFree: proAnnualSignupUrlFor(host, extraLocale),
      teamAuditAndAnnexIv: teamSignupUrlFor(host, extraLocale),
      teamAnnual2MonthsFree: teamAnnualSignupUrlFor(host, extraLocale),
      doneForYou24hSetup: conciergeSignupUrlFor(host, extraLocale),
    },
  };
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

function intOrNull(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function shortCode(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9_]{1,40}$/.test(value) ? value : null;
}

/** Reads the console scan: `{ scan: PageScan }`, `{ ok, scan }`, or a bare PageScan. Null when the shape is wrong. */
function readUpstreamScan(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body)) return null;
  const scan = isRecord(body.scan) ? body.scan : body;
  return typeof scan.reachable === "boolean" ? scan : null;
}

function resolveScannedLocale(host: string, pageRead: boolean, htmlLocale: unknown): string {
  const tldLocale = inferLocaleFromDomain(host);
  if (tldLocale !== "en") return tldLocale;
  if (pageRead && typeof htmlLocale === "string" && htmlLocale !== "en" && EU_LOCALE_CODES.includes(htmlLocale)) {
    return htmlLocale;
  }
  return tldLocale;
}

function baseResult(
  target: ScanTarget,
  locale = inferLocaleFromDomain(target.host),
  heroImageUrl: string | null = null,
): Omit<ScanLiveUrlResult, "offlineFallback" | "status" | "reason" | "note"> {
  return {
    tool: "spurvik_scan_live_url",
    host: target.host,
    scannedUrl: target.url,
    httpStatus: null,
    score: null,
    detectedWidgets: [],
    detectedSdks: [],
    detectedModel: null,
    confirmedAiSurface: null,
    heroImageUrl,
    art50NoticeDetected: null,
    markers: null,
    suggestedLocale: locale,
    suggestedLanguage: euLanguage(locale).label,
    badgeSnippet: buildBadgeScript({ systemName: target.host, locale, theme: "dark", position: "bottom-right", attribution: true }),
    ...scanLinks(target.host, locale, heroImageUrl),
  };
}

function fallback(target: ScanTarget, reason: string): ScanLiveUrlResult {
  return {
    ...baseResult(target),
    offlineFallback: true,
    status: "offline_fallback",
    reason,
    note: `The live scan service did not answer, so nothing was measured. Open sandboxUrl to run the scan in the browser, share reportUrl, or paste badgeSnippet before </body> for an Art. 50(1) notice. Not legal advice. ${PRICE_NOTE}`,
  };
}

function fromUpstream(target: ScanTarget, scan: Record<string, unknown>): ScanLiveUrlResult {
  const reachable = scan.reachable === true;
  const measured = scan.measured === true;
  const markersRaw = isRecord(scan.markers) ? scan.markers : null;
  const markers = markersRaw
    ? {
        art50_1_disclosure: markersRaw.art50_1_disclosure === true,
        art50_2_provenance: markersRaw.art50_2_provenance === true,
        art50_4_synthetic: markersRaw.art50_4_synthetic === true,
        art12_telemetry: markersRaw.art12_telemetry === true,
      }
    : null;
  const httpStatus = intOrNull(scan.httpStatus, 100, 599);
  const pageRead = reachable && httpStatus === null;
  const model = typeof scan.detectedModel === "string" ? stringList([scan.detectedModel])[0] ?? null : null;
  const locale = resolveScannedLocale(target.host, pageRead, scan.htmlLocale);
  const heroImageUrl = pageRead ? sanitizeHeroImageUrl(scan.heroImageUrl) : null;
  const detectedWidgets = pageRead ? stringList(scan.detectedWidgets) : [];
  const detectedSdks = pageRead ? stringList(scan.detectedSdks) : [];
  const detectedPlatforms = pageRead ? stringList(scan.detectedPlatforms) : [];
  const platformInstallerUrls = platformInstallerUrlsFor(detectedPlatforms, target.host, locale);
  const confirmedAiSurface = pageRead
    ? detectedSdks.length > 0 || detectedWidgets.some((w) => CONFIRMED_AI_RE.test(w))
    : null;
  const dualUseOnly = pageRead && detectedWidgets.length > 0 && !confirmedAiSurface;
  const dualUseClause = dualUseOnly
    ? " Dual-use support widget detected: Art. 50(1) notice is required if AI replies or routing are enabled (human-only live chat needs none)."
    : "";
  const base = baseResult(target, locale, heroImageUrl);
  const detectedHeroProxy = heroImageUrl ? detectImageProxy(heroImageUrl) : null;
  return {
    ...base,
    offlineFallback: false,
    status: !reachable ? "unreachable" : measured ? "measured" : "not_measured",
    reason: shortCode(scan.reason),
    httpStatus,
    score: measured ? intOrNull(scan.readinessScore, 0, 100) : null,
    detectedWidgets,
    detectedSdks,
    ...(detectedPlatforms.length > 0 ? { detectedPlatforms } : {}),
    ...(Object.keys(platformInstallerUrls).length > 0 ? { platformInstallerUrls } : {}),
    detectedModel: pageRead ? model : null,
    confirmedAiSurface,
    heroImageUrl,
    ...(detectedHeroProxy
      ? {
          heroImageProxy: {
            name: detectedHeroProxy.name,
            fix: detectedHeroProxy.fix,
            c2paCheckUrl: base.c2paCheckUrl,
          },
        }
      : {}),
    art50NoticeDetected: pageRead && markers ? markers.art50_1_disclosure : null,
    markers: pageRead ? markers : null,
    note: `Heuristic check of one public page. It can miss a widget or a notice that loads later.${dualUseClause} Not legal advice. ${PRICE_NOTE}`,
  };
}

/**
 * Live Art. 50(1) surface scan through the hosted console.
 * Never throws for network trouble: a timeout, a refused connection or a non-200 answer returns `offlineFallback: true`.
 * Nothing is logged: the URL, the response and any error stay in memory.
 */
export async function scanLiveUrl(rawUrl: unknown, deps: ScanLiveUrlDeps = {}): Promise<ScanLiveUrlOutcome> {
  let target: ScanTarget;
  try {
    target = normalizeScanTarget(rawUrl);
  } catch (error) {
    if (error instanceof ScanTargetRejected) return { ok: false, error: error.code, message: error.message };
    return { ok: false, error: "invalid_url", message: INVALID };
  }
  return { ok: true, result: await scanNormalizedTarget(target, deps) };
}

/**
 * One console scan for a target that already passed `normalizeScanTarget`.
 * Never throws for network trouble and logs nothing, like `scanLiveUrl`.
 */
export async function scanNormalizedTarget(target: ScanTarget, deps: ScanLiveUrlDeps = {}): Promise<ScanLiveUrlResult> {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") return fallback(target, "fetch_unavailable");
  let response: Response;
  try {
    response = await fetchImpl(`${SCAN_ENDPOINT}?url=${encodeURIComponent(target.url)}`, {
      method: "GET",
      headers: { "User-Agent": MCP_USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(deps.timeoutMs ?? SCAN_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return fallback(target, name === "TimeoutError" || name === "AbortError" ? "timeout" : "network_error");
  }
  if (response.status !== 200) return fallback(target, `upstream_http_${response.status}`);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return fallback(target, "upstream_invalid_json");
  }
  const scan = readUpstreamScan(body);
  if (!scan) return fallback(target, "upstream_invalid_shape");
  return fromUpstream(target, scan);
}
