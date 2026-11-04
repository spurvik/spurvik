# n8n-nodes-spurvik

n8n community node designed to support three separate workflow steps:

1. Add an AI interaction notice to one text field.
2. Record the call as an HMAC-SHA256 digest instead of the raw prompt text. This is designed to support Article 12 record-keeping.
3. Send an `ask_human()` approval request. This is designed to support Article 14 human oversight.

The node does not mark content. Using it does not by itself mean anyone meets the AI Act.

## Channels

Slack, Telegram, Email (Resend), Discord, Microsoft Teams, Linear, Jira, Monday.com, and Asana.

Monday.com only creates a board item. It does not send Approve or Block links.

Slack, Discord, and Teams use a webhook credential. The other channels use an approver target (chat id, email recipient, team id, project key, board id, or project gid) plus the matching token on the `spurvikApi` credential.

`callbackBaseUrl` is required for an approval request. Pass a URL that accepts GET clicks. The node does not call the Spurvik HTTP API and has no API key or base URL field.

## Credential

`spurvikApi` stores the HMAC signing secret and channel tokens as password fields. The node reads the secret only from that credential. It throws if the secret is missing, shorter than 16 characters, or padded with whitespace. It does not read `SPURVIK_HMAC_SECRET`.

Hosted console features are invite-only during early access.

## Layout

n8n loads:

- `dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js` (`class SpurvikEuAiActGuard`)
- `dist/credentials/SpurvikApi.credentials.js` (`class SpurvikApi`, credential name `spurvikApi`)

The node type id stays `spurvikEuAiActGuard`, the same id as 1.0.1.

`dist/index.js` still exports `executeSpurvikWorkflowStep`, `SpurvikN8nNodeDescription`, and `SpurvikEuAiActGuard`.

## Make.com

`make-com-blueprint.json` in this repository posts `actionName` and `payloadSummary` to the hosted HITL create route. That console is invite-only during early access. The Pro plan price in the blueprint is marked invite-only during early access.
