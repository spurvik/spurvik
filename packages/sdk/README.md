# @spurvik/sdk

Runtime client for provenance records, telemetry, a live human-oversight queue, and the halt cache.

The public MIT release is `spurvik@1.0.1` and `spurvik-sdk@1.0.1` on npm (core is bundled), from https://github.com/spurvik/spurvik. In this monorepo `@spurvik/sdk` is workspace version `1.0.1` and depends on `@spurvik/core`. `@spurvik/sdk/ai` types against `@ai-sdk/provider` and is meant to be passed to the Vercel AI SDK (`ai` 7, optional peer). See the root `LICENSE`.

`withSpurvik` is the provider wrapper. The old `withCompliance` alias is removed; use `withSpurvik`. That old name did not mean the wrapped client meets the Act. `withAegis` is the previous product-name alias and is removed in the next release.

`spurvikMiddleware` wraps an AI SDK language model. Pass it to `wrapLanguageModel`. It takes the same `SpurvikConfig` object as `withSpurvik`. It records the call and stores the HMAC receipt on that language-model result under `providerMetadata.spurvik`. It does not add `_aegis_provenance`. It does not mark content. Set `marking` only when you supply your own hook.

`@spurvik/sdk/mastra` and `@spurvik/sdk/openai-agents` are the Mastra and OpenAI Agents adapters. Both take the same `SpurvikConfig`. Neither reads `SPURVIK_` environment variables. The constructor throws when `apiKey` or `signingSecret` is missing. Article 12 (record-keeping) and Article 14 (human oversight) apply to high-risk AI systems. These adapters are designed to support that work. They do not mark content. A marking hook runs only when you set `marking`.

`generateText` and `streamText` do not put that receipt on `_spurvik_provenance`, and `provenanceOf` does not read their results. Read it with `provenanceFromMetadata(result.providerMetadata)`. For a stream, await `providerMetadata` first. `provenanceOf` is for a `withSpurvik` response or stream. Check a receipt with `verifyProvenanceSignature`. A match shows the signed fields still match the HMAC-SHA-256 signature made with your signing secret. It does not show that a notice was shown, that output is marked, or that your system meets the Act.

Telemetry is queued. The queue sends when the batch is full, on its interval, on `flush()`, and once as the process is about to exit when process hooks are on. A call does not flush the queue by itself. One process-wide exit listener serves every client, so constructing the middleware again does not add another listener. An idle empty queue is dropped from that registry. Each control-plane request ends after `telemetry.requestTimeoutMs` (default 5 seconds). `flush()` stops retrying after `telemetry.flushTimeoutMs` (default 8 seconds). Callers that share an in-flight flush share that deadline. If that flush failed and nothing new is queued, process exit keeps only the time left on that deadline, so a slow error still ends in about 8 seconds and does not open a second window. A new event queued while that flush is still running, or after it has returned, gets a fresh deadline once the in-flight flush has finished. A timed-out flush, then a new event, then exit can therefore take up to about 16 seconds. An event recorded after a flush that finished still goes out on exit, under a new deadline. `flush()` then settles, and `onTelemetryError` receives a `TimeoutError`.

Decision and oversight calls send `reviewerToken` as `x-spurvik-reviewer`. They do not take a free-text reviewer id. Any organisation member can halt or decide in the console. Deciding through the API needs a reviewer token, which only an organisation owner can issue. You choose who in your organisation does human oversight (Art. 26(2), for high-risk AI systems). Image C2PA marking lives in `@spurvik/c2pa` so this package does not load a native addon.

## What `withSpurvik` records

The output fingerprint is assistant-visible text. Tool-call argument strings are not included. Snapshot events are not counted again: an OpenAI `response.output_text.done` event repeats the full string, and a Gemini chunk's `text` getter repeats `candidates`. A thrown provider call does not produce a record. `chats.create` is a session factory, not a model call. The returned chat records `sendMessage` and `sendMessageStream`.

`withResponse()` records the parsed data and leaves the helper in place. `asResponse()` returns the raw `Response` and does not by itself create a record. Awaiting that same call, or calling `withResponse()`, does.

