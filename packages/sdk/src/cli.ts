/**
 * `spurvik` CLI: zero-API-key Art. 50(1) live-site scan, local unwrapped-call audit, and badge.js snippets.
 *
 * Nothing here reads environment variables (except NO_COLOR), writes files, or logs input anywhere but stdout/stderr.
 * `audit` never prints source text: only relative `file:line` and a provider label.
 */
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const CLI_VERSION = "1.0.9";
export const USER_AGENT = `spurvik-cli/${CLI_VERSION}`;

export const CONSOLE_ORIGIN = "https://console.spurvik.com";
export const SCAN_ENDPOINT = `${CONSOLE_ORIGIN}/api/v1/sandbox/scan`;
export const BADGE_SCRIPT_SRC = "https://spurvik.com/badge.js";
export const PORTFOLIO_URL = `${CONSOLE_ORIGIN}/portfolio`;
export const PRO_SIGNUP_URL = `${CONSOLE_ORIGIN}/signup?plan=pro`;
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

export type BadgeLang = "da" | "de" | "en";
const BADGE_LANGS: readonly BadgeLang[] = ["da", "de", "en"];

/** `.dk` -> da, `.de`/`.at` -> de, anything else -> en. */
export function langForHost(host: string | undefined): BadgeLang {
  const tld = (host ?? "").toLowerCase().replace(/\.$/, "").split(".").pop() ?? "";
  if (tld === "dk") return "da";
  if (tld === "de" || tld === "at") return "de";
  return "en";
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
  sandboxUrl: string;
  portfolioUrl: string;
  proUpgradeUrl: string;
  doneForYouUrl: string;
}

