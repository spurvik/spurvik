import {
  createMultiChannelApprovalRouter,
  verifyChannelApprovalToken,
  type HumanApprovalChannelConfig,
} from "spurvik";

async function main() {
  const signingSecret =
    process.env.SPURVIK_HMAC_SECRET ?? "demo-hmac-secret-at-least-16-chars";

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
    ...(process.env.LINEAR_API_KEY && process.env.LINEAR_TEAM_ID
      ? [
          {
            type: "linear" as const,
            apiKey: process.env.LINEAR_API_KEY,
            teamId: process.env.LINEAR_TEAM_ID,
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
  ];

  if (channels.length === 0) {
    throw new Error("Configure at least one approval channel.");
  }

  const router = createMultiChannelApprovalRouter({
    signingSecret,
    channels,
  });

  const { links, receipts } = await router.requestApproval({
    gateId: "apr_sepa_2026_1104",
    actionName: "execute_sepa_transfer",
    summary: "Approve a SEPA wire transfer for supplier invoice 8841",
    context: { currency: "EUR", invoiceId: "8841" },
    callbackBaseUrl: "https://console.spurvik.com/api/v1/hitl/callback",
  });

  console.log("Gate ID:", links.gateId);
  console.log("HMAC-SHA256 digest:", links.actionHmac);
  console.log("Channel receipts:", receipts);

  const url = new URL(links.approveUrl);
  const decision = url.searchParams.get("decision");
  if (decision !== "approved" && decision !== "rejected") {
    throw new Error("Approval link is missing a decision.");
  }

  const matches = verifyChannelApprovalToken({
    gateId: url.searchParams.get("gateId") ?? "",
    actionHmac: url.searchParams.get("hmac") ?? "",
    decision,
    issuedAtUnix: Number(url.searchParams.get("ts")),
    signature: url.searchParams.get("sig") ?? "",
    signingSecret,
  });
  console.log("Callback signature matches:", matches);
}

main().catch(console.error);
