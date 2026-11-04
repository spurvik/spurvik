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
  verifyChannelApprovalToken,
} from "spurvik";

const hitlRouter = createMultiChannelApprovalRouter({
  signingSecret: process.env.SPURVIK_HMAC_SECRET!,
  channels: [
    {
      type: "slack",
      webhookUrl: process.env.SLACK_WEBHOOK_URL!,
    },
    {
      type: "telegram",
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
      chatId: process.env.TELEGRAM_APPROVAL_CHAT_ID!,
    },
    {
      type: "linear",
      apiKey: process.env.LINEAR_API_KEY!,
      teamId: process.env.LINEAR_TEAM_ID!,
    },
    {
      type: "email",
      resendApiKey: process.env.RESEND_API_KEY!,
      from: "approvals@your-company.eu",
      to: "ops-approvals@your-company.eu",
    },
  ],
});

const { links, receipts } = await hitlRouter.requestApproval({
  gateId: "apr_wire_2026_1104",
  actionName: "execute_sepa_transfer",
  summary: "Approve a SEPA transfer to vendor IBAN DE89...",
  context: { tenantId: "org_eu_01", currency: "EUR" },
  callbackBaseUrl: "https://console.spurvik.com/api/v1/hitl/callback",
});

console.log(links.actionHmac);
console.log(receipts);
```

### Constant-Time Callback Verification

When a person opens an **Approve** or **Block** link from Slack, Telegram, Email, Discord, Microsoft Teams, Linear, Jira, or Asana, check it with `verifyChannelApprovalToken`. Monday.com creates an item for the request and does not send those links.

```ts
const decision = req.query.decision;
if (decision !== "approved" && decision !== "rejected") {
  throw new Error("Callback decision is missing.");
}

const matches = verifyChannelApprovalToken({
  gateId: String(req.query.gateId),
  actionHmac: String(req.query.hmac),
  decision,
  issuedAtUnix: Number(req.query.ts),
  signature: String(req.query.sig),
  signingSecret: process.env.SPURVIK_HMAC_SECRET!,
});

if (!matches) {
  throw new Error("Callback signature does not match.");
}
```

---

## 2. `n8n` & `Make.com` No-Code / Low-Code AI Workflow Guard (`packages/n8n-nodes-spurvik`)

For operations and automation teams building AI workflows in **n8n** or **Make.com**, `n8n-nodes-spurvik` combines all three runtime primitives in a single node:

1. **Art. 50(1) AI Interaction Notice**: Automatically injects localized disclosure headers (`EN`, `DE`, `DA`, `FR`) into outbound AI responses.
2. **HMAC-SHA256 record**: Logs the call as an HMAC-SHA256 digest in place of the raw prompt text, designed to support Article 12 record-keeping.
3. **`ask_human()` gate step**: Sends Approve / Block links to Slack, Telegram, Email, Discord, Microsoft Teams, Linear, Jira, or Asana, designed to support Article 14 human oversight. Monday.com creates an item for the request.

- **n8n Node Source**: [`packages/n8n-nodes-spurvik/src/index.ts`](../packages/n8n-nodes-spurvik/src/index.ts)
- **Make.com Importable Blueprint**: [`packages/n8n-nodes-spurvik/make-com-blueprint.json`](../packages/n8n-nodes-spurvik/make-com-blueprint.json)
