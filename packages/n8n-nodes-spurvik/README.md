# n8n-nodes-spurvik

n8n community node designed to support three separate workflow steps:

1. Add an AI interaction notice to one text field.
2. Record the call as an HMAC-SHA256 digest instead of the raw prompt text. The digest is `spurvik:workflow:input:v1|` plus the input field. This is designed to support Article 12 record-keeping. The notice operation reads outputField (default outputText) and inputField (default promptText). inputField is shown for the notice and the digest. It throws if outputField is missing or is not a string, if outputField equals inputField in any letter case, or if outputField matches promptText, prompt, chatInput, query, or input in any letter case. It does not read the prompt field. Output is { spurvik: result } plus explicitly named fields other than those prompt names. Those prompt names are never copied. The digest is HMAC-SHA256 of the prefix spurvik:workflow:input:v1| plus the input field.
3. Send an `ask_human()` approval request. This is designed to support Article 14 human oversight.

The node does not mark content. Using it does not by itself mean anyone meets the AI Act.

n8n keeps each node's input and output on the execution. The Spurvik node output does not copy prompt text, but the incoming item is still that node's input. Set the instance's execution data retention yourself: `EXECUTIONS_DATA_SAVE_ON_SUCCESS`, `EXECUTIONS_DATA_SAVE_ON_ERROR`, `EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS`, `EXECUTIONS_DATA_PRUNE`, `EXECUTIONS_DATA_MAX_AGE`, and `EXECUTIONS_DATA_PRUNE_MAX_COUNT`. n8n's execution history keeps those inputs and outputs until you change those retention settings.

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

`make-com-blueprint.json` in this repository posts `actionName` and `payloadSummary` to the hosted HITL create route. The bearer token in the file is `{{var.organization.spurvikApiKey}}`. [Make's custom-variables page](https://help.make.com/custom-variables) states that custom variables, including organization variables, are available only on the Pro, Teams, and Enterprise plans, and that variable values are stored in plain text and are not for secrets. The [Make API organizations reference](https://developers.make.com/api-documentation/api-reference/organizations) states that creating an organization variable returns 404 when the organization license does not include `customVariables`. This blueprint has not been test-imported in Make. If the organization is not on one of those plans, define a scenario input named `spurvikApiKey` and map the header from `{{var.input.spurvikApiKey}}`. [Make's scenario-input page](https://help.make.com/use-scenario-inputs) does not state a plan requirement and does not show that mapping token; the scenario editor inserts `{{var.input.<name>}}` for a scenario input. Do not map the API key from the webhook payload. That console is invite-only during early access. The Pro plan price in the blueprint is marked invite-only during early access.
