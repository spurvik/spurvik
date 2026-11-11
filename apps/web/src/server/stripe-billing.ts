import { createHmac, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import {
  UPGRADE_PRICE_EUR_CENTS,
  upgradePlanName,
  upgradePriceLabel,
  type UpgradeInsert,
  type UpgradeInterval,
  type UpgradePlanTier,
} from "../lib/upgrade-plans";
import type { UpgradeActivationView } from "./upgrade-activation";

export interface StripeBillingEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  STRIPE_PRICE_PRO_ANNUAL?: string;
  STRIPE_PRICE_TEAM_MONTHLY?: string;
  STRIPE_PRICE_TEAM_ANNUAL?: string;
  SPURVIK_PUBLIC_CONSOLE_URL?: string;
  SPURVIK_CONTENT_HASH_SECRET?: string;
}

export interface StripeCheckoutResult {
  mode: "stripe_checkout" | "early_access_queue";
  activation: UpgradeActivationView;
  checkoutUrl: string | null;
  stripeSessionId: string | null;
  receiptHmac: string;
}

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

function computeBillingReceiptHmac(
  secret: string,
  activationId: string,
  planTier: UpgradePlanTier,
  billingInterval: UpgradeInterval,
  status: string,
): string {
  return createHmac("sha256", secret)
    .update(`spurvik:billing:v1|${activationId}|${planTier}|${billingInterval}|${status}`, "utf8")
    .digest("hex");
}

function resolveConfiguredPriceId(
  env: StripeBillingEnv,
  planTier: UpgradePlanTier,
  billingInterval: UpgradeInterval,
): string | null {
  if (planTier === "pro" && billingInterval === "monthly") return env.STRIPE_PRICE_PRO_MONTHLY?.trim() || null;
  if (planTier === "pro" && billingInterval === "annual") return env.STRIPE_PRICE_PRO_ANNUAL?.trim() || null;
  if (planTier === "team" && billingInterval === "monthly") return env.STRIPE_PRICE_TEAM_MONTHLY?.trim() || null;
  if (planTier === "team" && billingInterval === "annual") return env.STRIPE_PRICE_TEAM_ANNUAL?.trim() || null;
  return null;
}

/**
 * Builds form-urlencoded parameters for Stripe `POST /v1/checkout/sessions`.
 * Uses configured Price IDs when provided, or falls back to inline EUR B2B `price_data`
 * so self-serve checkout works immediately with only `STRIPE_SECRET_KEY`.
 */
export function buildStripeCheckoutFormParams(
  activation: UpgradeActivationView,
  env: StripeBillingEnv = process.env,
): URLSearchParams {
  const baseUrl = (env.SPURVIK_PUBLIC_CONSOLE_URL?.trim() || "https://console.spurvik.com").replace(/\/+$/, "");
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("client_reference_id", activation.id);
  params.set("customer_email", activation.workEmail);
  params.set("success_url", `${baseUrl}/sandbox?upgraded=${activation.planTier}&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${baseUrl}/sandbox?upgrade=${activation.planTier}`);
  params.set("tax_id_collection[enabled]", "true");
  params.set("allow_promotion_codes", "true");
  params.set("metadata[activation_id]", activation.id);
  params.set("metadata[plan_tier]", activation.planTier);
  params.set("metadata[billing_interval]", activation.billingInterval);
  params.set("metadata[app_url]", activation.appUrl);

  const configuredPriceId = resolveConfiguredPriceId(env, activation.planTier, activation.billingInterval);
  params.set("line_items[0][quantity]", "1");
  if (configuredPriceId) {
    params.set("line_items[0][price]", configuredPriceId);
  } else {
    const amountCents = UPGRADE_PRICE_EUR_CENTS[activation.planTier][activation.billingInterval];
    const stripeInterval = activation.billingInterval === "annual" ? "year" : "month";
    params.set("line_items[0][price_data][currency]", "eur");
    params.set("line_items[0][price_data][unit_amount]", String(amountCents));
    params.set("line_items[0][price_data][tax_behavior]", "exclusive");
    params.set("line_items[0][price_data][recurring][interval]", stripeInterval);
    params.set(
      "line_items[0][price_data][product_data][name]",
      `Spurvik ${upgradePlanName(activation.planTier)} (${upgradePriceLabel(activation.planTier, activation.billingInterval)}, excl. VAT · B2B)`,
    );
    params.set("line_items[0][price_data][product_data][tax_code]", "txcd_10103001");
  }

  return params;
}

