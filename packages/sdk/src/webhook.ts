import { verifyWebhookSignature, type HitlWebhookEnvelope } from "@spurvik/core";
import { SpurvikError } from "./errors.js";

/**
 * Check a control-plane HITL webhook. The caller passes the raw body and the
 * `x-spurvik-signature` / `x-spurvik-timestamp` headers.
 * A match shows the payload still matches the HMAC-SHA-256 signature made with
 * your webhook secret. It is not a finding of legal compliance.
 */
export async function verifyHitlWebhook(input: {
  secret: string;
  body: string;
  signature: string | null;
  timestamp: string | null;
  nowMs?: number;
  toleranceMs?: number;
}): Promise<HitlWebhookEnvelope> {
  const check = await verifyWebhookSignature(input);
  if (!check.ok) {
    throw new SpurvikError(check.reason ?? "Webhook signature check failed.");
  }
  return JSON.parse(input.body) as HitlWebhookEnvelope;
}
