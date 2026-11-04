# Next.js + Vercel AI SDK

A small App Router chat app. The model is wrapped with `spurvikMiddleware` from `spurvik/ai`. Assistant replies sit next to `<AIDisclosureLabel />` from `spurvik/react`.

The label is a visible Article 50(1) interaction notice. It is not Article 50(2) machine-readable marking. This example sets content-hash mode to `keyed`. In that mode, `spurvikMiddleware` records a keyed HMAC-SHA256 fingerprint of the input on the HMAC receipt attached to provider metadata. It does not mark the reply.

Docs: https://spurvik.com/docs

## Prerequisites

Node.js 22 or newer. This folder pins `ai@7.0.162` and `@ai-sdk/openai@4.0.108`, and those packages need Node.js 22 or newer. `package.json` sets `engines.node` to `>=22` to match. Spurvik `1.0.6` itself allows Node.js 20 or newer.

You need an OpenAI API key only if you want the model to answer.

## Install

From this folder:

```bash
npm ci
```

## Environment

Copy `.env.example` to `.env.local`.

`OPENAI_API_KEY` is sent to OpenAI. Replace `your-key-here` before you send a message. The chat route uses `gpt-4o-mini`.

The chat route returns HTTP 400 if `SPURVIK_API_KEY`, `SPURVIK_SIGNING_SECRET`, or `SPURVIK_CONTENT_HASH_SECRET` is missing or still set to a sample placeholder. The response is plain text and names the variables to set. The same happens for `SPURVIK_BASE_URL` when `NODE_ENV` is production. Those sample values are not sent to the SDK.

Replace the placeholders before you send a message:

- `SPURVIK_API_KEY` — project key
- `SPURVIK_SIGNING_SECRET` — HMAC secret kept on this server, at least 16 characters. `SPURVIK_HMAC_SECRET` is read when `SPURVIK_SIGNING_SECRET` is unset.
- `SPURVIK_CONTENT_HASH_SECRET` — client-held secret for keyed fingerprints, at least 16 characters. It is not sent.
- `SPURVIK_BASE_URL` — control plane origin. Required when `NODE_ENV` is production. In development the SDK uses `http://127.0.0.1:43123` when this is omitted. For the hosted console, use `https://console.spurvik.com`.

A Free or developer plan key may return HTTP 402 on paid-only features. In development, `spurvikConfig()` can fill format-only stand-ins that pass the SDK's shape checks when the variables are absent. The chat route does not use that fill. It returns 400 instead, so a missing setting does not become an error page.

## Run

```bash
npm run dev
```

Open http://localhost:3000

`npm run build` compiles the app. `npm start` serves that build. A production process needs the four `SPURVIK_*` values above, because the SDK requires `baseUrl` when `NODE_ENV` is production.

## Where the label appears

`app/assistant-chat-header.tsx` renders `<AIDisclosureLabel notice="interaction" presentation="inline" locale="en" euIcon />`. The page shows that component in the header, before any message, and again beside each assistant reply. The sentence stays on screen without a click.

`app/api/chat/route.ts` passes `spurvikMiddleware` to `wrapLanguageModel`, then calls `streamText`. After the response, the route calls `flush()` on that middleware.