| Call | Recorded |
| --- | --- |
| OpenAI `chat.completions.create` | Yes. `await`, `withResponse()`, and `asResponse()` then `await` keep the helper methods. |
| OpenAI `chat.completions.parse` | Yes. The helper calls the raw client, so the outer call is recorded once. |
| OpenAI `chat.completions.create({ stream: true })` | Yes, when consumed with `for await`. The full text is hashed once. |
| OpenAI `chat.completions.stream` | Yes, via `for await`, `finalChatCompletion()`, or `.on('content')` then `done()`. |
| OpenAI `responses.create` | Yes, including `await` of a non-stream response. |
| OpenAI `responses.create({ stream: true })` | Yes, when consumed with `for await`. Delta text is hashed once. The done event is not added again. |
| OpenAI `responses.parse` | Yes. Recorded once on the outer call. |
| OpenAI `responses.stream` | Yes, via `finalResponse()`. `for await` and `done()` use the same wrapper. |
| Anthropic `messages.create` | Yes. `await`, `withResponse()`, and `asResponse()` then `await`. |
| Anthropic `messages.parse` | Yes. Recorded once on the outer call. |
| Anthropic `messages.create({ stream: true })` | Yes, when consumed with `for await`. |
| Anthropic `messages.stream` | Yes, via `for await`, or `.on('text')` then `done()`. |
| Gemini `models.generateContent` | Yes. |
| Gemini `models.generateContentStream` | Yes, when consumed with `for await`. Each chunk is counted once. |
| Gemini `chats.sendMessage` / `sendMessageStream` | Yes. The model id and session temperature are taken from the chat when the call omits them. |

These rows were exercised with the installed `openai`, `@anthropic-ai/sdk`, and `@google/genai` packages. Tests replace HTTP. They do not replace the SDK clients.

## What is not recorded

| Call | Why |
| --- | --- |
| Embeddings, images, audio, speech, transcriptions, moderations | Not an inference method this wrapper records. |
| Batches, files, uploads, fine-tuning, assistants, threads, runs, vector stores | Not an inference method this wrapper records. |
| OpenAI Realtime and Gemini Live | Not wrapped. |
| `responses.retrieve`, `responses.cancel`, `models.list`, and other reads | Not an inference call. |
| `chats.create` by itself | Session factory. The later `sendMessage` is the model call. |
| `toReadableStream()` as the only consumer of a raw SSE stream | The helper iterates the original stream, so the wrapper's iterator never runs. Event helpers such as `chat.completions.stream` still record from their end event. |
| Early `break` from `for await` | The text seen so far can be recorded. If the provider aborts the stream, the receipt is rejected instead of stored as a success. |
| A provider method that throws before a body exists | No record. |

The middleware does not see provider HTTP. Its output fingerprint is the concatenated text parts, or text deltas, not tool-call arguments. Tool-only output leaves `outputHash` null.

## Halt checks

`releaseKillSwitch({ reason, actionName })` releases a project halt, or one action when `actionName` is set. Pass a reason when you have one. The argument is optional. When the reason is missing or blank, the client sends `Released via SDK (no reason given)` and `reasonSource: "sdk_default"` before the request. A reason you pass is sent with `reasonSource: "caller"`. `reasonSource` is client-asserted. The server does not verify it. Console writes store NULL. A raw API call that omits the field stores NULL. The control plane does not fill that in. The returned `reason` is the reason just recorded. The halt reason that was in effect is `previousReason`. A halt response sets `previousReason` to null. `engageKillSwitch` still takes a reason. When that reason is missing or blank, the client sends `Halted via SDK (no reason given)` and `reasonSource: "sdk_default"`, because the control plane refuses a halt that arrives with no reason. Both calls need `reviewerToken`. The signed `oversight.changed` webhook posts the response: `reason` is the new reason, `previousReason` is null on a halt and the halt reason on a release. A later read of the same stop keeps the halt reason and sets `previousReason` to null.

`enforceHaltOnInference` defaults to on for `high_annex3`. The provider request is not sent until that check passes. Stream helpers stay synchronous: `.on`, `.done`, `final*`, `for await`, and `toReadableStream()` keep their usual shapes, and getters such as `ended` and `currentMessage` stay values. A stop emits `error` and then `end` with `SpurvikHaltedError`, and `done()` rejects with that error. The provider is not called. A halt check that accepts and then stays silent rejects with `SpurvikOversightTimeoutError`, which is a `SpurvikHaltedError`, and the provider request is still not sent. `abort()` before the provider request starts sends nothing, and `done()` rejects at once with `AbortError`. It does not wait for a halt check that is still in flight. A non-2xx oversight response is an error, and the provider request is not sent. The background halt refresh does not start a second request while one is in flight. On Node that poll, and the oversight push stream, use an unref'd `node:http` request so a silent server does not keep the process alive. Those two requests do not go through `config.fetch`, because a fetch socket stays referenced until the body ends. Halt checks the caller awaits, telemetry, and the push stream off Node still use `config.fetch`.

