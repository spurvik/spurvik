# Slack, Telegram, and Linear ask_human() router

Spurvik is designed to support Article 12 record-keeping and Article 14 human oversight; this is not legal advice.

This folder imports `createMultiChannelApprovalRouter` and `verifyChannelApprovalToken` from `spurvik` and fans one request out to Slack, Telegram, and Linear. `verifyChannelApprovalToken` checks Spurvik's own signed approval-link token. It does not check a Slack, Telegram, or Linear request signature. The action continues only when the queue status is `approved`.

## Exports this example uses

`packages/sdk/src/channels.ts` exports these functions, and `packages/sdk/src/index.ts` re-exports them on `spurvik`:

| Export | Role |
| --- | --- |
| `createMultiChannelApprovalRouter({ signingSecret, channels, fetchImpl? })` | Sends one request to every configured channel. `requestApproval` returns `{ links, receipts }`. |
| `createSignedApprovalLinks(request, signingSecret, issuedAtUnix?)` | Builds the HMAC digest and the approve and reject URLs. The router calls this. |
| `verifyChannelApprovalToken({ gateId, actionHmac, decision, issuedAtUnix, signature, signingSecret, maxAgeSeconds?, nowUnixSeconds? })` | Checks the HMAC signature on Spurvik's approval-link token. Returns `true` or `false`. |
| `verifySignedChannelCallback(params)` | Checks the HMAC signature on Spurvik's approval-link token and returns `{ ok: true, decision, gateId, actionHmac, issuedAtUnix, nonce }` or `false`. |
| `buildChannelOutboundRequest` | Builds the HTTP request for one channel. |
| `dispatchHumanApprovalChannel` | Posts that request. |

`verifySignedChannelCallback` is exported from `spurvik` and `spurvik/channels` starting in `1.0.5`. The router method `verifyCallback` calls `verifyChannelApprovalToken` with the router signing secret.

Channel objects use `type` (`"slack"`, `"telegram"`, `"linear"`). The approval request uses `gateId`, `actionName`, `summary`, optional `context`, and required `callbackBaseUrl`. `callbackBaseUrl` is a field on the request, not on the router. Decision strings are `approved` and `rejected`.

From `1.0.5`, the email channel escapes HTML in the request summary and context fields, and approval links include a `nonce` query parameter.

`npm test` typechecks and runs against the installed `spurvik` package. Channel helpers ship in `spurvik@1.0.6` (`spurvik` and `spurvik/channels`). This folder depends on `spurvik` `^1.0.6`.

The channel `gateId` and the queue row id from `requireHumanApproval` are different values. Nothing in the SDK writes the callback decision onto that row.

The Linear call creates an issue. It does not receive a Linear webhook. There is no exported handler for a Linear webhook payload.

## Install

Node.js 20 or newer. From this folder:

```bash
npm install
```

`package.json` depends on `spurvik` `^1.0.6`.

## Environment

```bash
cp .env.example .env
```

Replace every value. `.env.example` has placeholders only. The smoke test does not read `.env`.

| Variable | Purpose |
| --- | --- |
| `SPURVIK_SIGNING_SECRET` | Passed as `signingSecret`. At least 16 characters. Stays in this process. |
| `SPURVIK_API_KEY` | Project key for `SpurvikClient`. The SDK accepts `spurvik_live_` plus at least 32 URL-safe characters. |
| `SPURVIK_BASE_URL` | Control plane origin for the queue and halt read. |
| `CALLBACK_BASE_URL` | Origin and path written into the approve and reject links. |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook. |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token. |
| `TELEGRAM_CHAT_ID` | Chat that receives the message. |
| `LINEAR_API_KEY` | Linear API key. Sent as the `authorization` header. |
| `LINEAR_TEAM_ID` | Linear team id on the created issue. |

Optional: `TELEGRAM_API_BASE_URL` and `LINEAR_API_URL`. When omitted, the SDK uses its own defaults for those two hosts. `ASK_HUMAN_GATE_ID`, `ASK_HUMAN_ACTION`, and `ASK_HUMAN_SUMMARY` override the sample request used by `npm start`.

## Slack app

1. Create a Slack app.
2. Turn on Incoming Webhooks.
3. Add a webhook to the channel that should receive the request.
4. Copy that webhook into `SLACK_WEBHOOK_URL`.

The router posts JSON with `text` and `blocks`. The buttons are URL buttons. Slack does not call this process back. The reviewer opens the approval link on `CALLBACK_BASE_URL`. This example does not check Slack's request signature.

