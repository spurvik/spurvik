# n8n-nodes-spurvik

n8n community node designed to support three separate workflow steps:

1. Add an AI interaction notice to one text field.
2. Record the call as an HMAC-SHA256 digest instead of the raw prompt text. The digest is `spurvik:workflow:input:v1|` plus the input field. This is designed to support Article 12 record-keeping for high-risk AI systems. The notice operation reads outputField (default outputText) and inputField (default promptText). inputField is shown for the notice and the digest. It throws if outputField is missing or is not a string, if outputField equals inputField in any letter case, or if outputField matches promptText, prompt, chatInput, query, or input in any letter case. It does not read the prompt field. Output is { spurvik: result } plus explicitly named fields other than those prompt names. Those prompt names and the configured inputField are never copied (name check only, any letter case). The field value is not returned, including when that name is listed in passThroughFields. The digest is HMAC-SHA256 of the prefix spurvik:workflow:input:v1| plus the input field.
3. Send an `ask_human()` approval request. This is designed to support Article 14 human oversight for high-risk AI systems.

The node does not mark content. Using it does not by itself mean anyone meets the AI Act.

n8n keeps each node's input and output on the execution. The Spurvik node output does not copy prompt text, but the incoming item is still that node's input. Set the instance's execution data retention yourself: `EXECUTIONS_DATA_SAVE_ON_SUCCESS`, `EXECUTIONS_DATA_SAVE_ON_ERROR`, `EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS`, `EXECUTIONS_DATA_PRUNE`, `EXECUTIONS_DATA_MAX_AGE`, and `EXECUTIONS_DATA_PRUNE_MAX_COUNT`. n8n's execution history keeps those inputs and outputs until you change those retention settings.

## Channels

Slack, Telegram, Email (Resend), Discord, Microsoft Teams, Linear, Jira, Monday.com, and Asana.

Monday.com only creates a board item. It does not send Approve or Block links.

Slack, Discord, and Teams use a webhook credential. The other channels use an approver target (chat id, email recipient, team id, project key, board id, or project gid) plus the matching token on the `spurvikApi` credential.

`callbackBaseUrl` is required for an approval request. Pass a URL that accepts GET clicks. By default (when `consoleApiKey` is left empty), the node runs locally without calling the Spurvik HTTP API; setting `consoleApiKey` on the `spurvikApi` credential enables optional sync to `consoleBaseUrl` (`https://console.spurvik.com` by default).

## Credential

`spurvikApi` stores the HMAC signing secret, optional `consoleApiKey`, and channel tokens as password fields. The node reads the secret only from that credential. It throws if the secret is missing, shorter than 16 characters, or padded with whitespace. It does not read `SPURVIK_HMAC_SECRET`.

## Layout

n8n loads:

- `dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js` (`class SpurvikEuAiActGuard`)
- `dist/credentials/SpurvikApi.credentials.js` (`class SpurvikApi`, credential name `spurvikApi`)

The node type id stays `spurvikEuAiActGuard`, the same id as 1.0.1.

`dist/index.js` still exports `executeSpurvikWorkflowStep`, `SpurvikN8nNodeDescription`, and `SpurvikEuAiActGuard`.

## Make.com

`make-com-blueprint.json` in this repository posts `actionName` and `payloadSummary` to the hosted HITL create route. The bearer token in the file is `{{var.organization.spurvikApiKey}}`. Make organization variables and scenario inputs are plain text, not secret storage. [Make's custom-variables page](https://help.make.com/custom-variables) states that organization variables need Make Pro, Teams, or Enterprise, and that the values are stored in plain text and are not for secrets. The [Make API organizations reference](https://developers.make.com/api-documentation/api-reference/organizations) states that creating an organization variable returns 404 when the organization license does not include `customVariables`. This blueprint has not been test-imported in Make. The `{{var.input.spurvikApiKey}}` option needs scenario inputs (Pro+ and on-demand scheduling). A webhook-triggered blueprint is not started with scenario inputs, so that mapping likely won't work there. [Make's scenario-input page](https://help.make.com/use-scenario-inputs) shows the scenario editor inserts `{{var.input.<name>}}` for a scenario input. Enabling inputs requires on-demand scheduling; the [scenario update API](https://developers.make.com/api-documentation/api-reference/scenarios) returns 422 (IM016) otherwise, and an older sentence on that page still says Pro or higher, while [a later Make release note](https://help.make.com/scenario-inputs-now-available-for-all-users) says scenario inputs were opened to all plans. For production, use a Make keychain or connection. Do not map the API key from the webhook payload. Free workspaces sign up at https://console.spurvik.com/signup; paid plans (`Pro €19/mo · Team €79/mo`, excl. VAT · B2B only) upgrade through Stripe Checkout.