`create()`, `parse`, and the other promise methods do not start that check until the caller awaits the promise or calls `withResponse()` or `asResponse()`. An un-awaited call sends nothing. That includes a halted project: nothing is sent because the check never runs. Await the call, or use `withResponse()` / `asResponse()`, when a stop must be observed. `.stream()` starts the check immediately and still waits for it before the provider request.

## AI SDK middleware

```ts
import { generateText, streamText, wrapLanguageModel } from "ai";
import { provenanceFromMetadata, spurvikMiddleware } from "@spurvik/sdk/ai";

const spurvik = spurvikMiddleware({
  apiKey: process.env.SPURVIK_API_KEY!,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
  baseUrl: process.env.SPURVIK_BASE_URL, // required when NODE_ENV is production
  riskTier: "limited_art50", // Sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.
});

const model = wrapLanguageModel({
  model: yourLanguageModel,
  middleware: spurvik,
});

const generated = await generateText({ model, prompt: "Hello" });
const generatedRecord = provenanceFromMetadata(generated.providerMetadata);

const streamed = streamText({ model, prompt: "Hello" });
const streamedRecord = provenanceFromMetadata(await streamed.providerMetadata);
```

`spurvik.flush(): Promise<void>` sends this middleware's queued telemetry and leaves the client running. `wrapLanguageModel` accepts the same object.

Create that middleware once at module scope. A serverless isolate can return the response and freeze before the process-exit hook runs. Pass `flush()` to one platform wait helper:

```ts
import { after } from "next/server";

after(() => spurvik.flush());
```

Vercel handlers call `waitUntil(spurvik.flush())` from `@vercel/functions`. Install `@vercel/functions` in the app that calls it. Supabase Edge calls `EdgeRuntime.waitUntil(spurvik.flush())`. A handler that can wait calls `await spurvik.flush()`.

`registerProcessHooks` can stay off in those handlers. With the default on, further requests still share one exit listener, and an idle empty queue is dropped from it. Flush from the wait helper either way, because the isolate may not reach `beforeExit`.

`ai` is an optional peer (`^7.0.0`). Install it in the app that calls `wrapLanguageModel`. The subpath import `@spurvik/sdk/ai` is the middleware entry.

## Mastra

Checked against `@mastra/core` 1.79.0. Mastra's `MastraModelConfig` includes an AI SDK language model (`LanguageModelV2`, `LanguageModelV3`, or `LanguageModelV4` from `@ai-sdk/provider`). `resolveModelConfig` keeps a `specificationVersion: "v4"` model and calls `doGenerate` / `doStream` (`AISDKV7LanguageModel`). `Agent`'s `model` field is a `DynamicArgument`, so it accepts that object or a function that returns it. `withSpurvikMastra` returns the function. Mastra calls it from `Agent.getLLM` before `stream()` starts. A halt there rejects `agent.stream` and `agent.generate` with `SpurvikHaltedError`. A thrown `doStream` inside the stream loop becomes an empty text stream, so the check does not wait until `doStream`. The function's return value is what `spurvikMiddleware` records.

Model-router strings such as `openai/gpt-4o` are not wrapped. Pass a model object.

```ts
import { Agent } from "@mastra/core/agent";
import { provenanceFromMetadata, withSpurvikMastra } from "@spurvik/sdk/mastra";

const spurvik = withSpurvikMastra(yourLanguageModel, {
  apiKey: process.env.SPURVIK_API_KEY!,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
  baseUrl: process.env.SPURVIK_BASE_URL, // required when NODE_ENV is production
  riskTier: "limited_art50", // Sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.
});

const agent = new Agent({
  id: "assistant",
  name: "Assistant",
  instructions: "Reply briefly.",
  model: spurvik.model,
});

const generated = await agent.generate("Hello");
const record = provenanceFromMetadata(generated.providerMetadata);
```

`withSpurvikMastra` calls `wrapLanguageModel` with `spurvikMiddleware`. It does not keep a second copy of the recorder. `flush()` sends that middleware's queue.

What it does:

