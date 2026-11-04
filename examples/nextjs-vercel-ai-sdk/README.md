# Next.js + Vercel AI SDK

A small App Router chat app. The model is wrapped with `spurvikMiddleware` from `spurvik/ai`. Assistant replies sit next to `<AIDisclosureLabel />` from `spurvik/react`.

The label is a visible Article 50(1) interaction notice. It is not Article 50(2) machine-readable marking. The middleware records the call and attaches an HMAC receipt on provider metadata. It does not mark the reply.

Docs: https://spurvik.com/docs

## Prerequisites

Node.js 20 or newer. Spurvik `1.0.3` sets that floor. This folder pins `ai@7.0.162` and `@ai-sdk/openai@4.0.108`, and those packages set `engines.node` to `>=22`, so install and run the example on Node.js 22 or newer.

You need an OpenAI API key only if you want the model to answer.

## Install

From this folder:

```bash
npm ci
```

## Environment

Copy `.env.example` to `.env.local`.

`OPENAI_API_KEY` is sent to OpenAI. Replace `your-key-here` before you send a message. The chat route uses `gpt-4o-mini`.

Spurvik runs without a live project key. Leave the `SPURVIK_*` values as the placeholders in `.env.example` (or omit them). The app then passes format-only local values and omits `baseUrl`, so the SDK uses its development base URL `http://127.0.0.1:43123`. Telemetry is not delivered when that address is down. With `riskTier` set to `limited_art50`, the model call still runs.

To send records to a control plane, replace the placeholders:

- `SPURVIK_API_KEY` — project key (`spurvik_live_…`)
- `SPURVIK_SIGNING_SECRET` — HMAC secret kept on this server, at least 16 characters. `SPURVIK_HMAC_SECRET` is read when `SPURVIK_SIGNING_SECRET` is unset.
- `SPURVIK_CONTENT_HASH_SECRET` — client-held secret for keyed fingerprints, at least 16 characters. It is not sent.
- `SPURVIK_BASE_URL` — control plane origin. Required when `NODE_ENV` is production. For the hosted console, use `https://console.spurvik.com`.

A Free or developer plan key may return HTTP 402 on paid-only features.

## Run

```bash
npm run dev
```

Open http://localhost:3000

`npm run build` compiles the app. `npm start` serves that build. A production process needs the four `SPURVIK_*` values above, because the SDK requires `baseUrl` when `NODE_ENV` is production.

## Where the label appears

`app/assistant-chat-header.tsx` renders `<AIDisclosureLabel notice="interaction" presentation="inline" locale="en" euIcon />`. The page shows that component in the header, before any message, and again beside each assistant reply. The sentence stays on screen without a click.

`app/api/chat/route.ts` passes `spurvikMiddleware` to `wrapLanguageModel`, then calls `streamText`. After the response, the route calls `flush()` on that middleware.
