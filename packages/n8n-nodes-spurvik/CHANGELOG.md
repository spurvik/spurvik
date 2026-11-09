## n8n-nodes-spurvik 1.0.3

- Fixed: a passThroughFields entry equal to inputField no longer copies the input value to the output (affected 1.0.0–1.0.2).

## n8n-nodes-spurvik 1.0.2

The published 1.0.1 class lived in `dist/index.js`, so n8n looked for an export named `index` and failed to load the package. 1.0.2 ships `dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js` and `dist/credentials/SpurvikApi.credentials.js`.

- The node type id stays `spurvikEuAiActGuard`.
- `execute()` calls `executeSpurvikWorkflowStep`. The notice, digest, and approval operations are separate.
- The HMAC secret is read only from the `spurvikApi` credential. A missing secret throws.
- The notice operation reads outputField (default outputText) and inputField (default promptText). inputField is shown for the notice and the digest. It throws if outputField is missing or is not a string, if outputField equals inputField in any letter case, or if outputField matches promptText, prompt, chatInput, query, or input in any letter case. It does not read the prompt field. Output is { spurvik: result } plus explicitly named fields other than those prompt names. Those prompt names are never copied. The digest is HMAC-SHA256 of the prefix spurvik:workflow:input:v1| plus the input field.
- Nine channels are listed. Monday.com creates an item only.

## n8n-nodes-spurvik 1.0.1

Published from main. n8n 2.46.4 did not register it (`require(...).index is not a constructor`). `execute()` also called `executeSpurvikN8nGuard`, which was not defined.
