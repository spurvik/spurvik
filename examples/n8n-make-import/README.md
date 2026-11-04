# n8n and Make.com import guide (`n8n-nodes-spurvik`)

> Source: https://github.com/spurvik/spurvik (`packages/n8n-nodes-spurvik`). `n8n-nodes-spurvik` 1.0.0 is the repo manifest version; npm latest is 1.0.1 (MIT). `0.0.0-stage` is a placeholder.

Spurvik logs AI calls with HMAC receipts and offers disclosure, marking and human-oversight hooks. It is designed to support that work and not legal advice.

This folder is an import guide for the files that are actually in `packages/n8n-nodes-spurvik`. The helper computes HMAC receipts in process. It does not send them to the Spurvik control plane.

## What the package contains

| Item | Detail |
| --- | --- |
| Manifest | `packages/n8n-nodes-spurvik/package.json` version `1.0.2`. `"n8n"."nodes"` is `["dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js"]`. `"n8n"."credentials"` is `["dist/credentials/SpurvikApi.credentials.js"]`. |
| Runtime | `nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.ts` exports `class SpurvikEuAiActGuard` and `SpurvikN8nNodeDescription`. `workflow.ts` exports `executeSpurvikWorkflowStep`. `index.ts` re-exports both. |
| Build output | `npm run build` writes the node file n8n loads. Published `1.0.0` and `1.0.1` still point `n8n.nodes` at `dist/index.js`. n8n 2.46.4 fails those tarballs with `require(...).index is not a constructor`. In 1.0.1, `execute()` calls `executeSpurvikN8nGuard`, which that file does not define. |
| npm | `npm view n8n-nodes-spurvik` resolves. `latest` is `1.0.1` until `1.0.2` is published. `0.0.0-stage` is a placeholder. This repository's node is `1.0.2`. |
| Make file already in the package | `packages/n8n-nodes-spurvik/make-com-blueprint.json`. See [Make.com](#makecom) before importing it. |

`SpurvikN8nNodeDescription` fields n8n would read:

| Field | Value |
| --- | --- |
| `displayName` | `Spurvik AI Act Guard` |
| `name` | `spurvikEuAiActGuard` |
| `version` | `1` |
| `defaults.name` | `Spurvik AI Act Guard` |
| `inputs` / `outputs` | `["main"]` / `["main"]` |
| `credentials` | `spurvikApi`, required. The signing secret is a password field on that credential. |
| `properties` | `operation`, `systemName` (required), `inputField`, `outputField`, `noticeText`, `channel`, `approverTarget`, `callbackBaseUrl`, `actionName`, `actionSummary`, `emailFrom`, `jiraBaseUrl`, `jiraEmail`, `passThroughFields` |

`operation` values:

| Value | Label on the descriptor |
| --- | --- |
| `art50_disclosure` | Add an AI interaction notice |
| `art12_hmac_log` | Record an HMAC-SHA256 digest |
| `art14_ask_human` | Send an ask_human() approval request |

The three operations are separate. `art50_disclosure` reads `outputField` (default `outputText`) and prepends the notice to that AI output. It throws if the field is missing. It does not read the prompt field. `art12_hmac_log` hashes `inputField` and does not return that text. `art14_ask_human` sends the approval request.

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

`previous` is `previousRecordHash` with surrounding space removed, or 64 `0` characters when that argument is empty. `timestampIso` is `new Date().toISOString()` unless the caller passes `opts.nowIso`. `rawPromptBytes` on the helper receipt is the number `0`. `hmacSecret` must be a string of at least 16 characters after trim, or the function throws. In `n8n-nodes-spurvik@1.0.1`, `execute()` returns each item as `{ json: { ...itemJson, spurvik: result } }`, so the node output includes the incoming item. Prompt text on that item is in the output. n8n keeps each node's input and output on the execution. Set the instance's execution data retention yourself: `EXECUTIONS_DATA_SAVE_ON_SUCCESS`, `EXECUTIONS_DATA_SAVE_ON_ERROR`, `EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS`, `EXECUTIONS_DATA_PRUNE`, `EXECUTIONS_DATA_MAX_AGE`, and `EXECUTIONS_DATA_PRUNE_MAX_COUNT`.

`hmacSecret` is not a node parameter. Set it on the `spurvikApi` credential. `outputField`, `inputField`, `actionName`, `actionSummary`, `channel`, and `callbackBaseUrl` are node parameters. `callbackBaseUrl` is required for `art14_ask_human`. The SDK does not default it to the console HITL create route.

`channel` selects Slack, Telegram, Email (Resend), Discord, Microsoft Teams, Linear, Jira, Monday.com, or Asana. Monday.com creates an item only and does not send Approve or Block links. The node depends on `spurvik-sdk`. It does not import `packages/sdk/src`.

## n8n

n8n's install documentation: [Installation and management](https://docs.n8n.io/integrations/community-nodes/installation-and-management) and [GUI installation](https://docs.n8n.io/integrations/community-nodes/installation-and-management/gui-installation).

n8n Cloud installs community nodes from the nodes panel (n8n 1.94.0 or later). Installing a package by npm name is a self-hosted action. `npm install n8n-nodes-spurvik@1.0.0` succeeds. `latest` is `1.0.1`. `0.0.0-stage` is a placeholder. The 1.0.0 tarball has `dist/index.js` and no `INodeType` node class or credential type. `1.0.1` adds class `SpurvikEuAiActGuard` with `execute`, and it still has no credential type. n8n loads `require("dist/index.js").index` because the manifest file is `dist/index.js`. On n8n 2.46.4 that load fails with `require(...).index is not a constructor`. `execute()` in 1.0.1 calls `executeSpurvikN8nGuard`, which the file does not define, so a run would throw after a load fix. A working native node is (planned, 1.0.2).

Self-hosted steps, in order:

1. Run a self-hosted n8n. Community-node installs from npm need `N8N_COMMUNITY_PACKAGES_ENABLED=true` (the documented default). The owner or admin account is the account that can open the install dialog.
2. Open **Settings → Community Nodes → Install**.
3. Enter the npm package name `n8n-nodes-spurvik`. Accept the community-node risk prompt and select **Install**.
4. Install saves the package. `n8n-nodes-spurvik@1.0.0` and `latest` (`1.0.1`) are both on npm. `0.0.0-stage` is a placeholder. After install, n8n still does not list a Spurvik node. In the 1.0.0 tarball, `dist/index.js` exports `executeSpurvikWorkflowStep` and `SpurvikN8nNodeDescription`. It has no `INodeType` class and no credential type. `1.0.1` also exports `SpurvikEuAiActGuard` (`execute` is on that class) and still has no credential type. n8n instantiates `require("dist/index.js").index`. On n8n 2.46.4 the error is `require(...).index is not a constructor`. `execute()` in 1.0.1 calls `executeSpurvikN8nGuard`, which that file does not define. A working native node is (planned, 1.0.2).
5. Create a Spurvik credential in n8n. The credential type is `spurvikApi`. Put the signing secret in that credential's password field. Do not put the secret in the workflow JSON. Names for SDK HTTP calls you make yourself are in [`.env.example`](./.env.example). The n8n node does not read those variables.
6. Import the workflow. In the workflow editor, open the menu and choose **Import from File**. Select [`spurvik-eu-ai-act-guard.workflow.json`](./spurvik-eu-ai-act-guard.workflow.json).
7. The file's Spurvik nodes use type `n8n-nodes-spurvik.spurvikEuAiActGuard` and `typeVersion` `1`. Each node sets `operation` and `systemName`. The notice node also sets `outputField` (`outputText`). The digest node sets `inputField`. The ask-human node sets `channel`, `callbackBaseUrl`, `actionName`, and `actionSummary`. Each node references credential `spurvikApi` by `id` and `name` only. There is no signing secret in the file. After import, select your Spurvik credential on each node. `1.0.0` and `1.0.1` still fail to load because their manifest points at `dist/index.js`. `1.0.1` `execute()` calls `executeSpurvikN8nGuard`, which that file does not define.
8. Run the workflow from **When clicking Execute workflow**. n8n 2.46.4 stops while loading the node: `require(...).index is not a constructor`. The run does not build an HMAC receipt and does not send HTTP. `execute()` in 1.0.1 calls `executeSpurvikN8nGuard`, which the file does not define, so the run would throw even after that load error is gone. The 1.0.1 output item copies the incoming item, including prompt text when the item has it, and n8n's execution history keeps those inputs and outputs until you change the instance retention settings named above.
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
3. `packages/n8n-nodes-spurvik/make-com-blueprint.json` posts to `https://console.spurvik.com/api/v1/hitl` with JSON keys `actionName`, `inputHmac`, and `rawPromptBytes`, and it uses Make's `sha256` on the prompt text. `executeSpurvikWorkflowStep` does not send that request. The create-body `spurvik@1.0.4` sends for `POST /api/v1/hitl` is `actionName` plus `payloadSummary`. The blueprint's `sha256(...)` string is a different digest from `spurvik:workflow:input:v1|...`. Importing that blueprint does not reproduce the helper and does not match that body.
4. Console rows come from `spurvik@1.0.4` (`SpurvikClient`). This n8n package does not call it. To write those rows from Make, add separate HTTP modules. Base URL placeholder: `{{var.SPURVIK_BASE_URL}}` (`https://example.com` in `.env.example`). For an invited organisation the SDK docs use `https://console.spurvik.com`. Headers on every call: `authorization: Bearer {{var.SPURVIK_API_KEY}}`, `accept: application/json`, `content-type: application/json`. The client reads a JSON object with a `data` field.

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

From the repository root. No build is required: the script reads `nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.ts` when `dist` is absent. When `dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js` exists, the script loads that class instead. Build it with `cd packages/n8n-nodes-spurvik && npm run build` after `spurvik-sdk` is installed for that package.

```bash
node examples/n8n-make-import/validate-workflows.mjs
```

The script checks every Spurvik node: type `n8n-nodes-spurvik.spurvikEuAiActGuard`, `typeVersion` equal to the descriptor `version`, parameter names limited to `properties`, required parameters (including `outputField` on the notice operation), and a `spurvikApi` credential reference with `id` and `name` only. It accepts `export class SpurvikEuAiActGuard`. It also parses `make-http-module.json`. This repository has no CI job that runs `examples/`.

## Gaps

- Installing `n8n-nodes-spurvik@1.0.0` from npm works. `latest` is `1.0.1`. `0.0.0-stage` is a placeholder.
- The 1.0.0 tarball includes `dist/index.js` and has no `INodeType` node class or credential type, so n8n cannot load or list it as a node.
- `1.0.1` adds `SpurvikEuAiActGuard` with `execute` and still has no credential type. On n8n 2.46.4 the load error is `require(...).index is not a constructor`.
- `execute()` in 1.0.1 calls `executeSpurvikN8nGuard`, which the 1.0.1 file does not define. A run would throw after a load fix. The output item copies the incoming item, so prompt text on the input is in the node output, and n8n's execution history keeps node inputs and outputs until the instance retention settings are changed.
- This repository's `1.0.2` node class is `SpurvikEuAiActGuard` in `dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js`, with credential `spurvikApi`.
- `art50_disclosure` and `art12_hmac_log` are separate. The notice reads `outputField`. The helper does not call `POST /api/v1/disclosure`, `POST /api/v1/telemetry`, or `POST /api/v1/hitl`.
- The node depends on `spurvik-sdk`. It does not import `packages/sdk/src`.
- `packages/n8n-nodes-spurvik/make-com-blueprint.json` posts `actionName` and `payloadSummary`. The bearer token is `{{var.organization.spurvikApiKey}}`. Make's custom-variables page (https://help.make.com/custom-variables) says those variables are only on Pro, Teams, and Enterprise, and that the values are plain text, not for secrets. If that plan is unavailable, use a scenario input named `spurvikApiKey` mapped as `{{var.input.spurvikApiKey}}`. Make's scenario-input page (https://help.make.com/use-scenario-inputs) does not state a plan requirement. This blueprint has not been test-imported in Make. The token is not a field from the webhook payload. It is not a scenario exported from a Make account.
- This guide's workflow file is checked against the 1.0.2 descriptor. Published `1.0.0` and `1.0.1` still cannot be loaded by n8n 2.46.4.
