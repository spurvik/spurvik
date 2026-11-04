## n8n-nodes-spurvik 1.0.2

The published 1.0.1 class lived in `dist/index.js`, so n8n looked for an export named `index` and failed to load the package. 1.0.2 ships `dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js` and `dist/credentials/SpurvikApi.credentials.js`.

- The node type id stays `spurvikEuAiActGuard`.
- `execute()` calls `executeSpurvikWorkflowStep`. The notice, digest, and approval operations are separate.
- The HMAC secret is read only from the `spurvikApi` credential. A missing secret throws.
- Output is `{ spurvik: result }` plus any explicitly named non-prompt fields. Incoming `promptText` is not copied.
- Nine channels are listed. Monday.com creates an item only.

## n8n-nodes-spurvik 1.0.1

Published from main. n8n 2.46.4 did not register it (`require(...).index is not a constructor`). `execute()` also called `executeSpurvikN8nGuard`, which was not defined.
