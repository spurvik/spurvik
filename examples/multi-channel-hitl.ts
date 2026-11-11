import {
  createMultiChannelApprovalRouter,
  verifyChannelApprovalToken,
  type HumanApprovalChannelConfig,
} from "spurvik";

/**
 * In spurvik@1.0.7 (and 1.0.5+), callbackBaseUrl is required on requestApproval() and
 * createSignedApprovalLinks() includes a random 16-byte hex nonce in the
 * signed URL query string (?gateId=...&decision=...&hmac=...&ts=...&nonce=...&sig=...).
 * Pass nonce to verifyChannelApprovalToken (or use verifySignedChannelCallback)
 * on your callback endpoint, and record each nonce to refuse replays.
 *
 * Provenance records carry inputHash. Keyed mode is the default: inputHash
 * is a keyed HMAC-SHA256 fingerprint of the input, and contentHash.secret
 * must be at least 16 characters. n8n execution history keeps node inputs
 * and outputs.
 */
export function checkApprovalLink(signingSecret: string, target: string): boolean {
  const url = new URL(target);
  const decision = url.searchParams.get("decision");
  const ts = url.searchParams.get("ts");
  const nonce = url.searchParams.get("nonce") ?? undefined;
  if (decision !== "approved" && decision !== "rejected") return false;
  if (!ts || !/^\d+$/.test(ts)) return false;
  return verifyChannelApprovalToken({
    signingSecret,
    gateId: url.searchParams.get("gateId") ?? "",
    actionHmac: url.searchParams.get("hmac") ?? "",
    decision,
    issuedAtUnix: Number(ts),
    nonce,
    signature: url.searchParams.get("sig") ?? "",
  });
}

async function main() {
  const signingSecret =
    process.env.SPURVIK_SIGNING_SECRET ?? "demo-signing-secret-at-least-16";

  const channels: HumanApprovalChannelConfig[] = [
    ...(process.env.SLACK_WEBHOOK_URL
      ? [{ type: "slack" as const, webhookUrl: process.env.SLACK_WEBHOOK_URL }]
      : []),
    ...(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
      ? [
          {
            type: "telegram" as const,
            botToken: process.env.TELEGRAM_BOT_TOKEN,
            chatId: process.env.TELEGRAM_CHAT_ID,
          },
        ]
      : []),
    ...(process.env.RESEND_API_KEY && process.env.APPROVAL_EMAIL_TO
      ? [
          {
            type: "email" as const,
            resendApiKey: process.env.RESEND_API_KEY,
            from: "approvals@your-company.eu",
            to: process.env.APPROVAL_EMAIL_TO,
          },
        ]
      : []),
    ...(process.env.DISCORD_WEBHOOK_URL
      ? [{ type: "discord" as const, webhookUrl: process.env.DISCORD_WEBHOOK_URL }]
      : []),
    ...(process.env.TEAMS_WEBHOOK_URL
      ? [{ type: "teams" as const, webhookUrl: process.env.TEAMS_WEBHOOK_URL }]
      : []),
    ...(process.env.LINEAR_API_KEY && process.env.LINEAR_TEAM_ID
      ? [
          {
            type: "linear" as const,
            apiKey: process.env.LINEAR_API_KEY,
            teamId: process.env.LINEAR_TEAM_ID,
          },
        ]
      : []),
    ...(process.env.JIRA_BASE_URL &&
    process.env.JIRA_EMAIL &&
    process.env.JIRA_API_TOKEN &&
    process.env.JIRA_PROJECT_KEY
      ? [
          {
            type: "jira" as const,
            baseUrl: process.env.JIRA_BASE_URL,
            email: process.env.JIRA_EMAIL,
            apiToken: process.env.JIRA_API_TOKEN,
            projectKey: process.env.JIRA_PROJECT_KEY,
          },
        ]
      : []),
    ...(process.env.MONDAY_API_TOKEN && process.env.MONDAY_BOARD_ID
      ? [
          {
            type: "monday" as const,
            apiToken: process.env.MONDAY_API_TOKEN,
            boardId: process.env.MONDAY_BOARD_ID,
          },
        ]
      : []),
    ...(process.env.ASANA_ACCESS_TOKEN && process.env.ASANA_PROJECT_GID
      ? [
          {
            type: "asana" as const,
            accessToken: process.env.ASANA_ACCESS_TOKEN,
            projectGid: process.env.ASANA_PROJECT_GID,
          },
        ]
      : []),
  ];

  if (channels.length === 0) {
    throw new Error("Set at least one approval channel before requesting approval.");
  }

  const router = createMultiChannelApprovalRouter({
    signingSecret,
    channels,
  });

  const result = await router.requestApproval({
    gateId: "apr_sepa_2026_1104",
    actionName: "execute_sepa_transfer",
    summary: "Approve a SEPA transfer for supplier invoice 8841",
    context: { currency: "EUR", invoiceId: "8841" },
    callbackBaseUrl: "https://your-app.example/api/spurvik/callback",
  });

  console.log("Gate ID:", result.links.gateId);
  console.log("Approve URL:", result.links.approveUrl);
  console.log("Channel receipts:", result.receipts);
  console.log("Approval-link token check:", checkApprovalLink(signingSecret, result.links.approveUrl));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
