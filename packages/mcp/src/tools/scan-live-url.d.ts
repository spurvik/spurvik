/** Upstream scan endpoint on the hosted console. The origin is fixed; only the `url` query value varies. */
export declare const SCAN_ENDPOINT = "https://console.spurvik.com/api/v1/sandbox/scan";
export declare const SCAN_TIMEOUT_MS = 8000;
/** JSON Schema of the tool input, the same shape server.ts registers with zod. */
export declare const SCAN_LIVE_URL_INPUT_JSON_SCHEMA: {
    readonly type: "object";
    readonly properties: {
        readonly url: {
            readonly type: "string";
            readonly description: "Public http(s) URL or bare domain, for example stepnetwork.dk. localhost, private IPs and internal hosts are refused.";
        };
    };
    readonly required: readonly ["url"];
    readonly additionalProperties: false;
};
export interface ScanTarget {
    /** Normalized https URL sent to the console. */
    url: string;
    /** Lower-case host without a trailing dot (an IPv6 literal has no brackets). */
    host: string;
}
export type ScanRejectionCode = "invalid_url" | "blocked_target";
export declare class ScanTargetRejected extends Error {
    readonly code: ScanRejectionCode;
    constructor(code: ScanRejectionCode, message: string);
}
export interface ScanLiveUrlLinks {
    reportUrl: string;
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
    heroImageProxy?: {
        name: string;
        fix: string;
        c2paCheckUrl: string;
    };
    art50NoticeDetected: boolean | null;
    markers: {
        art50_1_disclosure: boolean;
        art50_2_provenance: boolean;
        art50_4_synthetic: boolean;
        art12_telemetry: boolean;
    } | null;
    suggestedLocale: string;
    suggestedLanguage: string;
    badgeSnippet: string;
    note: string;
}
export type ScanLiveUrlOutcome = {
    ok: true;
    result: ScanLiveUrlResult;
} | {
    ok: false;
    error: ScanRejectionCode;
    message: string;
};
export interface ScanLiveUrlDeps {
    fetch?: typeof globalThis.fetch;
    timeoutMs?: number;
}
/** IP literal check: true or false for an IPv4/IPv6 literal, null when the host is a name. */
export declare function isPublicIpLiteral(host: string): boolean | null;
/**
 * Normalizes a bare domain or http(s) URL to an https URL on a public host.
 * No DNS lookup is made here: the console resolves and pins the address behind its own SSRF gate.
 * This pre-check keeps localhost, private IPs and internal hostnames from leaving the machine.
 */
export declare function normalizeScanTarget(raw: unknown): ScanTarget;
/**
 * Live Art. 50(1) surface scan through the hosted console.
 * Never throws for network trouble: a timeout, a refused connection or a non-200 answer returns `offlineFallback: true`.
 * Nothing is logged: the URL, the response and any error stay in memory.
 */
export declare function scanLiveUrl(rawUrl: unknown, deps?: ScanLiveUrlDeps): Promise<ScanLiveUrlOutcome>;
/**
 * One console scan for a target that already passed `normalizeScanTarget`.
 * Never throws for network trouble and logs nothing, like `scanLiveUrl`.
 */
export declare function scanNormalizedTarget(target: ScanTarget, deps?: ScanLiveUrlDeps): Promise<ScanLiveUrlResult>;
