# 9-channel `ask_human()` approval router and `n8n-nodes-spurvik@1.0.15`

> Source: https://github.com/spurvik/spurvik (`packages/sdk/src/channels.ts`, published `spurvik@1.0.18`, and `n8n-nodes-spurvik@1.0.15` in this repository). This is not legal advice.

## 1. Approval router (`spurvik@1.0.18`)

`createMultiChannelApprovalRouter` sends one pre-flight `ask_human()` request to each channel you pass. `spurvik@1.0.18` accepts Slack, Telegram, email (Resend), Discord, Microsoft Teams, Linear, Jira, Monday.com, and Asana. This router is designed to support Article 12 record-keeping and Article 14 human oversight for high-risk AI systems.

### Callback URL & Nonce Verification

In `spurvik@1.0.18` (and `1.0.5+`), `callbackBaseUrl` is required on the approval request (`callbackBaseUrl: string` in `dist/channels.d.ts`), and `createSignedApprovalLinks` generates a random 16-byte hex `nonce` per link and mixes it into the HMAC-SHA256 signature. Pass your own GET callback endpoint (or `https://console.spurvik.com/api/v1/hitl/callback`) and verify the token with `verifyChannelApprovalToken` (passing `nonce`) or `verifySignedChannelCallback`:

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

Provenance records in `spurvik@1.0.18` carry `inputHash`. `contentHash.mode` defaults to `"keyed"`. In that mode `inputHash` is a keyed HMAC-SHA256 fingerprint of the input, and `contentHash.secret` must be at least 16 characters. Channel dispatch receipts are a separate object: `channel`, `gateId`, `actionHmac`, `httpStatus`, and `externalId`. n8n execution history keeps node inputs and outputs.

## 2. `n8n-nodes-spurvik@1.0.15`

This repository's package is `n8n-nodes-spurvik@1.0.15`. `1.0.15` adds `reportMarkdownUrl`, `c2paStatusShieldUrl`, `trustCenterCardUrl`, `trustWidgetScript`, `aiActManifestUrl`, and 15-CMS installer links (`PrestaShop`, `Shopware`, `Wix`, `Squarespace`, `Magento`, `BigCommerce`, `Drupal`, `Ghost`, `HubSpot CMS`) to `scanDomain`, offline 6-vector Art. 14 `gateSelfTest` (operation #8), `User-Agent: n8n-nodes-spurvik/1.0.15`, and `spurvik-sdk@^1.0.18`. `1.0.11` surfaces `detectedPlatforms`, 1-click CMS/GTM `platformInstallerUrls`, 2 Dec 2026 `heroImageProxy` C2PA CDN-strip diagnosis, `widgetDisclosureClass`, `prefilledPortfolioUrl`, and Free €0 + Pro/Team Annual `upgradeUrls` across scan and C2PA operations, clarifies 1-field email signup copy in `vendorQuestionnaireAnswers`, and sends `User-Agent: n8n-nodes-spurvik/1.0.11`. `1.0.10` marks `n8n-workflow` as an optional peer dependency (`peerDependenciesMeta.n8n-workflow.optional = true` so bare host installs avoid `isolated-vm` C++ compilation), returns `consoleSync: { httpStatus: 402, synced: false, planRequired: "pro" }` plus `upgradeUrls` instead of throwing when a Free-plan `consoleApiKey` calls `/api/v1/hitl` on `art14_ask_human`, and sends `User-Agent: n8n-nodes-spurvik/1.0.10`. `1.0.9` honours upstream `<html lang>` in `scanDomain` and `batchScanDomains`, detects Shopify CDN, WordPress Jetpack Photon and Webflow Image CDN C2PA stripping (and omits `appUrl` on shared CDN hosts) in `checkImageC2paUrl`, and sends `User-Agent: n8n-nodes-spurvik/1.0.9` across scan, C2PA check, and console sync. `1.0.8` added the zero-credential Answer Vendor Security Questionnaire operation (`vendorQuestionnaireAnswers`): Q1–Q5 EU AI Act answers for enterprise security questionnaires and DPO RFPs, built locally with no request (the same text as `spurvik-mcp-server@1.0.8` tool #10 and `npx spurvik rfp`), and `upgradeUrls` signup links on the notice, digest, and approval results when no `consoleApiKey` is set. `1.0.7` adds the zero-key Check Image C2PA & CDN Strip operation (`checkImageC2paUrl`): a read-only C2PA JUMBF manifest & CDN-strip checker for one public https image URL, ahead of Art. 50(2) machine-readable marking (applies from 2 December 2026). It never signs or adds a manifest. The URL is checked locally first (https on port 443 only; credentials, localhost, internal names and IP literals are refused before any request), then sent to `POST {consoleBaseUrl}/api/v1/provenance/public-check-url`. The output reports `manifestFound`, `signatureMatches`, `trustAnchor`, a sanitized `claimGenerator` and `validationCodes`, `cdnRewriteSuspected` for `/_next/image`, `/cdn-cgi/image/`, Cloudinary, imgix, Shopify CDN, Jetpack Photon, and Webflow CDN, a `data-notice="generated"` `badge.js` snippet, the `/c2pa` checker link, and signup links. `1.0.6` added the zero-key Batch Scan operation (`batchScanDomains`): it checks 1 to 10 public client sites in one step (every entry is validated before any request, 4 in flight), counts Art. 50 notice gaps, and returns one Scan Live Domain row per host plus a portfolio link. Scan Live Domain rows now also carry `portfolioUrl`, `statusShieldUrl`, and `statusShieldMarkdown`. `1.0.5` added the zero-key Scan Live Domain operation (`scanDomain`): it checks one public site for AI chat widgets and an Art. 50 notice through the console's public scan endpoint, needs no credential or API key, and returns a `badge.js` snippet plus report, sandbox, and upgrade links. `1.0.4` added optional `consoleApiKey` on the `spurvikApi` credential and `consoleBaseUrl` (`https://console.spurvik.com` by default) to sync hashed telemetry, disclosure sessions, and human-oversight rows to the hosted console without sending prompt text.

