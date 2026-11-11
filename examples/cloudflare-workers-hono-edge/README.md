# Cloudflare Workers, Hono & Supabase Edge Functions (`spurvik@1.0.7`)

Reference Web-Standard `fetch(request, ctx)` handler supporting parts of your EU AI Act Art. 50, Art. 12, and Art. 14 engineering work in serverless Edge isolates (Cloudflare Workers, Hono, Vercel Edge, and Supabase Edge Functions).

## Install

```bash
npm i spurvik@1.0.7
```

## What This Template Covers

1. **Durable Edge Telemetry (`KvTelemetryBuffer` + `ctx.waitUntil`)**: Buffers keyed HMAC-SHA256 provenance records in Workers KV / Upstash Redis so isolate eviction does not drop receipts, while storing zero raw prompt bytes (`contentHash: { mode: "keyed" }`).
2. **Art. 50(1) AI Notice & Upstream Provider Watermark Pass-Through**: Attaches an `x-spurvik-disclosure` header and JSON disclosure payload (`<AIDisclosureLabel />` in `spurvik/react` for browser UIs) while preserving upstream provider watermark headers (such as `x-watermark: true`) rather than stripping them at your proxy layer.
3. **Stateless Art. 14 Signed Callback Verification (`GET /api/spurvik/callback`)**: Verifies 1-click Slack, Telegram, Email, Teams, Linear, or Jira approval links via `verifyChannelApprovalToken` and rejects replayed nonces with `409`.

## Run Smoke Test

```bash
node --test examples/cloudflare-workers-hono-edge/smoke.test.mjs
```

## Hosted EU Console (`fra1`)

- Interactive zero-cookie browser sandbox: https://console.spurvik.com/sandbox
- Hosted EU (`fra1`) vault, human-oversight review queue & engineering summary (`Pro €19/mo` excl. VAT · B2B): https://console.spurvik.com/?upgrade=pro

*Spurvik provides runtime engineering primitives and cryptographic receipts — it is not legal advice, a conformity assessment, or Art. 50(2) media watermarking.*