export function scanLinks(host: string): ScanLinks {
  const h = encodeURIComponent(host);
  return {
    reportUrl: `${CONSOLE_ORIGIN}/report?domain=${h}`,
    sandboxUrl: `${CONSOLE_ORIGIN}/sandbox?scan=${h}`,
    portfolioUrl: PORTFOLIO_URL,
    proUpgradeUrl: `${CONSOLE_ORIGIN}/signup?plan=pro&appUrl=${h}`,
    doneForYouUrl: `${CONSOLE_ORIGIN}/signup?plan=concierge&appUrl=${h}`,
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
  /** Art. 50(1) interaction notice found on the page. null when the page could not be read. */
  covered: boolean | null;
  badgeSnippet: string;
  links: ScanLinks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Upstream strings go to a terminal: drop control/bidi chars (no ANSI injection), trim, cap. */
function cleanText(value: unknown, max = 120): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, max)
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
  const status: ScanStatus = !pageRead ? "unreachable" : disclosure ? "covered" : widgets.length > 0 ? "gap" : "no_widget_detected";
  const scannedUrl = cleanText(scan.scannedUrl, 2048);
  return {
    domain: target.host,
    scannedUrl: /^https:\/\//.test(scannedUrl) ? scannedUrl : target.url,
    status,
    reachable: scan.reachable,
    httpStatus,
    detectedWidgets: widgets,
    covered: pageRead ? disclosure : null,
    badgeSnippet: badgeScriptTag(target.host, langForHost(target.host)),
    links: scanLinks(target.host),
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

function printScan(report: ScanReport, io: Io): void {
  const { c, out } = io;
  const row = (label: string, value: string) => out(`  ${c.dim(label.padEnd(18))}${value}`);
  const statusText =
    report.status === "covered"
      ? c.green(STATUS_LABEL.covered)
      : report.status === "gap"
        ? c.red(STATUS_LABEL.gap)
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
  step("Client / DPO PDF brief", report.links.reportUrl);
  step("White-label Pro (€19/mo)", report.links.proUpgradeUrl);
  step("24h engineer Done-For-You (€199 once, incl. 1 year of Pro)", report.links.doneForYouUrl);
  step("Batch scan 10 domains", report.links.portfolioUrl);
  out();
}

async function cmdScan(args: ParsedArgs, deps: CliDeps, io: Io): Promise<number> {
  const raw = args.positionals[0];
  if (!raw) {
    io.err("Usage: spurvik scan <domain-or-url> [--json] [--fail-on-gap]");
    return EXIT_ERROR;
  }
  if (args.positionals.length > 1) {
    io.err("spurvik scan takes one domain. For many domains use https://console.spurvik.com/portfolio");
    return EXIT_ERROR;
  }
  let target: ScanTarget;
  try {
    target = normalizeScanTarget(raw);
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
  else printScan(report, io);
  return args.failOnGap && report.status === "gap" ? EXIT_GAP : EXIT_OK;
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

interface CallPattern {
  re: RegExp;
  provider: string;
  python?: boolean;
}

const CALL_PATTERNS: readonly CallPattern[] = [
  { re: /\bnew\s+OpenAI\s*\(/, provider: "OpenAI" },
  { re: /\bnew\s+Anthropic\s*\(/, provider: "Anthropic" },
  { re: /\bnew\s+GoogleGenAI\s*\(/, provider: "Google GenAI" },
  { re: /(?<!function\s+|def\s+)\bgenerateText\s*\(/, provider: "Vercel AI SDK generateText" },
  { re: /(?<!function\s+|def\s+)\bstreamText\s*\(/, provider: "Vercel AI SDK streamText" },
  { re: /(?<!\w)(?<!(?:class|def)\s+)(?:Async)?OpenAI\s*\(/, provider: "OpenAI", python: true },
  { re: /(?<!\w)(?<!(?:class|def)\s+)(?:Async)?Anthropic\s*\(/, provider: "Anthropic", python: true },
  { re: /\bgenai\.Client\s*\(/, provider: "Google GenAI", python: true },
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

function isCommentLine(line: string, python: boolean): boolean {
  const t = line.trimStart();
  return python ? t.startsWith("#") : t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
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
      const python = ext === ".py";
      const rel = path.relative(root, full).split(path.sep).join("/");
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? "";
        if (isCommentLine(line, python)) continue;
        const hit = CALL_PATTERNS.find((p) => Boolean(p.python) === python && p.re.test(line));
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
    io.err(`spurvik audit: not a readable directory: ${args.positionals[0] ?? "."}`);
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
      out(`  ${c.dim("config fields:")} ${QUICKSTART_URL}`);
    }
    out();
    out(`  ${c.dim("Hosted EU console for Art. 12 logs & Art. 14 oversight (Frankfurt fra1):")} ${PRO_SIGNUP_URL}`);
    out();
  }
  return args.failOnGap && report.unwrapped.length > 0 ? EXIT_GAP : EXIT_OK;
}

// ---------------------------------------------------------------------------------------------------------------
// badge
// ---------------------------------------------------------------------------------------------------------------

function cmdBadge(args: ParsedArgs, io: Io): number {
  if (args.positionals.length > 1) {
    io.err("Usage: spurvik badge [domain] [--lang da|de|en]");
    return EXIT_ERROR;
  }
  if (args.lang !== undefined && !BADGE_LANGS.includes(args.lang as BadgeLang)) {
    io.err(`spurvik badge: --lang must be one of ${BADGE_LANGS.join(", ")}`);
    return EXIT_ERROR;
  }
  const host = hostForSnippet(args.positionals[0]);
  const lang = (args.lang as BadgeLang | undefined) ?? langForHost(host);
  const systemName = sanitizeSystemName(host);
  const proUrl = host ? scanLinks(host).proUpgradeUrl : PRO_SIGNUP_URL;
  const { c, out } = io;
  out();
  out(`  ${c.bold("Spurvik · Art. 50(1) AI notice")} ${c.dim(`(${systemName}, ${lang})`)}`);
  out();
  out(`  ${c.bold("Any site")} ${c.dim("(paste before </body>)")}`);
  out(`  ${badgeScriptTag(systemName, lang)}`);
  out();
  out(`  ${c.bold("React / Next.js")} ${c.dim("(npm i spurvik)")}`);
  out(`  import { AIDisclosureLabel } from "spurvik/react";`);
  out(`  <AIDisclosureLabel notice="interaction" locale="${lang}" systemName="${systemName}" />`);
  out();
  out(`  ${c.bold("White-label")} ${c.dim('(data-attribution="false") — Pro €19/mo:')} ${proUrl}`);
  out();
  return EXIT_OK;
}

// ---------------------------------------------------------------------------------------------------------------
// argv
// ---------------------------------------------------------------------------------------------------------------

interface ParsedArgs {
  command: string | undefined;
  positionals: string[];
  json: boolean;
  failOnGap: boolean;
  help: boolean;
  version: boolean;
  lang?: string;
  unknown: string[];
}

const COMMANDS = new Set(["scan", "audit", "badge", "help", "version"]);

function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = { command: undefined, positionals: [], json: false, failOnGap: false, help: false, version: false, unknown: [] };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--") {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "--json") parsed.json = true;
    else if (arg === "--fail-on-gap") parsed.failOnGap = true;
    else if (arg === "-h" || arg === "--help") parsed.help = true;
    else if (arg === "-v" || arg === "--version") parsed.version = true;
    else if (arg === "--lang") parsed.lang = argv[++i] ?? "";
    else if (arg.startsWith("--lang=")) parsed.lang = arg.slice("--lang=".length);
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
    "  spurvik scan <domain-or-url> [--json] [--fail-on-gap]   Art. 50(1) notice check of a live site",
    "  spurvik <domain>                                         Same as scan (e.g. npx spurvik folk.app)",
    "  spurvik audit [dir] [--json] [--fail-on-gap]             Find unwrapped OpenAI/Anthropic/Gemini/AI SDK calls",
    "  spurvik badge [domain] [--lang da|de|en]                 badge.js tag + React snippet",
    "  spurvik --version | --help",
    "",
    "Exit codes: 0 ok, 1 gap found with --fail-on-gap, 2 usage or network error.",
    "",
    "Examples:",
    "  npx spurvik scan stepnetwork.dk",
    "  npx spurvik audit . --fail-on-gap",
    "  npx spurvik badge example.de",
    "",
    "scan sends only the domain or URL you pass to console.spurvik.com; audit runs locally and prints file:line only. Not legal advice.",
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
    io.err(`spurvik: unknown option ${args.unknown[0]}. Run spurvik --help.`);
    return EXIT_ERROR;
  }
  if (args.lang !== undefined && args.command !== "badge") {
    io.err("spurvik: --lang applies to the badge command only.");
    return EXIT_ERROR;
  }
  switch (args.command) {
    case "scan":
      return cmdScan(args, deps, io);
    case "audit":
      return cmdAudit(args, deps, io);
    case "badge":
      return cmdBadge(args, io);
    default:
      io.err(`spurvik: unknown command "${cleanText(args.command, 40)}". Run spurvik --help.`);
      return EXIT_ERROR;
  }
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
