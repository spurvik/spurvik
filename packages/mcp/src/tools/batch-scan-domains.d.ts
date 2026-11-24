import { type ScanLiveUrlDeps, type ScanLiveUrlResult, type ScanRejectionCode } from "./scan-live-url.js";
/** Same cap as the console /portfolio batch. */
export declare const BATCH_MAX_DOMAINS = 10;
/** Console scans in flight at once. */
export declare const BATCH_SCAN_CONCURRENCY = 4;
/** JSON Schema of the tool input, the same shape server.ts registers with zod. */
export declare const BATCH_SCAN_DOMAINS_INPUT_JSON_SCHEMA: {
    readonly type: "object";
    readonly properties: {
        readonly domains: {
            readonly type: "array";
            readonly minItems: 1;
            readonly maxItems: 10;
            readonly items: {
                readonly type: "string";
                readonly minLength: 1;
                readonly maxLength: 2048;
            };
            readonly description: "1 to 10 public http(s) URLs or bare domains, for example [\"stepnetwork.dk\", \"folk.app\"]. If any entry is localhost, a private IP or an internal host, nothing is scanned.";
        };
    };
    readonly required: readonly ["domains"];
    readonly additionalProperties: false;
};
export interface BatchDomainResult {
    host: string;
    scannedUrl: string;
    status: ScanLiveUrlResult["status"];
    offlineFallback: boolean;
    reason: string | null;
    score: number | null;
    detectedWidgets: string[];
    detectedSdks: string[];
    detectedPlatforms?: string[];
    platformInstallerUrls?: Record<string, string>;
    heroImageProxy?: {
        name: string;
        fix: string;
        c2paCheckUrl: string;
    };
    art50NoticeDetected: boolean | null;
    /** The page was read, an AI chat widget or AI SDK was found, and no Art. 50(1) notice was detected. */
    gap: boolean;
    suggestedLocale: string;
    reportUrl: string;
    sandboxUrl: string;
    badgeSnippet: string;
    statusShieldUrl: string;
    statusShieldMarkdown: string;
}
export interface BatchScanDomainsResult {
    tool: "spurvik_batch_scan_domains";
    /** Distinct hosts scanned. */
    totalDomains: number;
    /** Entries dropped because an earlier entry had the same host. */
    duplicatesRemoved: number;
    /** Hosts the console answered for (not offlineFallback). */
    scannedDomains: number;
    gapsFound: number;
    offlineFallbacks: number;
    results: BatchDomainResult[];
    portfolioUrl: string;
    /** Direct 1-click Console portfolio URL prefilled with `?domains=` for all scanned hosts. */
    prefilledPortfolioUrl: string;
    upgradeUrls: {
        proAnnual2MonthsFree: string;
        teamAgencyPack: string;
        teamAnnual2MonthsFree: string;
        doneForYouPerSite: string;
    };
    prices: {
        teamAgencyPack: string;
        doneForYouPerSite: string;
    };
    note: string;
}
export type BatchRejectionCode = ScanRejectionCode | "invalid_input" | "no_domains" | "too_many_domains";
export interface BatchRejectedEntry {
    /** 1-based position in `domains`. The value itself is not echoed. */
    position: number;
    error: ScanRejectionCode;
}
export type BatchScanDomainsOutcome = {
    ok: true;
    result: BatchScanDomainsResult;
} | {
    ok: false;
    error: BatchRejectionCode;
    message: string;
    rejected?: BatchRejectedEntry[];
};
/**
 * Art. 50(1) surface scan of up to 10 public domains through the hosted console.
 * Every entry is checked before any request; one refused entry refuses the batch with no network call.
 * Each domain is one `GET /api/v1/sandbox/scan` call (8 s timeout), at most 4 in flight.
 * A failed domain returns `offlineFallback: true` in its row; the batch itself never throws. Nothing is logged.
 */
export declare function batchScanDomains(domains: unknown, deps?: ScanLiveUrlDeps): Promise<BatchScanDomainsOutcome>;
