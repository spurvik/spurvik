/**
 * Zero-credential "Test Art. 14 Human Approval Blocking (6 Vectors)" operation.
 *
 * Pure local self-test mirroring `npx spurvik gate` and `GET /api/v1/gate/self-test`:
 * executes all 6 cryptographic `spurvik-sdk` (`spurvik:art12:v1` + `spurvik:art14:decision:v1`)
 * fail-closed blocking vectors against an ephemeral 256-bit secret that is never returned or logged.
 * Makes zero network requests, reads no credential, and drops invalid or private domains fail-closed.
 */

import { createHmac, randomBytes } from "node:crypto";
import {
  createSignedApprovalLinks,
  verifyChannelApprovalToken,
  verifySignedChannelCallback,
} from "spurvik-sdk";
import { questionnaireHostname } from "./vendor-questionnaire";

const CONSOLE_ORIGIN = "https://console.spurvik.com";
const SITE_ORIGIN = "https://spurvik.com";

export const SPURVIK_GATE_LOCALES = ["en", "de", "fr", "nl", "da", "sv", "es", "it"] as const;
export type SpurvikGateLocale = (typeof SPURVIK_GATE_LOCALES)[number];

export type SpurvikGateVectorId =
  | "unapproved_default_halt"
  | "explicit_human_block"
  | "tampered_payload_hmac"
  | "decision_flip_forgery"
  | "expired_link_replay"
  | "authentic_signed_approval";

export interface SpurvikGateVectorResult {
  id: SpurvikGateVectorId;
  scenario: string;
  expectedExecution: "blocked" | "allowed";
  actualExecution: "blocked" | "allowed";
  reason: string;
  passed: boolean;
}

export interface SpurvikGateUpgradeUrls {
  freeApiKey10sEur0: string;
  proWhiteLabelEur19: string;
  proAnnualEur190: string;
  teamAgencyEur79: string;
  teamAnnualEur790: string;
  doneForYou24hEur199: string;
}

export interface SpurvikGateSelfTestInput {
  /** Optional public domain or http(s) URL. Private/IP/localhost values are ignored and never echoed. */
  domain?: unknown;
  /** Optional EU locale (`en`, `de`, `fr`, `nl`, `da`, `sv`, `es`, `it`). Inferred from ccTLD when omitted. */
  locale?: unknown;
}

export interface SpurvikGateSelfTestOutput {
  article: "EU AI Act Art. 14 + Art. 12";
  domain: string | null;
  locale: SpurvikGateLocale;
  allPassed: boolean;
  blockedAttacks: number;
  totalVectors: number;
  sampleAction: {
    gateId: string;
    actionName: string;
    actionHmacPrefix: string;
    rawPromptPersistedBytes: 0;
  };
  vectors: SpurvikGateVectorResult[];
  interactiveUrl: string;
  sandboxUrl: string;
  upgradeUrls: SpurvikGateUpgradeUrls;
}

const LOCALIZED_HITL_COCKPIT_PATHS: Record<SpurvikGateLocale, string> = {
  en: "/langgraph-openai-agents-approval-check",
  de: "/de/ki-verordnung-artikel-14-menschliche-aufsicht-slack-teams-freigabe",
  fr: "/fr/reglement-ia-article-14-controle-humain-validation-slack-teams",
  nl: "/nl/ai-verordening-artikel-14-menselijk-toezicht-slack-teams-goedkeuring",
  da: "/da/eu-ai-act-artikel-14-menneskeligt-tilsyn-slack-teams-godkendelse",
  sv: "/sv/ai-forordningen-artikel-14-mansklig-tillsyn-slack-teams-godkannande",
  es: "/es/reglamento-ia-articulo-14-supervision-humana-aprobacion-slack-teams",
  it: "/it/regolamento-ia-articolo-14-sorveglianza-umana-approvazione-slack-teams",
};

function inferLocaleFromDomain(domain: string | null): SpurvikGateLocale {
  if (!domain) return "en";
  if (domain.endsWith(".de") || domain.endsWith(".at") || domain.endsWith(".ch")) return "de";
  if (domain.endsWith(".fr")) return "fr";
  if (domain.endsWith(".nl") || domain.endsWith(".be")) return "nl";
  if (domain.endsWith(".dk")) return "da";
  if (domain.endsWith(".se")) return "sv";
  if (domain.endsWith(".es")) return "es";
  if (domain.endsWith(".it")) return "it";
  return "en";
}

