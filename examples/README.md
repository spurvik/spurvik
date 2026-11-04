# Spurvik Runnable Examples (`examples/`)

> Source: https://github.com/spurvik/spurvik (`spurvik@1.0.3`, `spurvik-sdk@1.0.3`, `spurvik-mcp-server@1.0.2`).

| Example | What It Shows |
| --- | --- |
| [`multi-channel-hitl.ts`](./multi-channel-hitl.ts) | 9-channel pre-flight `ask_human()` approval fan-out (**Slack**, **Telegram**, **Email (Resend; use 1.0.5 once released (planned))**, **Discord**, **Microsoft Teams**, **Linear**, **Jira**, **Monday.com**, **Asana**) with constant-time signed callback verification and zero raw prompt bytes persisted (`raw_prompt=0B`). |
| [`slack-telegram-linear-ask-human/`](./slack-telegram-linear-ask-human/README.md) | Slack, Telegram, and Linear. Imports `createMultiChannelApprovalRouter` and `verifyChannelApprovalToken` from `spurvik`. `verifyChannelApprovalToken` checks Spurvik's approval-link token. Continues only when the queue status is `approved`. |
| [`nextjs-vercel-ai-sdk.tsx`](./nextjs-vercel-ai-sdk.tsx) | Next.js App Router + Vercel AI SDK (`spurvik/ai` `spurvikMiddleware`) + `<AIDisclosureLabel />` (`spurvik/react`) for EU AI Act Art. 50(1) transparency and Art. 12 chained HMAC-SHA256 provenance receipts. |
| [`../packages/n8n-nodes-spurvik/make-com-blueprint.json`](../packages/n8n-nodes-spurvik/make-com-blueprint.json) | Importable **Make.com** blueprint and **n8n** workflow guard combining Art. 50 notices, Art. 12 HMAC-SHA256 receipts, and Art. 14 multi-channel `ask_human()` gates. |
