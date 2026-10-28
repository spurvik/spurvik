# Mastra & OpenAI Agents SDK — Adapter Quick-Cards

> **Applies to:** `spurvik` `main` (`0e9cc89` / `d18dfba`, `@spurvik/sdk` `0.1.0` pre-release).
>
> **Status.** Public MIT packages: `spurvik@1.0.1` and `spurvik-sdk@1.0.1` from https://github.com/spurvik/spurvik. Workspace package `@spurvik/sdk` is `0.1.0` in the monorepo (`workspace:*`).
>
> **Scope.** Designed to support Article 50(1) AI-interaction notices and, for high-risk AI systems, Article 12 record-keeping and Article 14 human oversight. Its provenance record supports, but does not replace, Article 50(2) machine-readable marking. This is not legal advice.
>
> *Source: https://github.com/spurvik/spurvik. npm: `spurvik@1.0.1`, `spurvik-sdk@1.0.1`, `spurvik-mcp-server@1.0.2`.*

---

## Card 1 — Mastra (`@spurvik/sdk/mastra`)

- **Entry point:** `@spurvik/sdk/mastra` (`withSpurvikMastra`, `provenanceFromMetadata`)
- **Optional peers:** `@mastra/core` (`^1.79.0`) and `ai` (`^7.0.0`)
- **Model input:** `withSpurvikMastra` accepts either an AI SDK language model instance (`LanguageModelV2`, `LanguageModelV3`, or `LanguageModelV4`) or a `(args) => model` resolver function. Mastra model-router strings such as `"openai/gpt-4o"` are not accepted.

```ts
import { Agent } from "@mastra/core/agent";
import { verifyProvenanceSignature } from "@spurvik/core";
import { provenanceFromMetadata, withSpurvikMastra } from "@spurvik/sdk/mastra";

const spurvik = withSpurvikMastra(yourLanguageModel, {
  apiKey: process.env.SPURVIK_API_KEY!,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
  baseUrl: process.env.SPURVIK_BASE_URL!, // required when NODE_ENV is production
  riskTier: "limited_art50", // Sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.
});

const agent = new Agent({
  id: "support-agent",
  name: "Support Agent",
  instructions: "Reply briefly.",
  model: spurvik.model,
});

const out = await agent.generate("Hello");
const receipt = provenanceFromMetadata(out.providerMetadata);
const matches = receipt
  ? await verifyProvenanceSignature(receipt, process.env.SPURVIK_SIGNING_SECRET!)
  : false;
await spurvik.flush();
```

| Detail | Behaviour |
| --- | --- |
| **Receipt** | Stored on `out.providerMetadata.spurvik`. Read with `provenanceFromMetadata(out.providerMetadata)` (`provenanceOf` does not read a Mastra `FullOutput`). |
| **Halt check** | Checked when Mastra resolves `spurvik.model` before `agent.generate` or `agent.stream` starts. Throws `SpurvikHaltedError` when halted. |
| **Telemetry** | Keyed HMAC-SHA-256 fingerprints only; no prompt or output text is sent. Set `MASTRA_TELEMETRY_DISABLED=1` if you want Mastra's own telemetry off. |

---

## Card 2 — OpenAI Agents SDK (`@spurvik/sdk/openai-agents`)

- **Entry point:** `@spurvik/sdk/openai-agents` (`withSpurvikModelProvider`, `withSpurvikModel`, `provenanceFromAgentsResponse`, `provenanceOf`)
- **Optional peer:** `@openai/agents` (`^0.21.0`)

### A. Wrap `ModelProvider` for `Runner` (agent uses model name string)

```ts
import { Agent, OpenAIProvider, Runner } from "@openai/agents";
import { verifyProvenanceSignature } from "@spurvik/core";
import { provenanceFromAgentsResponse, withSpurvikModelProvider } from "@spurvik/sdk/openai-agents";

const spurvik = withSpurvikModelProvider(
  new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY, useResponses: true }),
  {
    apiKey: process.env.SPURVIK_API_KEY!,
    signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
    contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
    baseUrl: process.env.SPURVIK_BASE_URL!, // required when NODE_ENV is production
    riskTier: "limited_art50", // Sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.
  },
);

const runner = new Runner({
  modelProvider: spurvik,
  tracingDisabled: true,
  traceIncludeSensitiveData: false,
});
const agent = new Agent({
  name: "Support Agent",
  instructions: "Reply briefly.",
  model: "gpt-4o-mini",
});

const result = await runner.run(agent, "Hello");
const receipt = provenanceFromAgentsResponse(result.rawResponses.at(-1));
const matches = receipt
  ? await verifyProvenanceSignature(receipt, process.env.SPURVIK_SIGNING_SECRET!)
  : false;
await spurvik.flush();
```

### B. Wrap a single `Model` instance directly

