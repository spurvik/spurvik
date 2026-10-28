---
name: eu-ai-act-guardrails
description: Use when writing or reviewing code that calls OpenAI, Anthropic, Google GenAI, the Vercel AI SDK, OpenAI Agents, or LangGraph, or that defines agent tools with side effects. Designed to support Art. 50 notices and, for high-risk AI systems, Art. 12 record-keeping and Art. 14 human oversight.
---

# Spurvik guardrails

Use this skill when creating or reviewing code that calls a model client or defines an agent tool. The patterns below are the exports in this repository. This is not legal advice.

```ts
import { AIDisclosureLabel } from "@spurvik/react";
import { SpurvikConfigError, withSpurvik } from "@spurvik/sdk";
import { dedupeToolApprovalResponses, extractFinishReason, spurvikMiddleware } from "@spurvik/sdk/ai";
import { createSpurvikNeedsApproval, resolveAgentInterruptions } from "@spurvik/sdk/openai-agents";
import { spurvikInterrupt, withSpurvikLangGraph } from "@spurvik/sdk/langgraph";
```

## 1. Record wrapped calls with the real client

- Wrap OpenAI, Anthropic, and Google GenAI clients with `withSpurvik` from `@spurvik/sdk`. Read the response with `provenanceOf`.
- For the Vercel AI SDK, import `spurvikMiddleware` from `@spurvik/sdk/ai` and pass it to `wrapLanguageModel`. Call `flush()` on that middleware object. A call does not flush the queue by itself. Read the receipt with `provenanceFromMetadata`.
- For Mastra, use `withSpurvikMastra` from `@spurvik/sdk/mastra` and pass the function it returns as the agent's `model`. Read the receipt with `provenanceFromMetadata`.
- For OpenAI Agents, use `withSpurvikModel` or `withSpurvikModelProvider` from `@spurvik/sdk/openai-agents`. Read the receipt with `provenanceFromAgentsResponse`. Use `createSpurvikNeedsApproval` for a tool `needsApproval` callback and `resolveAgentInterruptions` for `RunResult.interruptions`. Both send the action to the human-oversight queue. Duplicate `callId` values are sent once.
- For LangGraph, use `withSpurvikLangGraph` from `@spurvik/sdk/langgraph`. Read the receipt with `provenanceOf` or `provenanceFromLangGraphState`. Use `spurvikInterrupt` or `resolveLangGraphInterrupts` for `interrupt()` pauses. A state with `__interrupt__` is recorded with finish reason `"interrupted"`.
- For the Vercel AI SDK, `extractFinishReason` reads a string or `{ unified, raw }` finish reason. A stream that closes without a finish chunk is recorded as `"interrupted"`. `dedupeToolApprovalResponses` keeps the first approval response per tool call. `finishReason` is omitted from the signed HMAC fields.
- Pass `apiKey`, `signingSecret`, and `contentHash.secret` explicitly from the environment. The SDK throws `SpurvikConfigError` when they are missing or invalid. It does not read those keys for you. `baseUrl` is required when `NODE_ENV` is production.
- `riskTier` is the caller's classification. Use `limited_art50` or `high_annex3` only when that is the classification you mean. Spurvik does not classify the use case.

The telemetry body carries fingerprints, model version, temperature, and latency. The ingestion route rejects prompt or output text. Do not `console.log` raw prompts or message arrays. Keyed fingerprints are designed to support pseudonymisation. They are not anonymisation. Do not name a storage region.

## 2. Art. 50(1) notice

A UI where a person interacts with an AI system should show a notice. Use `AIDisclosureLabel` from `@spurvik/react` with `notice="interaction"`. This repository does not ship a disclosure script and does not document a script URL.

Set `article50Disclosure` to true only when you state that a notice is shown. The flag is configuration, not a finding.

Do not claim the SDK marks content. Set `marking` only when you plug in your own Art. 50(2) marking hook. `verifyProvenanceSignature` shows whether the signed fields still match. It does not show that a mark is adequate under Art. 50(2).

## 3. Art. 12 and Art. 14 for high-risk AI systems

For a use classified as `high_annex3`:

- `enforceHaltOnInference` defaults to on. `oversight.cacheMs` and `oversight.pushInvalidation` are the halt-cache options.
- Call `requireHumanApproval(actionName, payload)` before a tool that moves money, changes permissions, deletes data, or sends an external message. The stored summary keeps field names and an optional fingerprint, not the values.
- `engageKillSwitch({ reason: "stop" })` and `releaseKillSwitch({ reason: "release the stop" })` need `reviewerToken`. If the release reason is missing or blank, the SDK sends "Released via SDK (no reason given)" before the request. A blank halt reason is sent as "Halted via SDK (no reason given)".

These methods are designed to support Art. 12 record-keeping and Art. 14 human oversight for high-risk AI systems. They are not a complete Art. 14 system. There is no currency threshold on `SpurvikConfig`.
