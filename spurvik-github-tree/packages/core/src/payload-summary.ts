import { canonicalJson } from "./canonical.js";

/** Structured HITL summary. Field names only. Do not put personal data in a key. */
export const PAYLOAD_SUMMARY_SCHEMA = "spurvik.payload_summary.v1" as const;

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const MAX_CHARS = 500;
const MAX_KEYS = 32;

export interface PayloadSummaryDocument {
  schema: typeof PAYLOAD_SUMMARY_SCHEMA;
  keys: string[];
  contentFingerprint: string | null;
}

/**
 * Canonical JSON for a human-approval summary.
 * Keys are identifier-shaped field names. Values are not included.
 * The fingerprint is a hex digest the caller already computed, or null.
 */
export function buildPayloadSummary(input: {
  keys: readonly string[];
  contentFingerprint: string | null;
}): string {
  const keys = input.keys.filter((key) => KEY_PATTERN.test(key)).slice(0, MAX_KEYS);
  const contentFingerprint =
    input.contentFingerprint && FINGERPRINT_PATTERN.test(input.contentFingerprint)
      ? input.contentFingerprint
      : null;
  let kept = keys;
  let serialized = render(kept, contentFingerprint);
  while (serialized.length > MAX_CHARS && kept.length > 0) {
    kept = kept.slice(0, -1);
    serialized = render(kept, contentFingerprint);
  }
  return serialized;
}

export function parsePayloadSummary(value: string): PayloadSummaryDocument | null {
  if (value.length < 1 || value.length > MAX_CHARS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const allowed = new Set(["schema", "keys", "contentFingerprint"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) return null;
  if (record.schema !== PAYLOAD_SUMMARY_SCHEMA) return null;
  if (!Array.isArray(record.keys) || record.keys.length > MAX_KEYS) return null;
  if (!record.keys.every((key) => typeof key === "string" && KEY_PATTERN.test(key))) return null;
  const fingerprint = record.contentFingerprint;
  if (fingerprint !== null && (typeof fingerprint !== "string" || !FINGERPRINT_PATTERN.test(fingerprint))) {
    return null;
  }
  const document: PayloadSummaryDocument = {
    schema: PAYLOAD_SUMMARY_SCHEMA,
    keys: record.keys,
    contentFingerprint: fingerprint,
  };
  if (canonicalJson(document) !== value) return null;
  return document;
}

export function isPayloadSummary(value: string): boolean {
  return parsePayloadSummary(value) !== null;
}

function render(keys: string[], contentFingerprint: string | null): string {
  const document: PayloadSummaryDocument = {
    schema: PAYLOAD_SUMMARY_SCHEMA,
    keys,
    contentFingerprint,
  };
  return canonicalJson(document);
}
