import { canonicalJson } from "./canonical.js";
import { hmacSha256Hex, timingSafeEqualString } from "./hash.js";
import { classifyUpstreamRoute, isCloudPartnerRoute, supportInference } from "./upstream-support.js";
export const UPSTREAM_MARKING_KIND = "upstream_marking_evidence";
const MARKING_KEYS = new Set([
    "watermark",
    "watermarked",
    "watermarking",
    "watermarking_config",
    "text_watermark",
    "content_credentials",
    "content_provenance",
    "c2pa",
    "synthid",
    "provenance",
]);
const HEADER_HINT = /watermark|provenance|c2pa|synthid|content-credential/;
const AFFIRMATIVE = new Set(["true", "applied", "present", "enabled", "detected", "on", "1"]);
const NEGATIVE = new Set(["false", "absent", "disabled", "not_applied", "off", "0", "none"]);
const CONFIG_OBJECTS = new Set(["generationconfig", "extra_body", "metadata", "response", "data"]);
/**
 * Read marking settings the caller sent and flags or headers the SDK object
 * actually carries. Missing signals stay unknown. This does not call a detector
 * and does not treat a provider's documentation as a mark on this response.
 */
export function observeUpstreamMarking(input) {
    const requested = collectSignals(input.request, "request");
    const returned = [
        ...collectSignals(input.response, "response"),
        ...collectHeaders(input.response),
    ].slice(0, 16);
    const model = input.model && input.model.trim() ? input.model.slice(0, 200) : "unknown";
    const route = input.route ?? "";
    const upstreamStatus = classifyUpstreamMarking({
        provider: input.provider,
        model,
        modality: input.modality,
        route,
        requested,
        returned,
    });
    return {
        eventId: "",
        timestamp: "",
        provider: input.provider,
        model,
        modality: input.modality,
        upstreamApplied: appliedFromStatus(upstreamStatus),
        upstreamStatus,
        evidenceTrailerAttached: false,
        localApplied: input.localApplied,
        routeKind: classifyUpstreamRoute(route),
        markingSource: evidenceSource(requested, returned),
        requested,
        returned,
    };
}
/**
 * Map signals to a status. Response confirmation wins. A support-table match
 * is `inferred` and does not mean a mark was present on this response.
 * Unknown provider, model, or route stays `unknown`.
 */
export function classifyUpstreamMarking(input, support = undefined) {
    if (!input.provider || input.provider === "unknown" || !input.model || input.model === "unknown") {
        if (affirmative(input.returned))
            return "provider_confirmed";
        return "unknown";
    }
    if (affirmative(input.returned))
        return "provider_confirmed";
    if (input.returned.length > 0 && input.returned.every((signal) => negative(signal)))
        return "not_requested";
    if (affirmative(input.requested))
        return "requested";
    if (input.requested.length > 0 && input.requested.every((signal) => negative(signal)))
        return "not_requested";
    if (isCloudPartnerRoute(input.route))
        return "unknown";
    if (supportInference(input.provider, input.model, input.modality, support))
        return "inferred";
    return "unknown";
}
export function appliedFromStatus(status) {
    if (status === "provider_confirmed")
        return "applied";
    if (status === "not_requested")
        return "not_applied";
    return "unknown";
}
/**
 * Sign one evidence event with the client-held secret.
 * A later match shows the payload still matches the HMAC-SHA-256 signature made with your signing secret. It is not a finding that a system meets the Act.
 */
