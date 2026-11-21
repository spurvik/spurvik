import { type SpurvikClassifyRiskReport, type SpurvikRiskArea } from "./classify-risk.js";
import { type SpurvikVendorQuestionnaireOutput } from "./vendor-questionnaire.js";
export declare const CLI_VERSION = "1.0.12";
export declare const USER_AGENT = "spurvik-cli/1.0.12";
export declare const CONSOLE_ORIGIN = "https://console.spurvik.com";
export declare const SCAN_ENDPOINT = "https://console.spurvik.com/api/v1/sandbox/scan";
export declare const BADGE_SCRIPT_SRC = "https://spurvik.com/badge.js";
export declare const PORTFOLIO_URL = "https://console.spurvik.com/portfolio";
/** Free signup: mints a SPURVIK_API_KEY (work email, no password, no card). */
export declare const SIGNUP_URL = "https://console.spurvik.com/signup";
export declare const PRO_SIGNUP_URL = "https://console.spurvik.com/signup?plan=pro";
export declare const TEAM_SIGNUP_URL = "https://console.spurvik.com/signup?plan=team";
export declare const CONCIERGE_SIGNUP_URL = "https://console.spurvik.com/signup?plan=concierge";
export declare const SCAN_TIMEOUT_MS = 10000;
export declare const EXIT_OK = 0;
export declare const EXIT_GAP = 1;
export declare const EXIT_ERROR = 2;
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
export declare class ScanTargetError extends Error {
    readonly code: "invalid_url" | "blocked_target";
    constructor(code: "invalid_url" | "blocked_target", message: string);
}
export interface ScanTarget {
    url: string;
    host: string;
}
/** Bare domain or http(s) URL -> https URL on a public host. No DNS lookup: the console resolves and pins the address. */
export declare function normalizeScanTarget(raw: string): ScanTarget;
/** True when a bare argument should be read as `scan <arg>` (folk.app, https://example.com), not as a command. */
export declare function looksLikeDomainOrUrl(arg: string): boolean;
export declare const BADGE_LANGS: readonly ["en", "da", "de", "fr", "es", "nl", "sv", "pl", "it", "pt", "fi", "cs", "bg", "el", "et", "ga", "hr", "hu", "lt", "lv", "mt", "ro", "sk", "sl"];
export type BadgeLang = (typeof BADGE_LANGS)[number];
/** Maps EU country-code TLDs (.dk -> da, .de/.at -> de, .fr/.be -> fr, .nl -> nl, .se -> sv, ...) or falls back to en. */
export declare function langForHost(host: string | undefined): BadgeLang;
/** Strips attribute-breaking and control/bidi characters; caps at 64 chars. Safe inside a double-quoted HTML/JSX attribute. */
export declare function sanitizeSystemName(raw: string | undefined, fallback?: string): string;
export declare function badgeScriptTag(systemName: string, lang: BadgeLang, attribution?: boolean): string;
export interface ScanLinks {
    reportUrl: string;
    sandboxUrl: string;
    portfolioUrl: string;
    c2paCheckUrl: string;
    rfpQuestionnaireUrl: string;
    proUpgradeUrl: string;
    teamUpgradeUrl: string;
    doneForYouUrl: string;
}
export declare function scanLinks(host: string, resolvedLang?: BadgeLang, heroImageUrl?: string | null): ScanLinks;
export type ScanStatus = "covered" | "gap" | "no_widget_detected" | "unreachable";
export interface ScanReport {
    domain: string;
    scannedUrl: string;
    status: ScanStatus;
    reachable: boolean;
    httpStatus: number | null;
    detectedWidgets: string[];
    /** True when an AI-native bot or model SDK was detected; false when only dual-use human/AI helpdesk widgets or none were seen; null when unread. */
    confirmedAiSurface: boolean | null;
    heroImageUrl: string | null;
    /** Art. 50(1) interaction notice found on the page. null when the page could not be read. */
    covered: boolean | null;
    badgeSnippet: string;
    links: ScanLinks;
}
/** Local file names can hold control/bidi characters too: show them as \\uXXXX instead of sending them to the terminal. */
export declare function escapeForTerminal(value: string): string;
/** Builds the report from the console answer `{ ok, scan: { reachable, httpStatus, detectedWidgets, markers, cards } }`. */
export declare function reportFromScan(target: ScanTarget, body: unknown): ScanReport | null;
export declare const BATCH_SCAN_MAX_DOMAINS = 10;
export interface BatchScanReport {
    totalDomains: number;
    duplicatesRemoved: number;
    gapsFound: number;
    results: ScanReport[];
    links: {
        portfolioUrl: string;
        teamUpgradeUrl: string;
        doneForYouUrl: string;
    };
}
export declare const AUDIT_EXTENSIONS: Set<string>;
export declare const AUDIT_SKIP_DIRS: Set<string>;
export declare const AUDIT_MAX_FILE_BYTES: number;
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
/** Read-only walk. Symlinks are not followed. Returns only file:line:provider, never source text. */
export declare function auditDirectory(root: string): AuditReport;
export declare const QUICKSTART_URL = "https://github.com/spurvik/spurvik/blob/main/docs/quickstart.md";
export declare const BADGE_CMS_TARGETS: readonly ["shopify", "wordpress", "webflow", "html", "react"];
export type BadgeCmsTarget = (typeof BADGE_CMS_TARGETS)[number];
export declare const SETUP_TARGETS: readonly ["openai", "anthropic", "google-genai", "vercel-ai-sdk", "mastra", "openai-agents", "langgraph", "react", "python", "fastapi", "langchain", "pydantic-ai", "shopify", "wordpress", "webflow", "html", "n8n", "make"];
export type SetupTarget = (typeof SETUP_TARGETS)[number];
export declare const SETUP_RUNTIMES: readonly ["node", "next", "vercel", "supabase-edge", "python"];
export type SetupRuntime = (typeof SETUP_RUNTIMES)[number];
export interface SetupReport {
    target: SetupTarget;
    runtime: SetupRuntime | "browser" | "workflow";
    detected: boolean;
    domain?: string;
    locale?: string;
    installCommand: string;
    snippet: string;
    envTemplate: string[];
    links: {
        reportUrl?: string;
        freeSignupUrl: string;
        proUpgradeUrl: string;
        teamUpgradeUrl: string;
        doneForYouUrl: string;
    };
}
export declare function detectSetupStack(root: string): {
    target: SetupTarget;
    runtime: SetupRuntime;
    detected: boolean;
};
export declare function buildSetupReport(target: SetupTarget, requestedRuntime: SetupRuntime | undefined, detected: boolean, options?: {
    domain?: string;
    locale?: string;
}): SetupReport;
export declare const C2PA_ENDPOINT = "https://console.spurvik.com/api/v1/provenance/public-check-url";
export declare const C2PA_PAGE_URL = "https://console.spurvik.com/c2pa";
/** The console allows 8 s for the image fetch, then reads the manifest; 15 s covers both. */
export declare const C2PA_TIMEOUT_MS = 15000;
export declare const C2PA_MAX_IMAGE_BYTES: number;
/** `c2pa --fail-on-missing`: no C2PA manifest, or one whose signature no longer matches. */
export declare const EXIT_MISSING = 2;
/**
 * Public https image URL on port 443, no credentials, no localhost/.local/.internal host and no private IP literal.
 * Checked before any network call. No DNS lookup: the console resolves, pins and re-checks every redirect.
 */
