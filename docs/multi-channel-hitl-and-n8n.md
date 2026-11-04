# 9-Channel `ask_human()` Approval Router & `n8n` / `Make.com` Workflow Guard

> Source: https://github.com/spurvik/spurvik (`packages/sdk/src/channels.ts` & `packages/n8n-nodes-spurvik`). Spurvik emits chained HMAC-SHA256 provenance digests with zero raw prompt text persisted (`raw_prompt=0B`) and provides deterministic pre-flight `ask_human()` gates. It is not legal advice and does not certify EU AI Act compliance.

---

## 1. Universal 9-Channel `ask_human()` Approval Router (EU AI Act Art. 14)

Drop a deterministic human-in-the-loop gate in front of any agent tool that moves money, modifies contracts or permissions, deletes records, or sends external messages — and fan out signed **Approve / Block** actions to the tools your team already uses:

- **Chat & Messaging**: `slack`, `telegram`, `discord`, `teams` (Microsoft Teams Adaptive Card)
- **Email**: `email` (Resend transactional HTML approval card)
- **Issue & Work Trackers**: `linear` (GraphQL `issueCreate`), `jira` (REST v3 issue), `monday` (GraphQL `create_item`), `asana` (REST task)

### Quickstart (`spurvik` / `spurvik/channels`)

```ts
import {
  createMultiChannelApprovalRouter,
  verifySignedChannelCallback,
} from "spurvik";

const hitlRouter = createMultiChannelApprovalRouter({
  hmacSecret: process.env.SPURVIK_HMAC_SECRET!,
  callbackBaseUrl: "https://console.spurvik.com/api/v1/hitl/callback",
  channels: [
    {
      channel: "slack",
      webhookUrl: process.env.SLACK_WEBHOOK_URL!,
    },
    {
      channel: "telegram",
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
      chatId: process.env.TELEGRAM_APPROVAL_CHAT_ID!,
    },
    {
      channel: "linear",
      apiKey: process.env.LINEAR_API_KEY!,
      teamId: process.env.LINEAR_TEAM_ID!,
    },
    {
      channel: "email",
      resendApiKey: process.env.RESEND_API_KEY!,
      fromEmail: "approvals@your-company.eu",
      toEmail: "ops-approvals@your-company.eu",
    },
  ],
});

// Trigger pre-flight approval before executing a high-stakes tool call:
const result = await hitlRouter.requestApproval({
  approvalId: "apr_wire_2026_1104",
  toolName: "execute_sepa_transfer",
  actionSummary: "Approve €4,500 SEPA transfer to vendor IBAN DE89...",
  riskLevel: "critical",
  rawArgsOrPrompt: JSON.stringify({ amountEur: 4500, iban: "DE89..." }),
  metadata: { tenantId: "org_eu_01", currency: "EUR" },
});

console.log(result.payloadDigestSha256); // Chained HMAC-SHA256 digest (0 raw prompt bytes stored)
console.log(result.deliveries); // Per-channel HTTP delivery status
```

### Constant-Time Callback Verification

When an operator clicks **Approve** or **Block** in Slack, Telegram, Email, Linear, Jira, Monday, or Asana, verify the signed callback in constant time:

```ts
const check = verifySignedChannelCallback({
  hmacSecret: process.env.SPURVIK_HMAC_SECRET!,
  approvalId: req.query.id,
  decision: req.query.decision, // "approve" | "block"
  channel: req.query.channel,
  expiresAtUnix: Number(req.query.exp),
  signatureHex: req.query.sig,
});

if (!check.valid) {
  throw new Error(`Invalid or expired callback signature: ${check.reason}`);
}
```

---

## 2. `n8n` & `Make.com` No-Code / Low-Code AI Workflow Guard (`packages/n8n-nodes-spurvik`)

For operations and automation teams building AI workflows in **n8n** or **Make.com**, `n8n-nodes-spurvik` combines all three runtime primitives in a single node:

1. **Art. 50(1) AI Interaction Notice**: Automatically injects localized disclosure headers (`EN`, `DE`, `DA`, `FR`) into outbound AI responses.
2. **Art. 12 Zero-Raw-Prompt Chained HMAC-SHA256 Receipt**: Emits a verifiable hash-chain receipt (`rawPromptBytesPersisted: 0`) so your workflow logs never leak customer PII.
3. **Art. 14 Multi-Channel `ask_human()` Gate**: Pauses high-risk workflow branches and dispatches signed Approve / Block links to Slack, Telegram, Email, Linear, Jira, Monday.com, or Asana.

- **n8n Node Source**: [`packages/n8n-nodes-spurvik/src/index.ts`](../packages/n8n-nodes-spurvik/src/index.ts)
- **Make.com Importable Blueprint**: [`packages/n8n-nodes-spurvik/make-com-blueprint.json`](../packages/n8n-nodes-spurvik/make-com-blueprint.json)
