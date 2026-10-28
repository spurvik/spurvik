---
description: Wrap OpenAI, Anthropic, and Google GenAI clients with withSpurvik, a Vercel AI SDK model with spurvikMiddleware, a Mastra model with withSpurvikMastra, an OpenAI Agents model with withSpurvikModel or withSpurvikModelProvider, or a LangGraph graph with withSpurvikLangGraph. Point React UIs at AIDisclosureLabel.
---

# `/spurvik:wrap`

Inspect the current project, or the file in `$ARGUMENTS`, and add the Spurvik setup that this repository actually exports. Leave unrelated code unchanged. Show the diff. Run the project's typecheck when it has one.

Pass every secret in from the environment. `@spurvik/sdk` throws `SpurvikConfigError` when `apiKey` is missing or is not a `spurvik_live_` project key, when `signingSecret` is missing or shorter than 16 characters, and when the default keyed fingerprint mode has no `contentHash.secret`. `baseUrl` is required when `NODE_ENV` is production. Development and tests may omit it and use `http://127.0.0.1:43123`. The SDK does not fill these fields from the environment.

`riskTier` is your classification as provider or deployer. Spurvik does not classify the use case. `article50Disclosure` defaults to false. Set it to true only when you state that an Art. 50(1) interaction notice is shown. The flag is configuration. It is not a finding that the notice was shown or that it is sufficient.

Do not set `marking` unless you supply your own hook. The SDK does not mark content. A marking hook is where a customer plugs in their own Art. 50(2) marking.

## OpenAI, Anthropic, and Google GenAI

```ts
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import {
  provenanceOf,
  SpurvikConfigError,
  verifyProvenanceSignature,
  withSpurvik,
  type SpurvikConfig,
} from "@spurvik/sdk";

const config = {
  apiKey: process.env.SPURVIK_API_KEY!,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET },
  baseUrl: process.env.SPURVIK_BASE_URL,
  riskTier: "limited_art50",
  article50Disclosure: false,
} satisfies SpurvikConfig;

const openai = withSpurvik(new OpenAI(), config);
const anthropic = withSpurvik(new Anthropic(), config);
const gemini = withSpurvik(new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }), config);

const completion = await openai.chat.completions.create({
  model: "your-model",
  messages: [{ role: "user", content: "Hello" }],
});
const record = provenanceOf(completion);
```

`withSpurvik` records chat completions, responses, Anthropic messages, Gemini `generateContent`, and Gemini chat `sendMessage`, including the stream helpers listed in `packages/sdk/README.md`. Embeddings, image generation, speech, moderations, batches, and file uploads have no provenance record. A thrown provider call does not produce a record. A call does not flush the queue by itself. `await openai._spurvik.flush()` sends the queued telemetry and leaves the client running.

The telemetry body carries fingerprints, model version, temperature, and latency. The ingestion route rejects prompt or output text. Keyed mode is the default. The repository states that this tree does not claim that data stays in the EU.

`verifyProvenanceSignature` checks the HMAC on a provenance record. A match shows the signed fields still match. It does not show that a mark is robust, detectable, or adequate under Art. 50(2).

## Vercel AI SDK

`spurvikMiddleware` and `flush()` are exported from `@spurvik/sdk/ai`. Pass the middleware to `wrapLanguageModel`. Install `ai` at `^7.0.0` in the app. Create one middleware at module scope.

```ts
import { generateText, streamText, wrapLanguageModel } from "ai";
import { provenanceFromMetadata, spurvikMiddleware } from "@spurvik/sdk/ai";
import type { SpurvikConfig } from "@spurvik/sdk";

declare const yourLanguageModel: Parameters<typeof wrapLanguageModel>[0]["model"];

const spurvik = spurvikMiddleware({
  apiKey: process.env.SPURVIK_API_KEY,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET },
  baseUrl: process.env.SPURVIK_BASE_URL,
  riskTier: "limited_art50",
} as SpurvikConfig);

const model = wrapLanguageModel({
  model: yourLanguageModel,
  middleware: spurvik,
});

const generated = await generateText({ model, prompt: "Hello" });
const generatedRecord = provenanceFromMetadata(generated.providerMetadata);

const streamed = streamText({ model, prompt: "Hello" });
const streamedRecord = provenanceFromMetadata(await streamed.providerMetadata);

await spurvik.flush();
```

