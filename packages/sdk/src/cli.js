/**
 * `spurvik` CLI: zero-API-key Art. 50(1) live-site scan, C2PA image manifest & CDN-strip check, local unwrapped-call
 * audit, badge.js snippets, and local EU AI Act vendor questionnaire & DPO RFP answers.
 *
 * Nothing here reads environment variables (except NO_COLOR), writes files, or logs input anywhere but stdout/stderr.
 * `audit` never prints source text: only relative `file:line` and a provider label.
 */
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { classifySpurvikRisk, SPURVIK_RISK_AREAS, } from "./classify-risk.js";
import { questionnaireHostname, SPURVIK_QUESTIONNAIRE_LOCALES, SPURVIK_QUESTIONNAIRE_PLANS, SPURVIK_QUESTIONNAIRE_PROVIDERS, spurvikVendorQuestionnaireAnswers, } from "./vendor-questionnaire.js";
export const CLI_VERSION = "1.0.12";
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
function paint(enabled) {
    const wrap = (open, close) => (s) => (enabled ? `\u001b[${open}m${s}\u001b[${close}m` : s);
    return { bold: wrap(1, 22), dim: wrap(2, 22), red: wrap(31, 39), green: wrap(32, 39), yellow: wrap(33, 39), cyan: wrap(36, 39) };
}
// ---------------------------------------------------------------------------------------------------------------
// Target normalisation (same public-host pre-check as spurvik-mcp-server's scan tool; the console re-checks)
// ---------------------------------------------------------------------------------------------------------------
export class ScanTargetError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "ScanTargetError";
        this.code = code;
    }
}
const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/;
const INVALID = "Not a valid domain or URL. Try: spurvik scan example.com";
const BLOCKED = "That host is not a public address. localhost, private IPs and internal hosts are not scanned.";
const BLOCKED_SUFFIXES = ["localhost", "local", "internal", "localdomain", "lan", "home.arpa", "intranet", "corp"];
const IPV4_RESERVED = [
    [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16], [0xac100000, 12],
    [0xc0000000, 24], [0xc0000200, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24],
    [0xe0000000, 4], [0xf0000000, 4],
];
function parseIpv4(value) {
    const parts = value.split(".");
    if (parts.length !== 4)
        return null;
    let out = 0;
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part) || (part.length > 1 && part.startsWith("0")))
            return null;
        const num = Number(part);
        if (num > 255)
            return null;
        out = out * 256 + num;
    }
    return out;
}
function ipv4Public(ip) {
    return !IPV4_RESERVED.some(([base, bits]) => {
        const mask = (0xffffffff << (32 - bits)) >>> 0;
        return ((ip >>> 0) & mask) === ((base >>> 0) & mask);
    });
}
function ipv6Groups(value) {
    let text = value;
    if (text.includes(".")) {
        const lastColon = text.lastIndexOf(":");
        const v4 = lastColon === -1 ? null : parseIpv4(text.slice(lastColon + 1));
        if (v4 === null)
            return null;
        text = `${text.slice(0, lastColon)}:${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
    }
    const halves = text.split("::");
    if (halves.length > 2)
        return null;
    const head = halves[0] ? halves[0].split(":") : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    const missing = 8 - head.length - tail.length;
    if (halves.length === 1 ? head.length !== 8 : missing < 1)
        return null;
    const groups = halves.length === 2 ? [...head, ...Array(missing).fill("0"), ...tail] : head;
    const nums = [];
    for (const group of groups) {
        if (!/^[0-9a-f]{1,4}$/.test(group))
            return null;
        nums.push(Number.parseInt(group, 16));
    }
    return nums.length === 8 ? nums : null;
}
function ipv6Public(g) {
    const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
    const firstFiveZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
    if (firstFiveZero && g5 === 0xffff)
        return ipv4Public(((g6 << 16) | g7) >>> 0);
    if (firstFiveZero && g5 === 0)
        return false;
    if ((g0 & 0xfe00) === 0xfc00 || (g0 & 0xffc0) === 0xfe80 || (g0 & 0xff00) === 0xff00)
        return false;
    if ((g0 === 0x2001 && g1 === 0x0db8) || (g0 === 0x0064 && g1 === 0xff9b) || g0 === 0x2002)
        return false;
    if (g0 === 0x2001 && (g1 & 0xfe00) === 0)
        return false;
    if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0)
        return false;
    return true;
}
/** true/false for an IP literal, null for a host name. */
function isPublicIpLiteral(host) {
    if (host.includes("%"))
        return false;
    if (host.includes(":")) {
        const groups = ipv6Groups(host);
        return groups ? ipv6Public(groups) : false;
    }
    const v4 = parseIpv4(host);
    if (v4 !== null)
        return ipv4Public(v4);
    if (/^[0-9.]+$/.test(host))
        return false;
    return null;
}
/** Bare domain or http(s) URL -> https URL on a public host. No DNS lookup: the console resolves and pins the address. */
export function normalizeScanTarget(raw) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 2048 || /[\u0000-\u001f\u007f\s<>"'`\\]/.test(trimmed)) {
        throw new ScanTargetError("invalid_url", INVALID);
    }
    const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed)?.[1]?.toLowerCase();
    if ((scheme !== undefined && scheme !== "http" && scheme !== "https") ||
        (scheme === undefined && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed) && !trimmed.startsWith("["))) {
        throw new ScanTargetError("invalid_url", "Only http and https URLs can be scanned.");
    }
    let url;
    try {
        url = new URL(scheme === undefined ? `https://${trimmed.replace(/^\/\//, "")}` : trimmed);
    }
    catch {
        throw new ScanTargetError("invalid_url", INVALID);
    }
    if (url.username || url.password)
        throw new ScanTargetError("invalid_url", "Credentials are not allowed in a scan URL.");
    const nonDefaultPort = url.port !== "";
    url.protocol = "https:";
    url.hash = "";
    let host = url.hostname.toLowerCase();
    if (host.endsWith("."))
        host = host.slice(0, -1);
    if (host.startsWith("[") && host.endsWith("]"))
        host = host.slice(1, -1);
    if (!host)
        throw new ScanTargetError("invalid_url", INVALID);
    const ipPublic = isPublicIpLiteral(host);
    if (ipPublic === false)
        throw new ScanTargetError("blocked_target", BLOCKED);
    if (ipPublic === null) {
        if (BLOCKED_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`)))
            throw new ScanTargetError("blocked_target", BLOCKED);
        if (!HOSTNAME_RE.test(host)) {
            throw new ScanTargetError(host.includes(".") ? "invalid_url" : "blocked_target", host.includes(".") ? INVALID : BLOCKED);
        }
    }
    if (nonDefaultPort)
        throw new ScanTargetError("invalid_url", "Only the default http(s) port is allowed.");
    if (!host.includes(":"))
        url.hostname = host; // drop a trailing dot
    return { url: url.toString(), host };
}
/** True when a bare argument should be read as `scan <arg>` (folk.app, https://example.com), not as a command. */
export function looksLikeDomainOrUrl(arg) {
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
];
/** ccTLD -> one of the 24 official EU languages (same table as spurvik-mcp-server and the console). */
const CCTLD_LOCALES = {
    dk: "da", de: "de", at: "de", se: "sv", nl: "nl", fr: "fr", be: "fr", es: "es", it: "it", pl: "pl", pt: "pt", fi: "fi",
    gr: "el", cz: "cs", ro: "ro", hu: "hu", bg: "bg", hr: "hr", sk: "sk", si: "sl", lt: "lt", lv: "lv", ee: "et",
};
/** Maps EU country-code TLDs (.dk -> da, .de/.at -> de, .fr/.be -> fr, .nl -> nl, .se -> sv, ...) or falls back to en. */
export function langForHost(host) {
    const tld = (host ?? "").toLowerCase().replace(/\.$/, "").split(".").pop() ?? "";
    return Object.prototype.hasOwnProperty.call(CCTLD_LOCALES, tld) ? CCTLD_LOCALES[tld] : "en";
}
/** Strips attribute-breaking and control/bidi characters; caps at 64 chars. Safe inside a double-quoted HTML/JSX attribute. */
export function sanitizeSystemName(raw, fallback = "AI assistant") {
    const cleaned = (raw ?? "")
        .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069<>"'`&\\{}]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 64)
        .trim();
    return cleaned || fallback;
}
/** Best-effort host for display/snippets (no network, no public-address check). */
function hostForSnippet(raw) {
    if (!raw)
        return undefined;
    try {
        return normalizeScanTarget(raw).host;
    }
    catch {
        try {
            const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
            return url.hostname.toLowerCase() || undefined;
        }
        catch {
            return undefined;
        }
    }
}
export function badgeScriptTag(systemName, lang, attribution = true) {
    return `<script src="${BADGE_SCRIPT_SRC}" data-system="${sanitizeSystemName(systemName)}" data-locale="${lang}" data-attribution="${attribution ? "true" : "false"}" defer></script>`;
}
const CLI_CONFIRMED_AI_RE = /\b(?:Intercom Fin|Zendesk AI|Botpress|Voiceflow|ElevenLabs ConvAI|Chatbase|OpenAI ChatKit|Ada|Vercel AI SDK|OpenAI|Anthropic|Google Gemini|LangChain|Mastra)\b/i;
function cliRfpQuestionnaireUrl(host, locale = "en") {
    const code = (locale || "en").trim().toLowerCase();
    const slug = code === "de"
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
function sanitizeCliHeroImageUrl(raw) {
    if (typeof raw !== "string")
        return null;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 1024 || !/^https:\/\//i.test(trimmed))
        return null;
    try {
        return normalizeScanTarget(trimmed).url;
    }
    catch {
        return null;
    }
}
export function scanLinks(host, resolvedLang, heroImageUrl) {
    const h = encodeURIComponent(host);
    const tldLang = langForHost(host);
    const lang = resolvedLang ?? tldLang;
    const extraLocale = lang !== "en" && lang !== tldLang ? `&locale=${encodeURIComponent(lang)}` : "";
    const c2paParts = [`domain=${h}`];
    if (lang !== "en")
        c2paParts.push(`locale=${encodeURIComponent(lang)}`);
    if (heroImageUrl)
        c2paParts.push(`url=${encodeURIComponent(heroImageUrl)}`);
    return {
        reportUrl: `${CONSOLE_ORIGIN}/report?domain=${h}${extraLocale}`,
        sandboxUrl: `${CONSOLE_ORIGIN}/sandbox?scan=${h}`,
        portfolioUrl: PORTFOLIO_URL,
        c2paCheckUrl: `${CONSOLE_ORIGIN}/c2pa?${c2paParts.join("&")}`,
        rfpQuestionnaireUrl: cliRfpQuestionnaireUrl(host, lang),
        proUpgradeUrl: `${CONSOLE_ORIGIN}/signup?plan=pro&appUrl=${h}${extraLocale}`,
        teamUpgradeUrl: `${CONSOLE_ORIGIN}/signup?plan=team&appUrl=${h}${extraLocale}`,
        doneForYouUrl: `${CONSOLE_ORIGIN}/signup?plan=concierge&appUrl=${h}${extraLocale}`,
    };
}
function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Upstream strings go to a terminal: drop control, bidi, zero-width and tag chars (no ANSI injection), trim, cap. */
function cleanText(value, max = 120) {
    return typeof value === "string"
        ? value.replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff\u{e0000}-\u{e007f}]/gu, "").trim().slice(0, max)
        : "";
}
/** Local file names can hold control/bidi characters too: show them as \\uXXXX instead of sending them to the terminal. */
export function escapeForTerminal(value) {
    return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
function cleanList(...values) {
    const out = [];
    for (const value of values) {
        if (!Array.isArray(value))
            continue;
        for (const item of value) {
            const clean = cleanText(item);
            if (clean && !out.includes(clean))
                out.push(clean);
            if (out.length >= 50)
                return out;
        }
    }
    return out;
}
/** Builds the report from the console answer `{ ok, scan: { reachable, httpStatus, detectedWidgets, markers, cards } }`. */
export function reportFromScan(target, body) {
    if (!isRecord(body))
        return null;
    const scan = isRecord(body.scan) ? body.scan : body;
    if (typeof scan.reachable !== "boolean")
        return null;
    const httpStatus = typeof scan.httpStatus === "number" && Number.isInteger(scan.httpStatus) && scan.httpStatus >= 100 && scan.httpStatus <= 599
        ? scan.httpStatus
        : null;
    // httpStatus is set only when the page answered with an error status, so nothing on it was read.
    const pageRead = scan.reachable && httpStatus === null;
    const markers = isRecord(scan.markers) ? scan.markers : {};
    const cards = isRecord(scan.cards) ? scan.cards : {};
    const art50Card = isRecord(cards.art50_1) ? cards.art50_1 : {};
    const disclosure = markers.art50_1_disclosure === true || art50Card.status === "detected";
    const widgets = pageRead ? cleanList(scan.detectedWidgets, scan.detectedSdks) : [];
    const confirmedAiSurface = pageRead
        ? (Array.isArray(scan.detectedSdks) && cleanList(scan.detectedSdks).length > 0) ||
            widgets.some((w) => CLI_CONFIRMED_AI_RE.test(w))
        : null;
    const heroImageUrl = pageRead ? sanitizeCliHeroImageUrl(scan.heroImageUrl) : null;
    const status = !pageRead ? "unreachable" : disclosure ? "covered" : widgets.length > 0 ? "gap" : "no_widget_detected";
    const scannedUrl = cleanText(scan.scannedUrl, 2048);
    const tldLang = langForHost(target.host);
    const resolvedLang = tldLang === "en" && pageRead && typeof scan.htmlLocale === "string" && scan.htmlLocale !== "en" && BADGE_LANGS.includes(scan.htmlLocale)
        ? scan.htmlLocale
        : tldLang;
    return {
        domain: target.host,
        scannedUrl: /^https:\/\//.test(scannedUrl) ? scannedUrl : target.url,
        status,
        reachable: scan.reachable,
        httpStatus,
        detectedWidgets: widgets,
        confirmedAiSurface,
        heroImageUrl,
        covered: pageRead ? disclosure : null,
        badgeSnippet: badgeScriptTag(target.host, resolvedLang),
        links: scanLinks(target.host, resolvedLang, heroImageUrl),
    };
}
class ScanFailed extends Error {
}
async function fetchScan(target, deps) {
    const fetchImpl = deps.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function")
        throw new ScanFailed("This Node.js has no fetch. Use Node.js 20 or later.");
    let response;
    try {
        response = await fetchImpl(`${SCAN_ENDPOINT}?url=${encodeURIComponent(target.url)}`, {
            method: "GET",
            headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
            signal: AbortSignal.timeout(deps.timeoutMs ?? SCAN_TIMEOUT_MS),
        });
    }
    catch (error) {
        const name = error instanceof Error ? error.name : "";
        throw new ScanFailed(name === "TimeoutError" || name === "AbortError"
            ? `The scan service did not answer within ${Math.round((deps.timeoutMs ?? SCAN_TIMEOUT_MS) / 1000)}s.`
            : "Could not reach console.spurvik.com. Check your network and try again.");
    }
    let body = null;
    try {
        body = await response.json();
    }
    catch {
        body = null;
    }
    if (response.status !== 200) {
        const upstream = isRecord(body) && isRecord(body.error) ? body.error : {};
        const code = /^[a-z_]{1,40}$/.test(String(upstream.code ?? "")) ? String(upstream.code) : `http_${response.status}`;
        const message = cleanText(upstream.message, 200);
        throw new ScanFailed(`Scan refused (${code})${message ? `: ${message}` : "."}`);
    }
    const report = reportFromScan(target, body);
    if (!report)
        throw new ScanFailed("The scan service sent an answer this CLI cannot read. Try again later.");
    return report;
}
const STATUS_LABEL = {
    covered: "COVERED",
    gap: "GAP — AI widget detected without Art. 50 notice",
    no_widget_detected: "NO PUBLIC WIDGET DETECTED",
    unreachable: "NOT SCANNED — page could not be read",
};
function printScan(report, io) {
    const { c, out } = io;
    const row = (label, value) => out(`  ${c.dim(label.padEnd(18))}${value}`);
    const statusText = report.status === "covered"
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
    row("HTTP status", report.httpStatus !== null ? `${report.httpStatus} (page not read)` : report.reachable ? "reachable, page read" : "unreachable");
    row("AI widgets", report.detectedWidgets.length ? report.detectedWidgets.join(", ") : "none detected");
    row("Art. 50(1) notice", statusText);
    out();
    if (report.status !== "covered") {
        out(`  ${c.bold("1-line fix")} ${c.dim("(paste before </body>)")}`);
        out(`  ${report.badgeSnippet}`);
        out();
    }
    out(`  ${c.bold("Next steps")} ${c.dim("(prices excl. VAT)")}`);
    const step = (label, url) => {
        out(`  › ${label}`);
        out(`    ${c.cyan(url)}`);
    };
    step("Client / DPO PDF brief", report.links.reportUrl);
    step("2 Dec 2026 C2PA hero-image check", report.links.c2paCheckUrl);
    step("White-label Pro (€19/mo)", report.links.proUpgradeUrl);
    step("Team 2M events + Annex IV (€79/mo)", report.links.teamUpgradeUrl);
    step("24h engineer Done-For-You (€199 once, incl. 1 year of Pro)", report.links.doneForYouUrl);
    step("Batch scan 10 domains", report.links.portfolioUrl);
    out();
}
export const BATCH_SCAN_MAX_DOMAINS = 10;
const BATCH_SCAN_CONCURRENCY = 4;
async function mapPool(items, limit, worker) {
    const out = new Array(items.length);
    let next = 0;
    const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            out[index] = await worker(items[index]);
        }
    });
    await Promise.all(lanes);
    return out;
}
function printBatchScan(batch, io) {
    const { c, out } = io;
    out();
    out(`  ${c.bold("Spurvik · EU AI Act Art. 50(1) batch portfolio scan")} ${c.dim(`(${batch.totalDomains} domains)`)}`);
    out();
    for (const r of batch.results) {
        const tag = r.status === "covered"
            ? c.green("COVERED")
            : r.status === "gap"
                ? c.red("GAP")
                : r.status === "unreachable"
                    ? c.yellow("UNREACHABLE")
                    : c.cyan("NO WIDGET");
        const widgets = r.detectedWidgets.length ? r.detectedWidgets.join(", ") : "none";
        out(`  ${tag.padEnd(14)} ${r.domain.padEnd(26)} ${c.dim(`widgets: ${widgets}`)} · ${c.cyan(r.links.reportUrl)}`);
    }
    out();
    out(`  ${batch.gapsFound > 0 ? c.yellow(`⚠ ${batch.gapsFound} of ${batch.totalDomains} domain(s) missing a visible Art. 50(1) AI notice.`) : c.green("✓ Zero Art. 50(1) notice gaps detected across scanned domains.")}`);
    out();
    out(`  ${c.bold("Next steps")} ${c.dim("(prices excl. VAT)")}`);
    out(`  › Interactive portfolio matrix & CSV/Markdown export`);
    out(`    ${c.cyan(batch.links.portfolioUrl)}`);
    out(`  › Multi-Client Agency Team (€79/mo, incl. 12mo Frankfurt logs & Annex IV draft)`);
    out(`    ${c.cyan(batch.links.teamUpgradeUrl)}`);
    out(`  › 24h engineer Done-For-You setup (€199/site, incl. 1 year of Pro)`);
    out(`    ${c.cyan(batch.links.doneForYouUrl)}`);
    out();
}
async function cmdScan(args, deps, io) {
    if (args.positionals.length === 0) {
        io.err("Usage: spurvik scan <domain-or-url> [...up to 10 domains] [--json] [--fail-on-gap]");
        return EXIT_ERROR;
    }
    if (args.positionals.length > BATCH_SCAN_MAX_DOMAINS) {
        io.err(`spurvik scan takes 1 to ${BATCH_SCAN_MAX_DOMAINS} domains per run.`);
        return EXIT_ERROR;
    }
    if (args.positionals.length === 1) {
        let target;
        try {
            target = normalizeScanTarget(args.positionals[0]);
        }
        catch (error) {
            io.err(error instanceof ScanTargetError ? error.message : INVALID);
            return EXIT_ERROR;
        }
        let report;
        try {
            report = await fetchScan(target, deps);
        }
        catch (error) {
            const message = error instanceof ScanFailed ? error.message : "The scan failed.";
            if (args.json) {
                io.out(JSON.stringify({ domain: target.host, status: "error", error: message, links: scanLinks(target.host) }, null, 2));
            }
            else {
                io.err(`spurvik scan: ${message}`);
                io.err(`Run it in the browser instead: ${scanLinks(target.host).sandboxUrl}`);
            }
            return EXIT_ERROR;
        }
        if (args.json)
            io.out(JSON.stringify(report, null, 2));
        else
            printScan(report, io);
        return args.failOnGap && report.status === "gap" ? EXIT_GAP : EXIT_OK;
    }
    // Multi-domain batch scan (2..10 domains): validate all targets before any network call.
    const targets = [];
    const seen = new Set();
    let duplicatesRemoved = 0;
    for (const raw of args.positionals) {
        let target;
        try {
            target = normalizeScanTarget(raw);
        }
        catch (error) {
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
    let results;
    try {
        results = await mapPool(targets, BATCH_SCAN_CONCURRENCY, (target) => fetchScan(target, deps));
    }
    catch (error) {
        const message = error instanceof ScanFailed ? error.message : "The batch scan failed.";
        if (args.json) {
            io.out(JSON.stringify({ status: "error", error: message, links: { portfolioUrl: PORTFOLIO_URL } }, null, 2));
        }
        else {
            io.err(`spurvik scan: ${message}`);
            io.err(`Run it in the browser instead: ${PORTFOLIO_URL}`);
        }
        return EXIT_ERROR;
    }
    const gapsFound = results.filter((r) => r.status === "gap").length;
    const portfolioUrl = `${PORTFOLIO_URL}?domains=${targets.map((t) => encodeURIComponent(t.host)).join(",")}`;
    const batch = {
        totalDomains: results.length,
        duplicatesRemoved,
        gapsFound,
        results,
        links: {
            portfolioUrl,
            teamUpgradeUrl: TEAM_SIGNUP_URL,
            doneForYouUrl: CONCIERGE_SIGNUP_URL,
        },
    };
    if (args.json)
        io.out(JSON.stringify(batch, null, 2));
    else
        printBatchScan(batch, io);
    return args.failOnGap && gapsFound > 0 ? EXIT_GAP : EXIT_OK;
}
// ---------------------------------------------------------------------------------------------------------------
// audit
// ---------------------------------------------------------------------------------------------------------------
export const AUDIT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]);
export const AUDIT_SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".turbo", "vendor", ".venv"]);
export const AUDIT_MAX_FILE_BYTES = 512 * 1024;
const AUDIT_MAX_FILES = 20_000;
const AUDIT_MAX_DEPTH = 32;
const AUDIT_MAX_FINDINGS = 500;
/** A file that mentions any of these is treated as already wrapped. */
const WRAPPED_RE = /spurvik|wrapVercelModel/i;
const CALL_PATTERNS = [
    { re: /\bnew\s+OpenAI\s*\(/, provider: "OpenAI" },
    { re: /\bnew\s+Anthropic\s*\(/, provider: "Anthropic" },
    { re: /\bnew\s+GoogleGenAI\s*\(/, provider: "Google GenAI" },
    { re: /(?<!function\s+|def\s+)\bgenerateText\s*\(/, provider: "Vercel AI SDK generateText" },
    { re: /(?<!function\s+|def\s+)\bstreamText\s*\(/, provider: "Vercel AI SDK streamText" },
    { re: /(?<!\w)(?<!(?:class|def)\s+)(?:Async)?OpenAI\s*\(/, provider: "OpenAI", python: true },
    { re: /(?<!\w)(?<!(?:class|def)\s+)(?:Async)?Anthropic\s*\(/, provider: "Anthropic", python: true },
    { re: /\bgenai\.Client\s*\(/, provider: "Google GenAI", python: true },
    { re: /\bChatOpenAI\s*\(/, provider: "LangChain ChatOpenAI", python: true },
    { re: /\bChatAnthropic\s*\(/, provider: "LangChain ChatAnthropic", python: true },
];
function isCommentLine(line, python) {
    const t = line.trimStart();
    return python ? t.startsWith("#") : t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}
/** Read-only walk. Symlinks are not followed. Returns only file:line:provider, never source text. */
export function auditDirectory(root) {
    const report = { directory: root, filesScanned: 0, wrappedFiles: 0, unwrapped: [], truncated: false };
    const stack = [{ dir: root, depth: 0 }];
    while (stack.length > 0) {
        const { dir, depth } = stack.pop();
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        entries.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isSymbolicLink())
                continue;
            if (entry.isDirectory()) {
                if (!AUDIT_SKIP_DIRS.has(entry.name) && depth < AUDIT_MAX_DEPTH)
                    stack.push({ dir: full, depth: depth + 1 });
                continue;
            }
            if (!entry.isFile())
                continue;
            const ext = path.extname(entry.name).toLowerCase();
            if (!AUDIT_EXTENSIONS.has(ext))
                continue;
            if (report.filesScanned >= AUDIT_MAX_FILES) {
                report.truncated = true;
                return finishAudit(report);
            }
            let text;
            try {
                if (lstatSync(full).size > AUDIT_MAX_FILE_BYTES)
                    continue;
                text = readFileSync(full, "utf8");
            }
            catch {
                continue;
            }
            report.filesScanned += 1;
            if (WRAPPED_RE.test(text)) {
                report.wrappedFiles += 1;
                continue;
            }
            const python = ext === ".py";
            const rel = path.relative(root, full).split(path.sep).join("/");
            const lines = text.split(/\r?\n/);
            for (let i = 0; i < lines.length; i += 1) {
                const line = lines[i] ?? "";
                if (isCommentLine(line, python))
                    continue;
                const hit = CALL_PATTERNS.find((p) => Boolean(p.python) === python && p.re.test(line));
                if (!hit)
                    continue;
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
function finishAudit(report) {
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
const AUDIT_NEXT_STEPS = [
    ["Free SPURVIK_API_KEY in 10s (€0, 10,000 events/mo, no card)", SIGNUP_URL],
    ["White-label badge + 90d Frankfurt vault + HITL queue (Pro €19/mo)", PRO_SIGNUP_URL],
    ["24h Done-For-You engineer setup (€199 once, incl. 1 yr Pro)", CONCIERGE_SIGNUP_URL],
];
function cmdAudit(args, deps, io) {
    if (args.positionals.length > 1) {
        io.err("Usage: spurvik audit [dir] [--json] [--fail-on-gap]");
        return EXIT_ERROR;
    }
    const base = deps.cwd ?? process.cwd();
    const target = path.resolve(base, args.positionals[0] ?? ".");
    let root;
    try {
        root = realpathSync(target);
        if (!statSync(root).isDirectory())
            throw new Error("not a directory");
    }
    catch {
        io.err(`spurvik audit: not a readable directory: ${escapeForTerminal(args.positionals[0] ?? ".")}`);
        return EXIT_ERROR;
    }
    const report = auditDirectory(root);
    const display = args.positionals[0] ?? ".";
    if (args.json) {
        io.out(JSON.stringify({
            directory: display,
            filesScanned: report.filesScanned,
            wrappedFiles: report.wrappedFiles,
            unwrappedCount: report.unwrapped.length,
            unwrapped: report.unwrapped,
            truncated: report.truncated,
            consoleUrl: PRO_SIGNUP_URL,
            freeSignupUrl: SIGNUP_URL,
            doneForYouUrl: CONCIERGE_SIGNUP_URL,
        }, null, 2));
    }
    else {
        const { c, out } = io;
        out();
        out(`  ${c.bold("Spurvik · local audit of unwrapped model calls")} ${c.dim(`(${escapeForTerminal(display)})`)}`);
        out();
        out(`  ${c.dim("Files scanned".padEnd(18))}${report.filesScanned}${report.truncated ? c.yellow(" (limit reached)") : ""}`);
        out(`  ${c.dim("Already wrapped".padEnd(18))}${report.wrappedFiles} file(s)`);
        out(`  ${c.dim("Unwrapped calls".padEnd(18))}${report.unwrapped.length === 0 ? c.green("0") : c.red(String(report.unwrapped.length))}`);
        if (report.unwrapped.length > 0) {
            out();
            for (const f of report.unwrapped)
                out(`    ${escapeForTerminal(f.file)}:${f.line} — ${f.provider}`);
            out();
            out(`  ${c.bold("Wrap the client once")}`);
            for (const line of WRAP_SNIPPET)
                out(`    ${line}`);
            if (report.unwrapped.some((f) => f.provider.startsWith("Vercel AI SDK"))) {
                out();
                out(`  ${c.bold("Vercel AI SDK")}`);
                for (const line of AI_SDK_SNIPPET)
                    out(`    ${line}`);
            }
            if (report.unwrapped.some((f) => f.file.endsWith(".py"))) {
                out();
                out(`  ${c.bold("Python / FastAPI / LangChain")} ${c.dim("(Python 3.10+ stdlib only)")}`);
                for (const line of PYTHON_WRAP_SNIPPET)
                    out(`    ${line}`);
            }
            out(`  ${c.dim("config fields:")} ${QUICKSTART_URL}`);
            out(`  ${c.dim("tailored setup:")} npx spurvik setup`);
        }
        out();
        out(`  ${c.bold("Next steps")} ${c.dim("(hosted EU console, Frankfurt fra1; prices excl. VAT)")}`);
        for (const [label, url] of AUDIT_NEXT_STEPS)
            out(`  ${label}: ${c.cyan(url)}`);
        out();
    }
    return args.failOnGap && report.unwrapped.length > 0 ? EXIT_GAP : EXIT_OK;
}
// ---------------------------------------------------------------------------------------------------------------
// badge
// ---------------------------------------------------------------------------------------------------------------
export const BADGE_CMS_TARGETS = ["shopify", "wordpress", "webflow", "html", "react"];
function cmdBadge(args, io) {
    if (args.positionals.length > 1) {
        io.err("Usage: spurvik badge [domain] [--lang <eu-locale>] [--cms shopify|wordpress|webflow|html|react]");
        return EXIT_ERROR;
    }
    if (args.lang !== undefined && !BADGE_LANGS.includes(args.lang)) {
        io.err(`spurvik badge: --lang must be one of ${BADGE_LANGS.join(", ")}`);
        return EXIT_ERROR;
    }
    if (args.cms !== undefined && !BADGE_CMS_TARGETS.includes(args.cms)) {
        io.err(`spurvik badge: --cms must be one of ${BADGE_CMS_TARGETS.join(", ")}`);
        return EXIT_ERROR;
    }
    const host = hostForSnippet(args.positionals[0]);
    const lang = args.lang ?? langForHost(host);
    const systemName = sanitizeSystemName(host);
    const localeSuffix = args.lang !== undefined && host && langForHost(host) === "en" && lang !== "en"
        ? `&locale=${encodeURIComponent(lang)}`
        : "";
    const proUrl = host ? `${scanLinks(host).proUpgradeUrl}${localeSuffix}` : PRO_SIGNUP_URL;
    const conciergeUrl = host ? `${scanLinks(host).doneForYouUrl}${localeSuffix}` : CONCIERGE_SIGNUP_URL;
    const tag = badgeScriptTag(systemName, lang);
    const cms = args.cms;
    const { c, out } = io;
    out();
    out(`  ${c.bold("Spurvik · Art. 50(1) AI notice")} ${c.dim(`(${systemName}, ${lang}${cms ? `, ${cms}` : ""})`)}`);
    out();
    if (cms === "shopify") {
        out(`  ${c.bold("Shopify Online Store 2.0")} ${c.dim("(layout/theme.liquid before </body>)")}`);
        out(`  ${tag}`);
        out(`  ${c.dim("Section file (.liquid):")} https://spurvik.com/r/spurvik-shopify-art50.liquid`);
    }
    else if (cms === "wordpress") {
        out(`  ${c.bold("WordPress / WooCommerce")} ${c.dim("(wp_footer hook or 1-click .zip plugin)")}`);
        out(`  add_action('wp_footer', function () { echo '${tag}'; });`);
        out(`  ${c.dim("Plugin (.zip):")} https://spurvik.com/r/spurvik-eu-ai-act-wp.zip`);
    }
    else if (cms === "webflow") {
        out(`  ${c.bold("Webflow")} ${c.dim("(Site Settings -> Custom Code -> Footer Code)")}`);
        out(`  ${tag}`);
    }
    else if (cms === "html") {
        out(`  ${c.bold("Static HTML")} ${c.dim("(paste before </body>)")}`);
        out(`  ${tag}`);
    }
    else if (cms === "react") {
        out(`  ${c.bold("React / Next.js")} ${c.dim("(npm i spurvik)")}`);
        out(`  import { AIDisclosureLabel } from "spurvik/react";`);
        out(`  <AIDisclosureLabel notice="interaction" locale="${lang}" systemName="${systemName}" />`);
    }
    else {
        out(`  ${c.bold("Any site")} ${c.dim("(paste before </body>)")}`);
        out(`  ${tag}`);
        out();
        out(`  ${c.bold("React / Next.js")} ${c.dim("(npm i spurvik)")}`);
        out(`  import { AIDisclosureLabel } from "spurvik/react";`);
        out(`  <AIDisclosureLabel notice="interaction" locale="${lang}" systemName="${systemName}" />`);
    }
    out();
    out(`  ${c.bold("Accessibility")} ${c.dim(`(role="status", aria-live="polite", lang="${lang}" — WCAG 2.1 AA / EN 301 549)`)}`);
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
    "vercel-ai-sdk",
    "mastra",
    "openai-agents",
    "langgraph",
    "react",
    "python",
    "fastapi",
    "langchain",
    "pydantic-ai",
    "shopify",
    "wordpress",
    "webflow",
    "html",
    "n8n",
    "make",
];
export const SETUP_RUNTIMES = ["node", "next", "vercel", "supabase-edge", "python"];
const PYTHON_SETUP_TARGETS = ["python", "fastapi", "langchain", "pydantic-ai"];
const CMS_SETUP_TARGETS = ["shopify", "wordpress", "webflow", "html"];
const WORKFLOW_SETUP_TARGETS = ["n8n", "make"];
const SETUP_TARGET_ALIASES = {
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
    django: "python",
    flask: "python",
    woocommerce: "wordpress",
    prestashop: "html",
    shopware: "html",
    centra: "html",
    dandomain: "html",
    lightspeed: "html",
    "make.com": "make",
};
const SETUP_DEFAULT_RUNTIME_BY_ALIAS = {
    next: "next",
    nextjs: "next",
    "next.js": "next",
    vercel: "vercel",
    lovable: "supabase-edge",
    supabase: "supabase-edge",
    "supabase-edge": "supabase-edge",
};
function fileExists(p) {
    try {
        return statSync(p).isFile();
    }
    catch {
        return false;
    }
}
function dirExists(p) {
    try {
        return statSync(p).isDirectory();
    }
    catch {
        return false;
    }
}
export function detectSetupStack(root) {
    const pkgPath = path.join(root, "package.json");
    if (fileExists(pkgPath)) {
        try {
            const raw = JSON.parse(readFileSync(pkgPath, "utf8"));
            const deps = new Set([
                ...Object.keys(raw.dependencies ?? {}),
                ...Object.keys(raw.devDependencies ?? {}),
            ]);
            const hasSupabaseEdge = fileExists(path.join(root, "supabase", "config.toml")) || dirExists(path.join(root, "supabase", "functions"));
            const runtime = deps.has("next")
                ? "next"
                : deps.has("@vercel/functions")
                    ? "vercel"
                    : hasSupabaseEdge
                        ? "supabase-edge"
                        : "node";
            if (deps.has("n8n-nodes-spurvik") || deps.has("n8n-workflow")) {
                return { target: "n8n", runtime: "node", detected: true };
            }
            if (deps.has("@mastra/core"))
                return { target: "mastra", runtime, detected: true };
            if (deps.has("@openai/agents"))
                return { target: "openai-agents", runtime, detected: true };
            if (deps.has("@langchain/langgraph"))
                return { target: "langgraph", runtime, detected: true };
            if (deps.has("ai") || deps.has("@ai-sdk/openai") || deps.has("@ai-sdk/anthropic") || deps.has("@ai-sdk/google")) {
                return { target: "vercel-ai-sdk", runtime, detected: true };
            }
            if (deps.has("@anthropic-ai/sdk"))
                return { target: "anthropic", runtime, detected: true };
            if (deps.has("@google/genai") || deps.has("@google/generative-ai")) {
                return { target: "google-genai", runtime, detected: true };
            }
            if (deps.has("openai"))
                return { target: "openai", runtime, detected: true };
            if (deps.has("react"))
                return { target: "react", runtime, detected: true };
        }
        catch {
            // Unparseable package.json: fall through to Python/CMS checks.
        }
    }
    const pyTextParts = [];
    for (const name of ["pyproject.toml", "requirements.txt"]) {
        const p = path.join(root, name);
        if (fileExists(p)) {
            try {
                pyTextParts.push(readFileSync(p, "utf8").toLowerCase());
            }
            catch {
                // Ignore unreadable file.
            }
        }
    }
    if (pyTextParts.length > 0) {
        const combined = pyTextParts.join("\n");
        if (/\bfastapi\b/.test(combined))
            return { target: "fastapi", runtime: "python", detected: true };
        if (/\bpydantic[-_]ai\b/.test(combined))
            return { target: "pydantic-ai", runtime: "python", detected: true };
        if (/\b(langchain|langgraph)\b/.test(combined))
            return { target: "langchain", runtime: "python", detected: true };
        return { target: "python", runtime: "python", detected: true };
    }
    if (fileExists(path.join(root, "layout", "theme.liquid"))) {
        return { target: "shopify", runtime: "node", detected: true };
    }
    if (fileExists(path.join(root, "wp-config.php")) || dirExists(path.join(root, "wp-content"))) {
        return { target: "wordpress", runtime: "node", detected: true };
    }
    return { target: "openai", runtime: "node", detected: false };
}
function flushHelperLines(runtime, expr) {
    if (runtime === "next")
        return { importLine: 'import { after } from "next/server";', callLine: `after(() => ${expr});` };
    if (runtime === "vercel") {
        return { importLine: 'import { waitUntil } from "@vercel/functions";', callLine: `waitUntil(${expr});` };
    }
    if (runtime === "supabase-edge") {
        return { importLine: "", callLine: `EdgeRuntime.waitUntil(${expr});` };
    }
    return { importLine: "", callLine: "" };
}
function sdkConfigLines(serverless) {
    const lines = [
        "const spurvikConfig = {",
        "  apiKey: process.env.SPURVIK_API_KEY!,",
        "  signingSecret: process.env.SPURVIK_SIGNING_SECRET!,",
        '  contentHash: { mode: "keyed" as const, secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },',
        '  baseUrl: process.env.SPURVIK_BASE_URL ?? "https://console.spurvik.com",',
        '  riskTier: "limited_art50" as const, // Sample value; set your own classification.',
        "  article50Disclosure: false, // Set true only when your UI renders an AI notice.",
    ];
    if (serverless)
        lines.push("  registerProcessHooks: false,");
    lines.push("  telemetry: { flushTimeoutMs: 3_000 },", "};");
    return lines;
}
export function buildSetupReport(target, requestedRuntime, detected, options = {}) {
    const host = options.domain ? questionnaireHostname(options.domain) : null;
    const loc = options.locale && BADGE_LANGS.includes(options.locale) ? options.locale : undefined;
    const nonEnLoc = loc && loc !== "en" ? loc : undefined;
    const freeParams = [];
    if (host)
        freeParams.push(`appUrl=${encodeURIComponent(host)}`);
    if (nonEnLoc)
        freeParams.push(`locale=${nonEnLoc}`);
    const appParam = host ? `&appUrl=${encodeURIComponent(host)}` : "";
    const locParam = nonEnLoc ? `&locale=${nonEnLoc}` : "";
    const links = {
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
        const snippet = target === "make"
            ? [
                "# Import https://spurvik.com/r/make-com-spurvik-blueprint.json in Make.com",
                "# Sends keyed HMAC-SHA256 digests (0 bytes of prompt text) to https://console.spurvik.com/api/v1/telemetry",
            ].join("\n")
            : [
                "# In n8n: Settings -> Community Nodes -> Install n8n-nodes-spurvik (7 EU AI Act operations)",
                "# Starter workflow JSON: https://spurvik.com/r/n8n-art50-starter.json",
            ].join("\n");
        return {
            target,
            runtime: "workflow",
            detected,
            ...metaFields,
            installCommand: target === "make"
                ? "curl -fsSLO https://spurvik.com/r/make-com-spurvik-blueprint.json"
                : "npm install n8n-nodes-spurvik",
            snippet,
            envTemplate: [
                "SPURVIK_BASE_URL=https://console.spurvik.com",
                "SPURVIK_API_KEY=",
            ],
            links,
        };
    }
    if (CMS_SETUP_TARGETS.includes(target) || target === "react") {
        const snippetLocale = loc ?? "en";
        const snippetSystem = host ?? "Support Assistant";
        const snippet = target === "shopify"
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
                : target === "react"
                    ? [
                        'import { AIDisclosureLabel } from "spurvik/react";',
                        "",
                        `<AIDisclosureLabel notice="interaction" locale="${snippetLocale}" systemName="${snippetSystem}" />`,
                    ].join("\n")
                    : `<script src="https://spurvik.com/badge.js" data-system="${snippetSystem}" data-locale="${snippetLocale}" data-position="bottom-left" data-attribution="true" defer></script>`;
        const installCommand = target === "react"
            ? "npm install spurvik"
            : target === "shopify"
                ? "curl -fsSLO https://spurvik.com/r/spurvik-shopify-art50.liquid"
                : target === "wordpress"
                    ? "curl -fsSLO https://spurvik.com/r/spurvik-eu-ai-act-wp.zip"
                    : "# Zero-install 1-line <script> tag (0 cookies, 24 EU languages)";
        return {
            target,
            runtime: "browser",
            detected,
            ...metaFields,
            installCommand,
            snippet,
            envTemplate: [],
            links,
        };
    }
    const isPy = PYTHON_SETUP_TARGETS.includes(target) || requestedRuntime === "python";
    if (isPy) {
        const snippet = target === "fastapi"
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
            links,
        };
    }
    const tsRuntime = requestedRuntime ?? "node";
    const serverless = tsRuntime !== "node";
    const cfg = sdkConfigLines(serverless);
    let snippetLines;
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
    }
    else if (target === "mastra") {
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
    }
    else if (target === "openai-agents") {
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
    }
    else if (target === "langgraph") {
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
    }
    else if (target === "anthropic") {
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
    }
    else if (target === "google-genai") {
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
    }
    else {
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
        links,
    };
}
function cmdSetup(args, deps, io) {
    if (args.positionals.length > 1) {
        io.err(`Usage: spurvik setup [target|dir] [--runtime ${SETUP_RUNTIMES.join("|")}] [--domain <domain>] [--lang <eu-locale>] [--json]`);
        return EXIT_ERROR;
    }
    if (args.runtime !== undefined && !SETUP_RUNTIMES.includes(args.runtime)) {
        io.err(`spurvik setup: --runtime must be one of ${SETUP_RUNTIMES.join(", ")}`);
        return EXIT_ERROR;
    }
    if (args.lang !== undefined && !BADGE_LANGS.includes(args.lang)) {
        io.err(`spurvik setup: --lang must be one of the 24 EU language codes: ${BADGE_LANGS.join(", ")}`);
        return EXIT_ERROR;
    }
    const base = deps.cwd ?? process.cwd();
    const arg0 = args.positionals[0]?.trim();
    let target;
    let detected = false;
    let autoRuntime;
    if (!arg0) {
        const stack = detectSetupStack(base);
        target = stack.target;
        autoRuntime = stack.runtime;
        detected = stack.detected;
    }
    else if (SETUP_TARGETS.includes(arg0.toLowerCase())) {
        target = arg0.toLowerCase();
    }
    else if (Object.prototype.hasOwnProperty.call(SETUP_TARGET_ALIASES, arg0.toLowerCase())) {
        const lower = arg0.toLowerCase();
        target = SETUP_TARGET_ALIASES[lower];
        autoRuntime = SETUP_DEFAULT_RUNTIME_BY_ALIAS[lower];
    }
    else {
        const candidateDir = path.resolve(base, arg0);
        if (dirExists(candidateDir)) {
            const stack = detectSetupStack(candidateDir);
            target = stack.target;
            autoRuntime = stack.runtime;
            detected = stack.detected;
        }
        else {
            io.err(`spurvik setup: unknown target "${escapeForTerminal(arg0)}". Supported: ${SETUP_TARGETS.join(", ")}`);
            return EXIT_ERROR;
        }
    }
    const runtime = args.runtime ?? autoRuntime;
    const report = buildSetupReport(target, runtime, detected, { domain: args.domain, locale: args.lang });
    if (args.json) {
        io.out(JSON.stringify(report, null, 2));
        return EXIT_OK;
    }
    const { c, out } = io;
    out();
    out(`  ${c.bold("Spurvik · quickstart setup")} ${c.dim(`(${report.target}, runtime: ${report.runtime}${report.detected ? ", auto-detected" : ""})`)}`);
    out();
    out(`  ${c.bold("1. Install")}`);
    out(`    ${report.installCommand}`);
    out();
    out(`  ${c.bold("2. Paste wrapper / snippet")}`);
    for (const line of report.snippet.split("\n"))
        out(`    ${line}`);
    if (report.envTemplate.length > 0) {
        out();
        out(`  ${c.bold("3. Environment variables (.env.example)")}`);
        for (const line of report.envTemplate)
            out(`    ${line}`);
    }
    out();
    out(`  ${c.bold("Next steps")} ${c.dim("(hosted EU console, Frankfurt fra1; prices excl. VAT)")}`);
    if (report.links.reportUrl) {
        out(`    Live Art. 50(1) report for ${report.domain}: ${c.cyan(report.links.reportUrl)}`);
    }
    out(`    Free SPURVIK_API_KEY in 10s (€0, no card): ${c.cyan(report.links.freeSignupUrl)}`);
    out(`    White-label badge + 90d Frankfurt vault + Slack/Teams gates (Pro €19/mo): ${c.cyan(report.links.proUpgradeUrl)}`);
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
const IMAGE_BLOCKED = "That host is not a public address. localhost, .local, .internal, private or reserved IPs are refused. Nothing was sent.";
/**
 * Public https image URL on port 443, no credentials, no localhost/.local/.internal host and no private IP literal.
 * Checked before any network call. No DNS lookup: the console resolves, pins and re-checks every redirect.
 */
export function normalizeImageUrl(raw) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 2048 || /[\u0000-\u001f\u007f-\u009f\s<>"'`\\]/.test(trimmed)) {
        throw new ScanTargetError("invalid_url", IMAGE_URL_HELP);
    }
    const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed)?.[1]?.toLowerCase();
    if (scheme === undefined) {
        throw new ScanTargetError("invalid_url", /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed) ? HTTPS_ONLY : IMAGE_URL_HELP);
    }
    if (scheme !== "https")
        throw new ScanTargetError("invalid_url", HTTPS_ONLY);
    let url;
    try {
        url = new URL(trimmed);
    }
    catch {
        throw new ScanTargetError("invalid_url", IMAGE_URL_HELP);
    }
    if (url.username || url.password)
        throw new ScanTargetError("invalid_url", "Remove the user name and password from the URL.");
    let host = url.hostname.toLowerCase();
    if (host.endsWith("."))
        host = host.slice(0, -1);
    if (host.startsWith("[") && host.endsWith("]"))
        host = host.slice(1, -1);
    if (!host)
        throw new ScanTargetError("invalid_url", IMAGE_URL_HELP);
    const ipPublic = isPublicIpLiteral(host);
    if (ipPublic === false)
        throw new ScanTargetError("blocked_target", IMAGE_BLOCKED);
    if (ipPublic === null) {
        if (BLOCKED_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`)))
            throw new ScanTargetError("blocked_target", IMAGE_BLOCKED);
        if (!HOSTNAME_RE.test(host)) {
            throw new ScanTargetError(host.includes(".") ? "invalid_url" : "blocked_target", host.includes(".") ? IMAGE_URL_HELP : IMAGE_BLOCKED);
        }
    }
    // WHATWG URL drops :443 for https, so any port left is not 443.
    if (url.port !== "")
        throw new ScanTargetError("invalid_url", "Only the default https port (443) is allowed.");
    url.hash = "";
    if (!host.includes(":"))
        url.hostname = host;
    return { url: url.toString(), host };
}
const REENCODE_FIX = "Re-check the untransformed original URL. If it also has no manifest, the CDN strips it on delivery: serve the signed file from your own origin.";
/** Image optimizers that re-encode on the fly and drop the C2PA JUMBF boxes (same rules as the hosted MCP tool). */
export function detectImageProxy(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    }
    catch {
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
    if (path.includes("/cdn-cgi/image/"))
        return { name: "Cloudflare image resizing (/cdn-cgi/image/)", fix: REENCODE_FIX };
    if (host === "cdn.shopify.com" || host.endsWith(".shopify.com") || path.startsWith("/cdn/shop/")) {
        return { name: "Shopify CDN (/cdn/shop/)", fix: REENCODE_FIX };
    }
    if (/^i\d\.wp\.com$/i.test(host))
        return { name: "WordPress Jetpack Photon CDN (i*.wp.com)", fix: REENCODE_FIX };
    if (host.endsWith(".website-files.com") || host.endsWith(".webflow.com")) {
        return { name: "Webflow Image CDN", fix: REENCODE_FIX };
    }
    if (host === "cloudinary.com" || host.endsWith(".cloudinary.com"))
        return { name: "Cloudinary", fix: REENCODE_FIX };
    if (host === "imgix.net" || host.endsWith(".imgix.net"))
        return { name: "imgix", fix: REENCODE_FIX };
    return null;
}
/** An image CDN host is not the customer's site, so it is not used as the signup appUrl. */
function isImageCdnHost(host) {
    return /(?:^|\.)(?:cloudinary\.com|imgix\.net|shopify\.com|wp\.com|website-files\.com|(?:uploads-ssl|assets)\.webflow\.com)$/i.test(host);
}
export function noticeLocaleForHost(host) {
    return langForHost(host ?? undefined);
}
/** Manifest text is attacker-controllable: letters, digits and ` ._()/+:@-` only, single spaces, at most 100 chars. */
export function safeClaimGenerator(value) {
    if (typeof value !== "string")
        return null;
    const cleaned = value
        .replace(/[^\p{L}\p{N} ._()/+:@-]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100)
        .trim();
    return cleaned || null;
}
/** Validation codes are dotted identifiers (`claimSignature.mismatch`): anything else is dropped. At most 20. */
export function safeValidationCodes(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((code) => typeof code === "string" && /^[A-Za-z0-9._:-]{1,80}$/.test(code)).slice(0, 20);
}
const C2PA_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MEDIA_EXTENSION = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const TRUST_ANCHOR_TEXT = {
    not_on_trust_list: "Signer certificate is not on the C2PA trust list",
    no_failure_reported: "No trust-list failure reported",
    not_checked: "Not checked (no manifest)",
};
/** The same `<AIDisclosureLabel notice="generated" />` and badge.js `data-notice="generated"` the hosted tool returns. */
export function generatedNotice(locale) {
    return {
        react: `import { AIDisclosureLabel } from "spurvik/react";\n\n<AIDisclosureLabel\n  notice="generated"\n  locale="${locale}"\n  presentation="block"\n/>`,
        script: `<script src="${BADGE_SCRIPT_SRC}" data-notice="generated" data-locale="${locale}" data-theme="auto" data-attribution="true" defer></script>`,
    };
}
/** Builds the report from the console answer `{ data: { mediaType, byteLength, manifestFound, ... }, fileName }`. */
export function reportFromC2pa(target, body, context) {
    if (!isRecord(body) || !isRecord(body.data))
        return null;
    const data = body.data;
    const mediaType = C2PA_MEDIA_TYPES.find((type) => type === data.mediaType);
    if (!mediaType)
        return null;
    const byteLength = data.byteLength;
    if (typeof byteLength !== "number" || !Number.isInteger(byteLength) || byteLength < 0 || byteLength > C2PA_MAX_IMAGE_BYTES)
        return null;
    if (typeof data.manifestFound !== "boolean")
        return null;
    const manifestFound = data.manifestFound;
    // No manifest means nothing was signed, so nothing can match.
    const signatureMatches = manifestFound && data.signatureMatches === true;
    const trustAnchor = typeof data.trustAnchor === "string" && /^[a-z_]{1,40}$/.test(data.trustAnchor)
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
    const status = !manifestFound ? "no_manifest" : signatureMatches ? "manifest_valid" : "signature_mismatch";
    let diagnosis = null;
    if (!manifestFound) {
        diagnosis = proxy
            ? `This URL goes through ${proxy.name}. Image optimizers decode and re-encode the image, which drops the C2PA JUMBF boxes, so a signed original arrives unsigned. ${proxy.fix}`
            : `These bytes carry no C2PA manifest. If the original file was signed, a CMS, CDN or upload step re-encoded it on the way. Upload the original file at ${C2PA_PAGE_URL} and compare.`;
    }
    else if (!signatureMatches) {
        diagnosis = `A C2PA manifest is present, but its signature does not match: the bytes or the claim changed after signing.${proxy ? ` This URL goes through ${proxy.name}, which re-encodes images. ${proxy.fix}` : ` Upload the original file at ${C2PA_PAGE_URL} and compare.`}`;
    }
    else if (proxy) {
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
export function resolveC2paInput(raw) {
    const trimmed = raw.trim();
    if (trimmed.length > 0 &&
        trimmed.length <= 253 &&
        !trimmed.includes("/") &&
        !trimmed.includes(":") &&
        !trimmed.includes("?") &&
        !trimmed.includes("#") &&
        !trimmed.includes("@") &&
        !/[\u0000-\u001f\u007f-\u009f\s<>"'`\\]/.test(trimmed)) {
        try {
            const scanTarget = normalizeScanTarget(trimmed);
            if (isPublicIpLiteral(scanTarget.host) === null) {
                return { target: scanTarget, bareDomain: true };
            }
        }
        catch (error) {
            if (error instanceof ScanTargetError && error.code === "blocked_target") {
                throw new ScanTargetError("blocked_target", IMAGE_BLOCKED);
            }
        }
    }
    return { target: normalizeImageUrl(raw), bareDomain: false };
}
function looksLikeImageAssetPath(rawUrl) {
    try {
        return /\.(?:png|jpe?g|webp|gif|svg|avif|bmp|ico)$/i.test(new URL(rawUrl).pathname);
    }
    catch {
        return false;
    }
}
async function discoverHeroFromPage(pageTarget, fetchImpl, timeoutMs) {
    const res = await fetchImpl(`${SCAN_ENDPOINT}?url=${encodeURIComponent(pageTarget.url)}`, {
        method: "GET",
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status !== 200)
        return null;
    const body = (await res.json().catch(() => null));
    if (!isRecord(body))
        return null;
    const scan = isRecord(body.scan) ? body.scan : body;
    if (scan.reachable !== true || typeof scan.heroImageUrl !== "string" || !scan.heroImageUrl.trim())
        return null;
    const heroTarget = normalizeImageUrl(scan.heroImageUrl);
    const htmlLocale = typeof scan.htmlLocale === "string" && BADGE_LANGS.includes(scan.htmlLocale)
        ? scan.htmlLocale
        : undefined;
    return { heroTarget, htmlLocale };
}
async function postC2paCheck(imageTarget, fetchImpl, timeoutMs) {
    let response;
    try {
        response = await fetchImpl(C2PA_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": USER_AGENT },
            body: JSON.stringify({ url: imageTarget.url }),
            redirect: "error",
            signal: AbortSignal.timeout(timeoutMs),
        });
    }
    catch (error) {
        const name = error instanceof Error ? error.name : "";
        throw new ScanFailed(name === "TimeoutError" || name === "AbortError"
            ? `The C2PA check did not answer within ${Math.round(timeoutMs / 1000)}s.`
            : "Could not reach console.spurvik.com. Check your network and try again.");
    }
    let body = null;
    try {
        body = await response.json();
    }
    catch {
        body = null;
    }
    return { status: response.status, body };
}
async function fetchC2pa(target, deps, bareDomain = false) {
    const fetchImpl = deps.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function")
        throw new ScanFailed("This Node.js has no fetch. Use Node.js 20 or later.");
    const timeoutMs = deps.timeoutMs ?? C2PA_TIMEOUT_MS;
    if (bareDomain) {
        let discovered = null;
        try {
            discovered = await discoverHeroFromPage(target, fetchImpl, timeoutMs);
        }
        catch (error) {
            if (error instanceof ScanTargetError) {
                throw new ScanFailed(`Discovered hero image refused (${error.code}): ${error.message}`);
            }
            const name = error instanceof Error ? error.name : "";
            throw new ScanFailed(name === "TimeoutError" || name === "AbortError"
                ? `The C2PA check did not answer within ${Math.round(timeoutMs / 1000)}s.`
                : "Could not reach console.spurvik.com. Check your network and try again.");
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
        if (!report)
            throw new ScanFailed("The C2PA check sent an answer this CLI cannot read. Try again later.");
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
                    if (heroReport)
                        return heroReport;
                }
            }
        }
        catch {
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
    if (!report)
        throw new ScanFailed("The C2PA check sent an answer this CLI cannot read. Try again later.");
    return report;
}
function printC2pa(report, io) {
    const { c, out } = io;
    const row = (label, value) => out(`  ${c.dim(label.padEnd(18))}${value}`);
    out();
    out(`  ${c.bold("Spurvik · C2PA JUMBF manifest & CDN-strip check")}`);
    out();
    row("Image", `${report.fileName} ${c.dim(`(${report.mediaType}, ${report.byteLength.toLocaleString("en-US")} bytes)`)}`);
    row("Host", report.host);
    if (report.discoveredFromPage) {
        row("Discovered", `${report.imageUrl} ${c.dim("(frontpage hero / og:image)")}`);
    }
    row("C2PA manifest", report.manifestFound
        ? c.green(`FOUND${report.embedded ? " (embedded JUMBF)" : " (remote, referenced from the image)"}`)
        : c.red("NOT FOUND"));
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
    const step = (label, url) => {
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
async function cmdC2pa(args, deps, io) {
    const raw = args.positionals[0];
    if (!raw || args.positionals.length > 1) {
        io.err("Usage: spurvik c2pa <image-url> [--json] [--fail-on-missing]");
        return EXIT_ERROR;
    }
    let resolved;
    try {
        resolved = resolveC2paInput(raw);
    }
    catch (error) {
        io.err(`spurvik c2pa: ${error instanceof ScanTargetError ? error.message : IMAGE_URL_HELP}`);
        return EXIT_ERROR;
    }
    let report;
    try {
        report = await fetchC2pa(resolved.target, deps, resolved.bareDomain);
    }
    catch (error) {
        const message = error instanceof ScanFailed ? error.message : "The C2PA check failed.";
        if (args.json) {
            io.out(JSON.stringify({ host: resolved.target.host, status: "error", error: message, links: { c2pa: C2PA_PAGE_URL } }, null, 2));
        }
        else {
            io.err(`spurvik c2pa: ${message}`);
            io.err(`Check it in the browser instead: ${C2PA_PAGE_URL}`);
        }
        return EXIT_ERROR;
    }
    if (args.json)
        io.out(JSON.stringify(report, null, 2));
    else
        printC2pa(report, io);
    return args.failOnMissing && (!report.manifestFound || !report.signatureMatches) ? EXIT_MISSING : EXIT_OK;
}
const RFP_USAGE = "Usage: spurvik rfp [domain] [--lang en|de|fr|nl|da|sv|es|it] [--plan free|pro|team|concierge] [--provider openai|anthropic|google-genai|vercel-ai-sdk|langgraph|openai-agents|mastra|python|custom] [--generates-media] [--no-high-risk-actions] [--json]";
/** Answers built from plan and provider facts only. The domain is used only when it is a public hostname. */
export function rfpReport(options) {
    return spurvikVendorQuestionnaireAnswers(options);
}
function cmdRfp(args, io) {
    if (args.positionals.length > 1) {
        io.err(RFP_USAGE);
        return EXIT_ERROR;
    }
    // The rejected value is not repeated.
    if (args.plan !== undefined && !SPURVIK_QUESTIONNAIRE_PLANS.includes(args.plan)) {
        io.err(`spurvik rfp: --plan must be one of ${SPURVIK_QUESTIONNAIRE_PLANS.join(", ")}`);
        return EXIT_ERROR;
    }
    if (args.provider !== undefined && !SPURVIK_QUESTIONNAIRE_PROVIDERS.includes(args.provider)) {
        io.err(`spurvik rfp: --provider must be one of ${SPURVIK_QUESTIONNAIRE_PROVIDERS.join(", ")}`);
        return EXIT_ERROR;
    }
    if (args.lang !== undefined && !SPURVIK_QUESTIONNAIRE_LOCALES.includes(args.lang)) {
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
    const { c, out } = io;
    // The Markdown holds only fixed text and a validated hostname ([a-z0-9.-]), so it is safe for a terminal.
    const lines = report.markdown.replace(/\n$/, "").split("\n");
    for (const line of lines) {
        if (line.startsWith("#"))
            out(c.bold(line));
        else if (line.startsWith("- "))
            out(line.replace(/: (https:\/\/\S+)$/, (_match, url) => `: ${c.cyan(url)}`));
        else
            out(line);
    }
    out();
    return EXIT_OK;
}
const RISK_USAGE = "Usage: spurvik risk [domain] [--use-case <text>] [--area general|biometrics|critical_infrastructure|education|employment_hr|essential_services_credit|law_enforcement|migration_border|justice_democracy] [--interacts|--no-interacts] [--synthetic|--no-synthetic] [--decisions|--no-decisions] [--lang <eu-locale>] [--json]";
export function riskReport(options) {
    return classifySpurvikRisk(options);
}
function cmdRisk(args, io) {
    if (args.positionals.length > 1) {
        io.err(RISK_USAGE);
        return EXIT_ERROR;
    }
    if (args.area !== undefined && !SPURVIK_RISK_AREAS.includes(args.area)) {
        io.err(`spurvik risk: --area must be one of ${SPURVIK_RISK_AREAS.join(", ")}`);
        return EXIT_ERROR;
    }
    if (args.lang !== undefined && !BADGE_LANGS.includes(args.lang)) {
        io.err(`spurvik risk: --lang must be one of ${BADGE_LANGS.join(", ")}`);
        return EXIT_ERROR;
    }
    const outcome = riskReport({
        siteDomain: args.positionals[0],
        useCase: args.useCase,
        area: args.area,
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
        if (line.startsWith("#"))
            out(c.bold(line));
        else if (line.startsWith("- "))
            out(line.replace(/: (https:\/\/\S+)$/, (_match, url) => `: ${c.cyan(url)}`));
        else
            out(line);
    }
    out();
    return EXIT_OK;
}
const COMMANDS = new Set(["scan", "portfolio", "c2pa", "audit", "badge", "setup", "init", "rfp", "risk", "help", "version"]);
function parseArgs(argv) {
    const parsed = {
        command: undefined,
        positionals: [],
        json: false,
        failOnGap: false,
        failOnMissing: false,
        help: false,
        version: false,
        generatesMedia: false,
        noHighRiskActions: false,
        unknown: [],
    };
    const rest = [];
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--") {
            rest.push(...argv.slice(i + 1));
            break;
        }
        if (arg === "--json")
            parsed.json = true;
        else if (arg === "--fail-on-gap")
            parsed.failOnGap = true;
        else if (arg === "--fail-on-missing")
            parsed.failOnMissing = true;
        else if (arg === "-h" || arg === "--help")
            parsed.help = true;
        else if (arg === "-v" || arg === "--version")
            parsed.version = true;
        else if (arg === "--lang")
            parsed.lang = argv[++i] ?? "";
        else if (arg.startsWith("--lang="))
            parsed.lang = arg.slice("--lang=".length);
        else if (arg === "--domain")
            parsed.domain = argv[++i] ?? "";
        else if (arg.startsWith("--domain="))
            parsed.domain = arg.slice("--domain=".length);
        else if (arg === "--cms")
            parsed.cms = argv[++i] ?? "";
        else if (arg.startsWith("--cms="))
            parsed.cms = arg.slice("--cms=".length);
        else if (arg === "--runtime")
            parsed.runtime = argv[++i] ?? "";
        else if (arg.startsWith("--runtime="))
            parsed.runtime = arg.slice("--runtime=".length);
        else if (arg === "--plan")
            parsed.plan = argv[++i] ?? "";
        else if (arg.startsWith("--plan="))
            parsed.plan = arg.slice("--plan=".length);
        else if (arg === "--provider")
            parsed.provider = argv[++i] ?? "";
        else if (arg.startsWith("--provider="))
            parsed.provider = arg.slice("--provider=".length);
        else if (arg === "--generates-media")
            parsed.generatesMedia = true;
        else if (arg === "--no-high-risk-actions")
            parsed.noHighRiskActions = true;
        else if (arg === "--use-case")
            parsed.useCase = argv[++i] ?? "";
        else if (arg.startsWith("--use-case="))
            parsed.useCase = arg.slice("--use-case=".length);
        else if (arg === "--area")
            parsed.area = argv[++i] ?? "";
        else if (arg.startsWith("--area="))
            parsed.area = arg.slice("--area=".length);
        else if (arg === "--interacts")
            parsed.interacts = true;
        else if (arg === "--no-interacts")
            parsed.interacts = false;
        else if (arg === "--synthetic")
            parsed.synthetic = true;
        else if (arg === "--no-synthetic")
            parsed.synthetic = false;
        else if (arg === "--decisions")
            parsed.decisions = true;
        else if (arg === "--no-decisions")
            parsed.decisions = false;
        else if (arg.startsWith("-") && arg.length > 1)
            parsed.unknown.push(arg);
        else
            rest.push(arg);
    }
    const first = rest[0];
    if (first !== undefined && COMMANDS.has(first)) {
        parsed.command = first;
        parsed.positionals = rest.slice(1);
    }
    else if (first !== undefined && looksLikeDomainOrUrl(first)) {
        parsed.command = "scan";
        parsed.positionals = rest;
    }
    else {
        parsed.command = first;
        parsed.positionals = rest.slice(1);
    }
    return parsed;
}
export function helpText() {
    return [
        `spurvik ${CLI_VERSION} — EU AI Act checks from the terminal. No API key needed.`,
        "",
        "Usage:",
        "  spurvik scan <domain-or-url> [--json] [--fail-on-gap]   Art. 50(1) notice check of 1 to 10 live sites",
        "  spurvik portfolio <domain...> [--json] [--fail-on-gap]  Agency batch Art. 50(1) check (up to 10 domains)",
        "  spurvik <domain>                                         Same as scan (e.g. npx spurvik folk.app)",
        "  spurvik c2pa <image-url> [--json] [--fail-on-missing]    C2PA JUMBF manifest & CDN-strip check (image URL or domain)",
        "  spurvik audit [dir] [--json] [--fail-on-gap]             Find unwrapped TS/JS & Python AI model calls",
        "  spurvik setup [target|dir] [--runtime <r>] [--json]      Auto-detect stack & print SDK/Python/CMS setup + .env",
        "  spurvik badge [domain] [--lang <eu-locale>] [--cms <c>]  24-language badge.js, Shopify, WP, Webflow & React snippets",
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
        "  npx spurvik risk acme.eu --use-case \"Customer support chatbot\" > AI_ACT_RISK.md",
        "  npx spurvik rfp acme.eu --plan team --provider langgraph",
        "",
        "scan and c2pa send only the domain or URL you pass to console.spurvik.com; audit runs locally and prints file:line only;",
        "risk and rfp make no request. Not legal advice.",
    ].join("\n");
}
export async function runCli(argv, deps = {}) {
    const stdout = deps.stdout ?? ((text) => process.stdout.write(text));
    const stderr = deps.stderr ?? ((text) => process.stderr.write(text));
    const color = deps.color ?? (Boolean(process.stdout.isTTY) && !process.env.NO_COLOR);
    const io = {
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
        io.err(`spurvik: unknown option ${escapeForTerminal(args.unknown[0])}. Run spurvik --help.`);
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
    if (args.domain !== undefined && args.command !== "setup" && args.command !== "init") {
        io.err("spurvik: --domain applies to the setup command only.");
        return EXIT_ERROR;
    }
    if (args.lang !== undefined &&
        args.command !== "badge" &&
        args.command !== "rfp" &&
        args.command !== "risk" &&
        args.command !== "setup" &&
        args.command !== "init") {
        io.err("spurvik: --lang applies to the badge, rfp, risk and setup commands only.");
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
    if (args.failOnGap && (args.command === "rfp" || args.command === "risk" || args.command === "setup" || args.command === "init")) {
        io.err("spurvik: --fail-on-gap is for scan and audit.");
        return EXIT_ERROR;
    }
    if ((args.plan !== undefined || args.provider !== undefined || args.generatesMedia || args.noHighRiskActions) &&
        args.command !== "rfp") {
        io.err("spurvik: --plan, --provider, --generates-media and --no-high-risk-actions apply to the rfp command only.");
        return EXIT_ERROR;
    }
    if ((args.useCase !== undefined ||
        args.area !== undefined ||
        args.interacts !== undefined ||
        args.synthetic !== undefined ||
        args.decisions !== undefined) &&
        args.command !== "risk") {
        io.err("spurvik: --use-case, --area, --interacts, --synthetic and --decisions apply to the risk command only.");
        return EXIT_ERROR;
    }
    switch (args.command) {
        case "scan":
        case "portfolio":
            return cmdScan(args, deps, io);
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
        default:
            io.err(`spurvik: unknown command "${cleanText(args.command, 40)}". Run spurvik --help.`);
            return EXIT_ERROR;
    }
}
/**
 * `spurvik rfp | head -n 5`: once the reader closes the pipe, drop the rest of the output instead of crashing
 * with an uncaught EPIPE. The command still exits with its own code. Other stream errors are rethrown.
 */
export function ignoreBrokenPipe(stream) {
    stream.on("error", (error) => {
        if (error.code !== "EPIPE")
            throw error;
    });
}
function invokedDirectly() {
    const entry = process.argv[1];
    if (!entry)
        return false;
    try {
        return import.meta.url === pathToFileURL(realpathSync(entry)).href;
    }
    catch {
        return false;
    }
}
if (invokedDirectly()) {
    ignoreBrokenPipe(process.stdout);
    ignoreBrokenPipe(process.stderr);
    runCli(process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    }, () => {
        process.stderr.write("spurvik: unexpected error.\n");
        process.exitCode = EXIT_ERROR;
    });
}
