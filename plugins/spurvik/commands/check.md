---
description: Search the workspace for model clients that are not passed to withSpurvik or spurvikMiddleware, for logs that print prompt text, for AI UIs without an Art. 50 label, and for side-effect tools without a human-oversight call.
---

# `/spurvik:check`

Search the current workspace and report what you find. Do not invent a scanner package. Do not treat a finding as a legal conclusion. This is not legal advice.

## What to search for

1. **Model clients without `withSpurvik` or `spurvikMiddleware`.**
   Look for `new OpenAI`, `new Anthropic`, `new GoogleGenAI`, `@google/genai`, `openai.chat`, `openai.responses`, `anthropic.messages`, `.generateContent`, `generateText`, `streamText`, `wrapLanguageModel`, and `@langchain/langgraph` (`StateGraph`, `interrupt(`). A client is wrapped when that call is passed through `withSpurvik` (`@spurvik/sdk`) or when the language model is passed to `wrapLanguageModel` with `spurvikMiddleware` from `@spurvik/sdk/ai`. `generateText` and `streamText` are wrapped only through that middleware. A Mastra agent is wrapped when its model comes from `withSpurvikMastra` (`@spurvik/sdk/mastra`); read that receipt with `provenanceFromMetadata`. An OpenAI Agents model is wrapped when it comes from `withSpurvikModel` or `withSpurvikModelProvider` (`@spurvik/sdk/openai-agents`); read that receipt with `provenanceFromAgentsResponse`. A LangGraph graph is wrapped when it is passed to `withSpurvikLangGraph` (`@spurvik/sdk/langgraph`); read that receipt with `provenanceOf` or `provenanceFromLangGraphState`. A LangGraph `interrupt()` is wired to the oversight queue when it goes through `spurvikInterrupt` or `resolveLangGraphInterrupts`. An Agents tool `needsApproval` callback is `createSpurvikNeedsApproval`, and `RunResult.interruptions` go through `resolveAgentInterruptions`. Embeddings, image generation, speech, moderations, batches, and file uploads are not recorded by `withSpurvik`. Say so instead of flagging them as unwrapped chat calls.

2. **Application logs that print prompt or message text.**
   Look for `console.log`, `logger`, or a database insert that writes `prompt`, `messages`, or `input` text. The SDK telemetry body carries fingerprints, model version, temperature, and latency. The ingestion route rejects prompt or output text. Keyed HMAC-SHA-256 fingerprints are the default (`contentHash.mode` `"keyed"`). A fingerprint of text that relates to an identifiable person can still be personal data. Keyed mode is designed to support pseudonymisation under GDPR Art. 4(5). It is not anonymisation.

3. **User-facing AI interaction without an Art. 50(1) notice.**
   Look in chat UI, widgets, and HTML for a visible notice. In this repository the React label is `AIDisclosureLabel` from `@spurvik/react` (`notice="interaction"`). `AiDisclosure` and `AIArticle50Section3Notice` are the other exports:

```ts
import { AiDisclosure, AIArticle50Section3Notice, AIDisclosureLabel } from "spurvik/react";
```

This repository does not ship a disclosure script and does not document a script URL. `article50Disclosure: true` on `SpurvikConfig` only records that you state a notice is shown. It is not a finding that the notice is sufficient. Art. 50 transparency obligations, as stated in the repository README, apply from 2 August 2026.

4. **Side-effect tools without a human-oversight call, for high-risk AI systems.**
   Look at tool definitions that refund, transfer, charge, delete, terminate, approve, or send a message. The SDK methods are `requireHumanApproval`, `engageKillSwitch`, and `releaseKillSwitch` on the withSpurvik-wrapped client (`client._spurvik.*`) or a Spurvik client:

```ts
import OpenAI from "openai";
import { SpurvikClient, withSpurvik, type SpurvikConfig } from "@spurvik/sdk";

declare const config: SpurvikConfig;

const client = withSpurvik(new OpenAI(), config);
await client._spurvik.requireHumanApproval("send_message", { id: "m_1" });
await client._spurvik.engageKillSwitch({ reason: "stop", actionName: "send_message" });
await client._spurvik.releaseKillSwitch({ reason: "release", actionName: "send_message" });

const spurvik = new SpurvikClient(config);
await spurvik.requireHumanApproval("send_message", { id: "m_1" });
```

   For `high_annex3`, `enforceHaltOnInference` defaults to on, and `oversight.cacheMs` / `oversight.pushInvalidation` control the halt cache. Pass a reason to `releaseKillSwitch`. That is the recommended call. If the reason is missing or blank, the SDK sends "Released via SDK (no reason given)" before the request. A blank `engageKillSwitch` reason is sent as "Halted via SDK (no reason given)". The control plane does not fill in a reason. There is no currency threshold in `SpurvikConfig`. Art. 12 and Art. 14 are for high-risk AI systems. The repository README states that those articles apply to Annex III high-risk systems from 2 December 2027. The human-review queue is designed to support Art. 14. It is not a complete Art. 14 system. For OpenAI Agents, `createSpurvikNeedsApproval` and `resolveAgentInterruptions` (`@spurvik/sdk/openai-agents`) send tool approval into that queue. For LangGraph, `spurvikInterrupt` and `resolveLangGraphInterrupts` (`@spurvik/sdk/langgraph`) do the same and return a `command.resume` value. Duplicate tool-call ids are sent once.

Do not describe a storage region. The repository states that this tree does not claim that data stays in the EU.

## Output

- A short count of findings, grouped by file.
- A table: `File:Line` | `Art. 50`, `Art. 12 for high-risk AI systems`, or `Art. 14 for high-risk AI systems` | what you found | the change that matches `/spurvik:wrap`.
- Offer to apply those changes with `/spurvik:wrap`.

Do not present the table as evidence of conformity.
