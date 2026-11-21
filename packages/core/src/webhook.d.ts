import type { WebhookEnvelope } from "./wire.js";
export declare const WEBHOOK_SIGNATURE_HEADER = "x-spurvik-signature";
export declare const WEBHOOK_TIMESTAMP_HEADER = "x-spurvik-timestamp";
/** Sent alongside the Spurvik headers for this release. */
export declare const LEGACY_WEBHOOK_SIGNATURE_HEADER = "x-aegis-signature";
export declare const LEGACY_WEBHOOK_TIMESTAMP_HEADER = "x-aegis-timestamp";
/** HMAC input. The timestamp is bound in so a captured body cannot be replayed later. */
export declare function webhookSigningInput(timestamp: string, body: string): string;
export declare function signWebhookBody(secret: string, timestamp: string, body: string): Promise<string>;
export declare function serializeWebhook(envelope: WebhookEnvelope): string;
export interface WebhookCheck {
    ok: boolean;
    reason?: string;
}
/**
 * Check a HITL webhook signature. A match shows the payload still matches the
 * HMAC-SHA-256 signature made with your webhook secret. It is not a finding that a system meets the Act,
 * and it does not mean the decision was lawful.
 */
export declare function verifyWebhookSignature(input: {
    secret: string;
    body: string;
    signature: string | null;
    timestamp: string | null;
    nowMs?: number;
    toleranceMs?: number;
}): Promise<WebhookCheck>;