export declare function normalizeImageUrl(raw: string): ScanTarget;
export interface ImageProxy {
    name: string;
    fix: string;
}
/** Image optimizers that re-encode on the fly and drop the C2PA JUMBF boxes (same rules as the hosted MCP tool). */
export declare function detectImageProxy(rawUrl: string): ImageProxy | null;
export declare function noticeLocaleForHost(host: string | null): string;
/** Manifest text is attacker-controllable: letters, digits and ` ._()/+:@-` only, single spaces, at most 100 chars. */
export declare function safeClaimGenerator(value: unknown): string | null;
/** Validation codes are dotted identifiers (`claimSignature.mismatch`): anything else is dropped. At most 20. */
export declare function safeValidationCodes(value: unknown): string[];
declare const C2PA_MEDIA_TYPES: readonly ["image/png", "image/jpeg", "image/webp"];
type C2paMediaType = (typeof C2PA_MEDIA_TYPES)[number];
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
    imageProxy: {
        detected: boolean;
        name: string | null;
        fix: string | null;
    };
    diagnosis: string | null;
    disclosure: {
        locale: string;
        react: string;
        script: string;
    };
    links: {
        c2pa: string;
        pro: string;
        concierge: string;
    };
    /** True when the image URL was auto-discovered in 1 hop from a bare domain or store webpage HTML. */
    discoveredFromPage?: boolean;
}
export interface C2paContext {
    requestedHost?: string;
    htmlLocale?: BadgeLang;
    discoveredFromPage?: boolean;
}
/** The same `<AIDisclosureLabel notice="generated" />` and badge.js `data-notice="generated"` the hosted tool returns. */
export declare function generatedNotice(locale: string): {
    react: string;
    script: string;
};
/** Builds the report from the console answer `{ data: { mediaType, byteLength, manifestFound, ... }, fileName }`. */
export declare function reportFromC2pa(target: ScanTarget, body: unknown, context?: C2paContext): C2paReport | null;
/**
 * Resolves either a bare public domain (`charlie-paris.com`) for 1-hop hero-image discovery,
 * or a full `https://` URL (image or store page) checked via `normalizeImageUrl`.
 */
export declare function resolveC2paInput(raw: string): {
    target: ScanTarget;
    bareDomain: boolean;
};
export type RfpReport = SpurvikVendorQuestionnaireOutput;
/** Answers built from plan and provider facts only. The domain is used only when it is a public hostname. */
export declare function rfpReport(options: {
    domain?: string;
    plan?: string;
    provider?: string;
    locale?: string;
    hasHighRiskActions?: boolean;
    generatesMedia?: boolean;
}): RfpReport;
export type RiskReport = SpurvikClassifyRiskReport;
export declare function riskReport(options: {
    siteDomain?: string;
    useCase?: string;
    area?: SpurvikRiskArea;
    locale?: string;
    interactsWithHumans?: boolean;
    generatesSyntheticMedia?: boolean;
    makesAutomatedDecisionsAboutPeople?: boolean;
}): import("./classify-risk.js").SpurvikClassifyRiskOutcome;
export declare function helpText(): string;
export declare function runCli(argv: readonly string[], deps?: CliDeps): Promise<number>;
/**
 * `spurvik rfp | head -n 5`: once the reader closes the pipe, drop the rest of the output instead of crashing
 * with an uncaught EPIPE. The command still exits with its own code. Other stream errors are rethrown.
 */
export declare function ignoreBrokenPipe(stream: NodeJS.WritableStream): void;
export {};
