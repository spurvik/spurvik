# Quickstart: wrap your first AI call with `withSpurvik`

> **Not legal advice.** This guide describes what the software in this repository does. It does not assess your system. Ask your own legal counsel how the EU AI Act and other laws apply to you.
>
> **Licence.** `packages/sdk` (published as `spurvik` and `spurvik-sdk`), `@spurvik/core`, `@spurvik/react`, and `@spurvik/mcp` are licensed under the MIT License and are provided without warranty. `packages/c2pa` (`@spurvik/c2pa`) is in this repository with `"private": true` and `"license": "MIT"`, and it is not published on npm. The hosted console at https://console.spurvik.com is a hosted service. Its source is not in this repository and the MIT licence does not cover it.
>
> *Source: https://github.com/spurvik/spurvik. npm: `spurvik@1.0.8`, `spurvik-sdk@1.0.8`, `spurvik-mcp-server@1.0.4`.*

This guide takes you from nothing to a signed provenance record for one OpenAI call, and shows you how to check that record later.

`withSpurvik()` wraps an OpenAI, Anthropic, or Gemini-shaped client. Your code calls the model the same way as before. Each wrapped call can carry a provenance record: a timestamp, the model id, keyed HMAC fingerprints of the prompt and output (not the text itself), your AI-notice setting (`article50Disclosure`), and an HMAC-SHA-256 signature made with a secret that stays on your side. The SDK sends a telemetry event with those fingerprints to `baseUrl`. Prompt and output text are not sent.

Using Spurvik does not, on its own, mean your system meets the Act. `riskTier` is your own classification (as provider or deployer); Spurvik does not classify your use case.

## Before you start

