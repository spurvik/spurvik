import { CONCIERGE_PRICE, CONCIERGE_SIGNUP_URL, PORTFOLIO_URL, PRICE_NOTE, TEAM_PRICE, TEAM_SIGNUP_URL, } from "../links.js";
import { normalizeScanTarget, scanNormalizedTarget, ScanTargetRejected, } from "./scan-live-url.js";
/** Same cap as the console /portfolio batch. */
export const BATCH_MAX_DOMAINS = 10;
/** Console scans in flight at once. */
export const BATCH_SCAN_CONCURRENCY = 4;
const MAX_URL_CHARS = 2048;
/** JSON Schema of the tool input, the same shape server.ts registers with zod. */
export const BATCH_SCAN_DOMAINS_INPUT_JSON_SCHEMA = {
    type: "object",
    properties: {
        domains: {
            type: "array",
            minItems: 1,
            maxItems: BATCH_MAX_DOMAINS,
            items: { type: "string", minLength: 1, maxLength: MAX_URL_CHARS },
            description: "1 to 10 public http(s) URLs or bare domains, for example [\"stepnetwork.dk\", \"folk.app\"]. If any entry is localhost, a private IP or an internal host, nothing is scanned.",
        },
    },
    required: ["domains"],
    additionalProperties: false,
};
/** Runs `worker` over `items` with at most `limit` in flight, keeping input order. */
async function mapPool(items, limit, worker) {
    const out = new Array(items.length);
    let next = 0;
    const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next;
            next += 1;
            out[index] = await worker(items[index]);
        }
    });
    await Promise.all(lanes);
    return out;
}
/** `art50NoticeDetected` is false only when the page was read and the markers came back, so an unknown notice is never a gap. */
function isGap(result) {
    return result.art50NoticeDetected === false && result.detectedWidgets.length + result.detectedSdks.length > 0;
}
function toDomainResult(result) {
    return {
        host: result.host,
        scannedUrl: result.scannedUrl,
        status: result.status,
        offlineFallback: result.offlineFallback,
        reason: result.reason,
        score: result.score,
        detectedWidgets: result.detectedWidgets,
        detectedSdks: result.detectedSdks,
        art50NoticeDetected: result.art50NoticeDetected,
        gap: isGap(result),
        suggestedLocale: result.suggestedLocale,
        reportUrl: result.reportUrl,
        sandboxUrl: result.sandboxUrl,
        badgeSnippet: result.badgeSnippet,
        statusShieldUrl: result.statusShieldUrl,
        statusShieldMarkdown: result.statusShieldMarkdown,
    };
}
/**
 * Validates every entry first and refuses the whole batch when any entry is not a public http(s) target.
 * Returns the distinct targets in input order, or the rejection.
 */
function validateDomains(input) {
    if (!Array.isArray(input)) {
        return { ok: false, error: "invalid_input", message: "Pass domains as an array of 1 to 10 public domains or URLs." };
    }
    if (input.length === 0)
        return { ok: false, error: "no_domains", message: "Pass at least 1 domain." };
    if (input.length > BATCH_MAX_DOMAINS) {
        return { ok: false, error: "too_many_domains", message: `Pass at most ${BATCH_MAX_DOMAINS} domains per batch.` };
    }
    const rejected = [];
    const targets = [];
    const seen = new Set();
    let duplicatesRemoved = 0;
    input.forEach((entry, index) => {
        let target;
        try {
            target = normalizeScanTarget(entry);
        }
        catch (error) {
            rejected.push({ position: index + 1, error: error instanceof ScanTargetRejected ? error.code : "invalid_url" });
            return;
        }
        if (seen.has(target.host)) {
            duplicatesRemoved += 1;
            return;
        }
        seen.add(target.host);
        targets.push(target);
    });
    if (rejected.length > 0) {
        const blocked = rejected.some((entry) => entry.error === "blocked_target");
        const positions = rejected.map((entry) => entry.position).join(", ");
        const which = rejected.length === 1 ? `Entry ${positions} is not a public http(s) domain.` : `Entries ${positions} are not public http(s) domains.`;
        return {
            ok: false,
            error: blocked ? "blocked_target" : "invalid_url",
            message: `Nothing was scanned. ${which} localhost, private or reserved IPs, internal hosts, credentials and non-default ports are refused.`,
            rejected,
        };
    }
    return { ok: true, targets, duplicatesRemoved };
}
/**
 * Art. 50(1) surface scan of up to 10 public domains through the hosted console.
 * Every entry is checked before any request; one refused entry refuses the batch with no network call.
 * Each domain is one `GET /api/v1/sandbox/scan` call (8 s timeout), at most 4 in flight.
 * A failed domain returns `offlineFallback: true` in its row; the batch itself never throws. Nothing is logged.
 */
export async function batchScanDomains(domains, deps = {}) {
    const checked = validateDomains(domains);
    if (!checked.ok)
        return checked;
    const scans = await mapPool(checked.targets, BATCH_SCAN_CONCURRENCY, (target) => scanNormalizedTarget(target, deps));
    const results = scans.map(toDomainResult);
    const offlineFallbacks = results.filter((result) => result.offlineFallback).length;
    return {
        ok: true,
        result: {
            tool: "spurvik_batch_scan_domains",
            totalDomains: results.length,
            duplicatesRemoved: checked.duplicatesRemoved,
            scannedDomains: results.length - offlineFallbacks,
            gapsFound: results.filter((result) => result.gap).length,
            offlineFallbacks,
            results,
            portfolioUrl: PORTFOLIO_URL,
            upgradeUrls: { teamAgencyPack: TEAM_SIGNUP_URL, doneForYouPerSite: CONCIERGE_SIGNUP_URL },
            prices: { teamAgencyPack: TEAM_PRICE, doneForYouPerSite: CONCIERGE_PRICE },
            note: `Heuristic check of one public page per domain. It can miss a widget or a notice that loads later. A row with offlineFallback: true was not measured; rerun it later or open portfolioUrl. Not legal advice. ${PRICE_NOTE}`,
        },
    };
}