The middleware records the call and stores the HMAC receipt on `providerMetadata.spurvik`. It does not mark content. `provenanceOf` does not read `generateText` or `streamText` results. On a serverless isolate, pass `spurvik.flush()` to one platform wait helper (`after` from `next/server`, `waitUntil` from `@vercel/functions`, or `EdgeRuntime.waitUntil`). `flush()` stops retrying after `telemetry.flushTimeoutMs` (default 8 seconds).

`extractFinishReason` reads a string or an `{ unified, raw }` finish reason (`unified` wins). `isInterruptedFinishReason` is true when that value is `"interrupted"`. A generate or stream finish chunk passes that reason through to the receipt. A stream that closes without a finish chunk is recorded as `"interrupted"`. `finishReason` and `interrupted` sit beside the signed record and are omitted from `Object.keys` and `JSON.stringify`, so the HMAC still covers the same fields. `dedupeToolApprovalResponses` keeps the first approval response for each `toolCallId`, `approvalId`, or `id`.

```ts
import { dedupeToolApprovalResponses, extractFinishReason, isInterruptedFinishReason } from "@spurvik/sdk/ai";

const finishReason = extractFinishReason({ unified: "interrupted", raw: "incomplete" });
const interrupted = isInterruptedFinishReason(finishReason);
const approvals = dedupeToolApprovalResponses([
  { toolCallId: "call_1", approved: true },
  { toolCallId: "call_1", approved: false },
  { approvalId: "appr_2", approved: true },
]);
```

## Mastra

`withSpurvikMastra` and `provenanceFromMetadata` are exported from `@spurvik/sdk/mastra`. Pass the function `withSpurvikMastra` returns as the Mastra agent's `model`. It accepts an AI SDK language model or a resolver function. A model-router string is rejected. Read the receipt with `provenanceFromMetadata`. Call `flush()` on the returned object when a serverless isolate can freeze before the process ends. The same `SpurvikConfig` fields apply. The helper does not mark content.

## OpenAI Agents

`withSpurvikModel`, `withSpurvikModelProvider`, and `provenanceFromAgentsResponse` are exported from `@spurvik/sdk/openai-agents`. `withSpurvikModel` wraps one Agents SDK `Model`. `withSpurvikModelProvider` wraps a `ModelProvider` and wraps each model `getModel` returns. Read the receipt with `provenanceFromAgentsResponse`. `provenanceOf` from `@spurvik/sdk` reads an Agents stream. The wrapper does not mark content.

`createSpurvikNeedsApproval` returns a `needsApproval` function. It checks the halt state, then returns true, or the result of `when` when you pass one. `resolveAgentInterruptions` sends each unique tool call to the human-oversight queue. An approved or overridden decision calls `state.approve`. A rejected decision calls `state.reject`. The same helpers are on the wrapped model and provider as `resolveInterruptions`.

```ts
import type { SpurvikConfig } from "@spurvik/sdk";
import { createSpurvikNeedsApproval, resolveAgentInterruptions } from "@spurvik/sdk/openai-agents";

declare const config: SpurvikConfig;

const needsApproval = createSpurvikNeedsApproval(config, { actionName: "send_message" });
const allowed = await needsApproval({}, { id: "m_1" }, "call_1");

const state = {
  approve(_item: { callId?: string }) {},
  reject(_item: { callId?: string }) {},
};

const resolved = await resolveAgentInterruptions(
  [{ callId: "call_1", name: "send_message", arguments: { id: "m_1" } }],
  config,
  { state },
);
```

## LangGraph

`withSpurvikLangGraph`, `spurvikInterrupt`, `resolveLangGraphInterrupts`, and `provenanceFromLangGraphState` are exported from `@spurvik/sdk/langgraph`. Pass a compiled graph. The module does not import `@langchain/langgraph`. `invoke` and `stream` record an HMAC receipt and run the halt check when enforcement is on. A returned state with a non-empty `__interrupt__` array is stored with finish reason `"interrupted"`. `spurvikInterrupt` sends one action to the human-oversight queue. `resolveLangGraphInterrupts` keeps the first interrupt for each id. One interrupt returns `{ resume }` for that decision. Several return `{ resume: resumeById }`.