| You need | Notes |
| --- | --- |
| Node.js 20 or later | `spurvik@1.0.8` sets `"engines": { "node": ">=20" }`. |
| An OpenAI API key | Or use the mock server in [Optional: try it without an OpenAI key](#optional-try-it-without-an-openai-key). |
| A project key | For an invited organisation, create it in the hosted console at https://console.spurvik.com. |

## Step 1: Install the published packages

```bash
npm install openai spurvik@1.0.8
```

`spurvik` and `spurvik-sdk` publish the same SDK. Import it as `spurvik`. Subpaths are `spurvik/ai`, `spurvik/mastra`, `spurvik/langgraph`, `spurvik/openai-agents`, and `spurvik/react`.

> Builds previously served at spurvik.com/sdk/latest.tgz are not this SDK, are unsupported and must not be relied on to check records.

## Step 2: Where `baseUrl` points

`baseUrl` is where SDK telemetry and the halt stream go. For an invited organisation, that address is `https://console.spurvik.com`. In production the SDK throws if `baseUrl` is omitted. Development and tests still default to `http://127.0.0.1:43123`.

The project API key has the form `spurvik_live_` plus at least 32 base64url characters. It is sent as a Bearer token. `SPURVIK_SIGNING_SECRET` and `SPURVIK_CONTENT_HASH_SECRET` stay in the caller and are never sent. The SDK reads none of these variables by itself; your code passes them in.

## Step 3: Create your app

```bash
mkdir my-ai-app
cd my-ai-app
npm init -y
npm pkg set type=module
npm install openai spurvik@1.0.8
```

`npm pkg set type=module` matters. The examples use `import` and top-level `await`. Run a `.ts` snippet with `npx tsx file.ts` from this folder.

The local stdio MCP server, from the app folder:

```bash
npm i -D spurvik-mcp-server@1.0.4
./node_modules/.bin/spurvik-mcp-server --root .
```

`--root` is required since 1.0.3.

## Step 4: Set your environment variables

```bash
export SPURVIK_API_KEY="spurvik_live_PASTE_THE_KEY"
export SPURVIK_SIGNING_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
export SPURVIK_CONTENT_HASH_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
export SPURVIK_BASE_URL="https://console.spurvik.com"
export OPENAI_API_KEY="sk-your-openai-key"
```

For an invited organisation, `SPURVIK_BASE_URL` is `https://console.spurvik.com`.

| Variable | What it is | Sent to `baseUrl`? |
| --- | --- | --- |
| `SPURVIK_API_KEY` | Project key from the hosted console. | Yes, as `Authorization: Bearer …`. |
| `SPURVIK_SIGNING_SECRET` | Your HMAC key for provenance records. | No. It stays in your process. |
| `SPURVIK_CONTENT_HASH_SECRET` | Your HMAC key for prompt and output fingerprints. | No. |
| `SPURVIK_BASE_URL` | Where telemetry and the halt stream go. | — |

## Step 5: Wrap a call and save the provenance record

```ts
import { writeFile } from "node:fs/promises";
import OpenAI from "openai";
import { provenanceOf, withSpurvik } from "spurvik";

const ai = withSpurvik(new OpenAI(), {
  apiKey: process.env.SPURVIK_API_KEY!,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
  baseUrl: process.env.SPURVIK_BASE_URL!,
  riskTier: "limited_art50",
  article50Disclosure: false,
  onTelemetryError: (error) => console.error("Spurvik telemetry not delivered:", error),
});

const completion = await ai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});
console.log("Model said:", completion.choices[0]?.message?.content);

const record = await provenanceOf(completion);
await writeFile("record.json", JSON.stringify(record, null, 2));
console.log("Saved provenance record", record!.eventId);

await ai._spurvik.shutdown();
```

`provenanceOf(res)` returns the signed provenance record attached to a non-streaming response. For a stream it returns a promise of the record: read the stream, then `await provenanceOf(stream)`. A record means the signature can be checked. It is not a conformity assessment.

## Step 6: Check a record's signature

```ts
import { readFile } from "node:fs/promises";
import { verifyProvenanceSignature, type ProvenanceRecord } from "spurvik";

const record = JSON.parse(await readFile("record.json", "utf8")) as ProvenanceRecord;
const secret = process.env.SPURVIK_SIGNING_SECRET!;

const matches = await verifyProvenanceSignature(record, secret);
console.log("Signature matches:", matches);

const edited = { ...record, modelId: "some-other-model" };
console.log("After editing modelId:", await verifyProvenanceSignature(edited, secret));
```

Argument order is `verifyProvenanceSignature(record, secret)`. A match shows that the signed fields still match a signature made with that secret. Anyone who holds the secret can make a matching signature, so limit who holds it. A match does not show that a notice was shown, that output is marked, or that your system meets the Act.

## Step 7: Flush and shut down

| Call | What it does |
| --- | --- |
| `await ai._spurvik.flush()` | Sends what is queued. The client stays usable. |
| `await ai._spurvik.shutdown()` | Stops background work and sends what is queued. Use it once, at the end. |

## Step 8: Streaming

```ts
import OpenAI from "openai";
import { provenanceOf, withSpurvik } from "spurvik";

const ai = withSpurvik(new OpenAI(), {
  apiKey: process.env.SPURVIK_API_KEY!,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
  baseUrl: process.env.SPURVIK_BASE_URL!,
  riskTier: "limited_art50",
});

const stream = await ai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
  stream: true,
});
let text = "";
for await (const chunk of stream) text += chunk.choices[0]?.delta?.content ?? "";
console.log("Model said:", text);

const record = await provenanceOf(stream);
console.log("Record signature algorithm:", record!.signatureAlg);

await ai._spurvik.shutdown();
```

## Optional: the signed text trailer

This is opt-in and off by default. `marking: { text: "signed-trailer" }` puts the trailer on the record as `markedOutput`. `applyToMessageContent: true` also appends it to non-streaming response text.

```ts
import OpenAI from "openai";
import { provenanceOf, withSpurvik } from "spurvik";

const ai = withSpurvik(new OpenAI(), {
  apiKey: process.env.SPURVIK_API_KEY!,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
  baseUrl: process.env.SPURVIK_BASE_URL!,
  riskTier: "limited_art50",
  marking: { text: "signed-trailer", applyToMessageContent: true },
});

const completion = await ai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});
const record = await provenanceOf(completion);
console.log(completion.choices[0]?.message?.content?.slice(-40));
console.log(record!.evidenceTrailerAttached, record!.markingApplied);

await ai._spurvik.shutdown();
```

`evidenceTrailerAttached: true` with `markingApplied: false` means the trailer is attached. It is not, by itself, machine-readable marking under Article 50(2).

## If `baseUrl` is unreachable

The wrapped model call still succeeds and returns its record (except for `high_annex3`, which fails closed). In a short script the telemetry event is lost: `onTelemetryError` is called once, `await shutdown()` returns, and the process exits with code 0. Calling `await ai._spurvik.shutdown()` before the process exits gives queued events one more try (up to 8 seconds by default). With `high_annex3`, a halt check that times out throws `SpurvikOversightTimeoutError`, and an error response from `baseUrl` throws `SpurvikApiError`. In both cases the provider is not called. Do not rely on `baseUrl` as your only copy of these events. Keep your own records as well. See [troubleshooting.md](troubleshooting.md).

## Log retention

Retention periods are (planned). This repository does not apply them.

| Plan | Default retention (planned) |
| --- | --- |
| Developer (free) | 30 days |
| Team | 90 days |
| Business | 12 months |
| Enterprise | A per-project period, in days. Unset Enterprise projects keep 365 days until an owner sets one. (planned) |

The purge function exists. The Spurvik operator runs it by hand on the hosted control plane. Nothing schedules it. Retention periods are (planned). A purge is not erasure of the project.

## Optional: try it without an OpenAI key

```ts
import http from "node:http";

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const stream = JSON.parse(body || "{}").stream === true;
      const model = "gpt-4o-2024-08-06";
      if (stream) {
        res.setHeader("content-type", "text/event-stream");
        for (const piece of ["Hello ", "from the mock"]) {
          const chunk = {
            id: "mock",
            object: "chat.completion.chunk",
            created: 0,
            model,
            choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
          };
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        res.end("data: [DONE]\n\n");
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          id: "mock",
          object: "chat.completion",
          created: 0,
          model,
          choices: [{ index: 0, message: { role: "assistant", content: "Hello from the mock" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 4, total_tokens: 5 },
        }),
      );
    });
  })
  .listen(4010, "127.0.0.1");
```

Point the OpenAI client at `http://127.0.0.1:4010/v1` with `OPENAI_BASE_URL` when you want to exercise the wrapper without a live model key.

## Next steps

- [5-minute-quickstart.md](5-minute-quickstart.md)
- [sandbox-first-5-minutes.md](sandbox-first-5-minutes.md)
- [console-onboarding.md](console-onboarding.md)
- [langgraph-quickstart.md](langgraph-quickstart.md) for `spurvik/langgraph`
- [hitl-approval-mapping.md](hitl-approval-mapping.md)
- [troubleshooting.md](troubleshooting.md)
- [onboarding-startups-smes.md](onboarding-startups-smes.md)
