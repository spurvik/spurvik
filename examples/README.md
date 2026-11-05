# Spurvik Runnable Examples (`examples/`)

> Source: https://github.com/spurvik/spurvik (`spurvik@1.0.6`, `spurvik-sdk@1.0.6`, `spurvik-mcp-server@1.0.2`, `n8n-nodes-spurvik@1.0.2`).

| Example | What It Shows |
| --- | --- |
| [`multi-channel-hitl.ts`](./multi-channel-hitl.ts) | Pre-flight `ask_human()` fan-out with `createMultiChannelApprovalRouter` for Slack, Telegram, email (Resend), Discord, Microsoft Teams, Linear, Jira, Monday.com, and Asana (`spurvik@1.0.6`). Sets `callbackBaseUrl` (`https://your-app.example/api/spurvik/callback`) and checks the signed link token (including `nonce`) with `verifyChannelApprovalToken` / `verifySignedChannelCallback`. |
| [`slack-telegram-linear-ask-human/`](./slack-telegram-linear-ask-human/README.md) | Runnable Slack, Telegram, and Linear approval flow (`npm test` runs `smoke.ts` against a local callback server). Imports `createMultiChannelApprovalRouter` and `verifyChannelApprovalToken` from `spurvik@1.0.6`. |
| [`nextjs-vercel-ai-sdk/`](./nextjs-vercel-ai-sdk/) | Next.js App Router chat with `<AIDisclosureLabel />` (`spurvik/react`) as an Art. 50(1) visible interaction notice and `spurvikMiddleware` (`spurvik/ai`) recording a keyed HMAC-SHA256 fingerprint of the input. |
| [`langgraph-mastra-openai-agents/`](./langgraph-mastra-openai-agents/) | Runnable adapters and smoke test (`smoke.test.mjs`) for **LangGraph (`spurvik/langgraph`)**, **OpenAI Agents SDK (`spurvik/openai-agents`)**, and **Mastra (`spurvik/mastra`)** with `provenanceOf` and `verifyProvenanceSignature` (`0B` raw prompt persisted). |
| [`n8n-make-import/`](./n8n-make-import/) | Importable **n8n** workflow JSON (`spurvik-eu-ai-act-n8n-workflow.json`) for `n8n-nodes-spurvik@1.0.2` (native loadable n8n Community Node with `SpurvikEuAiActGuard.node.js` and `SpurvikApi.credentials.js`, verified in `n8n 2.46.4`) plus **Make.com** HTTP module settings. |
| [`github-actions-ci-check/`](./github-actions-ci-check/) | Drop-in GitHub Actions workflow (`spurvik-ai-act-check.workflow.yml`) and CLI wrapper (`run-mcp-scan.mjs`) that runs `spurvik_find_unwrapped_calls` (`spurvik-mcp-server@1.0.2`) on every PR and emits inline `::error` GitHub PR annotations for unwrapped AI SDK calls. |
| [`../packages/n8n-nodes-spurvik/make-com-blueprint.json`](../packages/n8n-nodes-spurvik/make-com-blueprint.json) | Make.com blueprint published with `n8n-nodes-spurvik@1.0.2`, designed to support Article 12 record-keeping and Article 14 human oversight. |