The `n8n-nodes-spurvik@1.0.15` tarball contains:
- `dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js` (exports `SpurvikEuAiActGuard` with `description` and `execute()`)
- `dist/nodes/SpurvikEuAiActGuard/spurvik.svg`
- `dist/credentials/SpurvikApi.credentials.js` (exports `SpurvikApi`)
- `dist/workflow.js` (exports `executeSpurvikWorkflowStep` and `SpurvikN8nNodeDescription`)
- `dist/scan-domain.js` (exports `scanSpurvikDomain`, `batchScanSpurvikDomains`, `parseBatchDomains`, and `normalizeScanDomain`)
- `dist/check-image-c2pa-url.js` (exports `checkSpurvikImageC2paUrl`, `normalizeC2paImageUrl`, and `detectImageProxy`)
- `dist/vendor-questionnaire.js` (exports `spurvikVendorQuestionnaireAnswers` and `questionnaireHostname`)
- `dist/index.js`
- `make-com-blueprint.json`

`package.json` sets `n8n.nodes` to `["dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js"]` and `n8n.credentials` to `["dist/credentials/SpurvikApi.credentials.js"]`. The 1.0.2 package loaded in `n8n 2.46.4`. The node exposes three operations (`art50_disclosure`, `art12_hmac_log`, `art14_ask_human`) designed to support Article 50(1) transparency notices, and Article 12 record-keeping and Article 14 human oversight for high-risk AI systems, plus the zero-key `scanDomain`, `batchScanDomains`, and `checkImageC2paUrl` operations. The `spurvikApi` credential stays required for the first three and is hidden for the three zero-key operations. By default `passThroughFields` is blank. A listed entry equal to `inputField` (trimmed, any letter case) is not copied.

Files in this repository:

- [`packages/n8n-nodes-spurvik/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.ts`](../packages/n8n-nodes-spurvik/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.ts)
- [`packages/n8n-nodes-spurvik/credentials/SpurvikApi.credentials.ts`](../packages/n8n-nodes-spurvik/credentials/SpurvikApi.credentials.ts)
- [`packages/n8n-nodes-spurvik/src/workflow.ts`](../packages/n8n-nodes-spurvik/src/workflow.ts)
- [`packages/n8n-nodes-spurvik/make-com-blueprint.json`](../packages/n8n-nodes-spurvik/make-com-blueprint.json)
