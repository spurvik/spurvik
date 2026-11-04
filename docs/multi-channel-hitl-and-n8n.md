# 9-channel `ask_human()` approval router and `n8n-nodes-spurvik@1.0.2`

> Source: https://github.com/spurvik/spurvik (`packages/sdk/src/channels.ts`, published `spurvik@1.0.6`, and the `n8n-nodes-spurvik@1.0.2` npm tarball). This is not legal advice.

## 1. Approval router (`spurvik@1.0.6`)

`createMultiChannelApprovalRouter` sends one pre-flight `ask_human()` request to each channel you pass. `spurvik@1.0.6` accepts Slack, Telegram, email (Resend), Discord, Microsoft Teams, Linear, Jira, Monday.com, and Asana. This router is designed to support Article 12 record-keeping / Article 14 human oversight.

### Callback URL & Nonce Verification

In `spurvik@1.0.6` (and `1.0.5+`), `callbackBaseUrl` is required on the approval request (`callbackBaseUrl: string` in `dist/channels.d.ts`), and `createSignedApprovalLinks` generates a random 16-byte hex `nonce` per link and mixes it into the HMAC-SHA256 signature. Pass your own GET callback endpoint (or `https://console.spurvik.com/api/v1/hitl/callback`) and verify the token with `verifyChannelApprovalToken` (passing `nonce`) or `verifySignedChannelCallback`:

```ts
import {
  createMultiChannelApprovalRouter,
  verifyChannelApprovalToken,
} from "spurvik";

const hitlRouter = createMultiChannelApprovalRouter({
  signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
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

const result = await hitlRouter.requestApproval({
  gateId: "apr_wire_2026_1104",
  actionName: "execute_sepa_transfer",
  summary: "Approve a SEPA transfer to a vendor invoice",
  context: { currency: "EUR" },
  callbackBaseUrl: "https://your-app.example/api/spurvik/callback",
});

// Illustrative. This parses approveUrl for demonstration.
// A real handler reads the token, nonce, and decision from the incoming request.
const url = new URL(result.links.approveUrl);
const decision = url.searchParams.get("decision");
const tokenOk =
  (decision === "approved" || decision === "rejected") &&
  verifyChannelApprovalToken({
    signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
    gateId: url.searchParams.get("gateId") ?? "",
    actionHmac: url.searchParams.get("hmac") ?? "",
    decision,
    issuedAtUnix: Number(url.searchParams.get("ts")),
    nonce: url.searchParams.get("nonce") ?? undefined,
    signature: url.searchParams.get("sig") ?? "",
  });
```

### Input fingerprint

Provenance records in `spurvik@1.0.6` carry `inputHash`. `contentHash.mode` defaults to `"keyed"`. In that mode `inputHash` is a keyed HMAC-SHA256 fingerprint of the input, and `contentHash.secret` must be at least 16 characters. Channel dispatch receipts are a separate object: `channel`, `gateId`, `actionHmac`, `httpStatus`, and `externalId`. n8n execution history keeps node inputs and outputs.

## 2. `n8n-nodes-spurvik@1.0.2`

`npm view n8n-nodes-spurvik versions dist-tags` lists `0.0.0-stage`, `1.0.0`, `1.0.1`, and `1.0.2`, with `latest` at `1.0.2`.

The `n8n-nodes-spurvik@1.0.2` tarball contains:
- `dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js` (exports `SpurvikEuAiActGuard` with `description` and `execute()`)
- `dist/nodes/SpurvikEuAiActGuard/spurvik.svg`
- `dist/credentials/SpurvikApi.credentials.js` (exports `SpurvikApi`)
- `dist/workflow.js` (exports `executeSpurvikWorkflowStep` and `SpurvikN8nNodeDescription`)
- `dist/index.js`
- `make-com-blueprint.json`

`package.json` sets `n8n.nodes` to `["dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js"]` and `n8n.credentials` to `["dist/credentials/SpurvikApi.credentials.js"]`. Loaded in `n8n 2.46.4`, the native Community Node registers cleanly and exposes three operations (`art50_disclosure`, `art12_hmac_log`, `art14_ask_human`) designed to support Article 50(1) transparency notices, Article 12 record-keeping, and Article 14 human oversight. By default `passThroughFields` is blank, so incoming prompt fields are not copied onto the node output unless explicitly listed in `passThroughFields`.

Files in this repository:

- [`packages/n8n-nodes-spurvik/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.ts`](../packages/n8n-nodes-spurvik/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.ts)
- [`packages/n8n-nodes-spurvik/credentials/SpurvikApi.credentials.ts`](../packages/n8n-nodes-spurvik/credentials/SpurvikApi.credentials.ts)
- [`packages/n8n-nodes-spurvik/src/workflow.ts`](../packages/n8n-nodes-spurvik/src/workflow.ts)
- [`packages/n8n-nodes-spurvik/make-com-blueprint.json`](../packages/n8n-nodes-spurvik/make-com-blueprint.json)
