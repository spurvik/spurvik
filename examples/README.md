# Spurvik Runnable Examples (`examples/`)

> Source: https://github.com/spurvik/spurvik (`spurvik@1.0.3`, `spurvik-sdk@1.0.3`, `spurvik-mcp-server@1.0.2`).

| Example | What It Shows |
| --- | --- |
| [`multi-channel-hitl.ts`](./multi-channel-hitl.ts) | 9-channel pre-flight `ask_human()` approval fan-out (**Slack**, **Telegram**, **Email (Resend)**, **Discord**, **Microsoft Teams**, **Linear**, **Jira**, **Monday.com**, **Asana**) with constant-time signed callback verification. |
| [`nextjs-vercel-ai-sdk/`](./nextjs-vercel-ai-sdk/) | Next.js App Router chat with `<AIDisclosureLabel />` as an Art. 50(1) visible interaction notice and `spurvikMiddleware` recording a keyed HMAC-SHA256 fingerprint of the input. |
| [`../packages/n8n-nodes-spurvik/make-com-blueprint.json`](../packages/n8n-nodes-spurvik/make-com-blueprint.json) | Importable **Make.com** blueprint and **n8n** workflow guard combining Art. 50 notices, Art. 12 HMAC-SHA256 receipts, and Art. 14 multi-channel `ask_human()` gates. |
