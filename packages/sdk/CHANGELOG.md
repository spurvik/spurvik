# spurvik-sdk

## 1.0.7 — 2026-11-11

Published as `spurvik@1.0.7` and `spurvik-sdk@1.0.7` (same build). An `overridden` human decision now means do not continue, the same as `rejected`.

### Breaking

- `requireHumanApproval` now throws `SpurvikHitlRejectedError` when the decision is overridden, as it does when rejected. Read `error.record.status` (`"overridden"` or `"rejected"`). Continue only when it returns status `approved`.
- `SpurvikHitlRejectedError.message` says `was overridden` for an overridden decision and `was rejected` for a rejected one.
- For any other status that is not `approved`, `SpurvikHitlRejectedError.message` now reads `Human approval for "<actionName>" was not approved (status "<status>").` For example `was not approved (status "pending")`. In 1.0.6 the message said `was rejected` for every status.

### Fixed

- `spurvik/langgraph`: `spurvikInterrupt` and `resolveLangGraphInterrupts` set `approved: true` only for status `approved`. In 1.0.6 an overridden decision returned `approved: true`. An overridden decision now returns `approved: false` with status `overridden` (or throws with `throwOnReject`). A resume value that says `approved: true` with any status other than `approved` is settled to `approved: false`.
- `spurvik/openai-agents`: `resolveAgentInterruptions` calls `state.approve` only for status `approved`. In 1.0.6 an overridden decision called `state.approve`. It now calls `state.reject(item, { message: "The decision was overridden." })`. A rejected decision still calls `state.reject(item)`.
- Tests: new `client.test.ts`, `langgraph.test.ts`, and `openai-agents.test.ts` cover approved, rejected, and overridden.

## 1.0.5 — 2026-11-04

Fixes to the `spurvik/channels` functions shipped in 1.0.4. Published as `spurvik@1.0.5` and `spurvik-sdk@1.0.5` (same build). No exports were removed.

- Each channel throws `SpurvikConfigError` when a required credential or target (for example `webhookUrl`, `botToken`, `resendApiKey`, `apiKey`) is missing or blank. In 1.0.4 the request went out with `undefined` in the URL or header.
- The email HTML escapes the action title, summary, gate ID and links. In 1.0.4 the summary was inserted as raw HTML.
- Linear and Monday.com GraphQL replies that carry an `errors` array throw, even with HTTP 200. In 1.0.4 they were reported as sent.
- `verifyChannelApprovalToken` returns `false` when the signature is not a string (for example a missing `sig` query parameter). In 1.0.4 it threw a `TypeError`.
- `verifyChannelApprovalToken` rejects tokens issued more than 5 minutes in the future. The default validity stays 24 hours (86400 seconds). `maxAgeSeconds: 900` is a 15-minute window. `maxAgeSeconds: 0` throws `SpurvikConfigError` ("must be greater than 0"; omit the option to keep the 86400 second default). A non-finite, NaN, or negative `maxAgeSeconds` (for example `-1`) still uses the 24-hour default. Values above 7 days are capped at 7 days.
- Monday.com: the dispatch reads the created item id. The item carries the gate ID in its name. It does not carry the Approve / Block links.
- `callbackBaseUrl` is required. The SDK does not default to the console HITL create route, which accepts POST, not GET link clicks.
- New links include a nonce. A 1.0.4 token has no nonce and still verifies when the nonce is omitted. A link can be reused until it expires. The receiver must record the nonce and refuse a repeat.
- The channel approval secret is rejected when it is missing, shorter than 16 characters, or has leading or trailing whitespace. The error text does not cite the AI Act. HMAC domain prefixes are unchanged.
- From 1.0.5, `verifySignedChannelCallback` returns `{ ok: true, decision, gateId, actionHmac, issuedAtUnix, nonce }` when Spurvik's own approval-link token matches, and `false` otherwise. A missing signature returns `false` and does not throw. It does not verify a platform webhook signature.
- Linear `issueCreate.success: false` and a Monday.com `error_code` are not treated as sent.
- `src/mastra.types.ts` is excluded from `tsc --noEmit`. `@mastra/core` 1.79.0 uses a nested `@ai-sdk/provider` type identity, so the assignability checks in that file do not typecheck. The file is not part of the published build.
- `buildChannelOutboundRequest().body` is a JSON string.

## n8n-nodes-spurvik 1.0.2

See `packages/n8n-nodes-spurvik/CHANGELOG.md`. The node file is `dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js`.

## n8n-nodes-spurvik 1.0.1

Published from main. n8n could not construct the class because `n8n.nodes` pointed at `dist/index.js`.

## 1.0.4 — 2026-11-04

Published to npm as `spurvik-sdk@1.0.4`. New `spurvik/channels` entry, also re-exported from `spurvik`: `createSignedApprovalLinks`, `verifyChannelApprovalToken`, `buildChannelOutboundRequest`, `dispatchHumanApprovalChannel` and `createMultiChannelApprovalRouter`. These functions use `node:crypto`.

## 0.1.1 — 2026-10-24

This note is 0.1.1. The package version stays 1.0.1. That is intended.

`releaseKillSwitch` takes an optional reason: `{ reason?: string; actionName?: string }`. A call with no argument still works. When the reason is missing or blank, the client sends `Released via SDK (no reason given)` before the request. The control plane does not fill that in. Pass a reason when you have one.

`engageKillSwitch` sends `Halted via SDK (no reason given)` when its reason is missing or blank. The control plane refuses a halt that arrives with no reason. A reason you type is still sent as you typed it, aside from surrounding whitespace.

Both calls also send `reasonSource`. It is `caller` when you passed a reason, and `sdk_default` when the client substituted the sentence above. The value is client-asserted. The server does not verify it. The control plane stores it on the halt or release row. Console writes store NULL. A raw API call that omits the field stores NULL.

`withSpurvikMastra` now returns `model` as a function. Pass that function as Mastra `Agent`'s `model`. It is not the language model object. Mastra calls the function while it resolves the model. A halt throws `SpurvikHaltedError` from `agent.stream` and `agent.generate`.

`@openai/agents` is an optional peer. Install it for the Agents SDK. The adapter does not check for it.

The OpenAI Agents input fingerprint includes `reasoning_text` and a reasoning item's `rawContent`. It skips tool items (`function_call`, `function_call_result`, `hosted_tool_call`, and `tool_search_call`). A fingerprint can differ from 1.0.1 for the same input.

A halt response sets `previousReason` to null. A release response sets `reason` to the release reason and `previousReason` to the halt reason that was in effect. The `oversight.changed` webhook posts that response. A later read keeps the halt reason on the control row and sets `previousReason` to null.

A release response `reason` is the reason just recorded. The halt reason that was in effect is `previousReason`. The stored halt reason on the project stays where it was.
