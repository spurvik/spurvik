import { type HitlWebhookEnvelope } from "@spurvik/core";
/**
 * Check a control-plane HITL webhook. The caller passes the raw body and the
 * `x-spurvik-signature` / `x-spurvik-timestamp` headers.
 * A match shows the payload still matches the HMAC-SHA-256 signature made with
 * your webhook secret. It is not a finding that a system meets the Act.
 */
export declare function verifyHitlWebhook(input: {
    secret: string;
    body: string;
    signature: string | null;
    timestamp: string | null;
    nowMs?: number;
    toleranceMs?: number;
}): Promise<HitlWebhookEnvelope>;