## Telegram bot

1. Create a Telegram bot and copy its token into `TELEGRAM_BOT_TOKEN`.
2. Send a message to the bot, or add the bot to the chat that should approve actions.
3. Read that chat id into `TELEGRAM_CHAT_ID`.

The router posts `sendMessage` with an inline keyboard of URL buttons. This example does not check a Telegram request signature.

## Linear

1. Create a Linear API key and copy it into `LINEAR_API_KEY`.
2. Copy the team id into `LINEAR_TEAM_ID`.

The router posts a GraphQL `issueCreate` mutation. The issue description contains the approve link and the reject link. This example does not receive a Linear webhook and does not check a Linear request signature. Point `CALLBACK_BASE_URL` at an HTTP handler you run, and pass that request URL to `readSignedCallback` and `checkSignedCallback`.

## Run

Smoke test, with stubbed Slack, Telegram, Linear, and control-plane responses. It does not open a socket:

```bash
npm test
```

That runs `tsc --strict --noEmit` and `smoke.ts`.

To send one real request, fill `.env` and run:

```bash
npm start
```

`npm start` fans out to the three channels, checks the approve link it just built, then calls `requireHumanApproval`. It prints `{ continue, status, callbackMatch, gateId }`. Exit code 2 means the action did not continue. This process does not listen for HTTP. A click on the link does not, by itself, set the queue status.

## Platform request signatures

The SDK has no Slack, Telegram, or Linear platform request-signature verifiers. This example does not handle incoming platform callbacks, and it does not check those signatures.

`verifyChannelApprovalToken` checks only Spurvik's approval-link token.

If you handle incoming platform callbacks, checking the platform signature is the integrator's job:

- Slack: [request signatures](https://docs.slack.dev/authentication/verifying-requests-from-slack/)
- Telegram: [setWebhook `secret_token`](https://core.telegram.org/bots/api#setwebhook)
- Linear: [webhook signatures](https://linear.app/developers/webhooks)

Spurvik still checks only its approval-link token.

## How the HMAC signature check works

`createSignedApprovalLinks` builds:

- `actionHmac` from the signing secret, `gateId`, `actionName`, and the sorted `context` pairs
- an approve token and a reject token that also include the decision and `issuedAtUnix`
- links of the form `{callbackBaseUrl}?gateId=...&ts=...&hmac=...&decision=approved|rejected&sig=...`

`checkSignedCallback` reads that query and calls `verifyChannelApprovalToken`. The function rebuilds the token and compares it with `timingSafeEqual`. It returns `true` only when the gate id, HMAC, decision, timestamp, and signature all match the signing secret, and when `issuedAtUnix` is within `maxAgeSeconds` of now. The default max age is 86400 seconds. A mismatched decision, a changed signature, or an old timestamp returns `false`. The return value is a boolean. There is no reason string.

```ts
import { checkSignedCallback, readSignedCallback } from "./ask-human.ts";

const query = readSignedCallback(requestUrl);
const match = query
  ? checkSignedCallback(process.env.SPURVIK_SIGNING_SECRET ?? "", query)
  : false;
```

A match means the query still matches a token made with that secret. It does not update the queue.

## Approve, reject, overridden, and timeout

After a matching callback whose decision is `approved`, `runRoutedAskHuman` calls `SpurvikClient.requireHumanApproval`.

| Outcome | What the SDK does | What this example does |
| --- | --- | --- |
| `approved` | Returns the row. | `continue` is true. The action may proceed. |
| `rejected` | Throws `SpurvikHitlRejectedError`. A matching reject link returns before the queue call. | `continue` is false. |
| `overridden` | From spurvik 1.0.7, throws `SpurvikHitlRejectedError` with `record.status` `overridden`, and `resolveAgentInterruptions` / `spurvikInterrupt` treat it as do not continue. Up to 1.0.6 it returned the row without throwing, and those two helpers treated it as approved. | `continue` is false. This example checks that `status` is `approved` before continuing. |
| timeout | The row stays `pending` or `pending_confirmation` until `hitl.timeoutMs`, then the SDK throws `SpurvikHitlTimeoutError`. | `continue` is false. |

`npm start` uses the SDK default wait of 120000 milliseconds. The smoke test uses a short wait against the stub.

A callback timestamp outside `maxAgeSeconds` is a failed signature check (`callback_mismatch`), not the queue timeout.
