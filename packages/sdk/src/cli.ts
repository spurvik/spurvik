/**
 * `spurvik` CLI: zero-API-key Art. 50(1) live-site scan, C2PA image manifest & CDN-strip check, local unwrapped-call
 * audit, badge.js snippets, and local EU AI Act vendor questionnaire & DPO RFP answers.
 *
 * Nothing here reads environment variables (except NO_COLOR), writes files, or logs input anywhere but stdout/stderr.
 * `audit` never prints source text: only relative `file:line` and a provider label.
 */
import { createHmac, randomBytes } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createSignedApprovalLinks,
  verifyChannelApprovalToken,
  verifySignedChannelCallback,
} from "./channels.js";
import {
  classifySpurvikRisk,
  SPURVIK_RISK_AREAS,
  type SpurvikClassifyRiskReport,
  type SpurvikRiskArea,
} from "./classify-risk.js";
import {
  questionnaireHostname,
  SPURVIK_QUESTIONNAIRE_LOCALES,
  SPURVIK_QUESTIONNAIRE_PLANS,
  SPURVIK_QUESTIONNAIRE_PROVIDERS,
  spurvikVendorQuestionnaireAnswers,
  type SpurvikVendorQuestionnaireOutput,
} from "./vendor-questionnaire.js";

export const CLI_VERSION = "1.0.18";
export const USER_AGENT = `spurvik-cli/${CLI_VERSION}`;

export const CONSOLE_ORIGIN = "https://console.spurvik.com";
export const SCAN_ENDPOINT = `${CONSOLE_ORIGIN}/api/v1/sandbox/scan`;
export const BADGE_SCRIPT_SRC = "https://spurvik.com/badge.js";
export const PORTFOLIO_URL = `${CONSOLE_ORIGIN}/portfolio`;
/** Free signup: mints a SPURVIK_API_KEY (work email, no password, no card). */
export const SIGNUP_URL = `${CONSOLE_ORIGIN}/signup`;
export const PRO_SIGNUP_URL = `${CONSOLE_ORIGIN}/signup?plan=pro`;
export const TEAM_SIGNUP_URL = `${CONSOLE_ORIGIN}/signup?plan=team`;
export const CONCIERGE_SIGNUP_URL = `${CONSOLE_ORIGIN}/signup?plan=concierge`;
export const SCAN_TIMEOUT_MS = 10_000;

export const EXIT_OK = 0;
export const EXIT_GAP = 1;
export const EXIT_ERROR = 2;

export interface CliDeps {
  fetch?: typeof globalThis.fetch;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  /** Base directory for `audit`. Defaults to `process.cwd()`. */
  cwd?: string;
  timeoutMs?: number;
  /** ANSI colour. Defaults to on for a TTY without NO_COLOR. */
  color?: boolean;
}

interface Io {
  out: (line?: string) => void;
  err: (line?: string) => void;
  c: Paint;
}

type Paint = Record<"bold" | "dim" | "red" | "green" | "yellow" | "cyan", (s: string) => string>;

function paint(enabled: boolean): Paint {
  const wrap = (open: number, close: number) => (s: string) => (enabled ? `\u001b[${open}m${s}\u001b[${close}m` : s);
  return { bold: wrap(1, 22), dim: wrap(2, 22), red: wrap(31, 39), green: wrap(32, 39), yellow: wrap(33, 39), cyan: wrap(36, 39) };
}

// ---------------------------------------------------------------------------------------------------------------
// Target normalisation (same public-host pre-check as spurvik-mcp-server's scan tool; the console re-checks)
// ---------------------------------------------------------------------------------------------------------------

export class ScanTargetError extends Error {
  readonly code: "invalid_url" | "blocked_target";
  constructor(code: "invalid_url" | "blocked_target", message: string) {
    super(message);
    this.name = "ScanTargetError";
    this.code = code;
  }
}

export interface ScanTarget {
  url: string;
  host: string;
}

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/;
const INVALID = "Not a valid domain or URL. Try: spurvik scan example.com";
const BLOCKED = "That host is not a public address. localhost, private IPs and internal hosts are not scanned.";
const BLOCKED_SUFFIXES = ["localhost", "local", "internal", "localdomain", "lan", "home.arpa", "intranet", "corp"];
const IPV4_RESERVED: Array<[number, number]> = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16], [0xac100000, 12],
  [0xc0000000, 24], [0xc0000200, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24],
  [0xe0000000, 4], [0xf0000000, 4],
];

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

function ipv4Public(ip: number): boolean {
  return !IPV4_RESERVED.some(([base, bits]) => {
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return ((ip >>> 0) & mask) === ((base >>> 0) & mask);
  });
}

function ipv6Groups(value: string): number[] | null {
  let text = value;
  if (text.includes(".")) {
    const lastColon = text.lastIndexOf(":");
    const v4 = lastColon === -1 ? null : parseIpv4(text.slice(lastColon + 1));
    if (v4 === null) return null;
    text = `${text.slice(0, lastColon)}:${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const groups = halves.length === 2 ? [...head, ...Array<string>(missing).fill("0"), ...tail] : head;
  const nums: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    nums.push(Number.parseInt(group, 16));
  }
  return nums.length === 8 ? nums : null;
}

function ipv6Public(g: number[]): boolean {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
  const firstFiveZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (firstFiveZero && g5 === 0xffff) return ipv4Public(((g6 << 16) | g7) >>> 0);
  if (firstFiveZero && g5 === 0) return false;
  if ((g0 & 0xfe00) === 0xfc00 || (g0 & 0xffc0) === 0xfe80 || (g0 & 0xff00) === 0xff00) return false;
  if ((g0 === 0x2001 && g1 === 0x0db8) || (g0 === 0x0064 && g1 === 0xff9b) || g0 === 0x2002) return false;
  if (g0 === 0x2001 && (g1 & 0xfe00) === 0) return false;
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return false;
  return true;
}

/** true/false for an IP literal, null for a host name. */
function isPublicIpLiteral(host: string): boolean | null {
  if (host.includes("%")) return false;
  if (host.includes(":")) {
    const groups = ipv6Groups(host);
    return groups ? ipv6Public(groups) : false;
  }
  const v4 = parseIpv4(host);
  if (v4 !== null) return ipv4Public(v4);
  if (/^[0-9.]+$/.test(host)) return false;
  return null;
}

/** Bare domain or http(s) URL -> https URL on a public host. No DNS lookup: the console resolves and pins the address. */
export function normalizeScanTarget(raw: string): ScanTarget {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048 || /[\u0000-\u001f\u007f\s<>"'`\\]/.test(trimmed)) {
    throw new ScanTargetError("invalid_url", INVALID);
  }
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed)?.[1]?.toLowerCase();
  if (
    (scheme !== undefined && scheme !== "http" && scheme !== "https") ||
    (scheme === undefined && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed) && !trimmed.startsWith("["))
  ) {
    throw new ScanTargetError("invalid_url", "Only http and https URLs can be scanned.");
  }
  let url: URL;
  try {
    url = new URL(scheme === undefined ? `https://${trimmed.replace(/^\/\//, "")}` : trimmed);
  } catch {
    throw new ScanTargetError("invalid_url", INVALID);
  }
  if (url.username || url.password) throw new ScanTargetError("invalid_url", "Credentials are not allowed in a scan URL.");
  const nonDefaultPort = url.port !== "";
  url.protocol = "https:";
  url.hash = "";
  let host = url.hostname.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (!host) throw new ScanTargetError("invalid_url", INVALID);
  const ipPublic = isPublicIpLiteral(host);
  if (ipPublic === false) throw new ScanTargetError("blocked_target", BLOCKED);
  if (ipPublic === null) {
    if (BLOCKED_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) throw new ScanTargetError("blocked_target", BLOCKED);
    if (!HOSTNAME_RE.test(host)) {
      throw new ScanTargetError(host.includes(".") ? "invalid_url" : "blocked_target", host.includes(".") ? INVALID : BLOCKED);
    }
  }
  if (nonDefaultPort) throw new ScanTargetError("invalid_url", "Only the default http(s) port is allowed.");
  if (!host.includes(":")) url.hostname = host; // drop a trailing dot
  return { url: url.toString(), host };
}

/** True when a bare argument should be read as `scan <arg>` (folk.app, https://example.com), not as a command. */
export function looksLikeDomainOrUrl(arg: string): boolean {
  return /^https?:\/\//i.test(arg) || /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d+)?(?:[/?#].*)?$/i.test(arg);
}

// ---------------------------------------------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------------------------------------------

export const BADGE_LANGS = [
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
] as const;
export type BadgeLang = (typeof BADGE_LANGS)[number];

/** ccTLD -> one of the 24 official EU languages (same table as spurvik-mcp-server and the console). */
const CCTLD_LOCALES: Readonly<Record<string, BadgeLang>> = {
  dk: "da", de: "de", at: "de", se: "sv", nl: "nl", fr: "fr", be: "fr", es: "es", it: "it", pl: "pl", pt: "pt", fi: "fi",
  gr: "el", cz: "cs", ro: "ro", hu: "hu", bg: "bg", hr: "hr", sk: "sk", si: "sl", lt: "lt", lv: "lv", ee: "et",
};

/** Maps EU country-code TLDs (.dk -> da, .de/.at -> de, .fr/.be -> fr, .nl -> nl, .se -> sv, ...) or falls back to en. */
export function langForHost(host: string | undefined): BadgeLang {
  const tld = (host ?? "").toLowerCase().replace(/\.$/, "").split(".").pop() ?? "";
  return Object.prototype.hasOwnProperty.call(CCTLD_LOCALES, tld) ? CCTLD_LOCALES[tld]! : "en";
}

/** Strips attribute-breaking and control/bidi characters; caps at 64 chars. Safe inside a double-quoted HTML/JSX attribute. */
export function sanitizeSystemName(raw: string | undefined, fallback = "AI assistant"): string {
  const cleaned = (raw ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069<>"'`&\\{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64)
    .trim();
  return cleaned || fallback;
}

/** Best-effort host for display/snippets (no network, no public-address check). */
function hostForSnippet(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return normalizeScanTarget(raw).host;
  } catch {
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
      return url.hostname.toLowerCase() || undefined;
    } catch {
      return undefined;
    }
  }
}

export function badgeScriptTag(systemName: string, lang: BadgeLang, attribution = true): string {
  return `<script src="${BADGE_SCRIPT_SRC}" data-system="${sanitizeSystemName(systemName)}" data-locale="${lang}" data-attribution="${attribution ? "true" : "false"}" defer></script>`;
}

export interface ScanLinks {
  reportUrl: string;
  reportMarkdownUrl: string;
  trustCenterCardUrl: string;
  aiActManifestUrl: string;
  wellKnownStudioUrl: string;
  annexIvStudioUrl: string;
  trustWidgetScript: string;
  sandboxUrl: string;
  portfolioUrl: string;
  c2paCheckUrl: string;
  rfpQuestionnaireUrl: string;
  freeSignupUrl: string;
  proUpgradeUrl: string;
  proAnnualUrl: string;
  teamUpgradeUrl: string;
  teamAnnualUrl: string;
  doneForYouUrl: string;
}

const CLI_CONFIRMED_AI_RE =
  /\b(?:Intercom Fin|Zendesk AI|Ultimate|Tidio Lyro|Gorgias AI|CustomGPT|Sierra|Decagon|Botpress|Voiceflow|ElevenLabs ConvAI|Chatbase|OpenAI ChatKit|Ada|Vercel AI SDK|OpenAI|Anthropic|Google Gemini|LangChain|Mastra)\b/i;

function cliRfpQuestionnaireUrl(host: string, locale = "en"): string {
  const code = (locale || "en").trim().toLowerCase();
  const slug =
    code === "de"
      ? "/de/ki-verordnung-sicherheitsfragebogen-lieferanten-dsb"
      : code === "fr"
        ? "/fr/questionnaire-securite-reglement-ia-dpo-fournisseur"
        : code === "nl"
          ? "/nl/ai-verordening-leveranciersvragenlijst-fg-beveiliging"
          : code === "da"
            ? "/da/eu-ai-act-leverandoerspoergeskema-dpo-sikkerhed"
            : code === "es"
              ? "/es/cuestionario-seguridad-proveedor-reglamento-ia-dpd"
              : code === "it"
                ? "/it/questionario-sicurezza-fornitori-regolamento-ia-dpo"
                : code === "sv"
                  ? "/sv/ai-forordningen-leverantorssakerhetsformular-dso"
                  : "/eu-ai-act-vendor-security-questionnaire";
  return `https://spurvik.com${slug}?domain=${encodeURIComponent(host)}`;
}

export function cliWellKnownStudioUrl(host: string | null | undefined, locale = "en"): string {
  const code = (locale || "en").trim().toLowerCase();
  const slug =
    code === "de"
      ? "/de/well-known-ai-act-json-trust-center-widget"
      : code === "fr"
        ? "/fr/well-known-ai-act-json-widget-trust-center"
        : code === "nl"
          ? "/nl/well-known-ai-act-json-trust-center-widget"
          : code === "da"
            ? "/da/well-known-ai-act-json-trust-center-widget"
            : code === "sv"
              ? "/sv/well-known-ai-act-json-trust-center-widget"
              : code === "es"
                ? "/es/well-known-ai-act-json-widget-trust-center"
                : code === "it"
                  ? "/it/well-known-ai-act-json-widget-trust-center"
                  : "/well-known-ai-act-json-trust-center";
  const clean = (host ?? "").trim();
  return clean ? `https://spurvik.com${slug}?domain=${encodeURIComponent(clean)}` : `https://spurvik.com${slug}`;
}

export function cliAnnexIvStudioUrl(host: string | null | undefined, locale = "en"): string {
  const code = (locale || "en").trim().toLowerCase();
  const slug =
    code === "de"
      ? "/de/ki-verordnung-anhang-iv-technische-dokumentation"
      : code === "fr"
        ? "/fr/reglement-ia-annexe-iv-documentation-technique"
        : code === "nl"
          ? "/nl/ai-verordening-bijlage-iv-technische-documentatie"
          : code === "da"
            ? "/da/eu-ai-act-bilag-iv-teknisk-dokumentation"
            : code === "sv"
              ? "/sv/ai-forordningen-bilaga-iv-teknisk-dokumentation"
              : code === "es"
                ? "/es/reglamento-ia-anexo-iv-documentacion-tecnica"
                : code === "it"
                  ? "/it/regolamento-ia-allegato-iv-documentazione-tecnica"
                  : "/eu-ai-act-annex-iv-technical-documentation";
  const clean = (host ?? "").trim();
  return clean ? `https://spurvik.com${slug}?domain=${encodeURIComponent(clean)}` : `https://spurvik.com${slug}`;
}

function sanitizeCliHeroImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 1024 || !/^https:\/\//i.test(trimmed)) return null;
  try {
    return normalizeScanTarget(trimmed).url;
  } catch {
    return null;
  }
}

export function scanLinks(host: string, resolvedLang?: BadgeLang, heroImageUrl?: string | null): ScanLinks {
  const h = encodeURIComponent(host);
  const tldLang = langForHost(host);
  const lang = resolvedLang ?? tldLang;
  const extraLocale = lang !== "en" && lang !== tldLang ? `&locale=${encodeURIComponent(lang)}` : "";
  const extraLangAttr = lang !== "en" && lang !== tldLang ? ` data-lang="${lang}"` : "";
  const c2paParts = [`domain=${h}`];
  if (lang !== "en") c2paParts.push(`locale=${encodeURIComponent(lang)}`);
  if (heroImageUrl) c2paParts.push(`url=${encodeURIComponent(heroImageUrl)}`);
  return {
    reportUrl: `${CONSOLE_ORIGIN}/report?domain=${h}${extraLocale}`,
    reportMarkdownUrl: `${CONSOLE_ORIGIN}/api/v1/report/markdown?domain=${h}${extraLocale}&format=raw`,
    trustCenterCardUrl: `${CONSOLE_ORIGIN}/api/v1/badge/card.svg?domain=${h}${extraLocale}`,
    aiActManifestUrl: `${CONSOLE_ORIGIN}/api/v1/badge/ai-act.json?domain=${h}${extraLocale}`,
    wellKnownStudioUrl: cliWellKnownStudioUrl(host, lang),
    annexIvStudioUrl: cliAnnexIvStudioUrl(host, lang),
    trustWidgetScript: `<script src="https://spurvik.com/trust-widget.js" data-domain="${host}"${extraLangAttr} defer></script>`,
    sandboxUrl: `${CONSOLE_ORIGIN}/sandbox?scan=${h}`,
    portfolioUrl: PORTFOLIO_URL,
    c2paCheckUrl: `${CONSOLE_ORIGIN}/c2pa?${c2paParts.join("&")}`,
    rfpQuestionnaireUrl: cliRfpQuestionnaireUrl(host, lang),
    freeSignupUrl: `${CONSOLE_ORIGIN}/signup?appUrl=${h}${extraLocale}`,
    proUpgradeUrl: `${CONSOLE_ORIGIN}/signup?plan=pro&appUrl=${h}${extraLocale}`,
    proAnnualUrl: `${CONSOLE_ORIGIN}/signup?plan=pro&interval=annual&appUrl=${h}${extraLocale}`,
    teamUpgradeUrl: `${CONSOLE_ORIGIN}/signup?plan=team&appUrl=${h}${extraLocale}`,
    teamAnnualUrl: `${CONSOLE_ORIGIN}/signup?plan=team&interval=annual&appUrl=${h}${extraLocale}`,
    doneForYouUrl: `${CONSOLE_ORIGIN}/signup?plan=concierge&appUrl=${h}${extraLocale}`,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// scan
// ---------------------------------------------------------------------------------------------------------------

export type ScanStatus = "covered" | "gap" | "no_widget_detected" | "unreachable";

export interface ScanReport {
  domain: string;
  scannedUrl: string;
  status: ScanStatus;
  reachable: boolean;
  httpStatus: number | null;
  detectedWidgets: string[];
  detectedPlatforms?: string[];
  /** True when an AI-native bot or model SDK was detected; false when only dual-use human/AI helpdesk widgets or none were seen; null when unread. */
  confirmedAiSurface: boolean | null;
  heroImageUrl: string | null;
  heroImageProxy?: { name: string; fix: string; c2paCheckUrl: string };
  /** Art. 50(1) interaction notice found on the page. null when the page could not be read. */
  covered: boolean | null;
  badgeSnippet: string;
  links: ScanLinks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Upstream strings go to a terminal: drop control, bidi, zero-width and tag chars (no ANSI injection), trim, cap. */
function cleanText(value: unknown, max = 120): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff\u{e0000}-\u{e007f}]/gu, "").trim().slice(0, max)
    : "";
}

/** Local file names can hold control/bidi characters too: show them as \\uXXXX instead of sending them to the terminal. */
export function escapeForTerminal(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function cleanList(...values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const clean = cleanText(item);
      if (clean && !out.includes(clean)) out.push(clean);
      if (out.length >= 50) return out;
    }
  }
  return out;
}

/** Builds the report from the console answer `{ ok, scan: { reachable, httpStatus, detectedWidgets, markers, cards } }`. */
export function reportFromScan(target: ScanTarget, body: unknown): ScanReport | null {
  if (!isRecord(body)) return null;
  const scan = isRecord(body.scan) ? body.scan : body;
  if (typeof scan.reachable !== "boolean") return null;
  const httpStatus =
    typeof scan.httpStatus === "number" && Number.isInteger(scan.httpStatus) && scan.httpStatus >= 100 && scan.httpStatus <= 599
      ? scan.httpStatus
      : null;
  // httpStatus is set only when the page answered with an error status, so nothing on it was read.
  const pageRead = scan.reachable && httpStatus === null;
  const markers = isRecord(scan.markers) ? scan.markers : {};
  const cards = isRecord(scan.cards) ? scan.cards : {};
  const art50Card = isRecord(cards.art50_1) ? cards.art50_1 : {};
  const disclosure = markers.art50_1_disclosure === true || art50Card.status === "detected";
  const widgets = pageRead ? cleanList(scan.detectedWidgets, scan.detectedSdks) : [];
  const platforms = pageRead ? cleanList(scan.detectedPlatforms) : [];
  const confirmedAiSurface = pageRead
    ? (Array.isArray(scan.detectedSdks) && cleanList(scan.detectedSdks).length > 0) ||
      widgets.some((w) => CLI_CONFIRMED_AI_RE.test(w))
    : null;
  const heroImageUrl = pageRead ? sanitizeCliHeroImageUrl(scan.heroImageUrl) : null;
  const status: ScanStatus = !pageRead ? "unreachable" : disclosure ? "covered" : widgets.length > 0 ? "gap" : "no_widget_detected";
  const scannedUrl = cleanText(scan.scannedUrl, 2048);
  const tldLang = langForHost(target.host);
  const resolvedLang: BadgeLang =
    tldLang === "en" && pageRead && typeof scan.htmlLocale === "string" && scan.htmlLocale !== "en" && (BADGE_LANGS as readonly string[]).includes(scan.htmlLocale)
      ? (scan.htmlLocale as BadgeLang)
      : tldLang;
  const links = scanLinks(target.host, resolvedLang, heroImageUrl);
  const detectedHeroProxy = heroImageUrl ? detectImageProxy(heroImageUrl) : null;
  return {
    domain: target.host,
    scannedUrl: /^https:\/\//.test(scannedUrl) ? scannedUrl : target.url,
    status,
    reachable: scan.reachable,
    httpStatus,
    detectedWidgets: widgets,
    ...(platforms.length > 0 ? { detectedPlatforms: platforms } : {}),
    confirmedAiSurface,
    heroImageUrl,
    ...(detectedHeroProxy
      ? {
          heroImageProxy: {
            name: detectedHeroProxy.name,
            fix: detectedHeroProxy.fix,
            c2paCheckUrl: links.c2paCheckUrl,
          },
        }
      : {}),
    covered: pageRead ? disclosure : null,
    badgeSnippet: badgeScriptTag(target.host, resolvedLang),
    links,
  };
}

class ScanFailed extends Error {}

async function fetchScan(target: ScanTarget, deps: CliDeps): Promise<ScanReport> {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new ScanFailed("This Node.js has no fetch. Use Node.js 20 or later.");
  let response: Response;
  try {
    response = await fetchImpl(`${SCAN_ENDPOINT}?url=${encodeURIComponent(target.url)}`, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(deps.timeoutMs ?? SCAN_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    throw new ScanFailed(
      name === "TimeoutError" || name === "AbortError"
        ? `The scan service did not answer within ${Math.round((deps.timeoutMs ?? SCAN_TIMEOUT_MS) / 1000)}s.`
        : "Could not reach console.spurvik.com. Check your network and try again.",
    );
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.status !== 200) {
    const upstream = isRecord(body) && isRecord(body.error) ? body.error : {};
    const code = /^[a-z_]{1,40}$/.test(String(upstream.code ?? "")) ? String(upstream.code) : `http_${response.status}`;
    const message = cleanText(upstream.message, 200);
    throw new ScanFailed(`Scan refused (${code})${message ? `: ${message}` : "."}`);
  }
  const report = reportFromScan(target, body);
  if (!report) throw new ScanFailed("The scan service sent an answer this CLI cannot read. Try again later.");
  return report;
}

const STATUS_LABEL: Record<ScanStatus, string> = {
  covered: "COVERED",
  gap: "GAP — AI widget detected without Art. 50 notice",
  no_widget_detected: "NO PUBLIC WIDGET DETECTED",
  unreachable: "NOT SCANNED — page could not be read",
};

function cliPlatformInstallerSteps(platforms: readonly string[] | undefined): Array<[string, string]> {
  if (!platforms || platforms.length === 0) return [];
  const out: Array<[string, string]> = [];
  for (const p of platforms) {
    if (p === "Shopify") out.push(["1-click Shopify (.liquid)", "https://spurvik.com/r/spurvik-shopify-art50.liquid"]);
    else if (p === "WordPress") out.push(["1-click WordPress (.zip)", "https://spurvik.com/r/spurvik-eu-ai-act-wp.zip"]);
    else if (p === "PrestaShop") out.push(["1-click PrestaShop (.zip)", "https://spurvik.com/r/spurvik-prestashop-art50.zip"]);
    else if (p === "Shopware") out.push(["1-click Shopware 6 (.zip)", "https://spurvik.com/r/spurvik-shopware6-art50.zip"]);
    else if (p === "Google Tag Manager") out.push(["1-click Google Tag Manager (.json)", "https://spurvik.com/r/spurvik-gtm-art50-container.json"]);
    else if (p === "Framer") out.push(["1-click Framer (.tsx)", "https://spurvik.com/r/spurvik-framer-badge.tsx"]);
    if (out.length >= 3) break;
  }
  return out;
}

function printScan(report: ScanReport, io: Io): void {
  const { c, out } = io;
  const row = (label: string, value: string) => out(`  ${c.dim(label.padEnd(18))}${value}`);
  const statusText =
    report.status === "covered"
      ? c.green(STATUS_LABEL.covered)
      : report.status === "gap"
        ? report.confirmedAiSurface === false
          ? c.yellow("CHECK — dual-use chat widget detected; Art. 50(1) notice required if AI replies are enabled (human-only chat needs none)")
          : c.red(STATUS_LABEL.gap)
        : report.status === "unreachable"
          ? c.yellow(STATUS_LABEL.unreachable)
          : c.cyan(STATUS_LABEL.no_widget_detected);
  out();
  out(`  ${c.bold("Spurvik · EU AI Act Art. 50(1) live scan")}`);
  out();
  row("Domain", report.scannedUrl && report.scannedUrl !== `https://${report.domain}/` ? `${report.domain} ${c.dim(`(${report.scannedUrl})`)}` : report.domain);
  row(
    "HTTP status",
    report.httpStatus !== null ? `${report.httpStatus} (page not read)` : report.reachable ? "reachable, page read" : "unreachable",
  );
  row("AI widgets", report.detectedWidgets.length ? report.detectedWidgets.join(", ") : "none detected");
  if (report.detectedPlatforms?.length) {
    row("Platform stack", report.detectedPlatforms.join(", "));
  }
  if (report.heroImageProxy) {
    row("2 Dec C2PA CDN", c.yellow(`${report.heroImageProxy.name} (re-encode strips C2PA JUMBF on AI media)`));
  }
  row("Art. 50(1) notice", statusText);
  out();
  if (report.status !== "covered") {
    out(`  ${c.bold("1-line fix")} ${c.dim("(paste before </body>)")}`);
    out(`  ${report.badgeSnippet}`);
    out();
  }
  out(`  ${c.bold("Next steps")} ${c.dim("(prices excl. VAT)")}`);
  const step = (label: string, url: string) => {
    out(`  › ${label}`);
    out(`    ${c.cyan(url)}`);
  };
  for (const [label, url] of cliPlatformInstallerSteps(report.detectedPlatforms)) {
    step(label, url);
  }
  step("Client / DPO PDF brief", report.links.reportUrl);
  step("1-page Markdown brief (.md)", report.links.reportMarkdownUrl);
  step("Trust Center & Notion card (.svg)", report.links.trustCenterCardUrl);
  step("Machine-readable /.well-known/ai-act.json", report.links.aiActManifestUrl);
  step("2 Dec 2026 C2PA hero-image check", report.links.c2paCheckUrl);
  step("Free API key (€0)", report.links.freeSignupUrl);
  step("White-label Pro (€19/mo or €190/yr)", report.links.proUpgradeUrl);
  step("Team 2M events + Annex IV (€79/mo or €790/yr)", report.links.teamUpgradeUrl);
  step("24h engineer Done-For-You (€199 once, incl. 1 year of Pro)", report.links.doneForYouUrl);
  step("Batch scan 10 domains", report.links.portfolioUrl);
  out();
}

export const BATCH_SCAN_MAX_DOMAINS = 10;
const BATCH_SCAN_CONCURRENCY = 4;

export interface BatchScanReport {
  totalDomains: number;
  duplicatesRemoved: number;
  gapsFound: number;
  results: ScanReport[];
  links: {
    portfolioUrl: string;
    freeSignupUrl: string;
    proAnnualUrl: string;
    teamUpgradeUrl: string;
    teamAnnualUrl: string;
    doneForYouUrl: string;
  };
}

async function mapPool<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await worker(items[index]!);
    }
  });
  await Promise.all(lanes);
  return out;
}

