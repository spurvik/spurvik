# Spurvik Runnable Examples (`examples/`)

> Source: https://github.com/spurvik/spurvik (`spurvik@1.0.3`, `spurvik-sdk@1.0.3`, `spurvik-mcp-server@1.0.2`).

| Example | What It Shows |
| --- | --- |
| [`multi-channel-hitl.ts`](./multi-channel-hitl.ts) | `createMultiChannelApprovalRouter` sends a pre-flight approval request. Approve / Block links that carry Spurvik's own approval-link token go to **Slack**, **Telegram**, **Discord**, **Microsoft Teams**, **Linear**, **Jira**, and **Asana**. **Email (Resend)**: use 1.0.5 once released (planned). **Monday.com** creates an item for the request. `verifyChannelApprovalToken` checks only that Spurvik token. Checking each platform's request signature is the integrator's job. |
| [`nextjs-vercel-ai-sdk.tsx`](./nextjs-vercel-ai-sdk.tsx) | Next.js App Router + Vercel AI SDK (`spurvik/ai` `spurvikMiddleware`) + `<AIDisclosureLabel />` (`spurvik/react`) for EU AI Act Art. 50(1) transparency and Art. 12 chained HMAC-SHA256 provenance receipts. |
| [`../packages/n8n-nodes-spurvik/make-com-blueprint.json`](../packages/n8n-nodes-spurvik/make-com-blueprint.json) | Importable **Make.com** blueprint and **n8n** workflow guard combining Art. 50 notices, Art. 12 HMAC-SHA256 receipts, and Art. 14 multi-channel `ask_human()` gates. |