- Records `doGenerate` and `doStream` on the language model you pass in.
- Stores the HMAC receipt on `providerMetadata.spurvik`. `Agent.generate` keeps that object on its result when the step keeps the finish chunk. `provenanceOf` does not read a Mastra `FullOutput`. Read `provenanceFromMetadata`.
- Checks the halt state when Mastra resolves `model`, before `agent.stream` or `agent.generate` starts, when halt enforcement is on. The same `oversight` options as `withSpurvik` apply. A stop throws `SpurvikHaltedError` from that call.
- Sends keyed HMAC fingerprints. The control-plane body does not include the prompt or the output text.

What it does not do:

- Model-router strings such as `openai/gpt-4o` are not wrapped. Pass a model object. Mastra resolves that string in its own router, and this helper never receives the call.
- It does not record embeddings, voice, workflows, or any call that does not go through the wrapped model.
- It does not mark content. A marking hook runs only when you set `marking`.
- It does not turn Mastra's own telemetry off. Set `MASTRA_TELEMETRY_DISABLED` in the app if you do not want that.

`@mastra/core` is an optional peer (`^1.79.0`). `ai` stays an optional peer. Install both in the app that calls `withSpurvikMastra`.

## OpenAI Agents SDK

Checked against `@openai/agents` 0.21.0. A model call is `Model.getResponse` or `Model.getStreamedResponse` (`@openai/agents-core` `model.d.ts`). `ModelProvider.getModel` resolves a string name to a `Model`. `Runner` takes `modelProvider`. `Agent.model` is `string | Model`. `TracingProcessor` runs when a trace or span starts and ends. It does not run before the model request, so a halt check there cannot stop the call. This adapter wraps `Model` and `ModelProvider`. It does not register a tracing processor.

```ts
import { Agent, OpenAIProvider, Runner } from "@openai/agents";
import { provenanceFromAgentsResponse, withSpurvikModelProvider } from "@spurvik/sdk/openai-agents";

const spurvik = withSpurvikModelProvider(
  new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY, useResponses: true }),
  {
    apiKey: process.env.SPURVIK_API_KEY!,
    signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
    contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
    baseUrl: process.env.SPURVIK_BASE_URL, // required when NODE_ENV is production
    riskTier: "limited_art50", // Sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.
  },
);

const runner = new Runner({ modelProvider: spurvik, tracingDisabled: true, traceIncludeSensitiveData: false });
const agent = new Agent({
  name: "Assistant",
  instructions: "Reply briefly.",
  model: "gpt-4o-mini",
});

const result = await runner.run(agent, "Hello");
```

`getModel("gpt-4o-mini")` wraps the inner model and stores that name on the receipt. The `Model` interface does not expose the id the provider selected, so a call with no name is stored as `unknown`. Pass a `Model` instance with `withSpurvikModel(model, config, { modelId })` when `Agent.model` is already a model object. Models from one provider share one client. `flush()` sends that queue.

The receipt is on `providerData.spurvik` and on `_spurvik_provenance`. Read it with `provenanceFromAgentsResponse` or `provenanceOf`. On a stream, `response_done.response` carries the receipt, and `provenanceOf` on the iterable is a promise. The input fingerprint includes system instructions, string input, `input_text`, `output_text`, and `reasoning_text` (including a reasoning item's `rawContent`). It does not include tool results (`function_call_result` and its `output`) or tool-call items (`function_call`, `hosted_tool_call`, `tool_search_call`). The output hash is assistant `output_text` only and leaves out tool-call arguments. A thrown model call does not produce a receipt.

`getResponse` checks the halt state before the inner model is called when halt enforcement is on. `getStreamedResponse` starts that check when it is called and calls the inner model only after the check passes and the caller reads the stream. The `oversight` options are the same ones `withSpurvik` uses.

What it does not do:

- It does not mark content. A marking hook runs only when you set `marking`. With `applyToMessageContent`, the first assistant `output_text` is replaced with the hook output. That hook is yours.
- It does not turn off the Agents SDK's own tracing. Set `tracingDisabled` on the `Runner` when you do not want that export. This adapter still does not send the prompt or the output text to the control plane.
- It does not wrap `@openai/agents/realtime`.
- It does not replace the OpenAI client. The inner `Model` still performs the provider request.

`@openai/agents` is an optional peer (`^0.21.0`). Install it for the Agents SDK. The adapter does not check for it.

## Deno

Deno can import the built package. The on-disk telemetry buffer and the unref'd `node:http` halt poll are Node-only. On Deno, pass `DurableTelemetryBuffer` or `KvTelemetryBuffer`. `MemoryTelemetryBuffer` stays in memory for either runtime.