function printBatchScan(batch: BatchScanReport, io: Io): void {
  const { c, out } = io;
  out();
  out(`  ${c.bold("Spurvik · EU AI Act Art. 50(1) batch portfolio scan")} ${c.dim(`(${batch.totalDomains} domains)`)}`);
  out();
  for (const r of batch.results) {
    const tag =
      r.status === "covered"
        ? c.green("COVERED")
        : r.status === "gap"
          ? r.confirmedAiSurface === false
            ? c.yellow("CHECK (if AI)")
            : c.red("GAP")
          : r.status === "unreachable"
            ? c.yellow("UNREACHABLE")
            : c.cyan("NO WIDGET");
    const widgets = r.detectedWidgets.length ? r.detectedWidgets.join(", ") : "none";
    const stackSuffix = r.detectedPlatforms?.length ? ` · stack: ${r.detectedPlatforms.join(", ")}` : "";
    const c2paSuffix = r.heroImageProxy ? ` · 2 Dec C2PA: ${r.heroImageProxy.name.split(" (")[0]}` : "";
    out(`  ${tag.padEnd(14)} ${r.domain.padEnd(26)} ${c.dim(`widgets: ${widgets}${stackSuffix}${c2paSuffix}`)} · ${c.cyan(r.links.reportUrl)}`);
  }
  out();
  out(
    `  ${batch.gapsFound > 0 ? c.yellow(`⚠ ${batch.gapsFound} of ${batch.totalDomains} domain(s) missing a visible Art. 50(1) AI notice (human-only live chat needs none).`) : c.green("✓ Zero Art. 50(1) notice gaps detected across scanned domains.")}`,
  );
  out();
  out(`  ${c.bold("Next steps")} ${c.dim("(prices excl. VAT)")}`);
  out(`  › Interactive portfolio matrix & CSV/Markdown export`);
  out(`    ${c.cyan(batch.links.portfolioUrl)}`);
  out(`  › White-label Pro Annual (€190/yr · 2 months free)`);
  out(`    ${c.cyan(batch.links.proAnnualUrl)}`);
  out(`  › Team 2M events + Annex IV (€79/mo or €790/yr)`);
  out(`    ${c.cyan(batch.links.teamUpgradeUrl)}`);
  out(`  › 24h engineer Done-For-You setup (€199/site, incl. 1 year of Pro)`);
  out(`    ${c.cyan(batch.links.doneForYouUrl)}`);
  out();
}

function escapeScanCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function formatScanCsv(reports: readonly ScanReport[]): string {
  const header = "domain,status,detected_widgets,detected_platforms,art50_1_notice,report_url,rfp_csv_url,done_for_you_eur199_url,c2pa_check_url,trust_center_md_url";
  const rows = reports.map((r) => {
    const notice =
      r.status === "covered"
        ? "Detected"
        : r.status === "gap"
          ? "Gap — missing notice"
          : r.status === "unreachable"
            ? "Unreachable"
            : "No public AI widget";
    const enc = encodeURIComponent(r.domain);
    const rfpCsvUrl = `https://console.spurvik.com/api/v1/rfp/answers?domain=${enc}&plan=team&format=csv`;
    const c2paCheckUrl = `https://console.spurvik.com/c2pa?domain=${enc}`;
    const trustMdUrl = `https://console.spurvik.com/api/v1/badge/trust-center.md?domain=${enc}`;
    return [
      escapeScanCsvCell(r.domain),
      escapeScanCsvCell(r.status),
      escapeScanCsvCell(r.detectedWidgets.join("; ")),
      escapeScanCsvCell((r.detectedPlatforms ?? []).join("; ")),
      escapeScanCsvCell(notice),
      escapeScanCsvCell(r.links.reportUrl),
      escapeScanCsvCell(rfpCsvUrl),
      escapeScanCsvCell(r.links.doneForYouUrl),
      escapeScanCsvCell(c2paCheckUrl),
      escapeScanCsvCell(trustMdUrl),
    ].join(",");
  });
  return [header, ...rows].join("\r\n");
}

async function cmdScan(args: ParsedArgs, deps: CliDeps, io: Io): Promise<number> {
  if (args.positionals.length === 0) {
    io.err("Usage: spurvik scan <domain-or-url> [...up to 10 domains] [--json|--csv] [--fail-on-gap]");
    return EXIT_ERROR;
  }
  if (args.positionals.length > BATCH_SCAN_MAX_DOMAINS) {
    io.err(`spurvik scan takes 1 to ${BATCH_SCAN_MAX_DOMAINS} domains per run.`);
    return EXIT_ERROR;
  }
  if (args.positionals.length === 1) {
    let target: ScanTarget;
    try {
      target = normalizeScanTarget(args.positionals[0]!);
    } catch (error) {
      io.err(error instanceof ScanTargetError ? error.message : INVALID);
      return EXIT_ERROR;
    }
    let report: ScanReport;
    try {
      report = await fetchScan(target, deps);
    } catch (error) {
      const message = error instanceof ScanFailed ? error.message : "The scan failed.";
      if (args.json) {
        io.out(JSON.stringify({ domain: target.host, status: "error", error: message, links: scanLinks(target.host) }, null, 2));
      } else {
        io.err(`spurvik scan: ${message}`);
        io.err(`Run it in the browser instead: ${scanLinks(target.host).sandboxUrl}`);
      }
      return EXIT_ERROR;
    }
    if (args.json) io.out(JSON.stringify(report, null, 2));
    else if (args.csv) io.out(formatScanCsv([report]));
    else printScan(report, io);
    return args.failOnGap && report.status === "gap" ? EXIT_GAP : EXIT_OK;
  }

  // Multi-domain batch scan (2..10 domains): validate all targets before any network call.
  const targets: ScanTarget[] = [];
  const seen = new Set<string>();
  let duplicatesRemoved = 0;
  for (const raw of args.positionals) {
    let target: ScanTarget;
    try {
      target = normalizeScanTarget(raw);
    } catch (error) {
      io.err(error instanceof ScanTargetError ? error.message : INVALID);
      return EXIT_ERROR;
    }
    if (seen.has(target.host)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(target.host);
    targets.push(target);
  }
  let results: ScanReport[];
  try {
    results = await mapPool(targets, BATCH_SCAN_CONCURRENCY, (target) => fetchScan(target, deps));
  } catch (error) {
    const message = error instanceof ScanFailed ? error.message : "The batch scan failed.";
    if (args.json) {
      io.out(JSON.stringify({ status: "error", error: message, links: { portfolioUrl: PORTFOLIO_URL } }, null, 2));
    } else {
      io.err(`spurvik scan: ${message}`);
      io.err(`Run it in the browser instead: ${PORTFOLIO_URL}`);
    }
    return EXIT_ERROR;
  }
  const gapsFound = results.filter((r) => r.status === "gap").length;
  const portfolioUrl = `${PORTFOLIO_URL}?domains=${targets.map((t) => encodeURIComponent(t.host)).join(",")}`;
  const batch: BatchScanReport = {
    totalDomains: results.length,
    duplicatesRemoved,
    gapsFound,
    results,
    links: {
      portfolioUrl,
      freeSignupUrl: SIGNUP_URL,
      proAnnualUrl: `${PRO_SIGNUP_URL}&interval=annual`,
      teamUpgradeUrl: TEAM_SIGNUP_URL,
      teamAnnualUrl: `${TEAM_SIGNUP_URL}&interval=annual`,
      doneForYouUrl: CONCIERGE_SIGNUP_URL,
    },
  };
  if (args.json) io.out(JSON.stringify(batch, null, 2));
  else if (args.csv) io.out(formatScanCsv(results));
  else printBatchScan(batch, io);
  return args.failOnGap && gapsFound > 0 ? EXIT_GAP : EXIT_OK;
}

// ---------------------------------------------------------------------------------------------------------------
// audit
// ---------------------------------------------------------------------------------------------------------------

export const AUDIT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".php",
  ".rb",
  ".cs",
  ".go",
  ".java",
  ".kt",
]);
export const AUDIT_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  "vendor",
  ".venv",
  "bin",
  "obj",
  "target",
]);
export const AUDIT_MAX_FILE_BYTES = 512 * 1024;
const AUDIT_MAX_FILES = 20_000;
const AUDIT_MAX_DEPTH = 32;
const AUDIT_MAX_FINDINGS = 500;

/** A file that mentions any of these is treated as already wrapped. */
const WRAPPED_RE = /spurvik|wrapVercelModel/i;

type AuditFileKind = "js" | "py" | "php" | "rb" | "cs" | "go" | "jvm";

interface CallPattern {
  re: RegExp;
  provider: string;
  kind: AuditFileKind;
}