```ts
import { provenanceOf, verifyProvenanceSignature, type SpurvikConfig } from "@spurvik/sdk";
import { resolveLangGraphInterrupts, spurvikInterrupt, withSpurvikLangGraph } from "@spurvik/sdk/langgraph";

declare const compiled: {
  invoke: (
    input: { messages: Array<{ role: string; content: string }> },
  ) => Promise<{ messages: Array<{ role: string; content: string }> }>;
};

const config = {
  apiKey: process.env.SPURVIK_API_KEY,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET },
  baseUrl: process.env.SPURVIK_BASE_URL,
  riskTier: "limited_art50",
} as SpurvikConfig;

const graph = withSpurvikLangGraph(compiled, config);
const result = await graph.invoke({ messages: [{ role: "user", content: "Hello" }] });
const receipt = await provenanceOf(result);
const matches = receipt ? await verifyProvenanceSignature(receipt, process.env.SPURVIK_SIGNING_SECRET!) : false;
const decision = await spurvikInterrupt(
  { actionName: "send_message", callId: "call_1", payload: { id: "m_1" } },
  config,
);
const resolvedInterrupts = await resolveLangGraphInterrupts(
  [{ id: "int_1", value: { actionName: "send_message", payload: { id: "m_1" } } }],
  config,
);
await graph.flush();
```

## Halt and human oversight, for high-risk AI systems

These options are for a use you have classified as `high_annex3`. Art. 14 human oversight in this SDK is designed to support that work. It is not a complete Art. 14 system.

```ts
import OpenAI from "openai";
import { withSpurvik, type SpurvikConfig } from "@spurvik/sdk";

const client = new OpenAI();
const ai = withSpurvik(client, {
  apiKey: process.env.SPURVIK_API_KEY,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET },
  baseUrl: process.env.SPURVIK_BASE_URL,
  riskTier: "high_annex3",
  enforceHaltOnInference: true,
  oversight: { cacheMs: 5_000, pushInvalidation: true },
  reviewerToken: process.env.SPURVIK_REVIEWER_TOKEN,
} as SpurvikConfig);

const decision = await ai._spurvik.requireHumanApproval("send_contract", { contractId: "c_123" });
await ai._spurvik.engageKillSwitch({ reason: "stop this action", actionName: "send_contract" });
await ai._spurvik.releaseKillSwitch({ reason: "release this action", actionName: "send_contract" });
```

`enforceHaltOnInference` defaults to true for `high_annex3` and false otherwise. `oversight.cacheMs` is the halt-cache window (`0` refreshes on every inference call). `oversight.pushInvalidation` defaults to on when halt enforcement is on. `requireHumanApproval(actionName, payload)` opens a pending decision and waits. The stored summary is field names plus an optional fingerprint, not the values. Do not put personal data in a field name. `engageKillSwitch` and `releaseKillSwitch` need `reviewerToken` (a `spurvik_reviewer_` token). Pass a reason to `releaseKillSwitch`. If the reason is missing or blank, the SDK sends "Released via SDK (no reason given)" before the request. A blank halt reason is sent as "Halted via SDK (no reason given)". The control plane does not fill in a reason. There is no currency threshold and no region field on `SpurvikConfig`.

## Art. 50 notice in React

This repository does not ship a disclosure script and does not document a script URL. Use `@spurvik/react`:

```tsx
import { AIDisclosureLabel } from "@spurvik/react";

<AIDisclosureLabel notice="interaction" />
```

The words are in the page without a click. The label does not write browser storage or call a disclosure endpoint unless `beacon.consent` is true. Leaving that prop off is the default.

## Optional marking hook you supply

Leave this unset unless you are plugging in your own hook. `signed-trailer` embeds the provenance record in text. That is an application-level binding, not a finding under Art. 50(2). `createC2paImageHook` from `@spurvik/c2pa` embeds a C2PA manifest in a PNG or JPEG when you pass a certificate and key. `c2paMaterialFromEnv` reads `SPURVIK_C2PA_CERT_PEM` and `SPURVIK_C2PA_KEY_PEM` and returns null when either is missing.

```ts
import { createC2paImageHook, c2paMaterialFromEnv } from "@spurvik/c2pa";
import OpenAI from "openai";
import { withSpurvik, type SpurvikConfig } from "@spurvik/sdk";

const client = new OpenAI();
const material = c2paMaterialFromEnv();
const config = {
  apiKey: process.env.SPURVIK_API_KEY,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET },
  baseUrl: process.env.SPURVIK_BASE_URL,
  riskTier: "limited_art50",
  marking: {
    text: "signed-trailer",
    ...(material ? { media: createC2paImageHook(material) } : {}),
  },
} as SpurvikConfig;

const ai = withSpurvik(client, config);
```
