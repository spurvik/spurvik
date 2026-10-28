import {
  PROVENANCE_KIND,
  PROVENANCE_VERSION,
  SIGNATURE_ALG,
  verifyProvenanceSignature,
  type ProvenanceRecord,
} from "@spurvik/core";
import {
  DOES_NOT_MARK,
  MARK_LIMITATION,
  MISSING_SIGNING_INPUT,
  MISSING_SIGNING_SECRET_ENV,
  RECEIPT_NOT_JSON,
  SIGNING_INPUT_TOO_SHORT,
  RECEIPT_NOT_OBJECT,
  RECEIPT_TOO_LARGE,
  SIGNATURE_CHECK_LIMIT,
  SIGNATURE_DIFFERS,
  SIGNATURE_MATCHES,
  SIGNATURE_NOT_A_RECORD,
  SIGNATURE_NOT_CHECKED,
} from "../copy.js";

export const MAX_RECEIPT_CHARS = 1_000_000;
export const MIN_SIGNING_INPUT_LENGTH = 16;
const REDACTED_MARK = "[redacted]";

/** Replace every known secret, and its JSON-escaped form, wherever it appears in output. */
export function scrubSecrets(text: string, secrets: readonly (string | undefined)[]): string {
  const forms: string[] = [];
  const seen = new Set<string>();
  for (const secret of secrets) {
    const trimmed = secret?.trim();
    if (!trimmed || trimmed.length < MIN_SIGNING_INPUT_LENGTH || seen.has(trimmed)) continue;
    seen.add(trimmed);
    const encoded = JSON.stringify(trimmed);
    for (const form of [trimmed, encoded.slice(1, -1), encoded]) {
      if (form.length > 0 && !forms.includes(form)) forms.push(form);
    }
  }
  forms.sort((left, right) => right.length - left.length);
  let result = text;
  for (const form of forms) result = result.split(form).join(REDACTED_MARK);
  return result;
}

export function scrubSecret(text: string, secret: string | undefined): string {
  return scrubSecrets(text, [secret]);
}

/** The argument and `SPURVIK_SIGNING_SECRET`, when both are set, are both secrets this process knows. */
export function knownSigningSecrets(argument: string | undefined): string[] {
  const secrets: string[] = [];
  if (argument !== undefined) secrets.push(argument);
  const fromEnv = process.env.SPURVIK_SIGNING_SECRET;
  if (fromEnv !== undefined) secrets.push(fromEnv);
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
] as const;

function fieldCopy(name: string): string {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function rejectShortSigningInput(secret: string): void {
  if (secret.length < MIN_SIGNING_INPUT_LENGTH) throw new Error(SIGNING_INPUT_TOO_SHORT);
}

/** Argument wins. An empty value is an error. A short value is rejected before use. The secret is not logged. */
export function resolveSigningSecret(argument: string | undefined): string | undefined {
  if (argument !== undefined) {
    const trimmed = argument.trim();
    if (!trimmed) throw new Error(MISSING_SIGNING_INPUT);
    rejectShortSigningInput(trimmed);
    return trimmed;
  }
  const fromEnv = process.env.SPURVIK_SIGNING_SECRET;
  if (fromEnv === undefined) return undefined;
  const trimmed = fromEnv.trim();
  if (!trimmed) throw new Error(MISSING_SIGNING_SECRET_ENV);
  rejectShortSigningInput(trimmed);
  return trimmed;
}

function formatValue(value: unknown, secrets: readonly (string | undefined)[]): string {
  if (value === undefined) return "missing";
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  if (raw === undefined) return "missing";
  const text = scrubSecrets(raw, secrets);
  if (text.length > 180) return `${text.slice(0, 180)}...`;
  return text;
}

function canCheck(record: Record<string, unknown>): boolean {
  return (
    record.kind === PROVENANCE_KIND &&
    record.signatureAlg === SIGNATURE_ALG &&
    typeof record.signature === "string"
  );
}

/**
 * Explain a pasted HMAC receipt. Check it only when `signingSecret` is set.
 * The secret is never included in the result.
 */
export async function explainReceipt(receiptJson: string, signingSecret: string | undefined): Promise<string> {
  let secret = signingSecret;
  if (secret !== undefined) {
    secret = secret.trim();
    if (!secret) throw new Error(MISSING_SIGNING_INPUT);
    rejectShortSigningInput(secret);
  }
  const secrets = knownSigningSecrets(secret);
  try {
    return scrubSecrets(await explainReceiptBody(receiptJson, secret, secrets), secrets);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The receipt could not be explained.";
    throw new Error(scrubSecrets(message, secrets));
  }
}

async function explainReceiptBody(
  receiptJson: string,
  signingSecret: string | undefined,
  secrets: readonly (string | undefined)[],
): Promise<string> {
  if (receiptJson.length > MAX_RECEIPT_CHARS) throw new Error(RECEIPT_TOO_LARGE);
  const secret = signingSecret;
  let parsed: unknown;
  try {
    parsed = JSON.parse(receiptJson);
  } catch {
    throw new Error(RECEIPT_NOT_JSON);
  }
  if (!isRecord(parsed)) throw new Error(RECEIPT_NOT_OBJECT);

  let markedOutput: string | undefined;
  let body = parsed;
  let readFromWrapper = false;
  if (isRecord(parsed.record)) {
    body = parsed.record;
    readFromWrapper = true;
    if (typeof parsed.markedOutput === "string") markedOutput = parsed.markedOutput;
  }
  if (!isRecord(body)) throw new Error(RECEIPT_NOT_OBJECT);

  const lines = ["HMAC provenance receipt", ""];
  if (readFromWrapper) {
    lines.push(
      "Read the provenance record from the record field. markedOutput, when present, is hook output beside the HMAC. It is not part of the signature. Spurvik does not mark content.",
      "",
    );
  }
  const known = new Set<string>(FIELD_ORDER);
  for (const name of FIELD_ORDER) {
    lines.push(`${name}: ${formatValue(body[name], secrets)}`);
    lines.push(`  ${fieldCopy(name)}`);
  }
  const extras = Object.keys(body).filter((name) => !known.has(name));
  if (extras.length > 0) {
    lines.push("", "Other fields:");
    for (const name of extras) {
      if (SECRET_FIELD.test(name)) lines.push(`${name}: value omitted`);
      else lines.push(`${name}: ${formatValue(body[name], secrets)}`);
    }
  }
  if (markedOutput !== undefined) {
    const hidden = scrubSecrets(markedOutput, secrets);
    const shown = hidden.length > 180 ? `${hidden.slice(0, 180)}...` : hidden;
    lines.push(
      "",
      "markedOutput is hook output stored beside the receipt. It is not part of the HMAC. Spurvik does not mark content. This text is present only because a hook was set.",
      `markedOutput: ${shown}`,
    );
  }

  lines.push("");
  if (!canCheck(body)) {
    lines.push(SIGNATURE_NOT_A_RECORD);
  } else if (!secret) {
    lines.push(SIGNATURE_NOT_CHECKED);
  } else {
    let matches = false;
    try {
      matches = await verifyProvenanceSignature(body as unknown as ProvenanceRecord, secret);
    } catch {
      throw new Error("The receipt could not be explained.");
    }
    lines.push(matches ? SIGNATURE_MATCHES : SIGNATURE_DIFFERS);
    lines.push(SIGNATURE_CHECK_LIMIT);
  }
  lines.push(MARK_LIMITATION);
  lines.push(DOES_NOT_MARK);
  return `${lines.join("\n")}\n`;
}
