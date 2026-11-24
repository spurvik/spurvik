import { createHmac, timingSafeEqual } from "node:crypto";
import { PROVENANCE_KIND, PROVENANCE_VERSION, SIGNATURE_ALG, verifyProvenanceSignature, } from "@spurvik/core";
import { DOES_NOT_MARK, MARK_LIMITATION, MISSING_SIGNING_INPUT, MISSING_SIGNING_SECRET_ENV, RECEIPT_NOT_JSON, SIGNING_INPUT_TOO_SHORT, RECEIPT_NOT_OBJECT, RECEIPT_TOO_LARGE, SIGNATURE_CHECK_LIMIT, SIGNATURE_DIFFERS, SIGNATURE_MATCHES, SIGNATURE_NOT_A_RECORD, SIGNATURE_NOT_CHECKED, } from "../copy.js";
export const MAX_RECEIPT_CHARS = 1_000_000;
export const MIN_SIGNING_INPUT_LENGTH = 16;
const REDACTED_MARK = "[redacted]";
/** Replace every known secret, and its JSON-escaped form, wherever it appears in output. */
export function scrubSecrets(text, secrets) {
    const forms = [];
    const seen = new Set();
    for (const secret of secrets) {
        const trimmed = secret?.trim();
        if (!trimmed || trimmed.length < MIN_SIGNING_INPUT_LENGTH || seen.has(trimmed))
            continue;
        seen.add(trimmed);
        const encoded = JSON.stringify(trimmed);
        for (const form of [trimmed, encoded.slice(1, -1), encoded]) {
            if (form.length > 0 && !forms.includes(form))
                forms.push(form);
        }
    }
    forms.sort((left, right) => right.length - left.length);
    let result = text;
    for (const form of forms)
        result = result.split(form).join(REDACTED_MARK);
    return result;
}
export function scrubSecret(text, secret) {
    return scrubSecrets(text, [secret]);
}
/** The argument and `SPURVIK_SIGNING_SECRET`, when both are set, are both secrets this process knows. */
export function knownSigningSecrets(argument) {
    const secrets = [];
    if (argument !== undefined)
        secrets.push(argument);
    const fromEnv = process.env.SPURVIK_SIGNING_SECRET;
    if (fromEnv !== undefined)
        secrets.push(fromEnv);
    return secrets;
}
const SECRET_FIELD = /secret|password|token|credential|apikey|api[_-]?key|signing/i;
const FIELD_ORDER = [
    "kind",
    "eventId",
    "timestamp",
    "modelId",
    "modelProvider",
    "contentHashMode",
    "inputHash",
    "outputHash",
    "article50Disclosure",
    "markingHookId",
    "provenanceVersion",
    "markingApplied",
    "evidenceTrailerAttached",
    "upstreamMarking",
    "signature",
    "signatureAlg",
];
function fieldCopy(name) {
    switch (name) {
        case "kind":
            return `Expected value ${PROVENANCE_KIND}. This names the object as a provenance record.`;
        case "eventId":
            return "Id of this recorded call.";
        case "timestamp":
            return "Time the record was made.";
        case "modelId":
            return "Model id recorded for the call.";
        case "modelProvider":
            return "Provider name recorded for the call: openai, anthropic, google, mistral, open_weight, or unknown.";
        case "contentHashMode":
            return "How the prompt and output fingerprints were made: keyed, on, or off. Keyed mode is designed to support pseudonymisation. It is not anonymisation.";
        case "inputHash":
            return "Fingerprint of the recorded input, or null when content hashing is off.";
        case "outputHash":
            return "Fingerprint of the assistant-visible output, or null when there is no fingerprint.";
        case "article50Disclosure":
            return "True only when the caller set it. It records that configuration. It does not mean a notice was shown or that the notice was sufficient.";
        case "markingHookId":
            return "Id of the marking hook the caller set, or null when no hook was set.";
        case "provenanceVersion":
            return `Record shape version. Version ${PROVENANCE_VERSION} includes the marking fields in the HMAC.`;
        case "markingApplied":
            return "True only for a C2PA manifest that was embedded, a watermark hook that changed the content, or upstream status provider_confirmed. A signed text trailer does not set this. Spurvik does not mark content.";
        case "evidenceTrailerAttached":
            return "True when the caller's text trailer or metadata hook was attached. This is not an Art. 50(2) mark.";
        case "upstreamMarking":
            return "What the wrapped call could see about upstream marking: requested, provider_confirmed, not_requested, inferred, or unknown. None of these show that a mark is robust, detectable, or adequate under Art. 50(2).";
        case "signature":
            return "HMAC-SHA-256 of the signed fields, as hex. The signing secret stays with you.";
        case "signatureAlg":
            return `Expected value ${SIGNATURE_ALG}.`;
        default:
            return "Field on the pasted JSON.";
    }
}
function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
function rejectShortSigningInput(secret) {
    if (secret.length < MIN_SIGNING_INPUT_LENGTH)
        throw new Error(SIGNING_INPUT_TOO_SHORT);
}
/** Argument wins. An empty value is an error. A short value is rejected before use. The secret is not logged. */
export function resolveSigningSecret(argument) {
    if (argument !== undefined) {
        const trimmed = argument.trim();
        if (!trimmed)
            throw new Error(MISSING_SIGNING_INPUT);
        rejectShortSigningInput(trimmed);
        return trimmed;
    }
    const fromEnv = process.env.SPURVIK_SIGNING_SECRET;
    if (fromEnv === undefined)
        return undefined;
    const trimmed = fromEnv.trim();
    if (!trimmed)
        throw new Error(MISSING_SIGNING_SECRET_ENV);
    rejectShortSigningInput(trimmed);
    return trimmed;
}
function formatValue(value, secrets) {
    if (value === undefined)
        return "missing";
    const raw = typeof value === "string" ? value : JSON.stringify(value);
    if (raw === undefined)
        return "missing";
    const text = scrubSecrets(raw, secrets);
    if (text.length > 180)
        return `${text.slice(0, 180)}...`;
    return text;
}
function canCheck(record) {
    return (record.kind === PROVENANCE_KIND &&
        record.signatureAlg === SIGNATURE_ALG &&
        typeof record.signature === "string");
}
const HEX64_RE = /^[0-9a-f]{64}$/;
const DEFAULT_ART14_MAX_AGE_SECONDS = 86_400;
const MAX_ART14_CLOCK_SKEW_SECONDS = 300;
function parseArt14CallbackQuery(rawInput) {
    const trimmed = rawInput.trim();
    if (!trimmed || trimmed.startsWith("{") || trimmed.startsWith("[") || !trimmed.includes("="))
        return null;
    const qIdx = trimmed.indexOf("?");
    const query = qIdx >= 0 ? trimmed.slice(qIdx + 1) : trimmed;
    const sp = new URLSearchParams(query);
    const gateId = sp.get("gateId")?.trim() ?? "";
    const actionHmac = (sp.get("hmac") ?? sp.get("actionHmac"))?.trim() ?? "";
    const decision = sp.get("decision")?.trim() ?? "";
    const rawTs = (sp.get("ts") ?? sp.get("issuedAtUnix"))?.trim() ?? "";
    const sig = sp.get("sig")?.trim() ?? "";
    if (!gateId || !actionHmac || !decision || !rawTs || !sig)
        return null;
    return {
        gateId,
        actionHmac,
        decision,
        rawTs,
        nonce: sp.get("nonce")?.trim() || null,
        sig,
        actionName: sp.get("actionName")?.trim() || null,
        context: null,
    };
}
function parseArt14CallbackObject(body) {
    if (body.kind === PROVENANCE_KIND)
        return null;
    const gateId = typeof body.gateId === "string" ? body.gateId.trim() : "";
    const actionHmac = typeof body.actionHmac === "string"
        ? body.actionHmac.trim()
        : typeof body.hmac === "string"
            ? body.hmac.trim()
            : "";
    const decision = typeof body.decision === "string" ? body.decision.trim() : "";
    const rawTs = typeof body.issuedAtUnix === "number" || typeof body.issuedAtUnix === "string"
        ? String(body.issuedAtUnix).trim()
        : typeof body.ts === "number" || typeof body.ts === "string"
            ? String(body.ts).trim()
            : "";
    const sig = typeof body.sig === "string"
        ? body.sig.trim()
        : typeof body.signature === "string" && body.signatureAlg === undefined
            ? body.signature.trim()
            : "";
    if (!gateId || !actionHmac || !decision || !rawTs || !sig)
        return null;
    let context = null;
    if (isRecord(body.context)) {
        const clean = {};
        let allPrimitive = true;
        for (const [k, v] of Object.entries(body.context)) {
            if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
                clean[k] = v;
            }
            else {
                allPrimitive = false;
                break;
            }
        }
        if (allPrimitive)
            context = clean;
    }
    return {
        gateId,
        actionHmac,
        decision,
        rawTs,
        nonce: typeof body.nonce === "string" && body.nonce.trim() ? body.nonce.trim() : null,
        sig,
        actionName: typeof body.actionName === "string" && body.actionName.trim() ? body.actionName.trim() : null,
        context,
        maxAgeSeconds: typeof body.maxAgeSeconds === "number" && Number.isFinite(body.maxAgeSeconds) && body.maxAgeSeconds > 0
            ? body.maxAgeSeconds
            : undefined,
        nowUnixSeconds: typeof body.nowUnixSeconds === "number" && Number.isFinite(body.nowUnixSeconds)
            ? body.nowUnixSeconds
            : undefined,
    };
}
function computeArt12ActionHmac(gateId, actionName, context, signingSecret) {
    const pairs = Object.entries(context)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${String(v)}`)
        .join("&");
    return createHmac("sha256", signingSecret)
        .update(`spurvik:art12:v1|${gateId}|${actionName}|${pairs}`, "utf8")
        .digest("hex");
}
function computeArt14DecisionSig(gateId, actionHmac, decision, issuedAtUnix, nonce, signingSecret) {
    const base = `spurvik:art14:decision:v1|${gateId}|${actionHmac}|${decision}|${issuedAtUnix}`;
    const payload = nonce ? `${base}|${nonce}` : base;
    return createHmac("sha256", signingSecret).update(payload, "utf8").digest("hex");
}
function constantTimeHexMatch(actualHex, expectedHex) {
    if (!HEX64_RE.test(actualHex) || !HEX64_RE.test(expectedHex))
        return false;
    const a = Buffer.from(actualHex, "hex");
    const b = Buffer.from(expectedHex, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
}
function explainArt14Callback(cb, signingSecret, secrets) {
    const lines = [
        "Art. 14 human approval callback receipt",
        "",
        `gateId: ${formatValue(cb.gateId, secrets)}`,
        "  Identifier of the pre-execution human oversight gate.",
        `decision: ${formatValue(cb.decision, secrets)}`,
        "  Reviewer decision on the signed link: approved or rejected. Any other value blocks execution.",
        `actionHmac: ${formatValue(cb.actionHmac, secrets)}`,
        "  HMAC-SHA-256 over spurvik:art12:v1|<gateId>|<actionName>|<sorted_context_pairs>.",
        `issuedAtUnix: ${formatValue(cb.rawTs, secrets)}`,
        "  Unix timestamp (seconds) bound into the decision signature for replay protection.",
        `nonce: ${cb.nonce ? formatValue(cb.nonce, secrets) : "none"}`,
        "  Optional nonce bound into spurvik:art14:decision:v1 when present.",
        `sig: ${formatValue(cb.sig, secrets)}`,
        "  HMAC-SHA-256 over spurvik:art14:decision:v1|<gateId>|<actionHmac>|<decision>|<issuedAtUnix>[|<nonce>].",
    ];
    if (cb.actionName) {
        lines.push(`actionName: ${formatValue(cb.actionName, secrets)}`, "  Action name checked against actionHmac when context is supplied.");
    }
    lines.push("");
    if (!signingSecret) {
        lines.push(SIGNATURE_NOT_CHECKED);
        return `${lines.join("\n")}\n`;
    }
    const actionHmacLower = cb.actionHmac.toLowerCase();
    const sigLower = cb.sig.toLowerCase();
    const issuedAtUnix = Number(cb.rawTs);
    if (!HEX64_RE.test(actionHmacLower) ||
        !HEX64_RE.test(sigLower) ||
        (cb.decision !== "approved" && cb.decision !== "rejected") ||
        !Number.isFinite(issuedAtUnix)) {
        lines.push("Art. 14 gate verdict: BLOCK EXECUTION (reason: malformed callback fields)");
        lines.push(SIGNATURE_CHECK_LIMIT);
        return `${lines.join("\n")}\n`;
    }
    if (cb.actionName && cb.context) {
        const expectedActionHmac = computeArt12ActionHmac(cb.gateId, cb.actionName, cb.context, signingSecret);
        if (!constantTimeHexMatch(actionHmacLower, expectedActionHmac)) {
            lines.push("Art. 14 gate verdict: BLOCK EXECUTION (reason: tampered action payload — actionHmac mismatch)");
            lines.push(SIGNATURE_DIFFERS);
            lines.push(SIGNATURE_CHECK_LIMIT);
            return `${lines.join("\n")}\n`;
        }
    }
    const expectedSig = computeArt14DecisionSig(cb.gateId, actionHmacLower, cb.decision, issuedAtUnix, cb.nonce, signingSecret);
    if (!constantTimeHexMatch(sigLower, expectedSig)) {
        lines.push("Art. 14 gate verdict: BLOCK EXECUTION (reason: decision signature mismatch)");
        lines.push(SIGNATURE_DIFFERS);
        lines.push(SIGNATURE_CHECK_LIMIT);
        return `${lines.join("\n")}\n`;
    }
    const now = cb.nowUnixSeconds ?? Math.floor(Date.now() / 1000);
    const maxAge = cb.maxAgeSeconds ?? DEFAULT_ART14_MAX_AGE_SECONDS;
    if (now - issuedAtUnix > maxAge) {
        lines.push("Art. 14 gate verdict: BLOCK EXECUTION (reason: expired callback link replay)");
        lines.push(SIGNATURE_CHECK_LIMIT);
        return `${lines.join("\n")}\n`;
    }
    if (issuedAtUnix - now > MAX_ART14_CLOCK_SKEW_SECONDS) {
        lines.push("Art. 14 gate verdict: BLOCK EXECUTION (reason: future timestamp clock skew)");
        lines.push(SIGNATURE_CHECK_LIMIT);
        return `${lines.join("\n")}\n`;
    }
    if (cb.decision === "rejected") {
        lines.push("Art. 14 gate verdict: BLOCK EXECUTION (reason: explicit human rejection, authentic signature)");
        lines.push(SIGNATURE_MATCHES);
        lines.push(SIGNATURE_CHECK_LIMIT);
        return `${lines.join("\n")}\n`;
    }
    lines.push("Art. 14 gate verdict: PERMIT EXECUTION (authentic signature, fresh timestamp, human decision=approved)");
    lines.push(SIGNATURE_MATCHES);
    lines.push(SIGNATURE_CHECK_LIMIT);
    return `${lines.join("\n")}\n`;
}
/**
 * Explain a pasted HMAC receipt. Check it only when `signingSecret` is set.
 * The secret is never included in the result.
 */
export async function explainReceipt(receiptJson, signingSecret) {
    let secret = signingSecret;
    if (secret !== undefined) {
        secret = secret.trim();
        if (!secret)
            throw new Error(MISSING_SIGNING_INPUT);
        rejectShortSigningInput(secret);
    }
    const secrets = knownSigningSecrets(secret);
    try {
        return scrubSecrets(await explainReceiptBody(receiptJson, secret, secrets), secrets);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "The receipt could not be explained.";
        throw new Error(scrubSecrets(message, secrets));
    }
}
async function explainReceiptBody(receiptJson, signingSecret, secrets) {
    if (receiptJson.length > MAX_RECEIPT_CHARS)
        throw new Error(RECEIPT_TOO_LARGE);
    const secret = signingSecret;
    const queryCb = parseArt14CallbackQuery(receiptJson);
    if (queryCb)
        return explainArt14Callback(queryCb, secret, secrets);
    let parsed;
    try {
        parsed = JSON.parse(receiptJson);
    }
    catch {
        throw new Error(RECEIPT_NOT_JSON);
    }
    if (!isRecord(parsed))
        throw new Error(RECEIPT_NOT_OBJECT);
    let markedOutput;
    let body = parsed;
    let readFromWrapper = false;
    if (isRecord(parsed.record)) {
        body = parsed.record;
        readFromWrapper = true;
        if (typeof parsed.markedOutput === "string")
            markedOutput = parsed.markedOutput;
    }
    if (!isRecord(body))
        throw new Error(RECEIPT_NOT_OBJECT);
    const objectCb = parseArt14CallbackObject(body);
    if (objectCb)
        return explainArt14Callback(objectCb, secret, secrets);
    const lines = ["HMAC provenance receipt", ""];
    if (readFromWrapper) {
        lines.push("Read the provenance record from the record field. markedOutput, when present, is hook output beside the HMAC. It is not part of the signature. Spurvik does not mark content.", "");
    }
    const known = new Set(FIELD_ORDER);
    for (const name of FIELD_ORDER) {
        lines.push(`${name}: ${formatValue(body[name], secrets)}`);
        lines.push(`  ${fieldCopy(name)}`);
    }
    const extras = Object.keys(body).filter((name) => !known.has(name));
    if (extras.length > 0) {
        lines.push("", "Other fields:");
        for (const name of extras) {
            if (SECRET_FIELD.test(name))
                lines.push(`${name}: value omitted`);
            else
                lines.push(`${name}: ${formatValue(body[name], secrets)}`);
        }
    }
    if (markedOutput !== undefined) {
        const hidden = scrubSecrets(markedOutput, secrets);
        const shown = hidden.length > 180 ? `${hidden.slice(0, 180)}...` : hidden;
        lines.push("", "markedOutput is hook output stored beside the receipt. It is not part of the HMAC. Spurvik does not mark content. This text is present only because a hook was set.", `markedOutput: ${shown}`);
    }
    lines.push("");
    if (!canCheck(body)) {
        lines.push(SIGNATURE_NOT_A_RECORD);
    }
    else if (!secret) {
        lines.push(SIGNATURE_NOT_CHECKED);
    }
    else {
        let matches = false;
        try {
            matches = await verifyProvenanceSignature(body, secret);
        }
        catch {
            throw new Error("The receipt could not be explained.");
        }
        lines.push(matches ? SIGNATURE_MATCHES : SIGNATURE_DIFFERS);
        lines.push(SIGNATURE_CHECK_LIMIT);
    }
    lines.push(MARK_LIMITATION);
    lines.push(DOES_NOT_MARK);
    return `${lines.join("\n")}\n`;
}
