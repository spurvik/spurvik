import {
  createMultiChannelApprovalRouter,
  verifySignedChannelCallback,
} from "spurvik";

async function main() {
  const hmacSecret =
    process.env.SPURVIK_HMAC_SECRET ?? "demo-hmac-secret-at-least-16-chars";

  const router = createMultiChannelApprovalRouter({
    hmacSecret,
    callbackBaseUrl: "https://console.spurvik.com/api/v1/hitl/callback",
    channels: [
      ...(process.env.SLACK_WEBHOOK_URL
        ? [{ channel: "slack" as const, webhookUrl: process.env.SLACK_WEBHOOK_URL }]
        : []),
      ...(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
        ? [
            {
              channel: "telegram" as const,
              botToken: process.env.TELEGRAM_BOT_TOKEN,
              chatId: process.env.TELEGRAM_CHAT_ID,
            },
          ]
        : []),
      ...(process.env.LINEAR_API_KEY && process.env.LINEAR_TEAM_ID
        ? [
            {
              channel: "linear" as const,
              apiKey: process.env.LINEAR_API_KEY,
              teamId: process.env.LINEAR_TEAM_ID,
            },
          ]
        : []),
      ...(process.env.RESEND_API_KEY && process.env.APPROVAL_EMAIL_TO
        ? [
            {
              channel: "email" as const,
              resendApiKey: process.env.RESEND_API_KEY,
              fromEmail: "approvals@your-company.eu",
              toEmail: process.env.APPROVAL_EMAIL_TO,
            },
          ]
        : []),
    ],
  });

  const result = await router.requestApproval({
    approvalId: "apr_sepa_2026_1104",
    toolName: "execute_sepa_transfer",
    actionSummary: "Approve €2,400 SEPA wire transfer to supplier invoice #8841",
    riskLevel: "critical",
    rawArgsOrPrompt: JSON.stringify({ amountEur: 2400, invoiceId: "8841" }),
    metadata: { currency: "EUR", invoiceId: "8841" },
  });

  console.log("Approval ID:", result.approvalId);
  console.log("Payload digest:", result.payloadDigestSha256);
  console.log("Channel Deliveries:", result.deliveries);

  // Verify signed Approve/Block link in constant time:
  const url = new URL(result.approveUrl);
  const verified = verifySignedChannelCallback({
    hmacSecret,
    approvalId: url.searchParams.get("id")!,
    decision: url.searchParams.get("decision") as "approve" | "block",
    channel: (url.searchParams.get("channel") as any) ?? "slack",
    expiresAtUnix: Number(url.searchParams.get("exp")),
    signatureHex: url.searchParams.get("sig")!,
  });
  console.log("Callback verification:", verified);
}

main().catch(console.error);