function normalizeGateLocale(raw: unknown, domain: string | null): SpurvikGateLocale {
  if (typeof raw === "string") {
    const clean = raw.trim().toLowerCase();
    if ((SPURVIK_GATE_LOCALES as readonly string[]).includes(clean)) {
      return clean as SpurvikGateLocale;
    }
  }
  return inferLocaleFromDomain(domain);
}

export function spurvikGateSelfTest(input: SpurvikGateSelfTestInput = {}): SpurvikGateSelfTestOutput {
  const domain = questionnaireHostname(input.domain);
  const locale = normalizeGateLocale(input.locale, domain);

  const ephemeralSecret = randomBytes(32).toString("hex");
  const issuedAtUnix = 1_795_000_000;
  const maxAgeSeconds = 900;
  const gateId = "gate_art14_selftest_01";
  const actionName = "stripe.refunds.create";
  const callbackBaseUrl = "https://app.example/api/spurvik/callback";

  const signed = createSignedApprovalLinks(
    {
      gateId,
      actionName,
      summary: "Refund EUR 240",
      context: { amountEur: 240, currency: "EUR" },
      callbackBaseUrl,
    },
    ephemeralSecret,
    issuedAtUnix,
  );

  // 1. Default fail-closed halt before any human click
  const unapprovedCheck = verifySignedChannelCallback(
    `${callbackBaseUrl}?gateId=${gateId}`,
    ephemeralSecret,
    { maxAgeSeconds, nowUnixSeconds: issuedAtUnix + 5 },
  );
  const v1Actual: "blocked" | "allowed" =
    unapprovedCheck !== false && unapprovedCheck.decision === "approved" ? "allowed" : "blocked";

  // 2. Explicit human Block click (signed decision=rejected)
  const rejectCheck = verifySignedChannelCallback(signed.rejectUrl, ephemeralSecret, {
    maxAgeSeconds,
    nowUnixSeconds: issuedAtUnix + 5,
  });
  const v2Actual: "blocked" | "allowed" =
    rejectCheck !== false && rejectCheck.decision === "approved" ? "allowed" : "blocked";

  // 3. Payload parameter tampering (amountEur mutated 240 -> 24000 after signing)
  const tamperedActionHmac = createHmac("sha256", ephemeralSecret)
    .update(`spurvik:art12:v1|${gateId}|${actionName}|amountEur=24000&currency=EUR`, "utf8")
    .digest("hex");
  const tamperedOk = verifyChannelApprovalToken({
    gateId,
    actionHmac: tamperedActionHmac,
    decision: "approved",
    issuedAtUnix,
    signature: signed.approveToken,
    signingSecret: ephemeralSecret,
    nonce: signed.nonce,
    maxAgeSeconds,
    nowUnixSeconds: issuedAtUnix + 5,
  });
  const v3Actual: "blocked" | "allowed" = tamperedOk ? "allowed" : "blocked";

  // 4. Decision-flip forgery (swapping decision=rejected -> decision=approved on a signed Block URL)
  const flippedUrl = signed.rejectUrl.replace("decision=rejected", "decision=approved");
  const flippedCheck = verifySignedChannelCallback(flippedUrl, ephemeralSecret, {
    maxAgeSeconds,
    nowUnixSeconds: issuedAtUnix + 5,
  });
  const v4Actual: "blocked" | "allowed" =
    flippedCheck !== false && flippedCheck.decision === "approved" ? "allowed" : "blocked";

  // 5. Expired link replay (+901s past 900s TTL window)
  const expiredCheck = verifySignedChannelCallback(signed.approveUrl, ephemeralSecret, {
    maxAgeSeconds,
    nowUnixSeconds: issuedAtUnix + maxAgeSeconds + 1,
  });
  const v5Actual: "blocked" | "allowed" =
    expiredCheck !== false && expiredCheck.decision === "approved" ? "allowed" : "blocked";

  // 6. Authentic unmodified human Approve click within TTL
  const approveCheck = verifySignedChannelCallback(signed.approveUrl, ephemeralSecret, {
    maxAgeSeconds,
    nowUnixSeconds: issuedAtUnix + 12,
  });
  const v6Actual: "blocked" | "allowed" =
    approveCheck !== false && approveCheck.decision === "approved" ? "allowed" : "blocked";

  const vectors: SpurvikGateVectorResult[] = [
    {
      id: "unapproved_default_halt",
      scenario: "Unapproved tool call (missing human signature)",
      expectedExecution: "blocked",
      actualExecution: v1Actual,
      reason: "Fail-closed default halts tool execution until a signed human token arrives",
      passed: unapprovedCheck === false && v1Actual === "blocked",
    },
    {
      id: "explicit_human_block",
      scenario: "Reviewer clicks signed Block link (decision=rejected)",
      expectedExecution: "blocked",
      actualExecution: v2Actual,
      reason: "Constant-time MAC confirms decision=rejected and blocks execution",
      passed: rejectCheck !== false && rejectCheck.decision === "rejected" && v2Actual === "blocked",
    },
    {
      id: "tampered_payload_hmac",
      scenario: "Payload mutation (amountEur 240 -> 24000 with original sig)",
      expectedExecution: "blocked",
      actualExecution: v3Actual,
      reason: "spurvik:art12:v1 context digest mismatch rejects forged parameters",
      passed: !tamperedOk && v3Actual === "blocked",
    },
    {
      id: "decision_flip_forgery",
      scenario: "Decision-flip forgery (decision=rejected -> decision=approved)",
      expectedExecution: "blocked",
      actualExecution: v4Actual,
      reason: "spurvik:art14:decision:v1 domain-separated HMAC rejects swapped decision",
      passed: flippedCheck === false && v4Actual === "blocked",
    },
    {
      id: "expired_link_replay",
      scenario: "Replay of genuine Approve link past TTL (+901s > 900s)",
      expectedExecution: "blocked",
      actualExecution: v5Actual,
      reason: "Bounded maxAgeSeconds window blocks stale replay attempts",
      passed: expiredCheck === false && v5Actual === "blocked",
    },
    {
      id: "authentic_signed_approval",
      scenario: "Unmodified Approve link within TTL + matching nonce",
      expectedExecution: "allowed",
      actualExecution: v6Actual,
      reason: "Constant-time HMAC-SHA256 + nonce + TTL check permits single gated action",
      passed: approveCheck !== false && approveCheck.decision === "approved" && v6Actual === "allowed",
    },
  ];

  const allPassed = vectors.every((v) => v.passed);
  const blockedAttacks = vectors.filter(
    (v) => v.expectedExecution === "blocked" && v.actualExecution === "blocked",
  ).length;

  const cockpitPath = LOCALIZED_HITL_COCKPIT_PATHS[locale];
  const interactiveUrl = domain
    ? `${SITE_ORIGIN}${cockpitPath}?domain=${encodeURIComponent(domain)}`
    : `${SITE_ORIGIN}${cockpitPath}`;

  const signupUrl = (plan?: string, interval?: "annual"): string => {
    const params: string[] = [];
    if (plan) params.push(`plan=${plan}`);
    if (interval) params.push(`interval=${interval}`);
    if (domain) params.push(`appUrl=${encodeURIComponent(domain)}`);
    if (locale !== "en") params.push(`locale=${locale}`);
    return `${CONSOLE_ORIGIN}/signup${params.length ? `?${params.join("&")}` : ""}`;
  };

  const sandboxParams: string[] = [];
  if (domain) sandboxParams.push(`scan=${encodeURIComponent(domain)}`);
  if (locale !== "en") sandboxParams.push(`locale=${locale}`);
  const sandboxUrl = `${CONSOLE_ORIGIN}/sandbox${sandboxParams.length ? `?${sandboxParams.join("&")}` : ""}`;

  return {
    article: "EU AI Act Art. 14 + Art. 12",
    domain,
    locale,
    allPassed,
    blockedAttacks,
    totalVectors: vectors.length,
    sampleAction: {
      gateId,
      actionName,
      actionHmacPrefix: signed.actionHmac.slice(0, 16),
      rawPromptPersistedBytes: 0,
    },
    vectors,
    interactiveUrl,
    sandboxUrl,
    upgradeUrls: {
      freeApiKey10sEur0: signupUrl(),
      proWhiteLabelEur19: signupUrl("pro"),
      proAnnualEur190: signupUrl("pro", "annual"),
      teamAgencyEur79: signupUrl("team"),
      teamAnnualEur790: signupUrl("team", "annual"),
      doneForYou24hEur199: signupUrl("concierge"),
    },
  };
}
