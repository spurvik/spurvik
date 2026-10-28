import { canonicalJson } from "./canonical.js";
import { hmacSha256Hex, timingSafeEqualString } from "./hash.js";
import type { WebhookEnvelope } from "./wire.js";

export const WEBHOOK_SIGNATURE_HEADER = "x-spurvik-signature";
export const WEBHOOK_TIMESTAMP_HEADER = "x-spurvik-timestamp";
/** Sent alongside the Spurvik headers for this release. */
export const LEGACY_WEBHOOK_SIGNATURE_HEADER = "x-aegis-signature";
export const LEGACY_WEBHOOK_TIMESTAMP_HEADER = "x-aegis-timestamp";

/** HMAC input. The timestamp is bound in so a captured body cannot be replayed later. */
export function webhookSigningInput(timestamp: string, body: string): string {
  return `${timestamp}.${body}`;
}

export async function signWebhookBody(secret: string, timestamp: string, body: string): Promise<string> {
  const hex = await hmacSha256Hex(secret, webhookSigningInput(timestamp, body));
  return `v1=${hex}`;
}

export function serializeWebhook(envelope: WebhookEnvelope): string {
  return canonicalJson(envelope);
}

export interface WebhookCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Check a HITL webhook signature. A match shows the payload still matches the
 * HMAC-SHA-256 signature made with your webhook secret. It is not a finding of legal compliance,
 * and it does not mean the decision was lawful.
 */
export async function verifyWebhookSignature(input: {
  secret: string;
  body: string;
  signature: string | null;
  timestamp: string | null;
  nowMs?: number;
  toleranceMs?: number;
}): Promise<WebhookCheck> {
  if (!input.signature || !input.timestamp) {
    return { ok: false, reason: "Missing signature or timestamp." };
  }
  const stamped = Number(input.timestamp);
  if (!Number.isFinite(stamped)) return { ok: false, reason: "Timestamp is not a number." };
  const skew = Math.abs((input.nowMs ?? Date.now()) - stamped * 1000);
  if (skew > (input.toleranceMs ?? 5 * 60 * 1000)) {
    return { ok: false, reason: "Timestamp is outside the acceptance window." };
  }
  const expected = await signWebhookBody(input.secret, input.timestamp, input.body);
  if (!timingSafeEqualString(expected, input.signature.trim())) {
    return { ok: false, reason: "Signature does not match." };
  }
  return { ok: true };
}
