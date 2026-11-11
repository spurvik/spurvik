# LangGraph, Mastra, and OpenAI Agents Adapter Examples (`spurvik@1.0.8`)

> Source: https://github.com/spurvik/spurvik (`spurvik@1.0.8`, `spurvik-sdk@1.0.8`). This is technical infrastructure designed to support Article 12 record-keeping, Article 14 human oversight, and Article 50(1) transparency notices — not legal advice.

## Install

```bash
npm install spurvik@1.0.8
```

---

## 1. LangGraph (`spurvik/langgraph`)

Wrap a compiled LangGraph (`StateGraph(...).compile()`) with `withSpurvikLangGraph` to record keyed HMAC-SHA256 input/output digests (`0B` raw prompt persisted) and verify the attached provenance receipt:

```ts
import { verifyProvenanceSignature } from "spurvik";
import { provenanceFromLangGraphState, withSpurvikLangGraph } from "spurvik/langgraph";

const wrappedGraph = withSpurvikLangGraph(
  compiledGraph,
  {
    apiKey: process.env.SPURVIK_API_KEY!,
    signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
    contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
    baseUrl: process.env.SPURVIK_BASE_URL ?? "https://console.spurvik.com",
    riskTier: "limited_art50",
    article50Disclosure: true,
  },
  { modelId: "gpt-4o" },
);

const finalState = await wrappedGraph.invoke({
  messages: [{ role: "user", content: "Check refund eligibility for order #4821" }],
});

const receipt = provenanceFromLangGraphState(finalState);
const valid = await verifyProvenanceSignature(receipt!, process.env.SPURVIK_SIGNING_SECRET!);
await wrappedGraph.flush();
```

---

## 2. OpenAI Agents SDK (`spurvik/openai-agents`)

Wrap an `@openai/agents` `Model` with `withSpurvikModel` (or a `ModelProvider` with `withSpurvikModelProvider`) and gate high-risk tools with `createSpurvikNeedsApproval`:

```ts
import { verifyProvenanceSignature } from "spurvik";
import {
  createSpurvikNeedsApproval,
  provenanceFromAgentsResponse,
  withSpurvikModel,
} from "spurvik/openai-agents";

const config = {
  apiKey: process.env.SPURVIK_API_KEY!,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
  baseUrl: process.env.SPURVIK_BASE_URL ?? "https://console.spurvik.com",
  riskTier: "high_annex3" as const,
  article50Disclosure: true,
};

export const model = withSpurvikModel(baseAgentsModel, config, { modelId: "gpt-4o" });
export const needsApproval = createSpurvikNeedsApproval(config, {
  actionName: "stripe.refunds.create",
});
```

---

## 3. Mastra (`spurvik/mastra`)

Wrap an AI SDK language model for Mastra `Agent` using `withSpurvikMastra`:

```ts
import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { withSpurvikMastra } from "spurvik/mastra";

const spurvikMastra = withSpurvikMastra(openai("gpt-4o"), {
  apiKey: process.env.SPURVIK_API_KEY!,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
  baseUrl: process.env.SPURVIK_BASE_URL ?? "https://console.spurvik.com",
  riskTier: "limited_art50",
  article50Disclosure: true,
});

export const supportAgent = new Agent({
  name: "support-agent",
  instructions: "Assist customers with EU order inquiries.",
  model: spurvikMastra.model,
});
```

---

## Run the Smoke Test Locally

```bash
node --test examples/langgraph-mastra-openai-agents/smoke.test.mjs
```