```ts
import { Agent, Runner } from "@openai/agents";
import { verifyProvenanceSignature } from "@spurvik/core";
import { provenanceFromAgentsResponse, withSpurvikModel } from "@spurvik/sdk/openai-agents";

const model = withSpurvikModel(
  yourAgentsModel,
  {
    apiKey: process.env.SPURVIK_API_KEY!,
    signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
    contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
    baseUrl: process.env.SPURVIK_BASE_URL!, // required when NODE_ENV is production
    riskTier: "limited_art50", // Sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.
  },
  { modelId: "gpt-4o-mini" },
);

const runner = new Runner({ tracingDisabled: true, traceIncludeSensitiveData: false });
const agent = new Agent({ name: "Support Agent", instructions: "Reply briefly.", model });

const result = await runner.run(agent, "Hello");
const receipt = provenanceFromAgentsResponse(result.rawResponses.at(-1));
const matches = receipt
  ? await verifyProvenanceSignature(receipt, process.env.SPURVIK_SIGNING_SECRET!)
  : false;
await model.flush();
```

| Detail | Behaviour |
| --- | --- |
| **Receipt** | Stored on `response.providerData.spurvik` (and `_spurvik_provenance`). Read from `result.rawResponses.at(-1)` with `provenanceFromAgentsResponse`, or from a stream with `await provenanceOf(stream)`. |
| **Fingerprints** | Input hash covers system instructions and text items (excluding tool calls and tool outputs). Output hash covers assistant `output_text` only. |
| **Halt check** | Runs before `getResponse` / `getStreamedResponse` calls the inner model. Throws `SpurvikHaltedError` when halted. Does not wrap `@openai/agents/realtime`. |

---

## Card 3 — LangGraph (`@spurvik/sdk/langgraph`)

- **Entry point:** `@spurvik/sdk/langgraph` (`withSpurvikLangGraph`, `spurvikInterrupt`, `resolveLangGraphInterrupts`, `provenanceFromLangGraphState`, `provenanceOf`)
- **Optional peer:** `@langchain/langgraph` (`^1.0.0`). The adapter uses a structural graph type and does not import the package.

```ts
import { verifyProvenanceSignature } from "@spurvik/core";
import { provenanceOf, withSpurvikLangGraph, spurvikInterrupt } from "@spurvik/sdk/langgraph";

declare const compiled: {
  invoke: (input: { messages: Array<{ role: string; content: string }> }) => Promise<{ output: string }>;
};

const graph = withSpurvikLangGraph(compiled, {
  apiKey: process.env.SPURVIK_API_KEY!,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
  baseUrl: process.env.SPURVIK_BASE_URL!, // required when NODE_ENV is production
  riskTier: "limited_art50", // Sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.
});

const result = await graph.invoke({ messages: [{ role: "user", content: "Hello" }] });
const receipt = await provenanceOf(result);
const matches = receipt
  ? await verifyProvenanceSignature(receipt, process.env.SPURVIK_SIGNING_SECRET!)
  : false;
const decision = await spurvikInterrupt(
  { actionName: "send_message", callId: "call_1", payload: { id: "m_1" } },
  {
    apiKey: process.env.SPURVIK_API_KEY!,
    signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
    contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
    baseUrl: process.env.SPURVIK_BASE_URL!,
    riskTier: "high_annex3",
  },
);
await graph.flush();
```

| Detail | Behaviour |
| --- | --- |
| **Receipt** | Stored on the graph state as `_spurvik_provenance`. Read with `provenanceOf` or `provenanceFromLangGraphState`. |
| **Interrupted run** | A state with a non-empty `__interrupt__` array is recorded with finish reason `"interrupted"`. |
| **Human oversight** | `spurvikInterrupt` and `resolveLangGraphInterrupts` send the action to `/api/v1/hitl`. One interrupt returns `{ resume }`. Several return `{ resume: resumeById }`. Duplicate ids are sent once. |
| **Halt check** | `invoke` and `stream` call the halt check before the graph when enforcement is on. `spurvikInterrupt` fails closed with `SpurvikHaltedError` when the action is halted. |

---

## Card 4 — AI SDK finish reason and Agents approval

- **Finish reason:** `@spurvik/sdk/ai` exports `extractFinishReason`, `isInterruptedFinishReason`, and `dedupeToolApprovalResponses`.
- **Agents approval:** `@spurvik/sdk/openai-agents` exports `createSpurvikNeedsApproval` and `resolveAgentInterruptions`.

`extractFinishReason` reads a string or `{ unified, raw }` (`unified` wins). A generate or stream finish chunk stores that reason on the receipt. A stream that closes without a finish chunk is recorded as `"interrupted"`. `finishReason` and `interrupted` are readable on the receipt and on `providerMetadata.spurvik`, and they are left out of `Object.keys` and `JSON.stringify` so the HMAC still covers the same 16 fields.

`dedupeToolApprovalResponses` keeps the first approval response for each `toolCallId`, `approvalId`, or `id`.

`createSpurvikNeedsApproval` returns a `needsApproval` function. It checks the halt state, then returns true, or the `when` predicate when you pass one. `resolveAgentInterruptions` sends each unique `callId` to the human-oversight queue, calls `state.approve` for an approved or overridden row, and `state.reject` for a rejected row.

---

## Signature check note

A match (`true`) from `verifyProvenanceSignature` shows that the record's signed fields still match the HMAC-SHA-256 signature made with your signing secret. Anyone who holds that secret can make a matching signature, including for edited fields, so limit who holds it. It does not show that a notice was shown, that output is marked, or that your system meets the Act.