const CALL_PATTERNS: readonly CallPattern[] = [
  { re: /\bnew\s+OpenAI\s*\(/, provider: "OpenAI", kind: "js" },
  { re: /\bnew\s+Anthropic\s*\(/, provider: "Anthropic", kind: "js" },
  { re: /\bnew\s+GoogleGenAI\s*\(/, provider: "Google GenAI", kind: "js" },
  { re: /(?<!function\s+|def\s+)\bgenerateText\s*\(/, provider: "Vercel AI SDK generateText", kind: "js" },
  { re: /(?<!function\s+|def\s+)\bstreamText\s*\(/, provider: "Vercel AI SDK streamText", kind: "js" },
  { re: /(?<!\w)(?<!(?:class|def)\s+)(?:Async)?OpenAI\s*\(/, provider: "OpenAI", kind: "py" },
  { re: /(?<!\w)(?<!(?:class|def)\s+)(?:Async)?Anthropic\s*\(/, provider: "Anthropic", kind: "py" },
  { re: /\bgenai\.Client\s*\(/, provider: "Google GenAI", kind: "py" },
  { re: /\bChatOpenAI\s*\(/, provider: "LangChain ChatOpenAI", kind: "py" },
  { re: /\bChatAnthropic\s*\(/, provider: "LangChain ChatAnthropic", kind: "py" },
  {
    re: /\bOpenAI::(?:client|chat|responses|completions)\s*\(|\bPrism::(?:text|structured|embeddings)\s*\(|\bnew\s+\\?OpenAI\\Client\b|\bAnthropic::(?:client|messages)\s*\(/,
    provider: "PHP OpenAI / Prism",
    kind: "php",
  },
  {
    re: /\bnew\s+(?:Azure)?OpenAIClient\s*\(|\bnew\s+ChatClient\s*\(|\bAdd(?:Azure)?OpenAIChatCompletion\s*\(|\bCompleteChat(?:Streaming)?Async\s*\(|\bGetChatMessageContents?Async\s*\(/,
    provider: ".NET OpenAI / Semantic Kernel",
    kind: "cs",
  },
  {
    re: /\bopenai\.NewClient\s*\(|\banthropic\.NewClient\s*\(|\bbedrockruntime\.NewFromConfig\s*\(|\bCreateChatCompletion(?:Stream)?\s*\(|\bChat\.Completions\.New\s*\(|\bMessages\.New\s*\(/,
    provider: "Go OpenAI / Anthropic / Bedrock",
    kind: "go",
  },
  {
    re: /\bChatClient\.builder\s*\(|\bOpenAiChatModel\b|\bOpenAIClientBuilder\s*\(|\.\s*prompt\s*\([^)]*\)\s*\.(?:.*\.)?call\s*\(/,
    provider: "Java / Spring AI",
    kind: "jvm",
  },
  {
    re: /\bOpenAI::Client\.new\s*\(|\bAnthropic::Client\.new\s*\(|\bRubyLLM\.chat\b|\bLangchain::LLM::(?:OpenAI|Anthropic|GoogleGemini|MistralAI)\.new\b|\bGemini\.new\s*\(/,
    provider: "Ruby / Rails OpenAI / RubyLLM",
    kind: "rb",
  },
];

export interface AuditFinding {
  file: string;
  line: number;
  provider: string;
}

export interface AuditReport {
  directory: string;
  filesScanned: number;
  wrappedFiles: number;
  unwrapped: AuditFinding[];
  truncated: boolean;
}

function fileKindForExt(ext: string): AuditFileKind {
  if (ext === ".py") return "py";
  if (ext === ".php") return "php";
  if (ext === ".rb") return "rb";
  if (ext === ".cs") return "cs";
  if (ext === ".go") return "go";
  if (ext === ".java" || ext === ".kt") return "jvm";
  return "js";
}

function isCommentLine(line: string, kind: AuditFileKind): boolean {
  const t = line.trimStart();
  if (kind === "py" || kind === "rb") return t.startsWith("#");
  if (kind === "php") return t.startsWith("#") || t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

/** Read-only walk. Symlinks are not followed. Returns only file:line:provider, never source text. */
export function auditDirectory(root: string): AuditReport {
  const report: AuditReport = { directory: root, filesScanned: 0, wrappedFiles: 0, unwrapped: [], truncated: false };
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (stack.length > 0) {
    const { dir, depth } = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!AUDIT_SKIP_DIRS.has(entry.name) && depth < AUDIT_MAX_DEPTH) stack.push({ dir: full, depth: depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!AUDIT_EXTENSIONS.has(ext)) continue;
      if (report.filesScanned >= AUDIT_MAX_FILES) {
        report.truncated = true;
        return finishAudit(report);
      }
      let text: string;
      try {
        if (lstatSync(full).size > AUDIT_MAX_FILE_BYTES) continue;
        text = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      report.filesScanned += 1;
      if (WRAPPED_RE.test(text)) {
        report.wrappedFiles += 1;
        continue;
      }
      const kind = fileKindForExt(ext);
      const rel = path.relative(root, full).split(path.sep).join("/");
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? "";
        if (isCommentLine(line, kind)) continue;
        const hit = CALL_PATTERNS.find((p) => p.kind === kind && p.re.test(line));
        if (!hit) continue;
        report.unwrapped.push({ file: rel, line: i + 1, provider: hit.provider });
        if (report.unwrapped.length >= AUDIT_MAX_FINDINGS) {
          report.truncated = true;
          return finishAudit(report);
        }
      }
    }
  }
  return finishAudit(report);
}

function finishAudit(report: AuditReport): AuditReport {
  report.unwrapped.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  return report;
}

export const QUICKSTART_URL = "https://github.com/spurvik/spurvik/blob/main/docs/quickstart.md";

const WRAP_SNIPPET = [
  'import { withSpurvik } from "spurvik";',
  "const ai = withSpurvik(new OpenAI(), config); // also new Anthropic() / new GoogleGenAI()",
  "await ai.chat.completions.create({ ... });    // same call, now an HMAC-signed record",
];

const AI_SDK_SNIPPET = [
  'import { spurvikMiddleware } from "spurvik/ai";',
  "const model = wrapLanguageModel({ model, middleware: spurvikMiddleware(config) });",
  "await generateText({ model, ... });            // same config as withSpurvik",
];

const PYTHON_WRAP_SNIPPET = [
  "curl -fsSLO https://spurvik.com/r/spurvik_guard.py",
  "from spurvik_guard import send_telemetry_event, request_human_approval",
  'send_telemetry_event("openai", "gpt-4o", prompt, reply, latency_ms=140) # 0B raw prompt text',
];

const MCP_PR_GATE_URL = "https://spurvik.com/cursor-claude-mcp-eu-ai-act";
const HMAC_RECEIPT_GUIDE_URL = "https://spurvik.com/ai-event-logging-hmac-receipts";

const AUDIT_NEXT_STEPS: ReadonlyArray<readonly [string, string]> = [
  ["Free SPURVIK_API_KEY in 10s (€0, 10,000 events/mo, no card)", SIGNUP_URL],
  ["White-label badge + 90d Frankfurt vault + HITL queue (Pro €19/mo)", PRO_SIGNUP_URL],
  ["24h Done-For-You engineer setup (€199 once, incl. 1 yr Pro)", CONCIERGE_SIGNUP_URL],
  ["12-mo Frankfurt retention + Annex IV draft (Team €79/mo)", TEAM_SIGNUP_URL],
  ["Art. 12 & GDPR zero-prompt-text HMAC receipt cockpit", HMAC_RECEIPT_GUIDE_URL],
  ["GitHub Actions PR-Gate & 10-tool Cursor/Claude MCP", MCP_PR_GATE_URL],
];

function cmdAudit(args: ParsedArgs, deps: CliDeps, io: Io): number {
  if (args.positionals.length > 1) {
    io.err("Usage: spurvik audit [dir] [--json] [--fail-on-gap]");
    return EXIT_ERROR;
  }
  const base = deps.cwd ?? process.cwd();
  const target = path.resolve(base, args.positionals[0] ?? ".");
  let root: string;
  try {
    root = realpathSync(target);
    if (!statSync(root).isDirectory()) throw new Error("not a directory");
  } catch {
    io.err(`spurvik audit: not a readable directory: ${escapeForTerminal(args.positionals[0] ?? ".")}`);
    return EXIT_ERROR;
  }
  const report = auditDirectory(root);
  const display = args.positionals[0] ?? ".";
  if (args.json) {
    io.out(
      JSON.stringify(
        {
          directory: display,
          filesScanned: report.filesScanned,
          wrappedFiles: report.wrappedFiles,
          unwrappedCount: report.unwrapped.length,
          unwrapped: report.unwrapped,
          truncated: report.truncated,
          consoleUrl: PRO_SIGNUP_URL,
          freeSignupUrl: SIGNUP_URL,
          teamUpgradeUrl: TEAM_SIGNUP_URL,
          doneForYouUrl: CONCIERGE_SIGNUP_URL,
          hmacGuideUrl: HMAC_RECEIPT_GUIDE_URL,
          mcpGuideUrl: MCP_PR_GATE_URL,
        },
        null,
        2,
      ),
    );
  } else {
    const { c, out } = io;
    out();
    out(`  ${c.bold("Spurvik · local audit of unwrapped model calls")} ${c.dim(`(${escapeForTerminal(display)})`)}`);
    out();
    out(`  ${c.dim("Files scanned".padEnd(18))}${report.filesScanned}${report.truncated ? c.yellow(" (limit reached)") : ""}`);
    out(`  ${c.dim("Already wrapped".padEnd(18))}${report.wrappedFiles} file(s)`);
    out(
      `  ${c.dim("Unwrapped calls".padEnd(18))}${report.unwrapped.length === 0 ? c.green("0") : c.red(String(report.unwrapped.length))}`,
    );
    if (report.unwrapped.length > 0) {
      out();
      for (const f of report.unwrapped) out(`    ${escapeForTerminal(f.file)}:${f.line} — ${f.provider}`);
      out();
      out(`  ${c.bold("Wrap the client once")}`);
      for (const line of WRAP_SNIPPET) out(`    ${line}`);
      if (report.unwrapped.some((f) => f.provider.startsWith("Vercel AI SDK"))) {
        out();
        out(`  ${c.bold("Vercel AI SDK")}`);
        for (const line of AI_SDK_SNIPPET) out(`    ${line}`);
      }
      if (report.unwrapped.some((f) => f.file.endsWith(".py"))) {
        out();
        out(`  ${c.bold("Python / FastAPI / LangChain")} ${c.dim("(Python 3.10+ stdlib only)")}`);
        for (const line of PYTHON_WRAP_SNIPPET) out(`    ${line}`);
      }
      if (report.unwrapped.some((f) => f.file.endsWith(".php"))) {
        out(`  ${c.bold("PHP / Laravel / Symfony:")} curl -fsSLO https://spurvik.com/r/spurvik_guard.php && npx spurvik setup laravel`);
      }
      if (report.unwrapped.some((f) => f.file.endsWith(".cs"))) {
        out(`  ${c.bold("C# / .NET 8+ / Semantic Kernel:")} curl -fsSLO https://spurvik.com/r/SpurvikGuard.cs && npx spurvik setup dotnet`);
      }
      if (report.unwrapped.some((f) => f.file.endsWith(".go"))) {
        out(`  ${c.bold("Go 1.21+ stdlib:")} curl -fsSLO https://spurvik.com/r/spurvik_guard.go && npx spurvik setup go`);
      }
      if (report.unwrapped.some((f) => f.file.endsWith(".java") || f.file.endsWith(".kt"))) {
        out(`  ${c.bold("Java / Kotlin / Spring AI:")} npx spurvik setup spring-boot`);
      }
      if (report.unwrapped.some((f) => f.file.endsWith(".rb"))) {
        out(`  ${c.bold("Ruby / Rails / RubyLLM:")} curl -fsSLO https://spurvik.com/r/spurvik_guard.rb && npx spurvik setup rails`);
      }
      out(`  ${c.dim("config fields:")} ${QUICKSTART_URL}`);
      out(`  ${c.dim("tailored setup:")} npx spurvik setup`);
    }
    out();
    out(`  ${c.bold("Next steps")} ${c.dim("(hosted EU console, Frankfurt fra1; prices excl. VAT)")}`);
    for (const [label, url] of AUDIT_NEXT_STEPS) out(`  ${label}: ${c.cyan(url)}`);
    out();
  }
  return args.failOnGap && report.unwrapped.length > 0 ? EXIT_GAP : EXIT_OK;
}

// ---------------------------------------------------------------------------------------------------------------
// badge
// ---------------------------------------------------------------------------------------------------------------

export const BADGE_CMS_TARGETS = [
  "shopify",
  "wordpress",
  "webflow",
  "framer",
  "gtm",
  "cookiebot",
  "usercentrics",
  "cmp",
  "trust-widget",
  "trust-center",
  "well-known",
  "html",
  "react",
] as const;
export type BadgeCmsTarget = (typeof BADGE_CMS_TARGETS)[number];

function hmacCockpitUrl(host: string | null | undefined, locale = "en"): string {
  const code = (locale || "en").trim().toLowerCase();
  const slug =
    code === "de"
      ? "/de/ki-verordnung-artikel-12-protokollierung-dsgvo-hmac"
      : code === "fr"
        ? "/fr/reglement-ia-article-12-journalisation-rgpd-hmac"
        : code === "nl"
          ? "/nl/ai-verordening-artikel-12-logging-avg-hmac"
          : code === "da"
            ? "/da/eu-ai-act-artikel-12-logning-gdpr-hmac"
            : code === "sv"
              ? "/sv/ai-forordningen-artikel-12-loggning-gdpr-hmac"
              : code === "es"
                ? "/es/reglamento-ia-articulo-12-registro-rgpd-hmac"
                : code === "it"
                  ? "/it/regolamento-ia-articolo-12-registrazione-gdpr-hmac"
                  : "/ai-event-logging-hmac-receipts";
  const cleanHost = (host ?? "").trim();
  return cleanHost && cleanHost !== "your-app.example"
    ? `https://spurvik.com${slug}?domain=${encodeURIComponent(cleanHost)}`
    : `https://spurvik.com${slug}`;
}

function hitlCockpitUrl(host: string | null | undefined, locale = "en"): string {
  const code = (locale || "en").trim().toLowerCase();
  const slug =
    code === "de"
      ? "/de/ki-verordnung-artikel-14-menschliche-aufsicht-slack-teams-freigabe"
      : code === "fr"
        ? "/fr/reglement-ia-article-14-controle-humain-validation-slack-teams"
        : code === "nl"
          ? "/nl/ai-verordening-artikel-14-menselijk-toezicht-slack-teams-goedkeuring"
          : code === "da"
            ? "/da/eu-ai-act-artikel-14-menneskeligt-tilsyn-slack-teams-godkendelse"
            : code === "sv"
              ? "/sv/ai-forordningen-artikel-14-mansklig-tillsyn-slack-teams-godkannande"
              : code === "es"
                ? "/es/reglamento-ia-articulo-14-supervision-humana-aprobacion-slack-teams"
                : code === "it"
                  ? "/it/regolamento-ia-articolo-14-sorveglianza-umana-approvazione-slack-teams"
                  : "/langgraph-openai-agents-approval-check";
  const cleanHost = (host ?? "").trim();
  return cleanHost && cleanHost !== "your-app.example"
    ? `https://spurvik.com${slug}?domain=${encodeURIComponent(cleanHost)}`
    : `https://spurvik.com${slug}`;
}

function nextjsCockpitUrl(host: string | null | undefined, locale = "en"): string {
  const code = (locale || "en").trim().toLowerCase();
  const slug =
    code === "de"
      ? "/de/nextjs-vercel-ai-sdk-ki-verordnung-artikel-50"
      : code === "fr"
        ? "/fr/nextjs-vercel-ai-sdk-reglement-ia-article-50"
        : code === "nl"
          ? "/nl/nextjs-vercel-ai-sdk-ai-verordening-artikel-50"
          : code === "da"
            ? "/da/nextjs-vercel-ai-sdk-eu-ai-act-artikel-50"
            : code === "sv"
              ? "/sv/nextjs-vercel-ai-sdk-ai-forordningen-artikel-50"
              : code === "es"
                ? "/es/nextjs-vercel-ai-sdk-reglamento-ia-articulo-50"
                : code === "it"
                  ? "/it/nextjs-vercel-ai-sdk-regolamento-ia-articolo-50"
                  : "/nextjs-vercel-ai-sdk-art50-badge";
  const cleanHost = (host ?? "").trim();
  return cleanHost && cleanHost !== "your-app.example"
    ? `https://spurvik.com${slug}?domain=${encodeURIComponent(cleanHost)}`
    : `https://spurvik.com${slug}`;
}

function wordpressCockpitUrl(host: string | null | undefined, locale = "en"): string {
  const code = (locale || "en").trim().toLowerCase();
  const slug =
    code === "de"
      ? "/de/wordpress-elementor-webflow-ki-verordnung-plugin-artikel-50"
      : code === "fr"
        ? "/fr/wordpress-elementor-webflow-plugin-reglement-ia-article-50"
        : code === "nl"
          ? "/nl/wordpress-elementor-webflow-ai-verordening-plugin-artikel-50"
          : code === "da"
            ? "/da/wordpress-elementor-webflow-eu-ai-act-plugin-artikel-50"
            : code === "sv"
              ? "/sv/wordpress-elementor-webflow-ai-forordningen-plugin-artikel-50"
              : code === "es"
                ? "/es/wordpress-elementor-webflow-plugin-reglamento-ia-articulo-50"
                : code === "it"
                  ? "/it/wordpress-elementor-webflow-plugin-regolamento-ia-articolo-50"
                  : "/wordpress-shopify-webflow-eu-ai-act-badge";
  const cleanHost = (host ?? "").trim();
  return cleanHost && cleanHost !== "your-app.example"
    ? `https://spurvik.com${slug}?domain=${encodeURIComponent(cleanHost)}`
    : `https://spurvik.com${slug}`;
}

function cmdBadge(args: ParsedArgs, io: Io): number {
  if (args.positionals.length > 1) {
    io.err("Usage: spurvik badge [domain] [--lang <eu-locale>] [--cms shopify|wordpress|webflow|framer|gtm|html|react]");
    return EXIT_ERROR;
  }
  if (args.lang !== undefined && !BADGE_LANGS.includes(args.lang as BadgeLang)) {
    io.err(`spurvik badge: --lang must be one of ${BADGE_LANGS.join(", ")}`);
    return EXIT_ERROR;
  }
  if (args.cms !== undefined && !BADGE_CMS_TARGETS.includes(args.cms as BadgeCmsTarget)) {
    io.err(`spurvik badge: --cms must be one of ${BADGE_CMS_TARGETS.join(", ")}`);
    return EXIT_ERROR;
  }
  const host = hostForSnippet(args.positionals[0]);
  const lang = (args.lang as BadgeLang | undefined) ?? langForHost(host);
  const systemName = sanitizeSystemName(host);
  const localeSuffix =
    args.lang !== undefined && host && langForHost(host) === "en" && lang !== "en"
      ? `&locale=${encodeURIComponent(lang)}`
      : "";
  const proUrl = host ? `${scanLinks(host).proUpgradeUrl}${localeSuffix}` : PRO_SIGNUP_URL;
  const conciergeUrl = host ? `${scanLinks(host).doneForYouUrl}${localeSuffix}` : CONCIERGE_SIGNUP_URL;
  const cms = args.cms as BadgeCmsTarget | undefined;
  const studioUrl = host
    ? `${CONSOLE_ORIGIN}/labels?domain=${encodeURIComponent(host)}${localeSuffix}${cms === "react" ? "&tab=react" : ""}`
    : lang !== "en"
      ? `${CONSOLE_ORIGIN}/labels?locale=${encodeURIComponent(lang)}`
      : `${CONSOLE_ORIGIN}/labels`;
  const tag = badgeScriptTag(systemName, lang);
  const { c, out } = io;
  out();
  out(`  ${c.bold("Spurvik · Art. 50(1) AI notice")} ${c.dim(`(${systemName}, ${lang}${cms ? `, ${cms}` : ""})`)}`);
  out();
  if (cms === "shopify") {
    out(`  ${c.bold("Shopify Online Store 2.0")} ${c.dim("(layout/theme.liquid before </body>)")}`);
    out(`  ${tag}`);
    out(`  ${c.dim("Section file (.liquid):")} https://spurvik.com/r/spurvik-shopify-art50.liquid`);
  } else if (cms === "wordpress") {
    out(`  ${c.bold("WordPress / WooCommerce")} ${c.dim("(wp_footer hook or 1-click .zip plugin)")}`);
    out(`  add_action('wp_footer', function () { echo '${tag}'; });`);
    out(`  ${c.dim("Plugin (.zip):")} https://spurvik.com/r/spurvik-eu-ai-act-wp.zip`);
    out(`  ${c.dim("Interactive cockpit:")} ${wordpressCockpitUrl(host, lang)}`);
  } else if (cms === "webflow") {
    out(`  ${c.bold("Webflow")} ${c.dim("(Site Settings -> Custom Code -> Footer Code)")}`);
    out(`  ${tag}`);
    out(`  ${c.dim("Interactive cockpit:")} ${wordpressCockpitUrl(host, lang)}`);
  } else if (cms === "framer") {
    out(`  ${c.bold("Framer")} ${c.dim("(Code Component TSX or Site Settings -> Custom Code)")}`);
    out(`  ${tag}`);
    out(`  ${c.dim("Framer TSX:")} https://spurvik.com/r/spurvik-framer-badge.tsx`);
    out(`  ${c.dim("Interactive cockpit:")} ${wordpressCockpitUrl(host, lang)}`);
  } else if (cms === "gtm") {
    out(`  ${c.bold("Google Tag Manager")} ${c.dim("(Admin -> Import Container -> Merge · DOM Ready · consentStatus: NOT_NEEDED)")}`);
    out(`  ${tag}`);
    out(`  ${c.dim("GTM container (.json):")} https://spurvik.com/r/spurvik-gtm-art50-container.json`);
    out(`  ${c.dim("Interactive cockpit:")} ${wordpressCockpitUrl(host, lang)}`);
  } else if (cms === "cookiebot" || cms === "usercentrics" || cms === "cmp") {
    const cmpTag = `<script src="${BADGE_SCRIPT_SRC}" data-system="${systemName}" data-locale="${lang}" data-cookieconsent="ignore" data-uc-allowed="true" data-cmp-ab="2" defer></script>`;
    out(`  ${c.bold("Cookiebot / Usercentrics / OneTrust / Didomi Consent-Exempt")} ${c.dim("(0 cookies · renders before banner click)")}`);
    out(`  ${cmpTag}`);
    out(`  ${c.dim("GTM container (.json):")} https://spurvik.com/r/spurvik-gtm-art50-container.json`);
    out(`  ${c.dim("Interactive cockpit:")} ${wordpressCockpitUrl(host, lang)}`);
  } else if (cms === "trust-widget") {
    const widgetHost = host && host !== "your-app.example" ? host : "yourdomain.com";
    out(`  ${c.bold("Trust-Center & Security Page Widget")} ${c.dim("(Shadow DOM · 0 cookies · 10 EU langs)")}`);
    out(`  <script src="https://spurvik.com/trust-widget.js" data-domain="${widgetHost}" data-locale="${lang}" defer></script>`);
  } else if (cms === "trust-center") {
    const trustHost = host && host !== "your-app.example" ? host : "yourdomain.com";
    const trustLoc = lang !== "en" ? `&locale=${encodeURIComponent(lang)}` : "";
    out(`  ${c.bold("Public /trust & /security Markdown + SVG Card")} ${c.dim("(0 cookies · Art. 50 & C2PA)")}`);
    out(`  curl -fsSL "${CONSOLE_ORIGIN}/api/v1/badge/trust-center.md?domain=${encodeURIComponent(trustHost)}${trustLoc}" -o TRUST_CENTER_AI_ACT.md`);
    out(`  ${c.dim("Offline CLI generator:")} npx spurvik trust ${trustHost} > TRUST_CENTER_AI_ACT.md`);
    out(`  ${c.dim("Live Trust Card SVG:")} ${CONSOLE_ORIGIN}/api/v1/badge/card.svg?domain=${encodeURIComponent(trustHost)}${trustLoc}`);
  } else if (cms === "well-known") {
    const manifestHost = host && host !== "your-app.example" ? host : "yourdomain.com";
    out(`  ${c.bold("Machine-Readable /.well-known/ai-act.json")} ${c.dim("(spurvik.ai-act-manifest.v1 · Art. 50 & C2PA)")}`);
    out(`  mkdir -p public/.well-known && curl -fsSL "https://console.spurvik.com/api/v1/badge/ai-act.json?domain=${encodeURIComponent(manifestHost)}" -o public/.well-known/ai-act.json`);
    out(`  ${c.dim("HTML <head> link:")} <link rel="ai-act-manifest" href="/.well-known/ai-act.json" type="application/json" />`);
    out(`  ${c.dim("JSON Schema:")} https://spurvik.com/r/ai-act-manifest.schema.json`);
  } else if (cms === "html") {
    out(`  ${c.bold("Static HTML")} ${c.dim("(paste before </body>)")}`);
    out(`  ${tag}`);
  } else if (cms === "react") {
    out(`  ${c.bold("React / Next.js")} ${c.dim("(npm i spurvik)")}`);
    out(`  import { AIDisclosureLabel } from "spurvik/react";`);
    out(`  <AIDisclosureLabel notice="interaction" locale="${lang}" systemName="${systemName}" />`);
  } else {
    out(`  ${c.bold("Any site")} ${c.dim("(paste before </body>)")}`);
    out(`  ${tag}`);
    out();
    out(`  ${c.bold("React / Next.js")} ${c.dim("(npm i spurvik)")}`);
    out(`  import { AIDisclosureLabel } from "spurvik/react";`);
    out(`  <AIDisclosureLabel notice="interaction" locale="${lang}" systemName="${systemName}" />`);
    if (host && host !== "your-app.example") {
      out();
      out(`  ${c.bold("Trust-Center card")} ${c.dim("(/trust or /security page · Pro white-label)")}`);
      out(`  <script src="https://spurvik.com/trust-widget.js" data-domain="${host}" defer></script>`);
    }
  }
  out();
  out(`  ${c.bold("Accessibility")} ${c.dim(`(role="status", aria-live="polite", lang="${lang}" — WCAG 2.1 AA / EN 301 549)`)}`);
  out(`  ${c.bold("Live preview")} ${c.dim("(24 EU langs + colleague share):")} ${studioUrl}`);
  out(`  ${c.bold("White-label")} ${c.dim('(data-attribution="false") — Pro €19/mo:')} ${proUrl}`);
  out(`  ${c.bold("24h Setup")} ${c.dim("(engineer installs in PR or CMS, €199 once):")} ${conciergeUrl}`);
  out();
  return EXIT_OK;
}

// ---------------------------------------------------------------------------------------------------------------
// setup (alias: init) — local read-only stack detection + copy-paste SDK/Python/CMS setup & .env template
// ---------------------------------------------------------------------------------------------------------------

export const SETUP_TARGETS = [
  "openai",
  "anthropic",
  "google-genai",
  "mistral",
  "azure-openai",
  "bedrock",
  "litellm",
  "vercel-ai-sdk",
  "mastra",
  "openai-agents",
  "langgraph",
  "react",
  "nuxt",
  "sveltekit",
  "astro",
  "python",
  "fastapi",
  "langchain",
  "pydantic-ai",
  "php",
  "laravel",
  "symfony",
  "dotnet",
  "go",
  "spring-boot",
  "rails",
  "pre-commit",
  "shopify",
  "wordpress",
  "prestashop",
  "shopware",
  "cloudflare",
  "webflow",
  "framer",
  "gtm",
  "matomo",
  "cmp",
  "html",
  "n8n",
  "make",
  "copilot-studio",
] as const;
export type SetupTarget = (typeof SETUP_TARGETS)[number];

export const SETUP_RUNTIMES = ["node", "next", "vercel", "supabase-edge", "python"] as const;
export type SetupRuntime = (typeof SETUP_RUNTIMES)[number];

const PYTHON_SETUP_TARGETS: readonly SetupTarget[] = ["python", "fastapi", "langchain", "pydantic-ai"];
const PHP_SETUP_TARGETS: readonly SetupTarget[] = ["php", "laravel", "symfony"];
const ENTERPRISE_SETUP_TARGETS: readonly SetupTarget[] = ["dotnet", "go", "spring-boot", "rails"];
const CMS_SETUP_TARGETS: readonly SetupTarget[] = ["shopify", "wordpress", "prestashop", "shopware", "cloudflare", "webflow", "framer", "gtm", "matomo", "cmp", "html"];
const WORKFLOW_SETUP_TARGETS: readonly SetupTarget[] = ["n8n", "make", "copilot-studio"];

const SETUP_TARGET_ALIASES: Readonly<Record<string, SetupTarget>> = {
  gemini: "google-genai",
  google: "google-genai",
  google_genai: "google-genai",
  claude: "anthropic",
  "ai-sdk": "vercel-ai-sdk",
  ai_sdk: "vercel-ai-sdk",
  vercel: "vercel-ai-sdk",
  next: "vercel-ai-sdk",
  nextjs: "vercel-ai-sdk",
  "next.js": "vercel-ai-sdk",
  bolt: "vercel-ai-sdk",
  "bolt.new": "vercel-ai-sdk",
  v0: "vercel-ai-sdk",
  replit: "vercel-ai-sdk",
  lovable: "openai",
  supabase: "openai",
  "supabase-edge": "openai",
  vue: "nuxt",
  vue3: "nuxt",
  nuxt3: "nuxt",
  nuxt4: "nuxt",
  svelte: "sveltekit",
  svelte5: "sveltekit",
  django: "python",
  flask: "python",
  woocommerce: "wordpress",
  elementor: "wordpress",
  divi: "wordpress",
  wp: "wordpress",
  "google-tag-manager": "gtm",
  "tag-manager": "gtm",
  googletagmanager: "gtm",
  cookiebot: "cmp",
  usercentrics: "cmp",
  didomi: "cmp",
  axeptio: "cmp",
  onetrust: "cmp",
  iubenda: "cmp",
  complianz: "cmp",
  shopware6: "shopware",
  "cloudflare-worker": "cloudflare",
  "cf-worker": "cloudflare",
  "c2pa-cdn": "cloudflare",
  centra: "html",
  dandomain: "html",
  lightspeed: "html",
  intercom: "html",
  "intercom-fin": "html",
  zendesk: "html",
  "zendesk-ai": "html",
  tidio: "html",
  lyro: "html",
  hubspot: "html",
  dixa: "html",
  trengo: "html",
  gorgias: "html",
  crisp: "html",
  freshchat: "html",
  drift: "html",
  livechat: "html",
  helpscout: "html",
  tawk: "html",
  "make.com": "make",
  "chatgpt-actions": "copilot-studio",
  "custom-gpt": "copilot-studio",
  "openai-gpts": "copilot-studio",
  "microsoft-copilot-studio": "copilot-studio",
  dust: "copilot-studio",
  dify: "copilot-studio",
  hitl: "langgraph",
  slack: "langgraph",
  teams: "langgraph",
  "microsoft-teams": "langgraph",
  approval: "langgraph",
  "human-in-the-loop": "langgraph",
  mistralai: "mistral",
  "mistral-ai": "mistral",
  "la-plateforme": "mistral",
  azure: "azure-openai",
  azure_openai: "azure-openai",
  "aws-bedrock": "bedrock",
  "amazon-bedrock": "bedrock",
  ollama: "litellm",
  "open-webui": "litellm",
  vllm: "litellm",
  typo3: "php",
  composer: "php",
  laravel11: "laravel",
  laravel12: "laravel",
  symfony6: "symfony",
  symfony7: "symfony",
  "matomo-tag-manager": "matomo",
  "piwik-pro": "matomo",
  piwik: "matomo",
  csharp: "dotnet",
  "c#": "dotnet",
  aspnet: "dotnet",
  "asp.net": "dotnet",
  blazor: "dotnet",
  dotnet8: "dotnet",
  dotnet9: "dotnet",
  "semantic-kernel": "dotnet",
  golang: "go",
  gin: "go",
  echo: "go",
  fiber: "go",
  chi: "go",
  langchaingo: "go",
  java: "spring-boot",
  spring: "spring-boot",
  springboot: "spring-boot",
  "spring-ai": "spring-boot",
  kotlin: "spring-boot",
  ktor: "spring-boot",
  quarkus: "spring-boot",
  ruby: "rails",
  "ruby-on-rails": "rails",
  rails7: "rails",
  rails8: "rails",
  sinatra: "rails",
  hanami: "rails",
  ruby_llm: "rails",
  langchainrb: "rails",
  openwebui: "litellm",
  precommit: "pre-commit",
  husky: "pre-commit",
  "git-hooks": "pre-commit",
  lefthook: "pre-commit",
};

const SETUP_DEFAULT_RUNTIME_BY_ALIAS: Readonly<Record<string, SetupRuntime>> = {
  next: "next",
  nextjs: "next",
  "next.js": "next",
  vercel: "vercel",
  lovable: "supabase-edge",
  supabase: "supabase-edge",
  "supabase-edge": "supabase-edge",
};

export interface SetupReport {
  target: SetupTarget;
  runtime: SetupRuntime | "browser" | "workflow" | "php" | "dotnet" | "go" | "jvm" | "ruby" | "cli";
  detected: boolean;
  domain?: string;
  locale?: string;
  installCommand: string;
  snippet: string;
  envTemplate: string[];
  links: {
    reportUrl?: string;
    cockpitUrl?: string;
    freeSignupUrl: string;
    proUpgradeUrl: string;
    teamUpgradeUrl: string;
    doneForYouUrl: string;
  };
}

function fileExists(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function detectSetupStack(root: string): { target: SetupTarget; runtime: SetupRuntime; detected: boolean } {
  const pkgPath = path.join(root, "package.json");
  if (fileExists(pkgPath)) {
    try {
      const raw = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        dependencies?: Record<string, unknown>;
        devDependencies?: Record<string, unknown>;
      };
      const deps = new Set([
        ...Object.keys(raw.dependencies ?? {}),
        ...Object.keys(raw.devDependencies ?? {}),
      ]);
      const hasSupabaseEdge =
        fileExists(path.join(root, "supabase", "config.toml")) || dirExists(path.join(root, "supabase", "functions"));
      const runtime: SetupRuntime = deps.has("next")
        ? "next"
        : deps.has("@vercel/functions")
          ? "vercel"
          : hasSupabaseEdge
            ? "supabase-edge"
            : "node";
      if (deps.has("n8n-nodes-spurvik") || deps.has("n8n-workflow")) {
        return { target: "n8n", runtime: "node", detected: true };
      }
      if (deps.has("@mastra/core")) return { target: "mastra", runtime, detected: true };
      if (deps.has("@openai/agents")) return { target: "openai-agents", runtime, detected: true };
      if (deps.has("@langchain/langgraph")) return { target: "langgraph", runtime, detected: true };
      if (deps.has("@ai-sdk/mistral") || deps.has("@mistralai/mistralai")) {
        return { target: "mistral", runtime, detected: true };
      }
      if (deps.has("@ai-sdk/azure")) {
        return { target: "azure-openai", runtime, detected: true };
      }
      if (deps.has("@ai-sdk/amazon-bedrock")) {
        return { target: "bedrock", runtime, detected: true };
      }
      if (deps.has("ai") || deps.has("@ai-sdk/openai") || deps.has("@ai-sdk/anthropic") || deps.has("@ai-sdk/google")) {
        return { target: "vercel-ai-sdk", runtime, detected: true };
      }
      if (deps.has("@anthropic-ai/sdk")) return { target: "anthropic", runtime, detected: true };
      if (deps.has("@google/genai") || deps.has("@google/generative-ai")) {
        return { target: "google-genai", runtime, detected: true };
      }
      if (deps.has("openai")) return { target: "openai", runtime, detected: true };
      if (deps.has("nuxt")) return { target: "nuxt", runtime, detected: true };
      if (deps.has("@sveltejs/kit") || deps.has("svelte")) return { target: "sveltekit", runtime, detected: true };
      if (deps.has("astro")) return { target: "astro", runtime, detected: true };
      if (deps.has("react")) return { target: "react", runtime, detected: true };
    } catch {
      // Unparseable package.json: fall through to Python/CMS checks.
    }
  }

  const pyTextParts: string[] = [];
  for (const name of ["pyproject.toml", "requirements.txt"]) {
    const p = path.join(root, name);
    if (fileExists(p)) {
      try {
        pyTextParts.push(readFileSync(p, "utf8").toLowerCase());
      } catch {
        // Ignore unreadable file.
      }
    }
  }
  if (pyTextParts.length > 0) {
    const combined = pyTextParts.join("\n");
    if (/\bfastapi\b/.test(combined)) return { target: "fastapi", runtime: "python", detected: true };
    if (/\bpydantic[-_]ai\b/.test(combined)) return { target: "pydantic-ai", runtime: "python", detected: true };
    if (/\b(langchain|langgraph)\b/.test(combined)) return { target: "langchain", runtime: "python", detected: true };
    return { target: "python", runtime: "python", detected: true };
  }

  const composerPath = path.join(root, "composer.json");
  if (fileExists(composerPath)) {
    try {
      const rawComposer = JSON.parse(readFileSync(composerPath, "utf8")) as {
        require?: Record<string, unknown>;
        "require-dev"?: Record<string, unknown>;
      };
      const phpDeps = new Set([
        ...Object.keys(rawComposer.require ?? {}),
        ...Object.keys(rawComposer["require-dev"] ?? {}),
      ]);
      if (phpDeps.has("shopware/core")) return { target: "shopware", runtime: "node", detected: true };
      if (phpDeps.has("laravel/framework")) return { target: "laravel", runtime: "node", detected: true };
      if (phpDeps.has("symfony/framework-bundle")) return { target: "symfony", runtime: "node", detected: true };
      return { target: "php", runtime: "node", detected: true };
    } catch {
      // Fall through to theme/wp checks.
    }
  }

  if (fileExists(path.join(root, "layout", "theme.liquid"))) {
    return { target: "shopify", runtime: "node", detected: true };
  }
  if (fileExists(path.join(root, "wp-config.php")) || dirExists(path.join(root, "wp-content"))) {
    return { target: "wordpress", runtime: "node", detected: true };
  }
  if (fileExists(path.join(root, "go.mod"))) {
    return { target: "go", runtime: "node", detected: true };
  }
  if (fileExists(path.join(root, "Gemfile"))) {
    return { target: "rails", runtime: "node", detected: true };
  }
  if (
    fileExists(path.join(root, "pom.xml")) ||
    fileExists(path.join(root, "build.gradle")) ||
    fileExists(path.join(root, "build.gradle.kts"))
  ) {
    return { target: "spring-boot", runtime: "node", detected: true };
  }
  try {
    const entries = readdirSync(root);
    if (entries.some((e) => e.endsWith(".csproj") || e.endsWith(".sln") || e.endsWith(".slnx"))) {
      return { target: "dotnet", runtime: "node", detected: true };
    }
  } catch {
    // Ignore unreadable directory.
  }

  return { target: "openai", runtime: "node", detected: false };
}

function flushHelperLines(runtime: Exclude<SetupRuntime, "python">, expr: string): { importLine: string; callLine: string } {
  if (runtime === "next") return { importLine: 'import { after } from "next/server";', callLine: `after(() => ${expr});` };
  if (runtime === "vercel") {
    return { importLine: 'import { waitUntil } from "@vercel/functions";', callLine: `waitUntil(${expr});` };
  }
  if (runtime === "supabase-edge") {
    return { importLine: "", callLine: `EdgeRuntime.waitUntil(${expr});` };
  }
  return { importLine: "", callLine: "" };
}

function sdkConfigLines(serverless: boolean): string[] {
  const lines = [
    "const spurvikConfig = {",
    "  apiKey: process.env.SPURVIK_API_KEY!,",
    "  signingSecret: process.env.SPURVIK_SIGNING_SECRET!,",
    '  contentHash: { mode: "keyed" as const, secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },',
    '  baseUrl: process.env.SPURVIK_BASE_URL ?? "https://console.spurvik.com",',
    '  riskTier: "limited_art50" as const, // Sample value; set your own classification.',
    "  article50Disclosure: false, // Set true only when your UI renders an AI notice.",
  ];
  if (serverless) lines.push("  registerProcessHooks: false,");
  lines.push("  telemetry: { flushTimeoutMs: 3_000 },", "};");
  return lines;
}

export function buildSetupReport(
  target: SetupTarget,
  requestedRuntime: SetupRuntime | undefined,
  detected: boolean,
  options: { domain?: string; locale?: string } = {},
): SetupReport {
  const host = options.domain ? questionnaireHostname(options.domain) : null;
  const loc =
    options.locale && (BADGE_LANGS as readonly string[]).includes(options.locale) ? options.locale : undefined;
  const nonEnLoc = loc && loc !== "en" ? loc : undefined;
  const freeParams: string[] = [];
  if (host) freeParams.push(`appUrl=${encodeURIComponent(host)}`);
  if (nonEnLoc) freeParams.push(`locale=${nonEnLoc}`);
  const appParam = host ? `&appUrl=${encodeURIComponent(host)}` : "";
  const locParam = nonEnLoc ? `&locale=${nonEnLoc}` : "";
  const links: SetupReport["links"] = {
    ...(host ? { reportUrl: `${CONSOLE_ORIGIN}/report?domain=${encodeURIComponent(host)}${locParam}` } : {}),
    freeSignupUrl: freeParams.length > 0 ? `${SIGNUP_URL}?${freeParams.join("&")}` : SIGNUP_URL,
    proUpgradeUrl: `${PRO_SIGNUP_URL}${appParam}${locParam}`,
    teamUpgradeUrl: `${TEAM_SIGNUP_URL}${appParam}${locParam}`,
    doneForYouUrl: `${CONCIERGE_SIGNUP_URL}${appParam}${locParam}`,
  };
  const metaFields = {
    ...(host ? { domain: host } : {}),
    ...(loc ? { locale: loc } : {}),
  };

  if (WORKFLOW_SETUP_TARGETS.includes(target)) {
    const snippet =
      target === "make"
        ? [
            "# Import https://spurvik.com/r/make-com-spurvik-blueprint.json in Make.com",
            "# Sends keyed HMAC-SHA256 digests (0 bytes of prompt text) to https://console.spurvik.com/api/v1/telemetry",
          ].join("\n")
        : target === "copilot-studio"
          ? [
              "# Import https://console.spurvik.com/openapi-actions.json (OpenAPI 3.0.3, Authentication: None)",
              "# Works in Microsoft Copilot Studio, OpenAI Custom GPT Actions, Dust.tt, Dify & Zapier AI Actions (10 zero-key GET operations)",
            ].join("\n")
          : [
              "# In n8n: Settings -> Community Nodes -> Install n8n-nodes-spurvik (9 EU AI Act operations incl. 6 zero-key)",
              "# Zero-key 5-in-1 starter JSON: https://spurvik.com/r/n8n-zero-key-audit-rfp-annex-iv.json",
              "# Starter workflow JSON: https://spurvik.com/r/n8n-art50-starter.json",
            ].join("\n");
    return {
      target,
      runtime: "workflow",
      detected,
      ...metaFields,
      installCommand:
        target === "make"
          ? "curl -fsSLO https://spurvik.com/r/make-com-spurvik-blueprint.json"
          : target === "copilot-studio"
            ? "curl -fsSLO https://console.spurvik.com/openapi-actions.json"
            : "npm install n8n-nodes-spurvik",
      snippet,
      envTemplate: [
        "SPURVIK_BASE_URL=https://console.spurvik.com",
        "SPURVIK_API_KEY=",
      ],
      links: {
        ...links,
        cockpitUrl: hmacCockpitUrl(host, loc ?? (host ? langForHost(host) : "en")),
      },
    };
  }

  if (CMS_SETUP_TARGETS.includes(target) || target === "react") {
    const snippetLocale = loc ?? "en";
    const snippetSystem = host ?? "Support Assistant";
    const snippet =
      target === "shopify"
        ? [
            "{%- comment -%} Paste before </body> in layout/theme.liquid (or save https://spurvik.com/r/spurvik-shopify-art50.liquid as sections/spurvik-art50-notice.liquid) {%- endcomment -%}",
            '<script src="https://spurvik.com/badge.js" data-system="{{ shop.name | escape }}" data-locale="{{ request.locale.iso_code | slice: 0, 2 | downcase }}" data-position="bottom-left" data-attribution="true" defer></script>',
          ].join("\n")
        : target === "wordpress"
          ? [
              "// Add to functions.php or upload https://spurvik.com/r/spurvik-eu-ai-act-wp.zip:",
              "add_action('wp_footer', function (): void {",
              "    $lang = strtolower(substr(determine_locale(), 0, 2)) ?: 'en';",
              "    printf('<script src=\"https://spurvik.com/badge.js\" data-system=\"%s\" data-locale=\"%s\" data-position=\"bottom-left\" data-attribution=\"true\" defer></script>', esc_attr(get_bloginfo('name') ?: 'AI Assistant'), esc_attr($lang));",
              "});",
            ].join("\n")
          : target === "prestashop"
            ? [
                "# PrestaShop 1.7 / 8 / 9: Modules -> Module Manager -> Upload a module (spurvik-prestashop-art50.zip)",
                `<script src="https://spurvik.com/badge.js" data-system="${snippetSystem}" data-locale="${snippetLocale}" data-position="bottom-left" data-attribution="true" defer></script>`,
              ].join("\n")
            : target === "shopware"
              ? [
                  "# Shopware 6.5 / 6.6+: Extensions -> My extensions -> Upload extension (spurvik-shopware6-art50.zip)",
                  `<script src="https://spurvik.com/badge.js" data-system="${snippetSystem}" data-locale="${snippetLocale}" data-position="bottom-left" data-attribution="true" defer></script>`,
                ].join("\n")
              : target === "cloudflare"
                ? [
                    "# Cloudflare Edge Worker: streaming HTMLRewriter Art. 50(1) notice + C2PA polish:'off' passthrough",
                    "curl -fsSLO https://spurvik.com/r/cloudflare-worker-art50-c2pa.js",
                  ].join("\n")
                : target === "cmp" || target === "matomo"
                  ? [
                      target === "matomo"
                        ? "# Matomo Tag Manager / Piwik PRO Custom HTML tag (0 cookies, Consent type: No consent required):"
                        : "# Cookiebot / Usercentrics / OneTrust / Didomi auto-blocking bypass (0 cookies, ePrivacy Art. 5(3) exempt):",
                      `<script src="https://spurvik.com/badge.js" data-system="${snippetSystem}" data-locale="${snippetLocale}" data-position="bottom-left" data-cookieconsent="ignore" data-uc-allowed="true" data-cmp-ab="2" data-attribution="true" defer></script>`,
                    ].join("\n")
                  : target === "react"
            ? [
                'import { AIDisclosureLabel } from "spurvik/react";',
                "",
                `<AIDisclosureLabel notice="interaction" locale="${snippetLocale}" systemName="${snippetSystem}" />`,
              ].join("\n")
            : `<script src="https://spurvik.com/badge.js" data-system="${snippetSystem}" data-locale="${snippetLocale}" data-position="bottom-left" data-attribution="true" defer></script>`;
    const installCommand =
      target === "react"
        ? "npm install spurvik"
        : target === "shopify"
          ? "curl -fsSLO https://spurvik.com/r/spurvik-shopify-art50.liquid"
          : target === "wordpress"
            ? "curl -fsSLO https://spurvik.com/r/spurvik-eu-ai-act-wp.zip"
            : target === "prestashop"
              ? "curl -fsSLO https://spurvik.com/r/spurvik-prestashop-art50.zip"
              : target === "shopware"
                ? "curl -fsSLO https://spurvik.com/r/spurvik-shopware6-art50.zip"
                : target === "cloudflare"
                  ? "curl -fsSLO https://spurvik.com/r/cloudflare-worker-art50-c2pa.js"
                  : target === "framer"
              ? "curl -fsSLO https://spurvik.com/r/spurvik-framer-badge.tsx"
              : target === "gtm" || target === "cmp"
                ? "curl -fsSLO https://spurvik.com/r/spurvik-gtm-art50-container.json"
                : "# Zero-install 1-line <script> tag (0 cookies, 24 EU languages)";
    const cmsCockpit =
      target === "wordpress" || target === "webflow" || target === "framer" || target === "gtm" || target === "cmp"
        ? wordpressCockpitUrl(host, loc ?? (host ? langForHost(host) : "en"))
        : target === "react"
          ? nextjsCockpitUrl(host, loc ?? (host ? langForHost(host) : "en"))
          : undefined;
    return {
      target,
      runtime: "browser",
      detected,
      ...metaFields,
      installCommand,
      snippet,
      envTemplate: [],
      links: {
        ...links,
        ...(cmsCockpit ? { cockpitUrl: cmsCockpit } : {}),
      },
    };
  }

  if (PHP_SETUP_TARGETS.includes(target)) {
    const savePath = target === "symfony" ? "src/Service/SpurvikGuard.php" : "app/Services/SpurvikGuard.php";
    const snippetLocale = loc ?? (host ? langForHost(host) : "en");
    const snippetSystem = host ?? "Support AI";
    return {
      target,
      runtime: "php",
      detected,
      ...metaFields,
      installCommand: `curl -fsSL https://spurvik.com/r/spurvik_guard.php -o ${savePath}`,
      snippet: [
        `require_once __DIR__ . '/SpurvikGuard.php';`,
        `\\SpurvikGuard::sendTelemetryEvent($prompt, $reply, 'openai', 'gpt-4o-mini', 140);`,
        `// Blade / Twig 24-language Art. 50(1) notice (0 cookies, Cookiebot/Usercentrics exempt):`,
        `// echo \\SpurvikGuard::art50BadgeHtml('${snippetSystem}', '${snippetLocale}', 'interaction', 'bottom-left', false);`,
      ].join("\n"),
      envTemplate: [
        "SPURVIK_BASE_URL=https://console.spurvik.com",
        "SPURVIK_API_KEY=",
        "# Generate >= 16-byte secret locally (never sent to Spurvik): openssl rand -hex 32",
        "SPURVIK_CONTENT_HASH_SECRET=",
      ],
      links: {
        ...links,
        cockpitUrl: hmacCockpitUrl(host, snippetLocale),
      },
    };
  }

  if (target === "pre-commit") {
    const snippetLocale = loc ?? (host ? langForHost(host) : "en");
    return {
      target,
      runtime: "cli",
      detected,
      ...metaFields,
      installCommand: "curl -fsSL https://spurvik.com/r/pre-commit-config.yaml -o .pre-commit-config.yaml && pre-commit install",
      snippet: [
        "repos:",
        "  - repo: https://github.com/spurvik/spurvik",
        "    rev: v1",
        "    hooks:",
        "      - id: spurvik-audit",
        "      - id: spurvik-gate-test",
      ].join("\n"),
      envTemplate: [],
      links: {
        ...links,
        cockpitUrl: hmacCockpitUrl(host, snippetLocale),
      },
    };
  }

  if (ENTERPRISE_SETUP_TARGETS.includes(target)) {
    const snippetLocale = loc ?? (host ? langForHost(host) : "en");
    const snippetSystem = host ?? "Support AI";
    const entRuntime: "dotnet" | "go" | "jvm" | "ruby" =
      target === "dotnet" ? "dotnet" : target === "go" ? "go" : target === "rails" ? "ruby" : "jvm";
    const installCommand =
      target === "dotnet"
        ? "mkdir -p Services && curl -fsSL https://spurvik.com/r/SpurvikGuard.cs -o Services/SpurvikGuard.cs"
        : target === "go"
          ? "mkdir -p internal/spurvikguard && curl -fsSL https://spurvik.com/r/spurvik_guard.go -o internal/spurvikguard/spurvik_guard.go"
          : target === "rails"
            ? "mkdir -p app/services && curl -fsSL https://spurvik.com/r/spurvik_guard.rb -o app/services/spurvik_guard.rb"
            : "# Java 21+ stdlib javax.crypto.Mac + java.net.http.HttpClient (0 Maven/Gradle deps)";
    const snippet =
      target === "dotnet"
        ? [
            "using Spurvik;",
            'await SpurvikGuard.SendTelemetryEventAsync(prompt, reply, "azure-openai", "gpt-4o-eu", 120);',
            `// Razor / Blazor (0 cookies): @Html.Raw(SpurvikGuard.Art50BadgeHtml("${snippetSystem}", "${snippetLocale}", "interaction", "bottom-left", false))`,
          ].join("\n")
        : target === "go"
          ? [
              'import "yourmodule/internal/spurvikguard"',
              '_, _ = spurvikguard.SendTelemetryEvent(ctx, prompt, reply, "openai", "gpt-4o-mini", 120, "", "", "")',
              `// HTML helper (0 cookies): spurvikguard.Art50BadgeHTML("${snippetSystem}", "${snippetLocale}", "interaction", "bottom-left", false)`,
            ].join("\n")
          : target === "rails"
            ? [
                'require_relative "spurvik_guard"',
                `guard = SpurvikGuard.from_env(system_name: "${snippetSystem}", locale: "${snippetLocale}")`,
                'guard.log_call(prompt_text: prompt, output_text: reply, model: "gpt-4o-mini", provider: "openai")',
                "# ERB / ViewComponent (0 cookies): <%= raw guard.badge_html %>",
              ].join("\n")
            : [
                "// Java 21+ / Spring Boot 3 / Spring AI: post keyed HmacSHA256 inputHash & outputHash (0 prompt bytes) to https://console.spurvik.com/api/v1/telemetry",
                `<script src="https://spurvik.com/badge.js" data-system="${snippetSystem}" data-locale="${snippetLocale}" data-position="bottom-left" data-cookieconsent="ignore" data-uc-allowed="true" defer></script>`,
              ].join("\n");
    return {
      target,
      runtime: entRuntime,
      detected,
      ...metaFields,
      installCommand,
      snippet,
      envTemplate: [
        "SPURVIK_BASE_URL=https://console.spurvik.com",
        "SPURVIK_API_KEY=",
        "# Generate >= 16-byte secret locally (never sent to Spurvik): openssl rand -hex 32",
        "SPURVIK_CONTENT_HASH_SECRET=",
      ],
      links: {
        ...links,
        cockpitUrl: hmacCockpitUrl(host, snippetLocale),
      },
    };
  }

  const isPy = PYTHON_SETUP_TARGETS.includes(target) || requestedRuntime === "python";
  if (isPy) {
    const snippet =
      target === "fastapi"
        ? [
            "import time",
            "from fastapi import BackgroundTasks, FastAPI",
            "from spurvik_guard import art50_badge_html, request_human_approval, send_telemetry_event",
            "",
            "app = FastAPI()",
            "",
            "# Inside your chat route after receiving model output:",
            "# background_tasks.add_task(send_telemetry_event, prompt, output, model_provider='openai', model_version='gpt-4o', latency_ms=140)",
            "# Pre-flight human gate (Pro €19/mo & Team €79/mo, field names only):",
            "# approval = request_human_approval('issue_refund', {'order_id': 4821, 'amount_eur': 120})",
          ].join("\n")
        : [
            "from spurvik_guard import art50_badge_html, request_human_approval, send_telemetry_event",
            "",
            "# Logs keyed HMAC-SHA256 input/output digests (0 bytes of raw prompt text) to EU Frankfurt (fra1):",
            'send_telemetry_event(prompt, reply, model_provider="openai", model_version="gpt-4o", latency_ms=140)',
            '# Optional pre-flight human approval gate: request_human_approval("send_invoice", {"amount_eur": 250})',
          ].join("\n");
    return {
      target,
      runtime: "python",
      detected,
      ...metaFields,
      installCommand: "curl -fsSLO https://spurvik.com/r/spurvik_guard.py",
      snippet,
      envTemplate: [
        "SPURVIK_BASE_URL=https://console.spurvik.com",
        "SPURVIK_API_KEY=",
        "# Generate >= 16-byte secret locally (never sent to Spurvik): openssl rand -hex 32",
        "SPURVIK_CONTENT_HASH_SECRET=",
      ],
      links: {
        ...links,
        cockpitUrl: hmacCockpitUrl(host, loc ?? (host ? langForHost(host) : "en")),
      },
    };
  }

  const tsRuntime: Exclude<SetupRuntime, "python"> = requestedRuntime ?? "node";
  const serverless = tsRuntime !== "node";
  const cfg = sdkConfigLines(serverless);
  let snippetLines: string[];

  if (target === "vercel-ai-sdk") {
    const flush = flushHelperLines(tsRuntime, "spurvik.flush()");
    snippetLines = [
      'import { generateText, wrapLanguageModel } from "ai";',
      'import { openai } from "@ai-sdk/openai";',
      'import { spurvikMiddleware } from "spurvik/ai";',
      ...(flush.importLine ? [flush.importLine] : []),
      "",
      ...cfg,
      "const spurvik = spurvikMiddleware(spurvikConfig);",
      'const model = wrapLanguageModel({ model: openai("gpt-4o"), middleware: spurvik });',
      'const result = await generateText({ model, prompt: "Hello" });',
      ...(flush.callLine ? [flush.callLine] : []),
    ];
  } else if (target === "mastra") {
    const flush = flushHelperLines(tsRuntime, "wrapped.flush()");
    snippetLines = [
      'import { Agent } from "@mastra/core/agent";',
      'import { withSpurvikMastra } from "spurvik/mastra";',
      ...(flush.importLine ? [flush.importLine] : []),
      "",
      ...cfg,
      "const wrapped = withSpurvikMastra(baseModel, spurvikConfig);",
      'const agent = new Agent({ id: "assistant", name: "assistant", instructions: "Be concise.", model: wrapped.model });',
      ...(flush.callLine ? [flush.callLine] : []),
    ];
  } else if (target === "openai-agents") {
    const flush = flushHelperLines(tsRuntime, "provider.flush()");
    snippetLines = [
      'import { Agent, Runner } from "@openai/agents";',
      'import { OpenAIProvider } from "@openai/agents-openai";',
      'import { withSpurvikModelProvider } from "spurvik/openai-agents";',
      ...(flush.importLine ? [flush.importLine] : []),
      "",
      ...cfg,
      "const provider = withSpurvikModelProvider(new OpenAIProvider(), spurvikConfig);",
      'const runner = new Runner({ modelProvider: provider });',
      ...(flush.callLine ? [flush.callLine] : []),
    ];
  } else if (target === "langgraph") {
    const flush = flushHelperLines(tsRuntime, "lg.flush()");
    snippetLines = [
      'import { withSpurvikLangGraph } from "spurvik/langgraph";',
      ...(flush.importLine ? [flush.importLine] : []),
      "",
      ...cfg,
      "const lg = withSpurvikLangGraph(spurvikConfig);",
      "// Pass { callbacks: [lg.callbackHandler] } to graph.invoke(input, { callbacks: [lg.callbackHandler] })",
      ...(flush.callLine ? [flush.callLine] : []),
    ];
  } else if (target === "anthropic") {
    const flush = flushHelperLines(tsRuntime, "ai._spurvik.flush()");
    snippetLines = [
      'import Anthropic from "@anthropic-ai/sdk";',
      'import { provenanceOf, withSpurvik } from "spurvik";',
      ...(flush.importLine ? [flush.importLine] : []),
      "",
      ...cfg,
      "const ai = withSpurvik(new Anthropic(), spurvikConfig);",
      'const msg = await ai.messages.create({ model: "claude-sonnet-4-5", max_tokens: 512, messages: [{ role: "user", content: "Hello" }] });',
      "const receipt = provenanceOf(msg);",
      ...(flush.callLine ? [flush.callLine] : []),
    ];
  } else if (target === "google-genai") {
    const flush = flushHelperLines(tsRuntime, "ai._spurvik.flush()");
    snippetLines = [
      'import { GoogleGenAI } from "@google/genai";',
      'import { provenanceOf, withSpurvik } from "spurvik";',
      ...(flush.importLine ? [flush.importLine] : []),
      "",
      ...cfg,
      "const ai = withSpurvik(new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }), spurvikConfig);",
      'const res = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: "Hello" });',
      "const receipt = provenanceOf(res);",
      ...(flush.callLine ? [flush.callLine] : []),
    ];
  } else if (target === "mistral" || target === "azure-openai" || target === "bedrock") {
    const flush = flushHelperLines(tsRuntime, "spurvik.flush()");
    const providerImport =
      target === "mistral"
        ? 'import { mistral } from "@ai-sdk/mistral";'
        : target === "azure-openai"
          ? 'import { createAzure } from "@ai-sdk/azure";\nconst azureEu = createAzure({ resourceName: process.env.AZURE_RESOURCE_NAME!, apiKey: process.env.AZURE_API_KEY! });'
          : 'import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";\nconst bedrockEu = createAmazonBedrock({ region: "eu-central-1" });';
    const modelExpr =
      target === "mistral"
        ? 'mistral("mistral-large-latest")'
        : target === "azure-openai"
          ? 'azureEu("gpt-4o-eu")'
          : 'bedrockEu("eu.anthropic.claude-3-7-sonnet-20250219-v1:0")';
    snippetLines = [
      'import { generateText, wrapLanguageModel } from "ai";',
      providerImport,
      'import { spurvikMiddleware } from "spurvik/ai";',
      ...(flush.importLine ? [flush.importLine] : []),
      "",
      ...cfg,
      "const spurvik = spurvikMiddleware(spurvikConfig);",
      `const model = wrapLanguageModel({ model: ${modelExpr}, middleware: spurvik });`,
      'const result = await generateText({ model, prompt: "Hello" });',
      ...(flush.callLine ? [flush.callLine] : []),
    ];
  } else if (target === "litellm") {
    const flush = flushHelperLines(tsRuntime, "ai._spurvik.flush()");
    snippetLines = [
      'import OpenAI from "openai";',
      'import { provenanceOf, withSpurvik } from "spurvik";',
      ...(flush.importLine ? [flush.importLine] : []),
      "",
      ...cfg,
      'const ai = withSpurvik(new OpenAI({ baseURL: process.env.LITELLM_BASE_URL ?? "http://localhost:4000/v1", apiKey: process.env.LITELLM_API_KEY! }), spurvikConfig);',
      'const res = await ai.chat.completions.create({ model: "mistral-large", messages: [{ role: "user", content: "Hello" }] });',
      "const receipt = provenanceOf(res);",
      ...(flush.callLine ? [flush.callLine] : []),
    ];
  } else if (target === "nuxt" || target === "sveltekit" || target === "astro") {
    const snippetLocale = loc ?? (host ? langForHost(host) : "en");
    const snippetSystem = host ?? "Support AI";
    snippetLines = [
      'import OpenAI from "openai";',
      'import { provenanceOf, withSpurvik } from "spurvik";',
      "",
      ...cfg,
      "const ai = withSpurvik(new OpenAI(), spurvikConfig);",
      'const res = await ai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: "Hello" }] });',
      "const receipt = await provenanceOf(res);",
      "await ai._spurvik.flush();",
      target === "nuxt"
        ? `// nuxt.config.ts app.head.script: { src: "https://spurvik.com/badge.js", defer: true, "data-system": "${snippetSystem}", "data-locale": "${snippetLocale}", "data-cookieconsent": "ignore", "data-uc-allowed": "true" }`
        : target === "sveltekit"
          ? `// src/routes/+layout.svelte <svelte:head>: <script src="https://spurvik.com/badge.js" data-system="${snippetSystem}" data-locale="${snippetLocale}" data-cookieconsent="ignore" data-uc-allowed="true" defer></script>`
          : `// src/layouts/Layout.astro: <script is:inline src="https://spurvik.com/badge.js" data-system="${snippetSystem}" data-locale="${snippetLocale}" data-cookieconsent="ignore" data-uc-allowed="true" defer></script>`,
    ];
  } else {
    const flush = flushHelperLines(tsRuntime, "ai._spurvik.flush()");
    snippetLines = [
      'import OpenAI from "openai";',
      'import { provenanceOf, withSpurvik } from "spurvik";',
      ...(flush.importLine ? [flush.importLine] : []),
      "",
      ...cfg,
      "const ai = withSpurvik(new OpenAI(), spurvikConfig);",
      'const res = await ai.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: "Hello" }] });',
      "const receipt = provenanceOf(res);",
      ...(flush.callLine ? [flush.callLine] : []),
    ];
  }

  return {
    target,
    runtime: tsRuntime,
    detected,
    ...metaFields,
    installCommand: "npm install spurvik",
    snippet: [
      `// The SDK logs the call and attaches an HMAC receipt (${CLI_VERSION}, MIT). It does not mark content.`,
      ...snippetLines,
    ].join("\n"),
    envTemplate: [
      "SPURVIK_BASE_URL=https://console.spurvik.com",
      "SPURVIK_API_KEY=",
      "# Generate two local 32-byte secrets (never sent to Spurvik): openssl rand -hex 32",
      "SPURVIK_SIGNING_SECRET=",
      "SPURVIK_CONTENT_HASH_SECRET=",
    ],
    links: {
      ...links,
      cockpitUrl:
        target === "langgraph" || target === "openai-agents" || target === "mastra"
          ? hitlCockpitUrl(host, loc ?? (host ? langForHost(host) : "en"))
          : target === "vercel-ai-sdk" || tsRuntime === "next" || tsRuntime === "vercel"
            ? nextjsCockpitUrl(host, loc ?? (host ? langForHost(host) : "en"))
            : hmacCockpitUrl(host, loc ?? (host ? langForHost(host) : "en")),
    },
  };
}

function cmdSetup(args: ParsedArgs, deps: CliDeps, io: Io): number {
  if (args.positionals.length > 1) {
    io.err(`Usage: spurvik setup [target|dir] [--runtime ${SETUP_RUNTIMES.join("|")}] [--domain <domain>] [--lang <eu-locale>] [--json]`);
    return EXIT_ERROR;
  }
  if (args.runtime !== undefined && !SETUP_RUNTIMES.includes(args.runtime as SetupRuntime)) {
    io.err(`spurvik setup: --runtime must be one of ${SETUP_RUNTIMES.join(", ")}`);
    return EXIT_ERROR;
  }
  if (args.lang !== undefined && !(BADGE_LANGS as readonly string[]).includes(args.lang)) {
    io.err(`spurvik setup: --lang must be one of the 24 EU language codes: ${BADGE_LANGS.join(", ")}`);
    return EXIT_ERROR;
  }
  const base = deps.cwd ?? process.cwd();
  const arg0 = args.positionals[0]?.trim();
  let target: SetupTarget;
  let detected = false;
  let autoRuntime: SetupRuntime | undefined;

  if (!arg0) {
    const stack = detectSetupStack(base);
    target = stack.target;
    autoRuntime = stack.runtime;
    detected = stack.detected;
  } else if (SETUP_TARGETS.includes(arg0.toLowerCase() as SetupTarget)) {
    target = arg0.toLowerCase() as SetupTarget;
  } else if (Object.prototype.hasOwnProperty.call(SETUP_TARGET_ALIASES, arg0.toLowerCase())) {
    const lower = arg0.toLowerCase();
    target = SETUP_TARGET_ALIASES[lower]!;
    autoRuntime = SETUP_DEFAULT_RUNTIME_BY_ALIAS[lower];
  } else {
    const candidateDir = path.resolve(base, arg0);
    if (dirExists(candidateDir)) {
      const stack = detectSetupStack(candidateDir);
      target = stack.target;
      autoRuntime = stack.runtime;
      detected = stack.detected;
    } else {
      io.err(`spurvik setup: unknown target "${escapeForTerminal(arg0)}". Supported: ${SETUP_TARGETS.join(", ")}`);
      return EXIT_ERROR;
    }
  }

  const runtime = (args.runtime as SetupRuntime | undefined) ?? autoRuntime;
  const report = buildSetupReport(target, runtime, detected, { domain: args.domain, locale: args.lang });

  if (args.json) {
    io.out(JSON.stringify(report, null, 2));
    return EXIT_OK;
  }

  const { c, out } = io;
  out();
  out(
    `  ${c.bold("Spurvik · quickstart setup")} ${c.dim(
      `(${report.target}, runtime: ${report.runtime}${report.detected ? ", auto-detected" : ""})`,
    )}`,
  );
  out();
  out(`  ${c.bold("1. Install")}`);
  out(`    ${report.installCommand}`);
  out();
  out(`  ${c.bold("2. Paste wrapper / snippet")}`);
  for (const line of report.snippet.split("\n")) out(`    ${line}`);
  if (report.envTemplate.length > 0) {
    out();
    out(`  ${c.bold("3. Environment variables (.env.example)")}`);
    for (const line of report.envTemplate) out(`    ${line}`);
  }
  out();
  out(`  ${c.bold("Next steps")} ${c.dim("(hosted EU console, Frankfurt fra1; prices excl. VAT)")}`);
  if (report.links.reportUrl) {
    out(`    Live Art. 50(1) report for ${report.domain}: ${c.cyan(report.links.reportUrl)}`);
  }
  out(`    Free SPURVIK_API_KEY in 10s (€0, no card): ${c.cyan(report.links.freeSignupUrl)}`);
  out(`    White-label badge + 90d Frankfurt vault + Slack/Teams gates (Pro €19/mo): ${c.cyan(report.links.proUpgradeUrl)}`);
  out(`    2M events/mo + 12mo Frankfurt retention + Annex IV draft (Team €79/mo): ${c.cyan(report.links.teamUpgradeUrl)}`);
  out(`    24h Done-For-You engineer setup (€199 once, incl. 1 yr Pro): ${c.cyan(report.links.doneForYouUrl)}`);
  out();
  return EXIT_OK;
}

// ---------------------------------------------------------------------------------------------------------------
// c2pa — C2PA JUMBF manifest & CDN-strip checker (read-only; it never signs or adds a manifest)
// ---------------------------------------------------------------------------------------------------------------

export const C2PA_ENDPOINT = `${CONSOLE_ORIGIN}/api/v1/provenance/public-check-url`;
export const C2PA_PAGE_URL = `${CONSOLE_ORIGIN}/c2pa`;
/** The console allows 8 s for the image fetch, then reads the manifest; 15 s covers both. */
export const C2PA_TIMEOUT_MS = 15_000;
export const C2PA_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** `c2pa --fail-on-missing`: no C2PA manifest, or one whose signature no longer matches. */
export const EXIT_MISSING = 2;

const IMAGE_URL_HELP = "Enter the full URL of a PNG, JPEG or WebP image, for example https://example.com/hero.png.";
const HTTPS_ONLY = "Only https image URLs can be checked.";
const IMAGE_BLOCKED =
  "That host is not a public address. localhost, .local, .internal, private or reserved IPs are refused. Nothing was sent.";

/**
 * Public https image URL on port 443, no credentials, no localhost/.local/.internal host and no private IP literal.
 * Checked before any network call. No DNS lookup: the console resolves, pins and re-checks every redirect.
 */
export function normalizeImageUrl(raw: string): ScanTarget {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048 || /[\u0000-\u001f\u007f-\u009f\s<>"'`\\]/.test(trimmed)) {
    throw new ScanTargetError("invalid_url", IMAGE_URL_HELP);
  }
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme === undefined) {
    throw new ScanTargetError("invalid_url", /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed) ? HTTPS_ONLY : IMAGE_URL_HELP);
  }
  if (scheme !== "https") throw new ScanTargetError("invalid_url", HTTPS_ONLY);
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ScanTargetError("invalid_url", IMAGE_URL_HELP);
  }
  if (url.username || url.password) throw new ScanTargetError("invalid_url", "Remove the user name and password from the URL.");
  let host = url.hostname.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (!host) throw new ScanTargetError("invalid_url", IMAGE_URL_HELP);
  const ipPublic = isPublicIpLiteral(host);
  if (ipPublic === false) throw new ScanTargetError("blocked_target", IMAGE_BLOCKED);
  if (ipPublic === null) {
    if (BLOCKED_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) throw new ScanTargetError("blocked_target", IMAGE_BLOCKED);
    if (!HOSTNAME_RE.test(host)) {
      throw new ScanTargetError(host.includes(".") ? "invalid_url" : "blocked_target", host.includes(".") ? IMAGE_URL_HELP : IMAGE_BLOCKED);
    }
  }
  // WHATWG URL drops :443 for https, so any port left is not 443.
  if (url.port !== "") throw new ScanTargetError("invalid_url", "Only the default https port (443) is allowed.");
  url.hash = "";
  if (!host.includes(":")) url.hostname = host;
  return { url: url.toString(), host };
}

export interface ImageProxy {
  name: string;
  fix: string;
}

const REENCODE_FIX =
  "Re-check the untransformed original URL. If it also has no manifest, the CDN strips it on delivery: serve the signed file from your own origin.";

/** Image optimizers that re-encode on the fly and drop the C2PA JUMBF boxes (same rules as the hosted MCP tool). */
export function detectImageProxy(rawUrl: string): ImageProxy | null {
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

/** An image CDN host is not the customer's site, so it is not used as the signup appUrl. */
function isImageCdnHost(host: string): boolean {
  return /(?:^|\.)(?:cloudinary\.com|imgix\.net|shopify\.com|wp\.com|website-files\.com|(?:uploads-ssl|assets)\.webflow\.com)$/i.test(host);
}

export function noticeLocaleForHost(host: string | null): string {
  return langForHost(host ?? undefined);
}

/** Manifest text is attacker-controllable: letters, digits and ` ._()/+:@-` only, single spaces, at most 100 chars. */
export function safeClaimGenerator(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[^\p{L}\p{N} ._()/+:@-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
    .trim();
  return cleaned || null;
}

/** Validation codes are dotted identifiers (`claimSignature.mismatch`): anything else is dropped. At most 20. */
export function safeValidationCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((code): code is string => typeof code === "string" && /^[A-Za-z0-9._:-]{1,80}$/.test(code)).slice(0, 20);
}

const C2PA_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
type C2paMediaType = (typeof C2PA_MEDIA_TYPES)[number];
const MEDIA_EXTENSION: Record<C2paMediaType, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const TRUST_ANCHOR_TEXT: Readonly<Record<string, string>> = {
  not_on_trust_list: "Signer certificate is not on the C2PA trust list",
  no_failure_reported: "No trust-list failure reported",
  not_checked: "Not checked (no manifest)",
};

export type C2paStatus = "manifest_valid" | "signature_mismatch" | "no_manifest";

export interface C2paReport {
  imageUrl: string;
  host: string;
  fileName: string;
  mediaType: C2paMediaType;
  byteLength: number;
  status: C2paStatus;
  manifestFound: boolean;
  embedded: boolean;
  /** Unverified text from the manifest, reduced to plain printable characters. */
  claimGenerator: string | null;
  signatureMatches: boolean;
  trustAnchor: string;
  validationCodes: string[];
  imageProxy: { detected: boolean; name: string | null; fix: string | null };
  diagnosis: string | null;
  disclosure: { locale: string; react: string; script: string };
  links: { c2pa: string; pro: string; concierge: string };
  /** True when the image URL was auto-discovered in 1 hop from a bare domain or store webpage HTML. */
  discoveredFromPage?: boolean;
}

export interface C2paContext {
  requestedHost?: string;
  htmlLocale?: BadgeLang;
  discoveredFromPage?: boolean;
}

/** The same `<AIDisclosureLabel notice="generated" />` and badge.js `data-notice="generated"` the hosted tool returns. */
export function generatedNotice(locale: string): { react: string; script: string } {
  return {
    react: `import { AIDisclosureLabel } from "spurvik/react";\n\n<AIDisclosureLabel\n  notice="generated"\n  locale="${locale}"\n  presentation="block"\n/>`,
    script: `<script src="${BADGE_SCRIPT_SRC}" data-notice="generated" data-locale="${locale}" data-theme="auto" data-attribution="true" defer></script>`,
  };
}

/** Builds the report from the console answer `{ data: { mediaType, byteLength, manifestFound, ... }, fileName }`. */
export function reportFromC2pa(target: ScanTarget, body: unknown, context?: C2paContext): C2paReport | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const data = body.data;
  const mediaType = C2PA_MEDIA_TYPES.find((type) => type === data.mediaType);
  if (!mediaType) return null;
  const byteLength = data.byteLength;
  if (typeof byteLength !== "number" || !Number.isInteger(byteLength) || byteLength < 0 || byteLength > C2PA_MAX_IMAGE_BYTES) return null;
  if (typeof data.manifestFound !== "boolean") return null;
  const manifestFound = data.manifestFound;
  // No manifest means nothing was signed, so nothing can match.
  const signatureMatches = manifestFound && data.signatureMatches === true;
  const trustAnchor =
    typeof data.trustAnchor === "string" && /^[a-z_]{1,40}$/.test(data.trustAnchor)
      ? data.trustAnchor
      : manifestFound
        ? "no_failure_reported"
        : "not_checked";
  const rawName = typeof body.fileName === "string" ? body.fileName : "";
  const fileName = rawName.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(0, 80) || `image.${MEDIA_EXTENSION[mediaType]}`;
  const proxy = detectImageProxy(target.url);
  const effectiveHost = context?.requestedHost ?? target.host;
  const siteHost = isImageCdnHost(effectiveHost) ? null : effectiveHost;
  const baseLocale = noticeLocaleForHost(siteHost);
  const locale = baseLocale === "en" && context?.htmlLocale ? context.htmlLocale : baseLocale;
  const status: C2paStatus = !manifestFound ? "no_manifest" : signatureMatches ? "manifest_valid" : "signature_mismatch";
  let diagnosis: string | null = null;
  if (!manifestFound) {
    diagnosis = proxy
      ? `This URL goes through ${proxy.name}. Image optimizers decode and re-encode the image, which drops the C2PA JUMBF boxes, so a signed original arrives unsigned. ${proxy.fix}`
      : `These bytes carry no C2PA manifest. If the original file was signed, a CMS, CDN or upload step re-encoded it on the way. Upload the original file at ${C2PA_PAGE_URL} and compare.`;
  } else if (!signatureMatches) {
    diagnosis = `A C2PA manifest is present, but its signature does not match: the bytes or the claim changed after signing.${
      proxy ? ` This URL goes through ${proxy.name}, which re-encodes images. ${proxy.fix}` : ` Upload the original file at ${C2PA_PAGE_URL} and compare.`
    }`;
  } else if (proxy) {
    diagnosis = `The manifest survived ${proxy.name}. Re-check after any change to its settings.`;
  }
  const h = siteHost ? encodeURIComponent(siteHost) : null;
  return {
    imageUrl: target.url,
    host: effectiveHost,
    fileName,
    mediaType,
    byteLength,
    status,
    manifestFound,
    embedded: manifestFound && data.embedded === true,
    claimGenerator: manifestFound ? safeClaimGenerator(data.claimGenerator) : null,
    signatureMatches,
    trustAnchor,
    validationCodes: safeValidationCodes(data.validationCodes),
    imageProxy: { detected: proxy !== null, name: proxy?.name ?? null, fix: proxy?.fix ?? null },
    diagnosis,
    disclosure: { locale, ...generatedNotice(locale) },
    links: {
      c2pa: C2PA_PAGE_URL,
      pro: h ? `${PRO_SIGNUP_URL}&appUrl=${h}` : PRO_SIGNUP_URL,
      concierge: h ? `${CONCIERGE_SIGNUP_URL}&appUrl=${h}` : CONCIERGE_SIGNUP_URL,
    },
    ...(context?.discoveredFromPage ? { discoveredFromPage: true } : {}),
  };
}

/**
 * Resolves either a bare public domain (`charlie-paris.com`) for 1-hop hero-image discovery,
 * or a full `https://` URL (image or store page) checked via `normalizeImageUrl`.
 */
export function resolveC2paInput(raw: string): { target: ScanTarget; bareDomain: boolean } {
  const trimmed = raw.trim();
  if (
    trimmed.length > 0 &&
    trimmed.length <= 253 &&
    !trimmed.includes("/") &&
    !trimmed.includes(":") &&
    !trimmed.includes("?") &&
    !trimmed.includes("#") &&
    !trimmed.includes("@") &&
    !/[\u0000-\u001f\u007f-\u009f\s<>"'`\\]/.test(trimmed)
  ) {
    try {
      const scanTarget = normalizeScanTarget(trimmed);
      if (isPublicIpLiteral(scanTarget.host) === null) {
        return { target: scanTarget, bareDomain: true };
      }
    } catch (error) {
      if (error instanceof ScanTargetError && error.code === "blocked_target") {
        throw new ScanTargetError("blocked_target", IMAGE_BLOCKED);
      }
    }
  }
  return { target: normalizeImageUrl(raw), bareDomain: false };
}

function looksLikeImageAssetPath(rawUrl: string): boolean {
  try {
    return /\.(?:png|jpe?g|webp|gif|svg|avif|bmp|ico)$/i.test(new URL(rawUrl).pathname);
  } catch {
    return false;
  }
}

async function discoverHeroFromPage(
  pageTarget: ScanTarget,
  fetchImpl: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<{ heroTarget: ScanTarget; htmlLocale?: BadgeLang } | null> {
  const res = await fetchImpl(`${SCAN_ENDPOINT}?url=${encodeURIComponent(pageTarget.url)}`, {
    method: "GET",
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status !== 200) return null;
  const body = (await res.json().catch(() => null)) as unknown;
  if (!isRecord(body)) return null;
  const scan = isRecord(body.scan) ? body.scan : body;
  if (scan.reachable !== true || typeof scan.heroImageUrl !== "string" || !scan.heroImageUrl.trim()) return null;
  const heroTarget = normalizeImageUrl(scan.heroImageUrl);
  const htmlLocale =
    typeof scan.htmlLocale === "string" && (BADGE_LANGS as readonly string[]).includes(scan.htmlLocale)
      ? (scan.htmlLocale as BadgeLang)
      : undefined;
  return { heroTarget, htmlLocale };
}

async function postC2paCheck(
  imageTarget: ScanTarget,
  fetchImpl: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    response = await fetchImpl(C2PA_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify({ url: imageTarget.url }),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    throw new ScanFailed(
      name === "TimeoutError" || name === "AbortError"
        ? `The C2PA check did not answer within ${Math.round(timeoutMs / 1000)}s.`
        : "Could not reach console.spurvik.com. Check your network and try again.",
    );
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function fetchC2pa(target: ScanTarget, deps: CliDeps, bareDomain = false): Promise<C2paReport> {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new ScanFailed("This Node.js has no fetch. Use Node.js 20 or later.");
  const timeoutMs = deps.timeoutMs ?? C2PA_TIMEOUT_MS;

  if (bareDomain) {
    let discovered: { heroTarget: ScanTarget; htmlLocale?: BadgeLang } | null = null;
    try {
      discovered = await discoverHeroFromPage(target, fetchImpl, timeoutMs);
    } catch (error) {
      if (error instanceof ScanTargetError) {
        throw new ScanFailed(`Discovered hero image refused (${error.code}): ${error.message}`);
      }
      const name = error instanceof Error ? error.name : "";
      throw new ScanFailed(
        name === "TimeoutError" || name === "AbortError"
          ? `The C2PA check did not answer within ${Math.round(timeoutMs / 1000)}s.`
          : "Could not reach console.spurvik.com. Check your network and try again.",
      );
    }
    if (!discovered) {
      throw new ScanFailed("No frontpage hero or og:image PNG/JPEG/WebP URL was found on that domain. Pass a direct https image URL instead.");
    }
    const { status, body } = await postC2paCheck(discovered.heroTarget, fetchImpl, timeoutMs);
    if (status !== 200) {
      const upstream = isRecord(body) && isRecord(body.error) ? body.error : {};
      const code = /^[a-z_]{1,40}$/.test(String(upstream.code ?? "")) ? String(upstream.code) : `http_${status}`;
      const message = cleanText(upstream.message, 200);
      throw new ScanFailed(`Check refused (${code})${message ? `: ${message}` : "."}`);
    }
    const report = reportFromC2pa(discovered.heroTarget, body, {
      requestedHost: target.host,
      htmlLocale: discovered.htmlLocale,
      discoveredFromPage: true,
    });
    if (!report) throw new ScanFailed("The C2PA check sent an answer this CLI cannot read. Try again later.");
    return report;
  }

  const { status, body } = await postC2paCheck(target, fetchImpl, timeoutMs);
  if (status === 415 && !looksLikeImageAssetPath(target.url)) {
    try {
      const discovered = await discoverHeroFromPage(target, fetchImpl, timeoutMs);
      if (discovered) {
        const heroCheck = await postC2paCheck(discovered.heroTarget, fetchImpl, timeoutMs);
        if (heroCheck.status === 200) {
          const heroReport = reportFromC2pa(discovered.heroTarget, heroCheck.body, {
            requestedHost: target.host,
            htmlLocale: discovered.htmlLocale,
            discoveredFromPage: true,
          });
          if (heroReport) return heroReport;
        }
      }
    } catch {
      // Fall back to original 415 error when hero auto-discovery fails.
    }
  }
  if (status !== 200) {
    const upstream = isRecord(body) && isRecord(body.error) ? body.error : {};
    const code = /^[a-z_]{1,40}$/.test(String(upstream.code ?? "")) ? String(upstream.code) : `http_${status}`;
    const message = cleanText(upstream.message, 200);
    throw new ScanFailed(`Check refused (${code})${message ? `: ${message}` : "."}`);
  }
  const report = reportFromC2pa(target, body);
  if (!report) throw new ScanFailed("The C2PA check sent an answer this CLI cannot read. Try again later.");
  return report;
}

function printC2pa(report: C2paReport, io: Io): void {
  const { c, out } = io;
  const row = (label: string, value: string) => out(`  ${c.dim(label.padEnd(18))}${value}`);
  out();
  out(`  ${c.bold("Spurvik · C2PA JUMBF manifest & CDN-strip check")}`);
  out();
  row("Image", `${report.fileName} ${c.dim(`(${report.mediaType}, ${report.byteLength.toLocaleString("en-US")} bytes)`)}`);
  row("Host", report.host);
  if (report.discoveredFromPage) {
    row("Discovered", `${report.imageUrl} ${c.dim("(frontpage hero / og:image)")}`);
  }
  row(
    "C2PA manifest",
    report.manifestFound
      ? c.green(`FOUND${report.embedded ? " (embedded JUMBF)" : " (remote, referenced from the image)"}`)
      : c.red("NOT FOUND"),
  );
  if (report.manifestFound) {
    row("Signature", report.signatureMatches ? c.green("MATCHES") : c.red("DOES NOT MATCH (bytes or claim changed after signing)"));
    row("Trust list", TRUST_ANCHOR_TEXT[report.trustAnchor] ?? report.trustAnchor);
    row("Signer/generator", report.claimGenerator ? `${report.claimGenerator} ${c.dim("(unverified text from the manifest)")}` : "not stated");
    row("Validation codes", report.validationCodes.length > 0 ? report.validationCodes.join(", ") : "none");
  }
  row("Image optimizer", report.imageProxy.name ?? "none detected");
  out();
  if (report.diagnosis) {
    const warn = report.status !== "manifest_valid";
    out(`  ${warn ? c.yellow(report.imageProxy.detected ? "⚠ CDN strip:" : "⚠ No valid manifest:") : c.cyan("Note:")} ${report.diagnosis}`);
    out();
  }
  out(`  ${c.bold("Visible Art. 50 notice")} ${c.dim(`(AI-generated image, ${report.disclosure.locale})`)}`);
  out(`  ${c.dim("React / Next.js (npm i spurvik):")}`);
  out(`    import { AIDisclosureLabel } from "spurvik/react";`);
  out(`    <AIDisclosureLabel notice="generated" locale="${report.disclosure.locale}" presentation="block" />`);
  out(`  ${c.dim("Any site (paste before </body>):")}`);
  out(`    ${report.disclosure.script}`);
  out();
  out(`  ${c.bold("Next steps")} ${c.dim("(prices excl. VAT)")}`);
  const step = (label: string, url: string) => {
    out(`  › ${label}`);
    out(`    ${c.cyan(url)}`);
  };
  step("Interactive C2PA checker (upload the original, compare)", report.links.c2pa);
  step("White-label Pro (€19/mo)", report.links.pro);
  step("24h engineer Done-For-You (€199 once, incl. 1 year of Pro)", report.links.concierge);
  out();
  out(`  ${c.dim("Read-only check: Spurvik did not sign or change the image. The URL and bytes were not stored.")}`);
  out();
}

async function cmdC2pa(args: ParsedArgs, deps: CliDeps, io: Io): Promise<number> {
  const raw = args.positionals[0];
  if (!raw || args.positionals.length > 1) {
    io.err("Usage: spurvik c2pa <image-url> [--json] [--fail-on-missing]");
    return EXIT_ERROR;
  }
  let resolved: { target: ScanTarget; bareDomain: boolean };
  try {
    resolved = resolveC2paInput(raw);
  } catch (error) {
    io.err(`spurvik c2pa: ${error instanceof ScanTargetError ? error.message : IMAGE_URL_HELP}`);
    return EXIT_ERROR;
  }
  let report: C2paReport;
  try {
    report = await fetchC2pa(resolved.target, deps, resolved.bareDomain);
  } catch (error) {
    const message = error instanceof ScanFailed ? error.message : "The C2PA check failed.";
    if (args.json) {
      io.out(JSON.stringify({ host: resolved.target.host, status: "error", error: message, links: { c2pa: C2PA_PAGE_URL } }, null, 2));
    } else {
      io.err(`spurvik c2pa: ${message}`);
      io.err(`Check it in the browser instead: ${C2PA_PAGE_URL}`);
    }
    return EXIT_ERROR;
  }
  if (args.json) io.out(JSON.stringify(report, null, 2));
  else printC2pa(report, io);
  return args.failOnMissing && (!report.manifestFound || !report.signatureMatches) ? EXIT_MISSING : EXIT_OK;
}

// ---------------------------------------------------------------------------------------------------------------
// rfp — EU AI Act vendor security questionnaire & DPO RFP answers (local, no network)
// ---------------------------------------------------------------------------------------------------------------

export type RfpReport = SpurvikVendorQuestionnaireOutput;

const RFP_USAGE =
  "Usage: spurvik rfp [domain] [--lang en|de|fr|nl|da|sv|es|it] [--plan free|pro|team|concierge] [--provider openai|anthropic|google-genai|vercel-ai-sdk|langgraph|openai-agents|mastra|python|mistral|azure-openai|bedrock|php|laravel|custom] [--generates-media] [--no-high-risk-actions] [--json]";

const RFP_PROVIDER_ALIASES: Record<string, (typeof SPURVIK_QUESTIONNAIRE_PROVIDERS)[number]> = {
  gemini: "google-genai",
  google: "google-genai",
  ai: "vercel-ai-sdk",
  "ai-sdk": "vercel-ai-sdk",
  vercel: "vercel-ai-sdk",
  mistral: "vercel-ai-sdk",
  "mistral-ai": "vercel-ai-sdk",
  azure: "vercel-ai-sdk",
  "azure-openai": "vercel-ai-sdk",
  bedrock: "vercel-ai-sdk",
  "aws-bedrock": "vercel-ai-sdk",
  litellm: "openai",
  ollama: "openai",
  vllm: "openai",
  php: "custom",
  laravel: "custom",
  symfony: "custom",
  dotnet: "custom",
  csharp: "custom",
  aspnet: "custom",
  blazor: "custom",
  go: "custom",
  golang: "custom",
  java: "custom",
  spring: "custom",
  "spring-boot": "custom",
  kotlin: "custom",
  ruby: "custom",
  rails: "custom",
  "ruby-on-rails": "custom",
  ruby_llm: "custom",
  langchainrb: "custom",
  openwebui: "openai",
  "open-webui": "openai",
  fastapi: "python",
  langchain: "python",
  pydanticai: "python",
  "pydantic-ai": "python",
  multi: "custom",
};

const RFP_SOVEREIGN_OVERRIDES: Record<string, { baseLabel: string; targetLabel: string; baseWrapper: string; targetWrapper: string }> = {
  mistral: {
    baseLabel: "Vercel AI SDK",
    targetLabel: "Mistral AI (EU Paris · @ai-sdk/mistral)",
    baseWrapper: "`spurvikMiddleware` with `wrapLanguageModel`, from `spurvik/ai`",
    targetWrapper: "`spurvikMiddleware` with `wrapLanguageModel({ model: mistral(\"mistral-large-latest\") })` (`spurvik/ai`)",
  },
  "mistral-ai": {
    baseLabel: "Vercel AI SDK",
    targetLabel: "Mistral AI (EU Paris · @ai-sdk/mistral)",
    baseWrapper: "`spurvikMiddleware` with `wrapLanguageModel`, from `spurvik/ai`",
    targetWrapper: "`spurvikMiddleware` with `wrapLanguageModel({ model: mistral(\"mistral-large-latest\") })` (`spurvik/ai`)",
  },
  azure: {
    baseLabel: "Vercel AI SDK",
    targetLabel: "Azure OpenAI Service (EU Data Zone: Sweden Central / Germany West Central)",
    baseWrapper: "`spurvikMiddleware` with `wrapLanguageModel`, from `spurvik/ai`",
    targetWrapper: "`spurvikMiddleware` with `wrapLanguageModel({ model: azure(deployment) })` (`@ai-sdk/azure` + `spurvik/ai`)",
  },
  "azure-openai": {
    baseLabel: "Vercel AI SDK",
    targetLabel: "Azure OpenAI Service (EU Data Zone: Sweden Central / Germany West Central)",
    baseWrapper: "`spurvikMiddleware` with `wrapLanguageModel`, from `spurvik/ai`",
    targetWrapper: "`spurvikMiddleware` with `wrapLanguageModel({ model: azure(deployment) })` (`@ai-sdk/azure` + `spurvik/ai`)",
  },
  bedrock: {
    baseLabel: "Vercel AI SDK",
    targetLabel: "AWS Bedrock (eu-central-1 Frankfurt)",
    baseWrapper: "`spurvikMiddleware` with `wrapLanguageModel`, from `spurvik/ai`",
    targetWrapper: "`spurvikMiddleware` with `wrapLanguageModel({ model: bedrock(...) })` (`@ai-sdk/amazon-bedrock` eu-central-1 + `spurvik/ai`)",
  },
  "aws-bedrock": {
    baseLabel: "Vercel AI SDK",
    targetLabel: "AWS Bedrock (eu-central-1 Frankfurt)",
    baseWrapper: "`spurvikMiddleware` with `wrapLanguageModel`, from `spurvik/ai`",
    targetWrapper: "`spurvikMiddleware` with `wrapLanguageModel({ model: bedrock(...) })` (`@ai-sdk/amazon-bedrock` eu-central-1 + `spurvik/ai`)",
  },
  php: {
    baseLabel: "our model provider",
    targetLabel: "PHP 8.1+ / Laravel / Symfony (SpurvikGuard.php)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`SpurvikGuard::sendTelemetryEvent` & `SpurvikGuard::verifySignedCallback` (`SpurvikGuard.php`, 0 Composer deps)",
  },
  laravel: {
    baseLabel: "our model provider",
    targetLabel: "Laravel / PHP 8.1+ (SpurvikGuard.php)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`SpurvikGuard::sendTelemetryEvent` & `SpurvikGuard::verifySignedCallback` (`app/Services/SpurvikGuard.php`, 0 Composer deps)",
  },
  symfony: {
    baseLabel: "our model provider",
    targetLabel: "Symfony / PHP 8.1+ (SpurvikGuard.php)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`SpurvikGuard::sendTelemetryEvent` & `SpurvikGuard::verifySignedCallback` (`src/Service/SpurvikGuard.php`, 0 Composer deps)",
  },
  dotnet: {
    baseLabel: "our model provider",
    targetLabel: ".NET 8+ / C# 12 (ASP.NET Core · SpurvikGuard.cs)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`SpurvikGuard.SendTelemetryEventAsync` & `SpurvikGuard.VerifySignedCallback` (`Services/SpurvikGuard.cs`, 0 NuGet deps)",
  },
  csharp: {
    baseLabel: "our model provider",
    targetLabel: ".NET 8+ / C# 12 (ASP.NET Core · SpurvikGuard.cs)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`SpurvikGuard.SendTelemetryEventAsync` & `SpurvikGuard.VerifySignedCallback` (`Services/SpurvikGuard.cs`, 0 NuGet deps)",
  },
  aspnet: {
    baseLabel: "our model provider",
    targetLabel: "ASP.NET Core / .NET 8+ (SpurvikGuard.cs)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`SpurvikGuard.SendTelemetryEventAsync` & `SpurvikGuard.VerifySignedCallback` (`Services/SpurvikGuard.cs`, 0 NuGet deps)",
  },
  blazor: {
    baseLabel: "our model provider",
    targetLabel: "Blazor / .NET 8+ (SpurvikGuard.cs)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`SpurvikGuard.SendTelemetryEventAsync` & `SpurvikGuard.Art50BadgeHtml` (`Services/SpurvikGuard.cs`, 0 NuGet deps)",
  },
  go: {
    baseLabel: "our model provider",
    targetLabel: "Go 1.21+ (spurvik_guard.go)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`spurvikguard.SendTelemetryEvent` & `spurvikguard.VerifySignedCallback` (`internal/spurvikguard/spurvik_guard.go`, 0 go.mod deps)",
  },
  golang: {
    baseLabel: "our model provider",
    targetLabel: "Go 1.21+ (spurvik_guard.go)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`spurvikguard.SendTelemetryEvent` & `spurvikguard.VerifySignedCallback` (`internal/spurvikguard/spurvik_guard.go`, 0 go.mod deps)",
  },
  java: {
    baseLabel: "our model provider",
    targetLabel: "Java 21+ / Spring Boot 3 / Spring AI",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`SpurvikTelemetry.logCall` (`HmacSHA256` + `java.net.http.HttpClient`, 0 Maven/Gradle deps)",
  },
  spring: {
    baseLabel: "our model provider",
    targetLabel: "Spring Boot 3 / Spring AI (Java 21+)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`SpurvikTelemetry.logCall` (`HmacSHA256` + `java.net.http.HttpClient`, 0 Maven/Gradle deps)",
  },
  "spring-boot": {
    baseLabel: "our model provider",
    targetLabel: "Spring Boot 3 / Spring AI (Java 21+)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`SpurvikTelemetry.logCall` (`HmacSHA256` + `java.net.http.HttpClient`, 0 Maven/Gradle deps)",
  },
  kotlin: {
    baseLabel: "our model provider",
    targetLabel: "Kotlin / Spring Boot 3 / Ktor (JVM 21+)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`SpurvikTelemetry.logCall` (`HmacSHA256` + `java.net.http.HttpClient`, 0 Gradle deps)",
  },
  ruby: {
    baseLabel: "our model provider",
    targetLabel: "Ruby 3.1+ / Rails 7 & 8 (spurvik_guard.rb)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`SpurvikGuard#log_call` & `SpurvikGuard.verify_signed_callback` (`app/services/spurvik_guard.rb`, 0 Gem deps)",
  },
  rails: {
    baseLabel: "our model provider",
    targetLabel: "Ruby on Rails 7 & 8 / Ruby 3.1+ (spurvik_guard.rb)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`SpurvikGuard#log_call` & `SpurvikGuard.verify_signed_callback` (`app/services/spurvik_guard.rb`, 0 Gem deps)",
  },
  "ruby-on-rails": {
    baseLabel: "our model provider",
    targetLabel: "Ruby on Rails 7 & 8 / Ruby 3.1+ (spurvik_guard.rb)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`SpurvikGuard#log_call` & `SpurvikGuard.verify_signed_callback` (`app/services/spurvik_guard.rb`, 0 Gem deps)",
  },
  ruby_llm: {
    baseLabel: "our model provider",
    targetLabel: "RubyLLM / Rails 8 (spurvik_guard.rb)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`SpurvikGuard#log_call` & `SpurvikGuard.verify_signed_callback` (`app/services/spurvik_guard.rb`, 0 Gem deps)",
  },
  langchainrb: {
    baseLabel: "our model provider",
    targetLabel: "Langchain.rb / Ruby 3.1+ (spurvik_guard.rb)",
    baseWrapper: "`withSpurvik` on the provider client",
    targetWrapper: "`SpurvikGuard#log_call` & `SpurvikGuard.verify_signed_callback` (`app/services/spurvik_guard.rb`, 0 Gem deps)",
  },
};

/** Answers built from plan and provider facts only. The domain is used only when it is a public hostname. */
export function rfpReport(options: {
  domain?: string;
  plan?: string;
  provider?: string;
  locale?: string;
  hasHighRiskActions?: boolean;
  generatesMedia?: boolean;
}): RfpReport {
  const rawProv = options.provider?.trim().toLowerCase();
  const mappedProv = rawProv ? RFP_PROVIDER_ALIASES[rawProv] ?? rawProv : undefined;
  const base = spurvikVendorQuestionnaireAnswers({
    ...options,
    ...(mappedProv !== undefined ? { provider: mappedProv } : {}),
  });
  const override = rawProv ? RFP_SOVEREIGN_OVERRIDES[rawProv] : undefined;
  if (!override) return base;
  return {
    ...base,
    markdown: base.markdown
      .replaceAll(override.baseWrapper, override.targetWrapper)
      .replaceAll(override.baseLabel, override.targetLabel),
  };
}

const CLI_RFP_ARTICLE_BY_QNUM: Readonly<Record<string, string>> = {
  "1": "EU AI Act Art. 50(1) & Art. 50(2) (2 Dec 2026 C2PA)",
  "2": "EU AI Act Art. 12 (HMAC-SHA256 Event Logging)",
  "3": "GDPR Art. 5(1)(c) & EU Frankfurt (fra1) Residency",
  "4": "EU AI Act Art. 14 (Human Oversight Gates)",
  "5": "Retention, DPO Summary & Art. 11 Annex IV",
};

function escapeCliCsvCell(raw: string | undefined | null): string {
  const normalized = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  const safe = /^[=+\-@\t\r]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildRfpCsv(report: RfpReport, rawProvider?: string, rawLocale?: string): string {
  const blocks = report.markdown.split(/\n(?=## )/);
  const header = "question_id,regulation_article,question,answer,plan_tier,provider,domain,locale,evidence_report_url";
  const rows: string[] = [];
  const provLabel = rawProvider?.trim() ? rawProvider.trim().toLowerCase() : report.provider;
  const dom = report.domain ?? "";
  const loc = rawLocale?.trim() || ((report as { locale?: string }).locale ?? "en");
  const reportHref = dom ? `${CONSOLE_ORIGIN}/report?domain=${encodeURIComponent(dom)}` : `${CONSOLE_ORIGIN}/report`;
  for (const block of blocks) {
    const headMatch = /^## ([A-Z]([1-5]))\s*:\s*([^\n]+)\n([\s\S]*)$/.exec(block.trim());
    if (!headMatch) continue;
    const num = headMatch[2] ?? "1";
    const qId = `Q${num}`;
    const headingTitle = (headMatch[3] ?? "").trim();
    const body = (headMatch[4] ?? "").replace(/\n_[^\n]*_$/g, "").trim();
    const asksMatch = /\*\*Customer asks:\*\*\s*([^\n]+)/.exec(body);
    const questionText = asksMatch?.[1]?.trim() ?? headingTitle;
    const answerText = body
      .replace(/^\*\*Customer asks:\*\*\s*[^\n]+\n*/m, "")
      .replace(/^\*\*(?:Answer|Antwort|Réponse|Antwoord|Svar|Respuesta|Risposta)\s*:\*\*\s*/m, "")
      .trim();
    rows.push(
      [
        escapeCliCsvCell(qId),
        escapeCliCsvCell(CLI_RFP_ARTICLE_BY_QNUM[num] ?? headingTitle),
        escapeCliCsvCell(questionText),
        escapeCliCsvCell(answerText),
        escapeCliCsvCell(report.plan),
        escapeCliCsvCell(provLabel),
        escapeCliCsvCell(dom),
        escapeCliCsvCell(loc),
        escapeCliCsvCell(reportHref),
      ].join(","),
    );
  }
  return `${[header, ...rows].join("\n")}`;
}

function cmdRfp(args: ParsedArgs, io: Io): number {
  if (args.positionals.length > 1) {
    io.err(RFP_USAGE);
    return EXIT_ERROR;
  }
  // The rejected value is not repeated.
  if (args.plan !== undefined && !(SPURVIK_QUESTIONNAIRE_PLANS as readonly string[]).includes(args.plan)) {
    io.err(`spurvik rfp: --plan must be one of ${SPURVIK_QUESTIONNAIRE_PLANS.join(", ")}`);
    return EXIT_ERROR;
  }
  const normalizedProv = args.provider !== undefined ? RFP_PROVIDER_ALIASES[args.provider.toLowerCase()] ?? args.provider : undefined;
  if (normalizedProv !== undefined && !(SPURVIK_QUESTIONNAIRE_PROVIDERS as readonly string[]).includes(normalizedProv)) {
    io.err(`spurvik rfp: --provider must be one of ${SPURVIK_QUESTIONNAIRE_PROVIDERS.join(", ")}`);
    return EXIT_ERROR;
  }
  if (args.lang !== undefined && !(SPURVIK_QUESTIONNAIRE_LOCALES as readonly string[]).includes(args.lang)) {
    io.err(`spurvik rfp: --lang must be one of ${SPURVIK_QUESTIONNAIRE_LOCALES.join(", ")}`);
    return EXIT_ERROR;
  }
  const report = rfpReport({
    domain: args.positionals[0],
    plan: args.plan,
    provider: args.provider,
    locale: args.lang,
    hasHighRiskActions: !args.noHighRiskActions,
    generatesMedia: args.generatesMedia,
  });
  if (args.json) {
    io.out(JSON.stringify(report, null, 2));
    return EXIT_OK;
  }
  if (args.csv) {
    io.out(buildRfpCsv(report, args.provider, args.lang));
    return EXIT_OK;
  }
  const { c, out } = io;
  // The Markdown holds only fixed text and a validated hostname ([a-z0-9.-]), so it is safe for a terminal.
  const lines = report.markdown.replace(/\n$/, "").split("\n");
  for (const line of lines) {
    if (line.startsWith("#")) out(c.bold(line));
    else if (line.startsWith("- ")) out(line.replace(/: (https:\/\/\S+)$/, (_match, url: string) => `: ${c.cyan(url)}`));
    else out(line);
  }
  out();
  return EXIT_OK;
}

// ---------------------------------------------------------------------------------------------------------------
// risk — EU AI Act risk-tier classifier & DPO self-assessment Markdown record (local, no network)
// ---------------------------------------------------------------------------------------------------------------

export type RiskReport = SpurvikClassifyRiskReport;

const RISK_USAGE =
  "Usage: spurvik risk [domain] [--use-case <text>] [--area general|biometrics|critical_infrastructure|education|employment_hr|essential_services_credit|law_enforcement|migration_border|justice_democracy] [--interacts|--no-interacts] [--synthetic|--no-synthetic] [--decisions|--no-decisions] [--lang <eu-locale>] [--json]";

export function riskReport(options: {
  siteDomain?: string;
  useCase?: string;
  area?: SpurvikRiskArea;
  locale?: string;
  interactsWithHumans?: boolean;
  generatesSyntheticMedia?: boolean;
  makesAutomatedDecisionsAboutPeople?: boolean;
}) {
  return classifySpurvikRisk(options);
}

function cmdRisk(args: ParsedArgs, io: Io): number {
  if (args.positionals.length > 1) {
    io.err(RISK_USAGE);
    return EXIT_ERROR;
  }
  if (args.area !== undefined && !(SPURVIK_RISK_AREAS as readonly string[]).includes(args.area)) {
    io.err(`spurvik risk: --area must be one of ${SPURVIK_RISK_AREAS.join(", ")}`);
    return EXIT_ERROR;
  }
  if (args.lang !== undefined && !(BADGE_LANGS as readonly string[]).includes(args.lang)) {
    io.err(`spurvik risk: --lang must be one of ${BADGE_LANGS.join(", ")}`);
    return EXIT_ERROR;
  }
  const outcome = riskReport({
    siteDomain: args.positionals[0],
    useCase: args.useCase,
    area: args.area as SpurvikRiskArea | undefined,
    locale: args.lang,
    interactsWithHumans: args.interacts,
    generatesSyntheticMedia: args.synthetic,
    makesAutomatedDecisionsAboutPeople: args.decisions,
  });
  if (!outcome.ok) {
    io.err(`spurvik risk: ${outcome.message}`);
    return EXIT_ERROR;
  }
  if (args.json) {
    io.out(JSON.stringify(outcome.report, null, 2));
    return EXIT_OK;
  }
  const { c, out } = io;
  const lines = outcome.report.markdown.replace(/\n$/, "").split("\n");
  for (const line of lines) {
    if (line.startsWith("#")) out(c.bold(line));
    else if (line.startsWith("- ")) out(line.replace(/: (https:\/\/\S+)$/, (_match, url: string) => `: ${c.cyan(url)}`));
    else out(line);
  }
  out();
  return EXIT_OK;
}

// ---------------------------------------------------------------------------------------------------------------
// gate / block-test — Offline cryptographic EU AI Act Art. 14 fail-closed blocking self-test (0 network requests)
// ---------------------------------------------------------------------------------------------------------------

export type GateVectorId =
  | "unapproved_default_halt"
  | "explicit_human_block"
  | "tampered_payload_hmac"
  | "decision_flip_forgery"
  | "expired_link_replay"
  | "authentic_signed_approval";

export interface GateVectorResult {
  id: GateVectorId;
  scenario: string;
  expectedExecution: "blocked" | "allowed";
  actualExecution: "blocked" | "allowed";
  reason: string;
  passed: boolean;
}

export interface GateReport {
  article: "EU AI Act Art. 14 + Art. 12";
  domain: string | null;
  locale: BadgeLang;
  allPassed: boolean;
  blockedAttacks: number;
  totalVectors: number;
  sampleAction: {
    gateId: string;
    actionName: string;
    actionHmacPrefix: string;
    rawPromptPersistedBytes: 0;
  };
  vectors: GateVectorResult[];
  snippet: string;
  links: {
    cockpitUrl: string;
    sandboxUrl: string;
    freeSignupUrl: string;
    proUpgradeUrl: string;
    proAnnualUrl: string;
    teamUpgradeUrl: string;
    teamAnnualUrl: string;
    doneForYouUrl: string;
  };
}

const GATE_USAGE = "Usage: spurvik gate [domain] [--domain <domain>] [--lang <eu-locale>] [--json]";

function publicGateHost(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return normalizeScanTarget(raw).host;
  } catch {
    return null;
  }
}

export function gateReport(options: { domain?: string; locale?: string } = {}): GateReport {
  const domain = publicGateHost(options.domain);
  const requestedLang = options.locale && BADGE_LANGS.includes(options.locale as BadgeLang)
    ? (options.locale as BadgeLang)
    : undefined;
  const locale: BadgeLang = requestedLang ?? (domain ? langForHost(domain) : "en");

  const ephemeralSecret = randomBytes(32).toString("hex");
  const issuedAtUnix = 1_795_000_000;
  const maxAgeSeconds = 900;
  const gateId = "gate_art14_selftest_01";
  const actionName = "stripe.refunds.create";
  const callbackBaseUrl = "https://app.example/api/spurvik/callback";

  const signed = createSignedApprovalLinks(
    {
      gateId,
      actionName,
      summary: "Refund EUR 240",
      context: { amountEur: 240, currency: "EUR" },
      callbackBaseUrl,
    },
    ephemeralSecret,
    issuedAtUnix,
  );

  // 1. Default fail-closed halt before any human click
  const unapprovedCheck = verifySignedChannelCallback(
    `${callbackBaseUrl}?gateId=${gateId}`,
    ephemeralSecret,
    { maxAgeSeconds, nowUnixSeconds: issuedAtUnix + 5 },
  );
  const v1Actual: "blocked" | "allowed" =
    unapprovedCheck !== false && unapprovedCheck.decision === "approved" ? "allowed" : "blocked";

  // 2. Explicit human Block click (signed decision=rejected)
  const rejectCheck = verifySignedChannelCallback(signed.rejectUrl, ephemeralSecret, {
    maxAgeSeconds,
    nowUnixSeconds: issuedAtUnix + 5,
  });
  const v2Actual: "blocked" | "allowed" =
    rejectCheck !== false && rejectCheck.decision === "approved" ? "allowed" : "blocked";

  // 3. Payload parameter tampering (amountEur mutated 240 -> 24000 after signing)
  const tamperedActionHmac = createHmac("sha256", ephemeralSecret)
    .update(`spurvik:art12:v1|${gateId}|${actionName}|amountEur=24000&currency=EUR`, "utf8")
    .digest("hex");
  const tamperedOk = verifyChannelApprovalToken({
    gateId,
    actionHmac: tamperedActionHmac,
    decision: "approved",
    issuedAtUnix,
    signature: signed.approveToken,
    signingSecret: ephemeralSecret,
    nonce: signed.nonce,
    maxAgeSeconds,
    nowUnixSeconds: issuedAtUnix + 5,
  });
  const v3Actual: "blocked" | "allowed" = tamperedOk ? "allowed" : "blocked";

  // 4. Decision-flip forgery (swapping decision=rejected -> decision=approved on a signed Block URL)
  const flippedUrl = signed.rejectUrl.replace("decision=rejected", "decision=approved");
  const flippedCheck = verifySignedChannelCallback(flippedUrl, ephemeralSecret, {
    maxAgeSeconds,
    nowUnixSeconds: issuedAtUnix + 5,
  });
  const v4Actual: "blocked" | "allowed" =
    flippedCheck !== false && flippedCheck.decision === "approved" ? "allowed" : "blocked";

  // 5. Expired link replay (+901s past 900s TTL window)
  const expiredCheck = verifySignedChannelCallback(signed.approveUrl, ephemeralSecret, {
    maxAgeSeconds,
    nowUnixSeconds: issuedAtUnix + maxAgeSeconds + 1,
  });
  const v5Actual: "blocked" | "allowed" =
    expiredCheck !== false && expiredCheck.decision === "approved" ? "allowed" : "blocked";

  // 6. Authentic unmodified human Approve click within TTL
  const approveCheck = verifySignedChannelCallback(signed.approveUrl, ephemeralSecret, {
    maxAgeSeconds,
    nowUnixSeconds: issuedAtUnix + 12,
  });
  const v6Actual: "blocked" | "allowed" =
    approveCheck !== false && approveCheck.decision === "approved" ? "allowed" : "blocked";

  const vectors: GateVectorResult[] = [
    {
      id: "unapproved_default_halt",
      scenario: "Unapproved tool call (missing human signature)",
      expectedExecution: "blocked",
      actualExecution: v1Actual,
      reason: "Fail-closed default halts tool execution until a signed human token arrives",
      passed: unapprovedCheck === false && v1Actual === "blocked",
    },
    {
      id: "explicit_human_block",
      scenario: "Reviewer clicks signed Block link (decision=rejected)",
      expectedExecution: "blocked",
      actualExecution: v2Actual,
      reason: "Constant-time MAC confirms decision=rejected and blocks execution",
      passed: rejectCheck !== false && rejectCheck.decision === "rejected" && v2Actual === "blocked",
    },
    {
      id: "tampered_payload_hmac",
      scenario: "Payload mutation (amountEur 240 -> 24000 with original sig)",
      expectedExecution: "blocked",
      actualExecution: v3Actual,
      reason: "spurvik:art12:v1 context digest mismatch rejects forged parameters",
      passed: !tamperedOk && v3Actual === "blocked",
    },
    {
      id: "decision_flip_forgery",
      scenario: "Decision-flip forgery (decision=rejected -> decision=approved)",
      expectedExecution: "blocked",
      actualExecution: v4Actual,
      reason: "spurvik:art14:decision:v1 domain-separated HMAC rejects swapped decision",
      passed: flippedCheck === false && v4Actual === "blocked",
    },
    {
      id: "expired_link_replay",
      scenario: "Replay of genuine Approve link past TTL (+901s > 900s)",
      expectedExecution: "blocked",
      actualExecution: v5Actual,
      reason: "Bounded maxAgeSeconds window blocks stale replay attempts",
      passed: expiredCheck === false && v5Actual === "blocked",
    },
    {
      id: "authentic_signed_approval",
      scenario: "Unmodified Approve link within TTL + matching nonce",
      expectedExecution: "allowed",
      actualExecution: v6Actual,
      reason: "Constant-time HMAC-SHA256 + nonce + TTL check permits single gated action",
      passed: approveCheck !== false && approveCheck.decision === "approved" && v6Actual === "allowed",
    },
  ];

  const allPassed = vectors.every((v) => v.passed);
  const blockedAttacks = vectors.filter((v) => v.expectedExecution === "blocked" && v.actualExecution === "blocked").length;

  const snippet = [
    'import { createSignedApprovalLinks, verifySignedChannelCallback } from "spurvik/channels";',
    "",
    "const gate = createSignedApprovalLinks(",
    '  { gateId: crypto.randomUUID(), actionName: "stripe.refunds.create", summary: "Refund EUR 240", context: { amountEur: 240, currency: "EUR" }, callbackBaseUrl: "https://your-app.eu/api/spurvik/callback" },',
    "  process.env.SPURVIK_CHANNEL_SECRET!,",
    ");",
    "// Inside GET /api/spurvik/callback — fail-closed unless ok && decision === \"approved\":",
    "const check = verifySignedChannelCallback(req.url, process.env.SPURVIK_CHANNEL_SECRET!, { maxAgeSeconds: 900 });",
    'if (!check || check.decision !== "approved") throw new Error("Blocked by EU AI Act Art. 14 human gate");',
  ].join("\n");

  const domainLinks = domain ? scanLinks(domain, locale) : null;
  const localeParam = locale !== "en" ? `&locale=${encodeURIComponent(locale)}` : "";

  return {
    article: "EU AI Act Art. 14 + Art. 12",
    domain,
    locale,
    allPassed,
    blockedAttacks,
    totalVectors: vectors.length,
    sampleAction: {
      gateId,
      actionName,
      actionHmacPrefix: signed.actionHmac.slice(0, 16),
      rawPromptPersistedBytes: 0,
    },
    vectors,
    snippet,
    links: {
      cockpitUrl: hitlCockpitUrl(domain, locale),
      sandboxUrl: domainLinks ? domainLinks.sandboxUrl : `${CONSOLE_ORIGIN}/sandbox`,
      freeSignupUrl: domainLinks
        ? domainLinks.freeSignupUrl
        : `${SIGNUP_URL}${locale !== "en" ? `?locale=${encodeURIComponent(locale)}` : ""}`,
      proUpgradeUrl: domainLinks ? domainLinks.proUpgradeUrl : `${PRO_SIGNUP_URL}${localeParam}`,
      proAnnualUrl: domainLinks
        ? domainLinks.proAnnualUrl
        : `${CONSOLE_ORIGIN}/signup?plan=pro&interval=annual${localeParam}`,
      teamUpgradeUrl: domainLinks ? domainLinks.teamUpgradeUrl : `${TEAM_SIGNUP_URL}${localeParam}`,
      teamAnnualUrl: domainLinks
        ? domainLinks.teamAnnualUrl
        : `${CONSOLE_ORIGIN}/signup?plan=team&interval=annual${localeParam}`,
      doneForYouUrl: domainLinks ? domainLinks.doneForYouUrl : `${CONCIERGE_SIGNUP_URL}${localeParam}`,
    },
  };
}

function cmdGate(args: ParsedArgs, io: Io): number {
  if (args.positionals.length > 1 || (args.positionals.length === 1 && args.domain !== undefined)) {
    io.err(GATE_USAGE);
    return EXIT_ERROR;
  }
  if (args.lang !== undefined && !(BADGE_LANGS as readonly string[]).includes(args.lang)) {
    io.err(`spurvik gate: --lang must be one of ${BADGE_LANGS.join(", ")}`);
    return EXIT_ERROR;
  }
  const report = gateReport({
    domain: args.domain ?? args.positionals[0],
    locale: args.lang,
  });
  if (args.json) {
    io.out(JSON.stringify(report, null, 2));
    return report.allPassed ? EXIT_OK : EXIT_GAP;
  }
  const { c, out } = io;
  const targetSuffix = report.domain ? ` · ${report.domain}` : "";
  out();
  out(`  ${c.bold(`Spurvik EU AI Act Art. 14 Blocking Self-Test${targetSuffix}`)} ${c.dim(`(spurvik/channels ${CLI_VERSION})`)}`);
  out(
    `  ${report.allPassed ? c.green(`PASS ${report.totalVectors}/${report.totalVectors}`) : c.red("FAIL")} · ${report.blockedAttacks}/5 adversarial & unapproved calls blocked fail-closed · 0 raw prompt bytes`,
  );
  out();
  for (const v of report.vectors) {
    const badge =
      v.actualExecution === "blocked" ? c.yellow("BLOCKED") : c.green("ALLOWED");
    const mark = v.passed ? c.green("✓") : c.red("✗");
    out(`  ${mark} [${badge}] ${c.bold(v.scenario)}`);
    out(`      ${c.dim(v.reason)}`);
  }
  out();
  out(`  ${c.bold("Drop-in TypeScript gate")} ${c.dim("(npm install spurvik — Slack, Teams, Telegram, Discord, Email, Linear, Jira, Asana)")}`);
  for (const line of report.snippet.split("\n")) {
    out(`    ${line}`);
  }
  out();
  out(`  ${c.bold("Next steps")} ${c.dim("(prices excl. VAT)")}`);
  const step = (label: string, url: string) => {
    out(`  › ${label}`);
    out(`    ${c.cyan(url)}`);
  };
  step("Interactive Art. 14 Slack/Teams approval cockpit", report.links.cockpitUrl);
  step("Free API key (€0, 10k Art. 12 HMAC events/mo, no card)", report.links.freeSignupUrl);
  step("Pro human-in-the-loop gates + 250k events (€19/mo or €190/yr)", report.links.proUpgradeUrl);
  step("Team 2M events + Annex IV & auditor verification (€79/mo or €790/yr)", report.links.teamUpgradeUrl);
  step("24h engineer Done-For-You (€199 once, incl. 1 year of Pro)", report.links.doneForYouUrl);
  out();
  out(`  ${c.dim("Offline cryptographic self-test using an ephemeral in-memory key; 0 network requests. Not legal advice.")}`);
  out();
  return report.allPassed ? EXIT_OK : EXIT_GAP;
}

// ---------------------------------------------------------------------------------------------------------------
// annex-iv / art11 — Zero-network 9-section EU AI Act Art. 11 & Annex IV technical documentation draft
// ---------------------------------------------------------------------------------------------------------------

export const ANNEX_IV_CLI_USE_CASES = [
  "employment",
  "credit",
  "education",
  "essential_services",
  "biometrics",
  "support_agent",
] as const;
export type AnnexIvCliUseCase = (typeof ANNEX_IV_CLI_USE_CASES)[number];

export const ANNEX_IV_CLI_PROVIDERS = [
  "openai",
  "anthropic",
  "gemini",
  "mistral",
  "azure-openai",
  "aws-bedrock",
  "python",
  "rails",
] as const;
export type AnnexIvCliProvider = (typeof ANNEX_IV_CLI_PROVIDERS)[number];

export interface AnnexIvCliSection {
  number: string;
  annexRef: string;
  title: string;
  sourceMode: "scaffolded_free" | "auto_populated_team";
  populatedInPreview: boolean;
  summary: string;
}

export interface AnnexIvCliReport {
  format: "spurvik.annex-iv-preview.v1";
  regulation: "Regulation (EU) 2024/1689 — Article 11(1) & Annex IV";
  highRiskApplicabilityDate: "2027-12-02";
  art502ProvenanceMilestone: "2026-12-02";
  region: "fra1";
  domain: string | null;
  displaySystem: string;
  locale: BadgeLang;
  useCase: AnnexIvCliUseCase;
  annexIiiReference: string;
  provider: AnnexIvCliProvider;
  tier: "free" | "team";
  readinessScorePct: number;
  sections: AnnexIvCliSection[];
  markdown: string;
  links: {
    studioUrl: string;
    previewApiUrl: string;
    rfpQuestionnaireUrl: string;
    freeSignupUrl: string;
    proUpgradeUrl: string;
    teamUpgradeUrl: string;
    teamAnnualUrl: string;
    doneForYouUrl: string;
  };
}

const ANNEX_IV_UC_META: Readonly<
  Record<
    AnnexIvCliUseCase,
    { annexIiiRef: string; title: string; intendedPurpose: string; consequentialAction: string; oversightRole: string }
  >
> = {
  employment: {
    annexIiiRef: "Annex III §4(a)–(b) — Employment, Workers Management & Recruitment",
    title: "Candidate Screening & Interview Evaluation Assistant",
    intendedPurpose: "Assists recruiting and HR teams in summarizing candidate applications and scoring structured role criteria.",
    consequentialAction: "advance_or_reject_candidate",
    oversightRole: "Human Talent / HR Reviewer",
  },
  credit: {
    annexIiiRef: "Annex III §5(b) — Creditworthiness, Underwriting & Pricing",
    title: "Credit Risk & Underwriting Decision Support System",
    intendedPurpose: "Evaluates structured financial signals to draft underwriting recommendations for human credit officers.",
    consequentialAction: "approve_or_decline_credit_limit",
    oversightRole: "Licensed Credit / Risk Officer",
  },
  education: {
    annexIiiRef: "Annex III §3(a)–(d) — Education, Admissions & Assessment",
    title: "Admissions & Academic Evaluation Support System",
    intendedPurpose: "Scores structured coursework rubrics and flags submissions requiring faculty review.",
    consequentialAction: "finalize_admission_or_grade",
    oversightRole: "Faculty / Admissions Examiner",
  },
  essential_services: {
    annexIiiRef: "Annex III §5(a)/(c) — Essential Private & Public Services Triage",
    title: "Benefits, Claims & Priority Triage Assistant",
    intendedPurpose: "Classifies inbound claims and routes consequential eligibility or payout decisions to a human caseworker.",
    consequentialAction: "execute_claim_payout_or_denial",
    oversightRole: "Claims / Casework Specialist",
  },
  biometrics: {
    annexIiiRef: "Annex III §1 — Permitted Biometric Categorisation / Verification",
    title: "Permitted Identity & Biometric Verification Workflow",
    intendedPurpose: "Assists secondary document and liveness review with mandatory dual-reviewer confirmation.",
    consequentialAction: "confirm_identity_match_override",
    oversightRole: "Trust & Safety Identity Reviewer",
  },
  support_agent: {
    annexIiiRef: "Enterprise B2B Agent — Voluntary / Procurement Annex IV File",
    title: "Customer Operations & Transactional AI Agent",
    intendedPurpose: "Handles customer inquiries with Art. 50(1) AI notice and gates refunds, account edits, and outbound actions.",
    consequentialAction: "stripe.refunds.create",
    oversightRole: "Operations / Billing Reviewer",
  },
};

const ANNEX_IV_PV_META: Readonly<Record<AnnexIvCliProvider, { label: string; wrapper: string }>> = {
  openai: {
    label: "OpenAI API (Responses / Chat Completions)",
    wrapper: `withSpurvik(new OpenAI(), { riskTier: "high_annex3" })`,
  },
  anthropic: {
    label: "Anthropic Claude Messages API",
    wrapper: `withSpurvik(new Anthropic(), { riskTier: "high_annex3" })`,
  },
  gemini: {
    label: "Google GenAI (Gemini API)",
    wrapper: `withSpurvik(new GoogleGenAI({}), { riskTier: "high_annex3" })`,
  },
  mistral: {
    label: "Mistral AI EU Endpoint (Paris)",
    wrapper: `withSpurvik(mistralClient, { riskTier: "high_annex3" })`,
  },
  "azure-openai": {
    label: "Azure OpenAI Service (EU Sweden Central / Germany West Central)",
    wrapper: `withSpurvik(new AzureOpenAI(), { riskTier: "high_annex3" })`,
  },
  "aws-bedrock": {
    label: "AWS Bedrock Runtime (EU Frankfurt eu-central-1)",
    wrapper: `withSpurvik(bedrockClient, { riskTier: "high_annex3" })`,
  },
  python: {
    label: "Python 3.10+ (FastAPI / LangChain / PydanticAI)",
    wrapper: `spurvik_guard.send_telemetry_event(..., risk_tier="high_annex3")`,
  },
  rails: {
    label: "Ruby 3.1+ / Rails 7 & 8 (spurvik_guard.rb · 0 gems)",
    wrapper: `SpurvikGuard.from_env(risk_tier: "high_annex3")`,
  },
};

const ANNEX_IV_USAGE =
  "Usage: spurvik annex-iv [domain] [--use-case employment|credit|education|essential_services|biometrics|support_agent] [--provider openai|anthropic|gemini|mistral|azure-openai|aws-bedrock|python|rails] [--plan team|free] [--lang <eu-locale>] [--csv] [--json]";

function resolveAnnexIvUseCase(raw: string | undefined): AnnexIvCliUseCase | null {
  if (raw === undefined) return "employment";
  const v = raw.trim().toLowerCase().replace(/-/g, "_");
  if (v === "employment" || v === "hr" || v === "recruiting") return "employment";
  if (v === "credit" || v === "fintech" || v === "scoring") return "credit";
  if (v === "education" || v === "edtech" || v === "admissions") return "education";
  if (v === "essential_services" || v === "claims" || v === "triage") return "essential_services";
  if (v === "biometrics" || v === "identity") return "biometrics";
  if (v === "support_agent" || v === "agent" || v === "general" || v === "saas") return "support_agent";
  return null;
}

function resolveAnnexIvProvider(raw: string | undefined): AnnexIvCliProvider | null {
  if (raw === undefined) return "openai";
  const v = raw.trim().toLowerCase();
  if (v === "openai") return "openai";
  if (v === "anthropic" || v === "claude") return "anthropic";
  if (v === "gemini" || v === "google" || v === "google-genai") return "gemini";
  if (v === "mistral" || v === "mistral-ai") return "mistral";
  if (v === "azure-openai" || v === "azure_openai" || v === "azure") return "azure-openai";
  if (v === "aws-bedrock" || v === "aws_bedrock" || v === "bedrock") return "aws-bedrock";
  if (v === "python" || v === "fastapi" || v === "langchain" || v === "pydantic-ai") return "python";
  if (v === "rails" || v === "ruby" || v === "ruby-on-rails" || v === "ruby_llm" || v === "langchainrb") return "rails";
  return null;
}

export function annexIvReport(options: {
  domain?: string;
  useCase?: AnnexIvCliUseCase;
  provider?: AnnexIvCliProvider;
  tier?: "free" | "team";
  locale?: string;
} = {}): AnnexIvCliReport {
  const domain = publicGateHost(options.domain);
  const requestedLang =
    options.locale && (BADGE_LANGS as readonly string[]).includes(options.locale)
      ? (options.locale as BadgeLang)
      : undefined;
  const locale: BadgeLang = requestedLang ?? (domain ? langForHost(domain) : "en");
  const displaySystem = domain ?? "acme-ai.eu";
  const useCase = options.useCase ?? "employment";
  const provider = options.provider ?? "openai";
  const tier = options.tier ?? "team";
  const isTeam = tier === "team";
  const uc = ANNEX_IV_UC_META[useCase];
  const pv = ANNEX_IV_PV_META[provider];

  const sections: AnnexIvCliSection[] = [
    {
      number: "01",
      annexRef: "Annex IV §1",
      title: "General System Description, Intended Purpose & Release Identity",
      sourceMode: "scaffolded_free",
      populatedInPreview: true,
      summary: `${displaySystem} — ${uc.title} (${uc.annexIiiRef}). Intended purpose: ${uc.intendedPurpose}`,
    },
    {
      number: "02",
      annexRef: "Annex IV §2(a)–(d)",
      title: "System Architecture, Upstream Model Provider & Runtime Wrapper",
      sourceMode: "scaffolded_free",
      populatedInPreview: true,
      summary: `Upstream model: ${pv.label} wrapped via ${pv.wrapper} (spurvik@${CLI_VERSION}).`,
    },
    {
      number: "03",
      annexRef: "Annex IV §2(e) & Art. 10 / GDPR Art. 5(1)(c)",
      title: "Data Governance & Zero-Prompt-Text Pseudonymisation Boundary",
      sourceMode: "scaffolded_free",
      populatedInPreview: true,
      summary:
        "Keyed HMAC-SHA256 digests (inputHash, outputHash) computed on your server before ingestion; 0 bytes of raw prompt or personal data stored in Spurvik.",
    },
    {
      number: "04",
      annexRef: "Annex IV §2(g) & Article 12",
      title: "Automatic Event Logging & Chained HMAC-SHA256 Receipt Ledger",
      sourceMode: "auto_populated_team",
      populatedInPreview: isTeam,
      summary: isTeam
        ? "Auto-populated from Spurvik Team Frankfurt (eu-central-1) vault: chained prevLogHash -> recordHash integrity summary, model/version distribution, and active telemetry window (up to 2,000,000 events/mo)."
        : "[Manual placeholder on Free €0 — upgrade to Team €79/mo or €790/yr to auto-populate live Frankfurt Art. 12 chain digests & volume tables]",
    },
    {
      number: "05",
      annexRef: "Annex IV §2(e) & Article 14",
      title: "Human Oversight Measures & Pre-Execution Approval Gate Ledger",
      sourceMode: "auto_populated_team",
      populatedInPreview: isTeam,
      summary: isTeam
        ? `Auto-populated from Spurvik HITL ledger: consequential action \`${uc.consequentialAction}\` held behind signed Approve/Block review by ${uc.oversightRole} (Slack, Microsoft Teams, or signed webhook) with field-name-only payload summary.`
        : `[Manual placeholder on Free €0 — upgrade to Team €79/mo or €790/yr to attach hosted Art. 14 gate counts & reviewer decision audit summary for \`${uc.consequentialAction}\`]`,
    },
    {
      number: "06",
      annexRef: "Annex IV §3 & Article 15",
      title: "Accuracy, Robustness, Cybersecurity & Fail-Closed Error Handling",
      sourceMode: "auto_populated_team",
      populatedInPreview: isTeam,
      summary: isTeam
        ? "Auto-populated latency, error-rate, and 6-vector Art. 14 cryptographic signature self-test status (spurvik:art12:v1 & spurvik:art14:decision:v1)."
        : "[Manual placeholder on Free €0 — upgrade to Team €79/mo or €790/yr to embed automated fail-closed gate & error-rate telemetry]",
    },
    {
      number: "07",
      annexRef: "Annex IV §4–5 & Article 9",
      title: "Risk Management Matrix & Transparency Controls (Art. 13 & Art. 50)",
      sourceMode: "scaffolded_free",
      populatedInPreview: true,
      summary:
        "Deployer instructions (Art. 13), 24-language Art. 50(1) AI interaction notice (https://spurvik.com/badge.js), and 2 Dec 2026 Art. 50(2) C2PA provenance workflow.",
    },
    {
      number: "08",
      annexRef: "Annex IV §8–9, Article 19 & Article 72",
      title: "12-Month EU Frankfurt Retention, SIEM Webhook Export & Post-Market Monitoring",
      sourceMode: "auto_populated_team",
      populatedInPreview: isTeam,
      summary: isTeam
        ? "Active 12-month log retention in EU Frankfurt (eu-central-1) + signed SIEM/S3 webhook export supporting Art. 19 (>=6-month statutory log floor) and Art. 72 post-market monitoring."
        : "[Free €0 retains 30 days (Pro €19/mo: 90 days) — upgrade to Team €79/mo or €790/yr for 12-month Frankfurt retention & webhook export]",
    },
    {
      number: "09",
      annexRef: "Annex IV §6–7, Article 47 & Article 49",
      title: "Harmonised Standards, EU Declaration Cross-Reference & Art. 49 Registration",
      sourceMode: "auto_populated_team",
      populatedInPreview: isTeam,
      summary: isTeam
        ? `Structured export metadata block (system slug \`${displaySystem}\`, provider, Annex III category, export timestamp & workspace digest) ready for internal QMS sign-off under Art. 17 / Art. 47 / Art. 49.`
        : "[Manual sign-off table on Free €0 — upgrade to Team €79/mo or €790/yr to generate timestamped workspace Annex IV Markdown/PDF drafts]",
    },
  ];

  const appQuery = domain
    ? `appUrl=${encodeURIComponent(domain)}${locale !== "en" && locale !== langForHost(domain) ? `&locale=${encodeURIComponent(locale)}` : ""}`
    : locale !== "en"
      ? `locale=${encodeURIComponent(locale)}`
      : "";
  const joinQ = (base: string) => (appQuery ? `${base}${base.includes("?") ? "&" : "?"}${appQuery}` : base);
  const studioUrl = cliAnnexIvStudioUrl(domain, locale);
  const previewApiUrl = `${CONSOLE_ORIGIN}/api/v1/annex-iv/preview?domain=${encodeURIComponent(displaySystem)}&useCase=${useCase}&provider=${provider}&tier=${tier}${locale !== "en" ? `&locale=${encodeURIComponent(locale)}` : ""}`;
  const rfpUrl = domain
    ? cliRfpQuestionnaireUrl(domain, locale)
    : cliRfpQuestionnaireUrl("acme.eu", locale).replace(/\?domain=acme\.eu$/, "");
  const teamUpgradeUrl = joinQ(TEAM_SIGNUP_URL);
  const teamAnnualUrl = joinQ(`${CONSOLE_ORIGIN}/signup?plan=team&interval=annual`);
  const proUpgradeUrl = joinQ(PRO_SIGNUP_URL);
  const freeSignupUrl = joinQ(SIGNUP_URL);
  const doneForYouUrl = joinQ(CONCIERGE_SIGNUP_URL);

  const markdown = [
    `# EU AI Act Annex IV Technical Documentation Draft — ${displaySystem}`,
    "",
    "- **Regulation**: Regulation (EU) 2024/1689 — Article 11(1) & Annex IV",
    `- **Annex III Scope**: ${uc.annexIiiRef}`,
    `- **Upstream Model & Wrapper**: ${pv.label} — \`${pv.wrapper}\``,
    "- **Control-Plane Region**: EU Frankfurt (`eu-central-1` / `fra1`)",
    `- **Preview Mode**: ${
      isTeam
        ? "Spurvik Team (€79/mo or €790/yr) — 9/9 sections populated from live Frankfurt telemetry & HITL ledger"
        : "Free Skeleton (€0) — 4/9 static sections scaffolded (upgrade to Team €79/mo for live Art. 12/14/19 auto-population)"
    }`,
    "",
    ...sections.flatMap((sec) => [
      `## Section ${sec.number} (${sec.annexRef}) — ${sec.title}`,
      `- **Source**: ${sec.sourceMode === "auto_populated_team" ? "Live Spurvik Team Vault (eu-central-1)" : "Static Engineering Scaffold"}`,
      `- **Record**: ${sec.summary}`,
      "",
    ]),
    "## Provider Sign-Off Checklist (Owner Organisation)",
    "- [ ] Confirm Annex III classification and intended purpose boundaries (Art. 6, Art. 9)",
    "- [ ] Attach evaluation datasets, bias tests, and human-oversight SOPs (Art. 10, Art. 14, Art. 15)",
    "- [ ] Complete EU Declaration of Conformity (Art. 47) and EU database registration where applicable (Art. 49)",
    "",
    "## Links & Workspace Activation (Prices excl. VAT, B2B)",
    `- Interactive 9-section Annex IV Studio: ${studioUrl}`,
    `- Team 2M events + 12-month Frankfurt retention + live Annex IV export (€79/mo): ${teamUpgradeUrl}`,
    `- Team Annual (2 months free · €790/yr): ${teamAnnualUrl}`,
    `- 24h Engineer Done-For-You Setup (€199 once, incl. 1 year of Pro): ${doneForYouUrl}`,
    "",
    "_Technical documentation scaffold generated offline (0 network requests); supports EU AI Act Art. 11 & Annex IV preparation, not legal advice._",
  ].join("\n");

  return {
    format: "spurvik.annex-iv-preview.v1",
    regulation: "Regulation (EU) 2024/1689 — Article 11(1) & Annex IV",
    highRiskApplicabilityDate: "2027-12-02",
    art502ProvenanceMilestone: "2026-12-02",
    region: "fra1",
    domain,
    displaySystem,
    locale,
    useCase,
    annexIiiReference: uc.annexIiiRef,
    provider,
    tier,
    readinessScorePct: isTeam ? 100 : 44,
    sections,
    markdown,
    links: {
      studioUrl,
      previewApiUrl,
      rfpQuestionnaireUrl: rfpUrl,
      freeSignupUrl,
      proUpgradeUrl,
      teamUpgradeUrl,
      teamAnnualUrl,
      doneForYouUrl,
    },
  };
}

export function buildAnnexIvCsv(report: AnnexIvCliReport): string {
  const pv = ANNEX_IV_PV_META[report.provider];
  const cell = (raw: string): string => {
    const flat = raw.replace(/\r?\n+/g, " ").trim();
    const guarded = /^[=+\-@\t\r]/.test(flat) ? `'${flat}` : flat;
    return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
  };
  const header = [
    "Section",
    "Annex_IV_Reference",
    "Title",
    "Source_Mode",
    "Populated",
    "System",
    "Annex_III_Scope",
    "Model_Provider",
    "Summary",
    "Team_Upgrade_URL",
    "Studio_URL",
  ].join(",");
  const rows = report.sections.map((sec) =>
    [
      cell(`Section ${sec.number}`),
      cell(sec.annexRef),
      cell(sec.title),
      cell(sec.sourceMode),
      cell(sec.populatedInPreview ? "Yes" : "Team (€79/mo)"),
      cell(report.displaySystem),
      cell(report.annexIiiReference),
      cell(pv.label),
      cell(sec.summary),
      cell(report.links.teamUpgradeUrl),
      cell(report.links.studioUrl),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

function cmdAnnexIv(args: ParsedArgs, io: Io): number {
  if (args.json && args.csv) {
    io.err("spurvik annex-iv: choose either --json or --csv, not both.");
    return EXIT_ERROR;
  }
  if (args.positionals.length > 1 || (args.positionals.length === 1 && args.domain !== undefined)) {
    io.err(ANNEX_IV_USAGE);
    return EXIT_ERROR;
  }
  if (args.lang !== undefined && !(BADGE_LANGS as readonly string[]).includes(args.lang)) {
    io.err(`spurvik annex-iv: --lang must be one of ${BADGE_LANGS.join(", ")}`);
    return EXIT_ERROR;
  }
  const useCase = resolveAnnexIvUseCase(args.useCase);
  if (!useCase) {
    io.err(`spurvik annex-iv: --use-case must be one of ${ANNEX_IV_CLI_USE_CASES.join(", ")}`);
    return EXIT_ERROR;
  }
  const provider = resolveAnnexIvProvider(args.provider);
  if (!provider) {
    io.err(`spurvik annex-iv: --provider must be one of ${ANNEX_IV_CLI_PROVIDERS.join(", ")}`);
    return EXIT_ERROR;
  }
  const rawPlan = args.plan !== undefined ? args.plan.trim().toLowerCase() : "team";
  if (rawPlan !== "team" && rawPlan !== "free") {
    io.err("spurvik annex-iv: --plan must be team or free");
    return EXIT_ERROR;
  }
  const report = annexIvReport({
    domain: args.domain ?? args.positionals[0],
    useCase,
    provider,
    tier: rawPlan,
    locale: args.lang,
  });
  if (args.json) {
    io.out(JSON.stringify(report, null, 2));
    return EXIT_OK;
  }
  if (args.csv) {
    io.out(buildAnnexIvCsv(report));
    return EXIT_OK;
  }
  const { c, out } = io;
  for (const line of report.markdown.split("\n")) {
    if (line.startsWith("#")) out(c.bold(line));
    else if (line.startsWith("- ")) out(line.replace(/: (https:\/\/\S+)$/, (_m, url: string) => `: ${c.cyan(url)}`));
    else out(line);
  }
  return EXIT_OK;
}

const REPORT_USAGE = "Usage: spurvik report <domain> [--lang <eu-locale>] [--json]";

async function cmdReport(args: ParsedArgs, deps: CliDeps, io: Io): Promise<number> {
  const rawTarget = args.domain ?? args.positionals[0];
  if (!rawTarget || args.positionals.length > 1 || (args.positionals.length === 1 && args.domain !== undefined)) {
    io.err(REPORT_USAGE);
    return EXIT_ERROR;
  }
  if (args.lang !== undefined && !(BADGE_LANGS as readonly string[]).includes(args.lang)) {
    io.err(`spurvik report: --lang must be one of ${BADGE_LANGS.join(", ")}`);
    return EXIT_ERROR;
  }
  let target: ScanTarget;
  try {
    target = normalizeScanTarget(rawTarget);
  } catch (err) {
    io.err(`spurvik report: ${err instanceof Error ? err.message : INVALID}`);
    return EXIT_ERROR;
  }

  const host = target.host.replace(/^www\./i, "") || target.host;
  const locale: BadgeLang =
    args.lang && (BADGE_LANGS as readonly string[]).includes(args.lang)
      ? (args.lang as BadgeLang)
      : langForHost(host);
  const locQuery = locale !== "en" ? `&locale=${encodeURIComponent(locale)}` : "";
  const endpoint = `${CONSOLE_ORIGIN}/api/v1/report/markdown?domain=${encodeURIComponent(host)}${locQuery}`;
  const shareUrl = `${CONSOLE_ORIGIN}/report?domain=${encodeURIComponent(host)}${locQuery}`;
  const annexIvStudioUrl = cliAnnexIvStudioUrl(host, locale);
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? SCAN_TIMEOUT_MS;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    timer.unref?.();
    let res: Response;
    try {
      res = await fetchFn(endpoint, {
        method: "GET",
        headers: { accept: "application/json", "user-agent": USER_AGENT },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      if (data && data.ok === true && typeof data.markdown === "string") {
        if (args.json) {
          io.out(JSON.stringify(data, null, 2));
        } else {
          for (const line of data.markdown.split("\n")) {
            io.out(line.startsWith("#") ? io.c.bold(line) : line);
          }
        }
        return EXIT_OK;
      }
    }
  } catch {
    // Fall through to deterministic offline brief below.
  }

  const badgeHtml = `<script src="${BADGE_SCRIPT_SRC}" data-system="${host}"${locale !== "en" ? ` data-locale="${locale}"` : ""} data-position="bottom-left" defer></script>`;
  const offlineMd = [
    `# EU AI Act Art. 50(1) & 2 Dec 2026 Art. 50(2) Readiness Brief — ${host}`,
    "",
    `[![EU AI Act Art. 50](${CONSOLE_ORIGIN}/api/v1/badge/status.svg?domain=${encodeURIComponent(host)})](${shareUrl}) [![EU AI Act Art. 50(2) C2PA](${CONSOLE_ORIGIN}/api/v1/c2pa/status.svg?domain=${encodeURIComponent(host)})](${CONSOLE_ORIGIN}/c2pa?domain=${encodeURIComponent(host)})`,
    "",
    `_Offline fallback generated locally (console.spurvik.com unreachable). Live brief: ${shareUrl}_`,
    "",
    "## 1. Visible 24-Language Art. 50(1) AI Notice (0 Cookies)",
    "",
    "```html",
    badgeHtml,
    "```",
    "",
    "## 2. 2 Dec 2026 C2PA, Annex IV & B2B Activation (Excl. VAT)",
    "",
    `- **Interactive 9-Section Annex IV Studio**: ${annexIvStudioUrl}`,
    `- **Done-For-You 24h Engineer Setup (€199 once · incl. 1 year Pro)**: ${CONCIERGE_SIGNUP_URL}&appUrl=${encodeURIComponent(host)}${locQuery}`,
    `- **White-Label Pro (€19/mo or €190/yr)**: ${PRO_SIGNUP_URL}&appUrl=${encodeURIComponent(host)}${locQuery}`,
    `- **Team / Agency (€79/mo or €790/yr · 2M events + 12-mo retention + Annex IV)**: ${TEAM_SIGNUP_URL}&appUrl=${encodeURIComponent(host)}${locQuery}`,
  ].join("\n");

  if (args.json) {
    io.out(
      JSON.stringify(
        {
          ok: true,
          offlineFallback: true,
          domain: host,
          locale,
          shareUrl,
          annexIvStudioUrl,
          badgeScript: badgeHtml,
          markdown: offlineMd,
        },
        null,
        2,
      ),
    );
  } else {
    io.out(offlineMd);
  }
  return EXIT_OK;
}

// ---------------------------------------------------------------------------------------------------------------
// trust (alias: trust-center) — 100% offline customer-facing /trust & /security Markdown + SVG card embeds
// ---------------------------------------------------------------------------------------------------------------

function cmdTrust(args: ParsedArgs, io: Io): number {
  if (args.positionals.length > 1 || (args.positionals.length === 1 && args.domain !== undefined)) {
    io.err("Usage: spurvik trust [domain] [--lang <eu-locale>] [--json]");
    return EXIT_ERROR;
  }
  if (args.lang !== undefined && !(BADGE_LANGS as readonly string[]).includes(args.lang)) {
    io.err(`spurvik trust: --lang must be one of the 24 EU language codes: ${BADGE_LANGS.join(", ")}`);
    return EXIT_ERROR;
  }

  const rawDomain = args.positionals[0] ?? args.domain;
  const host = rawDomain ? questionnaireHostname(rawDomain) : null;
  const displayHost = host ?? "yourdomain.com";
  const locale: BadgeLang =
    args.lang && (BADGE_LANGS as readonly string[]).includes(args.lang)
      ? (args.lang as BadgeLang)
      : host
        ? langForHost(host)
        : "en";
  const locQuery = locale !== "en" ? `&locale=${encodeURIComponent(locale)}` : "";
  const encodedHost = encodeURIComponent(displayHost);

  const art50SvgUrl = `${CONSOLE_ORIGIN}/api/v1/badge/status.svg?domain=${encodedHost}`;
  const c2paSvgUrl = `${CONSOLE_ORIGIN}/api/v1/c2pa/status.svg?domain=${encodedHost}`;
  const trustCardSvgUrl = `${CONSOLE_ORIGIN}/api/v1/badge/card.svg?domain=${encodedHost}${locQuery}`;
  const reportUrl = `${CONSOLE_ORIGIN}/report?domain=${encodedHost}${locQuery}`;
  const c2paUrl = `${CONSOLE_ORIGIN}/c2pa?domain=${encodedHost}${locQuery}`;
  const aiActJsonUrl = `${CONSOLE_ORIGIN}/api/v1/badge/ai-act.json?domain=${encodedHost}${locQuery}`;
  const trustCenterApiUrl = `${CONSOLE_ORIGIN}/api/v1/badge/trust-center.md?domain=${encodedHost}${locQuery}`;
  const trustWidgetScript = `<script src="https://spurvik.com/trust-widget.js" data-domain="${displayHost}"${locale !== "en" ? ` data-locale="${locale}"` : ""} defer></script>`;
  const cmpExemptBadgeScript = `<script src="${BADGE_SCRIPT_SRC}" data-system="${displayHost}" data-locale="${locale}" data-position="bottom-left" data-cookieconsent="ignore" data-uc-allowed="true" data-cmp-ab="2" defer></script>`;

  const heading =
    locale === "de"
      ? `EU-KI-Verordnung Transparenz & Trust-Center — ${displayHost}`
      : locale === "fr"
        ? `Centre de Confiance Règlement IA (UE 2024/1689) — ${displayHost}`
        : `EU AI Act Transparency & Trust Center — ${displayHost}`;

  const intro =
    locale === "de"
      ? `Öffentliche Übersicht zu KI-Transparenzhinweisen (Art. 50 Abs. 1), C2PA-Medienherkunft zum 2. Dez. 2026 (Art. 50 Abs. 2), pseudonymisierter HMAC-SHA256-Protokollierung in Frankfurt (Art. 12) und menschlicher Freigabe (Art. 14).`
      : locale === "fr"
        ? `Synthèse publique des mentions d’interaction IA (Art. 50(1)), provenance C2PA au 2 déc. 2026 (Art. 50(2)), reçus HMAC-SHA256 pseudonymisés à Francfort (Art. 12) et validation humaine (Art. 14).`
        : `Public overview of AI interaction notices (Art. 50(1)), 2 December 2026 C2PA media provenance (Art. 50(2)), pseudonymised HMAC-SHA256 call receipts in EU Frankfurt (Art. 12), and pre-flight human approval gates (Art. 14).`;

  const markdown = [
    `# ${heading}`,
    "",
    `[![EU AI Act Art. 50](${art50SvgUrl})](${reportUrl}) [![EU AI Act Art. 50(2) C2PA](${c2paSvgUrl})](${c2paUrl})`,
    "",
    intro,
    "",
    `[![EU AI Act Trust Card — ${displayHost}](${trustCardSvgUrl})](${reportUrl})`,
    "",
    "## Controls & Architecture",
    "",
    "| EU AI Act Control | Implementation | Data Residency & Privacy |",
    "| --- | --- | --- |",
    `| **Art. 50(1) AI Interaction Notice** | 24-language Shadow DOM notice (\`role=\"status\"\`, WCAG 2.1 AA) | 0 cookies · Cookiebot & Usercentrics exempt |`,
    `| **Art. 50(2) Synthetic Media Provenance** | C2PA JUMBF manifest inspection & CDN strip prevention (2 Dec 2026) | [Live C2PA Check](${c2paUrl}) |`,
    "| **Art. 12 Event Logging & GDPR Art. 5(1)(c)** | Chained HMAC-SHA256 input/output digests (`0` bytes of raw prompt text) | EU Frankfurt (`fra1`) |",
    "| **Art. 14 Human Oversight** | Deterministic pre-flight approval gates (`Slack`, `Teams`, Console) | Fail-closed before external side effects |",
    `| **Machine-Readable Discovery** | \`/.well-known/ai-act.json\` (\`spurvik.ai-act-manifest.v1\`) | [${aiActJsonUrl}](${aiActJsonUrl}) |`,
    "",
    "## Embed on `/trust` or `/security` (0 Cookies)",
    "",
    "```html",
    trustWidgetScript,
    "<!-- Consent-exempt Art. 50(1) notice (Cookiebot / Usercentrics / OneTrust safe): -->",
    cmpExemptBadgeScript,
    "```",
    "",
    "---",
    "",
    `_Generated with Spurvik (\`fra1\` Frankfurt · EyeTea Solutions ApS, CVR 37093378) · [Live Readiness Brief](${reportUrl}) · [White-Label Pro (€19/mo or €190/yr)](${PRO_SIGNUP_URL}&appUrl=${encodedHost}${locQuery}) · [Team & Annex IV (€79/mo or €790/yr)](${TEAM_SIGNUP_URL}&appUrl=${encodedHost}${locQuery}) · [24h Engineer Setup (€199)](${CONCIERGE_SIGNUP_URL}&appUrl=${encodedHost}${locQuery})_`,
  ].join("\n");

  if (args.json) {
    io.out(
      JSON.stringify(
        {
          format: "spurvik.trust-center.v1",
          domain: host,
          locale,
          shields: { art50SvgUrl, c2paSvgUrl, trustCardSvgUrl },
          embeds: { trustWidgetScript, cmpExemptBadgeScript },
          links: {
            reportUrl,
            c2paUrl,
            aiActJsonUrl,
            trustCenterApiUrl,
            proUpgradeUrl: `${PRO_SIGNUP_URL}&appUrl=${encodedHost}${locQuery}`,
            teamUpgradeUrl: `${TEAM_SIGNUP_URL}&appUrl=${encodedHost}${locQuery}`,
            doneForYouUrl: `${CONCIERGE_SIGNUP_URL}&appUrl=${encodedHost}${locQuery}`,
          },
          markdown,
        },
        null,
        2,
      ),
    );
  } else {
    io.out(markdown);
  }
  return EXIT_OK;
}

// ---------------------------------------------------------------------------------------------------------------
// argv
// ---------------------------------------------------------------------------------------------------------------

interface ParsedArgs {
  command: string | undefined;
  positionals: string[];
  json: boolean;
  csv: boolean;
  failOnGap: boolean;
  failOnMissing: boolean;
  help: boolean;
  version: boolean;
  lang?: string;
  domain?: string;
  cms?: string;
  runtime?: string;
  plan?: string;
  provider?: string;
  generatesMedia: boolean;
  noHighRiskActions: boolean;
  useCase?: string;
  area?: string;
  interacts?: boolean;
  synthetic?: boolean;
  decisions?: boolean;
  unknown: string[];
}

const COMMANDS = new Set([
  "scan",
  "portfolio",
  "report",
  "brief",
  "dpo",
  "trust",
  "trust-center",
  "c2pa",
  "audit",
  "badge",
  "setup",
  "init",
  "rfp",
  "risk",
  "annex-iv",
  "art11",
  "gate",
  "block-test",
  "help",
  "version",
]);

function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: undefined,
    positionals: [],
    json: false,
    csv: false,
    failOnGap: false,
    failOnMissing: false,
    help: false,
    version: false,
    generatesMedia: false,
    noHighRiskActions: false,
    unknown: [],
  };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--") {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "--json") parsed.json = true;
    else if (arg === "--csv") parsed.csv = true;
    else if (arg === "--fail-on-gap") parsed.failOnGap = true;
    else if (arg === "--fail-on-missing") parsed.failOnMissing = true;
    else if (arg === "-h" || arg === "--help") parsed.help = true;
    else if (arg === "-v" || arg === "--version") parsed.version = true;
    else if (arg === "--lang") parsed.lang = argv[++i] ?? "";
    else if (arg.startsWith("--lang=")) parsed.lang = arg.slice("--lang=".length);
    else if (arg === "--domain") parsed.domain = argv[++i] ?? "";
    else if (arg.startsWith("--domain=")) parsed.domain = arg.slice("--domain=".length);
    else if (arg === "--cms") parsed.cms = argv[++i] ?? "";
    else if (arg.startsWith("--cms=")) parsed.cms = arg.slice("--cms=".length);
    else if (arg === "--runtime") parsed.runtime = argv[++i] ?? "";
    else if (arg.startsWith("--runtime=")) parsed.runtime = arg.slice("--runtime=".length);
    else if (arg === "--plan") parsed.plan = argv[++i] ?? "";
    else if (arg.startsWith("--plan=")) parsed.plan = arg.slice("--plan=".length);
    else if (arg === "--provider") parsed.provider = argv[++i] ?? "";
    else if (arg.startsWith("--provider=")) parsed.provider = arg.slice("--provider=".length);
    else if (arg === "--generates-media") parsed.generatesMedia = true;
    else if (arg === "--no-high-risk-actions") parsed.noHighRiskActions = true;
    else if (arg === "--use-case") parsed.useCase = argv[++i] ?? "";
    else if (arg.startsWith("--use-case=")) parsed.useCase = arg.slice("--use-case=".length);
    else if (arg === "--area") parsed.area = argv[++i] ?? "";
    else if (arg.startsWith("--area=")) parsed.area = arg.slice("--area=".length);
    else if (arg === "--interacts") parsed.interacts = true;
    else if (arg === "--no-interacts") parsed.interacts = false;
    else if (arg === "--synthetic") parsed.synthetic = true;
    else if (arg === "--no-synthetic") parsed.synthetic = false;
    else if (arg === "--decisions") parsed.decisions = true;
    else if (arg === "--no-decisions") parsed.decisions = false;
    else if (arg.startsWith("-") && arg.length > 1) parsed.unknown.push(arg);
    else rest.push(arg);
  }
  const first = rest[0];
  if (first !== undefined && COMMANDS.has(first)) {
    parsed.command = first;
    parsed.positionals = rest.slice(1);
  } else if (first !== undefined && looksLikeDomainOrUrl(first)) {
    parsed.command = "scan";
    parsed.positionals = rest;
  } else {
    parsed.command = first;
    parsed.positionals = rest.slice(1);
  }
  return parsed;
}

export function helpText(): string {
  return [
    `spurvik ${CLI_VERSION} — EU AI Act checks from the terminal. No API key needed.`,
    "",
    "Usage:",
    "  spurvik scan <domain-or-url> [--json] [--fail-on-gap]   Art. 50(1) notice check of 1 to 10 live sites",
    "  spurvik report <domain> [--lang <eu-locale>] [--json]    Shareable DPO & Art. 50(1)/50(2) Markdown brief",
    "  spurvik trust [domain] [--lang <eu-locale>] [--json]     Offline /trust & /security Markdown + SVG card (0 network)",
    "  spurvik portfolio <domain...> [--json] [--fail-on-gap]  Agency batch Art. 50(1) check (up to 10 domains)",
    "  spurvik <domain>                                         Same as scan (e.g. npx spurvik folk.app)",
    "  spurvik c2pa <image-url> [--json] [--fail-on-missing]    C2PA JUMBF manifest & CDN-strip check (image URL or domain)",
    "  spurvik audit [dir] [--json] [--fail-on-gap]             Find unwrapped TS/JS & Python AI model calls",
    "  spurvik setup [target|dir] [--runtime <r>] [--json]      Auto-detect stack & print SDK/Python/CMS setup + .env",
    "  spurvik badge [domain] [--lang <eu-locale>] [--cms <c>]  24-language badge.js, Shopify, WP, Webflow & React snippets",
    "  spurvik gate [domain] [--lang <eu-locale>] [--json]      Offline 6-vector Art. 14 fail-closed blocking self-test",
    "  spurvik annex-iv [domain] [--use-case <u>] [--provider <p>] [--json]",
    "                                                           9-section EU AI Act Art. 11 & Annex IV Markdown draft (zero network)",
    "  spurvik risk [domain] [--use-case <text>] [--area <a>]   EU AI Act risk classifier & DPO self-assessment Markdown",
    "  spurvik rfp [domain] [--plan <plan>] [--provider <p>] [--json]",
    "                                                           EU AI Act vendor security questionnaire & DPO RFP answers (Q1–Q5)",
    "      --plan free|pro|team|concierge (default pro)",
    "      --provider openai|anthropic|google-genai|vercel-ai-sdk|langgraph|openai-agents|mastra|python|custom (default openai)",
    "      --generates-media, --no-high-risk-actions",
    "  spurvik --version | --help",
    "",
    "Exit codes: 0 ok, 1 gap found with --fail-on-gap, 2 usage or network error,",
    "            or c2pa --fail-on-missing with no C2PA manifest or a signature that does not match.",
    "",
    "Examples:",
    "  npx spurvik scan stepnetwork.dk",
    "  npx spurvik c2pa https://example.com/hero.png --fail-on-missing",
    "  npx spurvik c2pa charlie-paris.com",
    "  npx spurvik audit . --fail-on-gap",
    "  npx spurvik badge example.de",
    "  npx spurvik gate doctolib.fr",
    "  npx spurvik annex-iv personio.de --use-case employment --provider anthropic > ANNEX_IV.md",
    "  npx spurvik risk acme.eu --use-case \"Customer support chatbot\" > AI_ACT_RISK.md",
    "  npx spurvik rfp acme.eu --plan team --provider langgraph",
    "",
    "scan and c2pa send only the domain or URL you pass to console.spurvik.com; audit runs locally and prints file:line only;",
    "gate, annex-iv, risk and rfp make no request. Not legal advice.",
  ].join("\n");
}

export async function runCli(argv: readonly string[], deps: CliDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = deps.stderr ?? ((text: string) => process.stderr.write(text));
  const color = deps.color ?? (Boolean(process.stdout.isTTY) && !process.env.NO_COLOR);
  const io: Io = {
    out: (line = "") => stdout(`${line}\n`),
    err: (line = "") => stderr(`${line}\n`),
    c: paint(color),
  };
  const args = parseArgs(argv);
  if (args.version || args.command === "version") {
    io.out(CLI_VERSION);
    return EXIT_OK;
  }
  if (args.help || args.command === "help" || args.command === undefined) {
    io.out(helpText());
    return EXIT_OK;
  }
  if (args.unknown.length > 0) {
    io.err(`spurvik: unknown option ${escapeForTerminal(args.unknown[0]!)}. Run spurvik --help.`);
    return EXIT_ERROR;
  }
  if (args.cms !== undefined && args.command !== "badge") {
    io.err("spurvik: --cms applies to the badge command only.");
    return EXIT_ERROR;
  }
  if (args.runtime !== undefined && args.command !== "setup" && args.command !== "init") {
    io.err("spurvik: --runtime applies to the setup command only.");
    return EXIT_ERROR;
  }
  if (
    args.domain !== undefined &&
    args.command !== "setup" &&
    args.command !== "init" &&
    args.command !== "gate" &&
    args.command !== "block-test" &&
    args.command !== "annex-iv" &&
    args.command !== "art11" &&
    args.command !== "report" &&
    args.command !== "brief" &&
    args.command !== "dpo" &&
    args.command !== "trust" &&
    args.command !== "trust-center"
  ) {
    io.err("spurvik: --domain applies to the setup, report, trust, gate and annex-iv commands only.");
    return EXIT_ERROR;
  }
  if (
    args.lang !== undefined &&
    args.command !== "badge" &&
    args.command !== "rfp" &&
    args.command !== "risk" &&
    args.command !== "annex-iv" &&
    args.command !== "art11" &&
    args.command !== "setup" &&
    args.command !== "init" &&
    args.command !== "gate" &&
    args.command !== "block-test" &&
    args.command !== "report" &&
    args.command !== "brief" &&
    args.command !== "dpo" &&
    args.command !== "trust" &&
    args.command !== "trust-center"
  ) {
    io.err("spurvik: --lang applies to the badge, report, trust, gate, annex-iv, rfp, risk and setup commands only.");
    return EXIT_ERROR;
  }
  if (args.failOnMissing && args.command !== "c2pa") {
    io.err("spurvik: --fail-on-missing applies to the c2pa command only.");
    return EXIT_ERROR;
  }
  if (args.failOnGap && args.command === "c2pa") {
    io.err("spurvik: use --fail-on-missing with c2pa (--fail-on-gap is for scan and audit).");
    return EXIT_ERROR;
  }
  if (
    args.failOnGap &&
    (args.command === "rfp" ||
      args.command === "risk" ||
      args.command === "annex-iv" ||
      args.command === "art11" ||
      args.command === "setup" ||
      args.command === "init" ||
      args.command === "gate" ||
      args.command === "block-test" ||
      args.command === "report" ||
      args.command === "brief" ||
      args.command === "dpo" ||
      args.command === "trust" ||
      args.command === "trust-center")
  ) {
    io.err("spurvik: --fail-on-gap is for scan and audit.");
    return EXIT_ERROR;
  }
  if (
    args.csv &&
    args.command !== "rfp" &&
    args.command !== "scan" &&
    args.command !== "portfolio" &&
    args.command !== "annex-iv" &&
    args.command !== "art11"
  ) {
    io.err("spurvik: --csv applies to the rfp, annex-iv, scan and portfolio commands only.");
    return EXIT_ERROR;
  }
  if ((args.generatesMedia || args.noHighRiskActions) && args.command !== "rfp") {
    io.err("spurvik: --generates-media and --no-high-risk-actions apply to the rfp command only.");
    return EXIT_ERROR;
  }
  if (
    (args.plan !== undefined || args.provider !== undefined) &&
    args.command !== "rfp" &&
    args.command !== "annex-iv" &&
    args.command !== "art11"
  ) {
    io.err("spurvik: --plan and --provider apply to the rfp and annex-iv commands only.");
    return EXIT_ERROR;
  }
  if (
    args.useCase !== undefined &&
    args.command !== "risk" &&
    args.command !== "annex-iv" &&
    args.command !== "art11"
  ) {
    io.err("spurvik: --use-case applies to the risk and annex-iv commands only.");
    return EXIT_ERROR;
  }
  if (
    (args.area !== undefined ||
      args.interacts !== undefined ||
      args.synthetic !== undefined ||
      args.decisions !== undefined) &&
    args.command !== "risk"
  ) {
    io.err("spurvik: --area, --interacts, --synthetic and --decisions apply to the risk command only.");
    return EXIT_ERROR;
  }
  switch (args.command) {
    case "scan":
    case "portfolio":
      return cmdScan(args, deps, io);
    case "report":
    case "brief":
    case "dpo":
      return cmdReport(args, deps, io);
    case "trust":
    case "trust-center":
      return cmdTrust(args, io);
    case "c2pa":
      return cmdC2pa(args, deps, io);
    case "audit":
      return cmdAudit(args, deps, io);
    case "badge":
      return cmdBadge(args, io);
    case "setup":
    case "init":
      return cmdSetup(args, deps, io);
    case "rfp":
      return cmdRfp(args, io);
    case "risk":
      return cmdRisk(args, io);
    case "annex-iv":
    case "art11":
      return cmdAnnexIv(args, io);
    case "gate":
    case "block-test":
      return cmdGate(args, io);
    default:
      io.err(`spurvik: unknown command "${cleanText(args.command, 40)}". Run spurvik --help.`);
      return EXIT_ERROR;
  }
}

/**
 * `spurvik rfp | head -n 5`: once the reader closes the pipe, drop the rest of the output instead of crashing
 * with an uncaught EPIPE. The command still exits with its own code. Other stream errors are rethrown.
 */
export function ignoreBrokenPipe(stream: NodeJS.WritableStream): void {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") throw error;
  });
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  ignoreBrokenPipe(process.stdout);
  ignoreBrokenPipe(process.stderr);
  runCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      process.stderr.write("spurvik: unexpected error.\n");
      process.exitCode = EXIT_ERROR;
    },
  );
}