/**
 * Records an upgrade activation and, when `STRIPE_SECRET_KEY` is configured,
 * creates a live B2B Stripe Checkout Session. Never logs raw email or PII (GDPR Art. 5(1)(c)).
 */
export async function createUpgradeOrStripeCheckout(
  pool: Pool,
  input: UpgradeInsert,
  opts: {
    env?: StripeBillingEnv;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<StripeCheckoutResult> {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const hmacSecret = env.SPURVIK_CONTENT_HASH_SECRET?.trim() || "spurvik-billing-hmac-fallback-key";

  const { recordUpgradeActivation } = await import("./upgrade-activation");
  const activation = await recordUpgradeActivation(pool, input);
  const stripeKey = env.STRIPE_SECRET_KEY?.trim();

  if (!stripeKey) {
    return {
      mode: "early_access_queue",
      activation,
      checkoutUrl: null,
      stripeSessionId: null,
      receiptHmac: computeBillingReceiptHmac(
        hmacSecret,
        activation.id,
        activation.planTier,
        activation.billingInterval,
        activation.status,
      ),
    };
  }

  const formParams = buildStripeCheckoutFormParams(activation, env);
  const res = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${stripeKey}`,
      "content-type": "application/x-www-form-urlencoded",
      "idempotency-key": `spurvik-checkout-${activation.id}`,
    },
    body: formParams.toString(),
  });

  if (!res.ok) {
    throw new Error(`Stripe checkout session creation failed with HTTP ${res.status}.`);
  }

  const session = (await res.json()) as { id?: string; url?: string };
  if (!session?.id || !session?.url) {
    throw new Error("Stripe checkout session response missing id or url.");
  }

  return {
    mode: "stripe_checkout",
    activation,
    checkoutUrl: session.url,
    stripeSessionId: session.id,
    receiptHmac: computeBillingReceiptHmac(
      hmacSecret,
      activation.id,
      activation.planTier,
      activation.billingInterval,
      "checkout_created",
    ),
  };
}

/**
 * Verifies Stripe's `Stripe-Signature` header (`t=...,v1=...`) using constant-time HMAC-SHA256.
 */
export function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  nowUnixSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader || !webhookSecret) return false;
  const parts = signatureHeader.split(",").map((p) => p.trim());
  const timestampPart = parts.find((p) => p.startsWith("t="));
  const v1Parts = parts.filter((p) => p.startsWith("v1="));
  if (!timestampPart || v1Parts.length === 0) return false;

  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(nowUnixSeconds - timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedHex = createHmac("sha256", webhookSecret).update(signedPayload, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");

  for (const v1 of v1Parts) {
    const sigHex = v1.slice(3);
    if (sigHex.length !== expectedHex.length) continue;
    try {
      const sigBuf = Buffer.from(sigHex, "hex");
      if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data?: {
    object?: {
      id?: string;
      client_reference_id?: string | null;
      metadata?: Record<string, string | undefined>;
      payment_status?: string;
      status?: string;
    };
  };
}

/**
 * Activates a pending `upgrade_activations` record upon verified `checkout.session.completed`.
 */
export async function applyStripeWebhookEvent(
  pool: Pool,
  event: StripeWebhookEvent,
): Promise<{ handled: boolean; activationId: string | null; newStatus: string | null }> {
  if (event.type !== "checkout.session.completed") {
    return { handled: false, activationId: null, newStatus: null };
  }
  const obj = event.data?.object;
  const activationId = obj?.metadata?.activation_id || obj?.client_reference_id || null;
  if (!activationId || !/^[0-9a-f-]{36}$/i.test(activationId)) {
    return { handled: false, activationId: null, newStatus: null };
  }

  const { ensureUpgradeActivationsTable } = await import("./upgrade-activation");
  await ensureUpgradeActivationsTable(pool);
  const res = await pool.query<{ id: string; status: string }>(
    `UPDATE "upgrade_activations" SET "status" = 'active' WHERE "id" = $1 RETURNING "id", "status"`,
    [activationId],
  );
  const updated = res.rows[0];
  if (!updated) {
    return { handled: false, activationId, newStatus: null };
  }
  return { handled: true, activationId: updated.id, newStatus: updated.status };
}
