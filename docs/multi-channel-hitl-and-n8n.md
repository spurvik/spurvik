# 9-channel `ask_human()` approval router and `n8n-nodes-spurvik@1.0.1`

> Source: https://github.com/spurvik/spurvik (`packages/sdk/src/channels.ts`, published `spurvik@1.0.4`, and the `n8n-nodes-spurvik@1.0.1` npm tarball). This is not legal advice.

## 1. Approval router (`spurvik@1.0.4`)

`createMultiChannelApprovalRouter` sends one pre-flight `ask_human()` request to each channel you pass. `spurvik@1.0.4` accepts Slack, Telegram, email (Resend), Discord, Microsoft Teams, Linear, Jira, Monday.com, and Asana. This router is designed to support Article 12 record-keeping / Article 14 human oversight.

### Callback URL

In published `spurvik@1.0.4`, `callbackBaseUrl` is optional on the approval request (`callbackBaseUrl?: string` in `dist/channels.d.ts`). `createSignedApprovalLinks` in `dist/channels.js` uses this when the value is missing or blank:

```js
request.callbackBaseUrl?.trim() || "https://console.spurvik.com/api/v1/hitl"
```

That console route accepts POST only. An approver click is a GET, so the click is not accepted, and nothing is approved or recorded. The console does not hold the customer's secret, so it cannot check the link. On 1.0.4, always set `callbackBaseUrl` to your own endpoint and check the token there with `verifyChannelApprovalToken`. `callbackBaseUrl` is required from 1.0.5 (planned).

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
  callbackBaseUrl: 'https://your-app.example/api/spurvik/callback',
});

// Handler for GET {callbackBaseUrl}?gateId&ts&hmac&decision&sig
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
    signature: url.searchParams.get("sig") ?? "",
  });
```

### Input fingerprint

Provenance records in `spurvik@1.0.4` carry `inputHash`. `contentHash.mode` defaults to `"keyed"`. In that mode `inputHash` is a keyed HMAC-SHA256 fingerprint of the input, and `contentHash.secret` must be at least 16 characters (`dist/chunk-DQUZA3T3.js`). Channel dispatch receipts are a different object: `channel`, `gateId`, `actionHmac`, `httpStatus`, and `externalId`. n8n execution history keeps node inputs and outputs.

## 2. `n8n-nodes-spurvik@1.0.1`

`npm view n8n-nodes-spurvik versions dist-tags` lists `0.0.0-stage`, `1.0.0`, and `1.0.1`, with `latest` at `1.0.1`. The notes below are only what the `n8n-nodes-spurvik@1.0.1` tarball and a load under n8n 2.46.4 show.

The tarball contains `package.json`, `dist/index.js`, `src/index.ts`, `src/n8n-nodes-spurvik.test.ts`, and `make-com-blueprint.json`. `package.json` sets `n8n.nodes` to `["dist/index.js"]`. It has no `n8n.credentials` entry. `dist/index.js` does not export a credential type.

`dist/index.js` exports `executeSpurvikWorkflowStep`, `SpurvikN8nNodeDescription`, and class `SpurvikEuAiActGuard`. The class sets `description` and defines `execute()`. The file name is `index.js`, which does not match the class name. n8n 2.46.4 loads `new (require(file).index)()` (`n8n-core` `loadClassInIsolation`). The tarball has no export named `index`. That call throws `TypeError: require(...).index is not a constructor`.

Started with `n8n@2.46.4` and `N8N_CUSTOM_EXTENSIONS` pointed at a directory whose `node_modules/n8n-nodes-spurvik` is the unpacked 1.0.1 tarball. The process log says `Skipping custom node "<dir>/node_modules/n8n-nodes-spurvik/dist/index.js": failed to load.` and then `n8n ready`. No node from that package is registered. Native node (planned, 1.0.2).

`execute()` calls `executeSpurvikN8nGuard`, which neither `dist/index.js` nor `src/index.ts` in the tarball defines. It also calls `this.getInputData` and `this.getNodeParameter`, which the class does not define. The item built inside `execute()` is `{ json: { ...itemJson, spurvik: result } }`, so the output spreads the incoming item. Prompt text on that item is included in the output. n8n execution history keeps node inputs and outputs.

`n8n-nodes-spurvik@1.0.1` is designed to support Article 12 record-keeping / Article 14 human oversight.

Files in this repository, separate from that tarball:

- [`packages/n8n-nodes-spurvik/src/index.ts`](../packages/n8n-nodes-spurvik/src/index.ts)
- [`packages/n8n-nodes-spurvik/make-com-blueprint.json`](../packages/n8n-nodes-spurvik/make-com-blueprint.json)