export async function signUpstreamMarkingEvidence(fields, secret) {
    if (!secret)
        throw new Error("An evidence signing secret is required.");
    const signedPayload = canonicalJson({ kind: UPSTREAM_MARKING_KIND, ...fields });
    const signature = await hmacSha256Hex(secret, signedPayload);
    return { ...fields, signature, signedPayload };
}
/** A match shows the stored payload still matches the HMAC-SHA-256 signature made with your signing secret. It is not a finding that a system meets the Act. */
export async function verifyUpstreamMarkingEvidence(signedPayload, signature, secret) {
    if (!secret || !signedPayload || !signature)
        return false;
    const expected = await hmacSha256Hex(secret, signedPayload);
    return timingSafeEqualString(expected, signature);
}
export function parseUpstreamMarkingPayload(signedPayload) {
    try {
        const parsed = JSON.parse(signedPayload);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return null;
        const record = parsed;
        if (record.kind !== UPSTREAM_MARKING_KIND)
            return null;
        if (typeof record.eventId !== "string" || typeof record.provider !== "string" || typeof record.model !== "string") {
            return null;
        }
        if (record.upstreamApplied !== "applied" && record.upstreamApplied !== "not_applied" && record.upstreamApplied !== "unknown") {
            return null;
        }
        if (typeof record.localApplied !== "boolean")
            return null;
        return {
            eventId: record.eventId,
            timestamp: typeof record.timestamp === "string" ? record.timestamp : "",
            provider: record.provider,
            model: record.model,
            modality: isModality(record.modality) ? record.modality : "unknown",
            upstreamApplied: record.upstreamApplied,
            upstreamStatus: statusValue(record.upstreamStatus, record.upstreamApplied),
            evidenceTrailerAttached: record.evidenceTrailerAttached === true,
            localApplied: record.localApplied,
            routeKind: isRouteKind(record.routeKind) ? record.routeKind : "direct",
            markingSource: isEvidenceSource(record.markingSource) ? record.markingSource : "none",
            requested: signals(record.requested),
            returned: signals(record.returned),
        };
    }
    catch {
        return null;
    }
}
function evidenceSource(requested, returned) {
    const affirmed = returned.find((signal) => AFFIRMATIVE.has(signal.value.trim().toLowerCase()));
    const chosen = affirmed ?? (returned.length > 0 && returned.every((signal) => NEGATIVE.has(signal.value.trim().toLowerCase())) ? returned[0] : undefined);
    if (chosen)
        return chosen.source === "header" ? "header" : "response";
    if (requested.length > 0)
        return "request";
    return "none";
}
function isRouteKind(value) {
    return value === "direct" || value === "bedrock" || value === "vertex" || value === "azure" || value === "foundry";
}
function isEvidenceSource(value) {
    return value === "response" || value === "request" || value === "header" || value === "none";
}
function affirmative(signals) {
    return signals.some((signal) => AFFIRMATIVE.has(signal.value.trim().toLowerCase()));
}
function negative(signal) {
    return NEGATIVE.has(signal.value.trim().toLowerCase());
}
function statusValue(status, applied) {
    if (status === "requested" ||
        status === "provider_confirmed" ||
        status === "not_requested" ||
        status === "inferred" ||
        status === "unknown") {
        return status;
    }
    if (applied === "applied")
        return "provider_confirmed";
    if (applied === "not_applied")
        return "not_requested";
    return "unknown";
}
function collectSignals(node, source) {
    const found = [];
    walk(node, source, 0, found);
    return found.slice(0, 16);
}
function walk(node, source, depth, found) {
    if (depth > 2 || found.length >= 16 || !isRecord(node))
        return;
    for (const [key, value] of Object.entries(node)) {
        const lower = key.toLowerCase();
        if (MARKING_KEYS.has(lower)) {
            const rendered = renderValue(value);
            if (rendered)
                found.push({ source, name: lower.slice(0, 64), value: rendered });
            continue;
        }
        if (depth < 2 && CONFIG_OBJECTS.has(lower) && isRecord(value)) {
            walk(value, source, depth + 1, found);
        }
    }
}
function collectHeaders(response) {
    const found = [];
    const bags = [];
    if (isRecord(response)) {
        bags.push(response.headers);
        if (isRecord(response.response))
            bags.push(response.response.headers);
    }
    for (const bag of bags)
        readHeaderBag(bag, found);
    return found;
}
function readHeaderBag(bag, found) {
    if (!bag || found.length >= 16)
        return;
    if (typeof Headers !== "undefined" && bag instanceof Headers) {
        bag.forEach((value, key) => pushHeader(key, value, found));
        return;
    }
    if (!isRecord(bag))
        return;
    for (const [key, value] of Object.entries(bag)) {
        if (typeof value === "string")
            pushHeader(key, value, found);
    }
}
function pushHeader(key, value, found) {
    if (found.length >= 16)
        return;
    const name = key.toLowerCase();
    if (!HEADER_HINT.test(name))
        return;
    const rendered = renderValue(value);
    if (!rendered)
        return;
    found.push({ source: "header", name: name.slice(0, 64), value: rendered });
}
function renderValue(value) {
    if (typeof value === "boolean")
        return value ? "true" : "false";
    if (typeof value === "number" && Number.isFinite(value))
        return String(value).slice(0, 80);
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed || trimmed.length > 80)
            return null;
        if (/\s/.test(trimmed) && trimmed.length > 40)
            return null;
        return trimmed;
    }
    if (isRecord(value)) {
        const compact = canonicalJson(value);
        if (compact.length <= 80)
            return compact;
    }
    return null;
}
function signals(value) {
    if (!Array.isArray(value))
        return [];
    const parsed = [];
    for (const item of value) {
        if (!isRecord(item))
            continue;
        if (item.source !== "request" && item.source !== "response" && item.source !== "header")
            continue;
        if (typeof item.name !== "string" || typeof item.value !== "string")
            continue;
        parsed.push({ source: item.source, name: item.name, value: item.value });
    }
    return parsed;
}
function isModality(value) {
    return value === "text" || value === "image" || value === "audio" || value === "video" || value === "unknown";
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
