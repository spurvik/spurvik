```ts
import { AIDisclosureLabel } from "@spurvik/react";
import { withSpurvik } from "@spurvik/sdk";
import { spurvikMiddleware } from "@spurvik/sdk/ai";
```

When writing or modifying model clients or agent tools:

1. Wrap OpenAI, Anthropic, and Google GenAI clients with `withSpurvik` from `@spurvik/sdk`. For the Vercel AI SDK, pass `spurvikMiddleware` from `@spurvik/sdk/ai` to `wrapLanguageModel`, and call `flush()` on that object. Pass `apiKey`, `signingSecret`, and `contentHash.secret` from the environment. The SDK throws when those values are missing. Do not log raw prompts. The telemetry body carries fingerprints, model version, temperature, and latency. The ingestion route rejects prompt or output text. This is designed to support Art. 12 record-keeping for high-risk AI systems.
2. Render an Art. 50(1) interaction notice with `AIDisclosureLabel` from `@spurvik/react`. Do not add a disclosure script URL. This repository does not ship one. The SDK does not mark content. A marking hook runs only when the caller sets `marking`.
3. For high-risk AI systems, call `requireHumanApproval` before a tool that moves money, changes permissions, deletes data, or sends an external message. `enforceHaltOnInference` and `oversight` are the halt options. `engageKillSwitch({ reason: "stop" })` and `releaseKillSwitch({ reason: "release the stop" })` need `reviewerToken`. If the release reason is missing or blank, the SDK sends "Released via SDK (no reason given)" before the request. A blank halt reason is sent as "Halted via SDK (no reason given)". This is designed to support Art. 14. It is not a complete Art. 14 system.

Claude Code does not load this file as session context. The skill `eu-ai-act-guardrails` carries the same rules.
