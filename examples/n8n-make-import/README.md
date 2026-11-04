# n8n and Make.com import guide (`n8n-nodes-spurvik`)

> Source: https://github.com/spurvik/spurvik (`packages/n8n-nodes-spurvik`). Package name on the manifest: `n8n-nodes-spurvik` at version `1.0.0`, `"license": "MIT"`.

Spurvik logs AI calls with HMAC receipts and offers disclosure, marking and human-oversight hooks; it does not make anyone compliant, and this is not legal advice.

This folder is an import guide for the files that are actually in `packages/n8n-nodes-spurvik`. The helper computes HMAC receipts in process. It does not send them to the Spurvik control plane.

## What the package contains

| Item | In the tree |
| --- | --- |
| Manifest | `packages/n8n-nodes-spurvik/package.json`. `"n8n"."nodes"` is `["dist/index.js"]`. There is no `"n8n"."credentials"` entry, no `dependencies`, no `scripts`, and no `files` list. |
| Runtime | `packages/n8n-nodes-spurvik/src/index.ts` exports `executeSpurvikWorkflowStep` and `SpurvikN8nNodeDescription`. |
| Build output | `dist/index.js` and `dist/index.d.ts` are named by the manifest. They are not in the repository. |
| npm | The registry name `n8n-nodes-spurvik` returns HTTP 404. Recheck with `npm view n8n-nodes-spurvik`. |
| Make file already in the package | `packages/n8n-nodes-spurvik/make-com-blueprint.json`. See [Make.com](#makecom) before importing it. |

`SpurvikN8nNodeDescription` fields n8n would read:

| Field | Value |
| --- | --- |
| `displayName` | `Spurvik EU AI Act Guard` |
| `name` | `spurvikEuAiActGuard` |
| `version` | `1` |
| `defaults.name` | `Spurvik Guard` |
| `inputs` / `outputs` | `["main"]` / `["main"]` |
| `properties` | `operation` (options) and `systemName` (string, required) |

`operation` values:

| Value | Label on the descriptor |
| --- | --- |
| `art50_disclosure` | Art. 50(1) AI Notice + Art. 12 HMAC Log |
| `art12_hmac_log` | Art. 12 Chained HMAC-SHA256 Log Only |
| `art14_ask_human` | Art. 14 Pre-Flight ask_human() Gate |

The function treats `art50_disclosure` and `art12_hmac_log` as one path. Both return the same notice string and the same HMAC receipt. Only the echoed `operation` string differs. `art14_ask_human` adds `art14Gate`.

The notice string is always:

```text
[AI System Notice · EU AI Act Art. 50(1)] You are interacting with an AI system (${systemName}).
```

When `outputText` is a string, `disclosedOutputText` is that notice, a blank line, and `outputText`. When `outputText` is omitted, `disclosedOutputText` is `null` and `outputHmac` is `null`.

HMAC receipt on `art12Record` (hex digests, secret kept by the caller):

```text
inputHmac  = HMAC-SHA-256(hmacSecret, "spurvik:workflow:input:v1|" + (rawInputText or ""))
outputHmac = HMAC-SHA-256(hmacSecret, "spurvik:workflow:output:v1|" + outputText)   # or null
recordHash = HMAC-SHA-256(hmacSecret, "spurvik:workflow:chain:v1|" + previous + "|" + systemName + "|" + inputHmac + "|" + (outputHmac or "none") + "|" + timestampIso)
```

`previous` is `previousRecordHash` with surrounding space removed, or 64 `0` characters when that argument is empty. `timestampIso` is `new Date().toISOString()` unless the caller passes `opts.nowIso`. `rawPromptBytes` on the receipt is the number `0`. The returned object leaves out `rawInputText` and `outputText`. `hmacSecret` must be a string of at least 16 characters after trim, or the function throws.

Arguments that exist on `executeSpurvikWorkflowStep` and are absent from `properties`: `hmacSecret`, `rawInputText`, `outputText`, `previousRecordHash`, `actionName`, `actionSummary`, `gateId`, `channel`, `callbackBaseUrl`.

For `art14_ask_human`, empty optional arguments become `gate_${recordHash.slice(0, 16)}`, `workflow.risky_action`, and `Human approval required for ${actionName}`. `art14Gate.status` is `pending_human_approval`. Approve and reject URLs come from `createSignedApprovalLinks` in `packages/sdk/src/channels.ts`. If `callbackBaseUrl` is omitted, that helper uses `https://console.spurvik.com/api/v1/hitl` and appends a query string (`gateId`, `ts`, `hmac`, `decision`, `sig`). Building the URL does not create a human-oversight row.

`channel` is optional. When it is set, `dispatchHumanApprovalChannel` sends one HTTP POST to that channel (Slack, Telegram, email, Discord, Teams, Linear, Jira, Monday.com, or Asana). The n8n `properties` array has no `channel` field, so a workflow import cannot pass one. The import path is a relative source import, `../../sdk/src/channels.js`, and the package manifest declares no dependency on the SDK.

## n8n

n8n's install documentation: [Installation and management](https://docs.n8n.io/integrations/community-nodes/installation-and-management) and [GUI installation](https://docs.n8n.io/integrations/community-nodes/installation-and-management/gui-installation).

n8n Cloud installs community nodes from the nodes panel (n8n 1.94.0 or later). Installing a package by npm name is a self-hosted action. `n8n-nodes-spurvik` is not on npm, so the nodes panel has no package to add, and Cloud has no other install path for this folder.

Self-hosted steps, in order:

1. Run a self-hosted n8n. Community-node installs from npm need `N8N_COMMUNITY_PACKAGES_ENABLED=true` (the documented default). The owner or admin account is the account that can open the install dialog.
2. Open **Settings → Community Nodes → Install**.
3. Enter the npm package name `n8n-nodes-spurvik`. Accept the community-node risk prompt and select **Install**.
4. The install stops at the registry. `npm view n8n-nodes-spurvik` returns 404, so n8n has no tarball to save. The same 404 is what `npm install n8n-nodes-spurvik` inside `~/.n8n/nodes` returns. The manifest's entry file `dist/index.js` is also absent from this repository, and the package has no build script that could create it.
5. Credentials: there is nothing to add. The manifest has no credential list, and `SpurvikN8nNodeDescription` has no `credentials` field. n8n's credential screen will not offer a Spurvik credential. Placeholder names for the function argument and for SDK HTTP calls you make yourself are in [`.env.example`](./.env.example) and in the table below. Do not put a live key in the workflow JSON.
6. Import the workflow. In the workflow editor, open the menu and choose **Import from File**. Select [`spurvik-eu-ai-act-guard.workflow.json`](./spurvik-eu-ai-act-guard.workflow.json).
7. The file's Spurvik nodes use type `n8n-nodes-spurvik.spurvikEuAiActGuard`, `typeVersion` `1`, and parameters `operation` and `systemName` only. Those names are taken from `SpurvikN8nNodeDescription`. n8n loads a community node by requiring a class from the installed package. This package exports a plain object and a function. It does not export a class with an `execute` method. After import, the canvas shows a missing node type.
8. Run the workflow from **When clicking Execute workflow**. n8n stops on the missing node. The run does not call `executeSpurvikWorkflowStep`, does not build an HMAC receipt, and does not send HTTP.
9. Where an HMAC receipt shows up when something else calls the function: on the return value, field `art12Record`. The function does not POST that object anywhere. The hosted console does not gain a row from this package.
10. Where a channel message shows up: only after a direct call that passes `channel`. The POST goes to that channel's own URL (`webhookUrl` for Slack, Discord, and Teams). `art14Gate.channelReceipt` then has `channel`, `gateId`, `actionHmac`, `httpStatus`, and `externalId`. The imported workflow cannot set `channel`. Nothing in this package receives the approve or reject click.

A manual call, outside n8n, is `executeSpurvikWorkflowStep` from `packages/n8n-nodes-spurvik/src/index.ts` with `hmacSecret` and `systemName`. That still stays in process unless `channel` is set.

## Make.com

Make.com does not load n8n community nodes. A Make scenario cannot install `n8n-nodes-spurvik`. The HTTP module is the module that can send the requests below. Settings to type in, and the same content in [`make-http-module.json`](./make-http-module.json):

1. Create a scenario. Add a trigger you control (the JSON uses a custom webhook module as the first module). Leave the webhook URL as a placeholder until you connect a scenario in your own Make account. This repository does not publish a webhook URL.
2. The helper's only HTTP request is the channel POST inside `dispatchHumanApprovalChannel`, and only when `channel` is passed. Add **HTTP → Make a request** (`http:ActionSendData`, version 3):
   - URL: `{{var.CHANNEL_WEBHOOK_URL}}` (placeholder `https://example.com/hooks/REPLACE_ME`)
   - Method: `POST`
   - Body type: Raw
   - Content type: `application/json`
   - Header `content-type`: `application/json`
   - Body: the Slack shape from `buildChannelOutboundRequest` (`text`, `blocks` with one `section` and one `actions` array). Button URLs in the sample are `https://example.com/hitl?...` placeholders. The real URLs are the `approveUrl` and `rejectUrl` strings from `createSignedApprovalLinks`. Make's HTTP module does not compute those HMAC receipts. The sample body is the shape, with `REPLACE_ME` where the digest and signature would be.
3. `packages/n8n-nodes-spurvik/make-com-blueprint.json` posts to `https://console.spurvik.com/api/v1/hitl` with JSON keys `actionName`, `inputHmac`, and `rawPromptBytes`, and it uses Make's `sha256` on the prompt text. `executeSpurvikWorkflowStep` does not send that request. The SDK create-body for `POST /api/v1/hitl` is `actionName` plus `payloadSummary` (`HitlCreateBody` in `packages/core/src/wire.ts`). The blueprint's `sha256(...)` string is a different digest from `spurvik:workflow:input:v1|...`. Importing that blueprint does not reproduce the helper and does not match the SDK body.
4. Console rows come from the SDK client in `packages/sdk/src/client.ts`, which this n8n package does not call. To write those rows from Make, add separate HTTP modules. Base URL placeholder: `{{var.SPURVIK_BASE_URL}}` (`https://example.com` in `.env.example`). For an invited organisation the SDK docs use `https://console.spurvik.com`. Headers on every call: `authorization: Bearer {{var.SPURVIK_API_KEY}}`, `accept: application/json`, `content-type: application/json`. The client reads a JSON object with a `data` field.

   `POST {{var.SPURVIK_BASE_URL}}/api/v1/telemetry` with:

   ```json
   {
     "events": [
       {
         "eventId": "00000000-0000-4000-8000-000000000000",
         "timestamp": "2026-11-04T00:00:00.000Z",
         "modelProvider": "unknown",
         "modelVersion": "placeholder",
         "inputHash": null,
         "outputHash": null,
         "contentHashMode": "off",
         "latencyMs": 0,
         "temperature": null,
         "contentMarkingApplied": false,
         "evidenceTrailerAttached": false,
         "markingHookId": null,
         "hitlStatus": null
       }
     ]
   }
   ```

   A stored telemetry batch is the project's call log in the hosted console. This n8n package never sends one. `contentMarkingApplied` stays `false` here; this package does not call a marking hook.

   `POST {{var.SPURVIK_BASE_URL}}/api/v1/hitl` with:

   ```json
   {
     "actionName": "workflow.risky_action",
     "payloadSummary": "{\"contentFingerprint\":null,\"keys\":[\"invoiceId\"],\"schema\":\"spurvik.payload_summary.v1\"}"
   }
   ```

   `payloadSummary` is the canonical JSON from `buildPayloadSummary`: keys sorted, field names only, fingerprint `null` or 64 hex characters. The human-oversight queue for that row is `/dashboard/projects/<projectId>/oversight`. `<projectId>` is the id the console returns; this guide has no project id.

   `POST {{var.SPURVIK_BASE_URL}}/api/v1/disclosure` with `{ "sessionId": "session_REPLACE_ME", "jurisdiction": "EU" }`. That is the SDK disclosure write. The n8n helper's notice is the local string above, and the helper does not send this POST.

   A decision is `POST {{var.SPURVIK_BASE_URL}}/api/v1/hitl/REPLACE_APPROVAL_ID/decision` with header `x-spurvik-reviewer: {{var.SPURVIK_REVIEWER_TOKEN}}` and body `{ "status": "approved", "reason": "placeholder reason" }`. `status` is `approved`, `rejected`, or `overridden`. The helper does not send this either.

5. Run the Make scenario after you replace every `REPLACE_ME` and `example.com` URL with values from your own account. Until then the HTTP module has nowhere real to send. A successful channel POST shows up in that channel. A successful `POST /api/v1/hitl` shows up on the oversight path above. A successful `POST /api/v1/telemetry` shows up as ingested telemetry for the project. None of those sends happen because an n8n workflow imported this package.

## Placeholder credentials

| Name | Placeholder | Who reads it |
| --- | --- | --- |
| `SPURVIK_HMAC_SECRET` | `replace-with-at-least-16-characters` | `executeSpurvikWorkflowStep` argument `hmacSecret`. It is not an n8n parameter and it is not sent to the control plane. |
| `SPURVIK_API_KEY` | `spurvik_live_REPLACE_ME` | `Authorization: Bearer` on SDK HTTP. This n8n package does not read it. |
| `SPURVIK_REVIEWER_TOKEN` | `spurvik_reviewer_REPLACE_ME` | Header `x-spurvik-reviewer` on a decision call. This n8n package does not read it. |
| `SPURVIK_BASE_URL` | `https://example.com` | SDK `baseUrl`. This n8n package does not read it. |
| `CHANNEL_WEBHOOK_URL` | `https://example.com/hooks/REPLACE_ME` | `channel.webhookUrl` for a Slack, Discord, or Teams channel passed to the function. |
| `CALLBACK_BASE_URL` | `https://example.com/hitl` | `callbackBaseUrl` on the function. |

## Check the JSON

From the repository root:

```bash
node examples/n8n-make-import/validate-workflows.mjs
```

The script loads `SpurvikN8nNodeDescription` from `packages/n8n-nodes-spurvik/src/index.ts` and checks every Spurvik node in the workflow JSON: type `n8n-nodes-spurvik.spurvikEuAiActGuard`, `typeVersion` equal to the descriptor `version`, and parameter names limited to `properties`. It also parses `make-http-module.json`. This repository has no CI job that runs `examples/`.

## Gaps

- `n8n-nodes-spurvik` is not published on npm (registry 404), so neither Cloud nor self-hosted n8n can install it from the registry.
- `dist/index.js` is missing, and the package has no build script.
- The source file is not an n8n node class. There is no `execute` method for the runner to call.
- There is no credential type. `hmacSecret` and `channel` cannot be set on the imported node.
- `art50_disclosure` and `art12_hmac_log` share one code path. The notice is one English string. The helper does not call `POST /api/v1/disclosure`, `POST /api/v1/telemetry`, or `POST /api/v1/hitl`.
- The helper imports `packages/sdk/src/channels.ts` by a relative path. The manifest does not declare that dependency.
- `packages/n8n-nodes-spurvik/make-com-blueprint.json` is a short JSON document. Its POST body does not match `HitlCreateBody`, and it is not a scenario exported from Make.
- This guide's workflow file was checked against the descriptor. It was not executed inside a running n8n instance, because the package cannot be installed there.
