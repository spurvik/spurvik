# Mapping Tool Approvals & Interruptions to Spurvik's Human-Oversight Queue

> **Pre-release.** Describes human-oversight and tool-approval integration on `aegis-ai` `main` (`8e16fad`). `@spurvik/sdk` and `@spurvik/core` are private pre-release workspace packages (`0.1.0`) and are not published on npm. Public source: https://github.com/spurvik/spurvik. Plugin tree: https://github.com/spurvik/spurvik/tree/main/plugins/spurvik. Not legal advice.
>
> *Pre-release documentation (aegis-ai 8e16fad).*

Use this guide to connect tool-approval pauses from the **Vercel AI SDK** (`finishReason` / `rawFinishReason === "interrupted"` and `tool-approval-request`), **OpenAI Agents SDK** (`needsApproval` and `RunState` interruptions), and **LangGraph** (`interrupt()` and `Command({ resume })`) to Spurvik's human-oversight queue (`hitl_approvals` and `/dashboard/projects/<projectId>/oversight`). For a dedicated LangGraph walkthrough, see [`docs/langgraph-quickstart.md`](./langgraph-quickstart.md).

---

## SDK Method & Control-Plane Endpoint Map

`@spurvik/sdk` ships framework adapters plus blocking and non-blocking primitives for human-in-the-loop (HITL) decisions and project/action halts:

| Step | Shipped `@spurvik/sdk` / `@spurvik/core` API | Control-Plane Endpoint | Notes |
|---|---|---|---|
| **AI SDK finish-reason & approval deduplication** | `extractFinishReason`, `isInterruptedFinishReason`, `dedupeToolApprovalResponses` (`@spurvik/sdk/ai`) | `POST /api/v1/telemetry` | Reads string or `{ unified, raw }` finish reasons (`unified` wins), records `"interrupted"` on streams that close without a finish chunk, and keeps the first approval response per `toolCallId` / `approvalId` / `id`. |
| **OpenAI Agents `needsApproval` & `RunState` resolver** | `createSpurvikNeedsApproval`, `resolveAgentInterruptions` (`@spurvik/sdk/openai-agents`) | `POST /api/v1/hitl` then `GET /api/v1/hitl/:id` | Checks halt state before returning `true` (or `when` predicate), deduplicates `callId` items, polls `/api/v1/hitl`, and calls `state.approve(item)` or `state.reject(item)`. |
| **LangGraph graph wrapper & interrupt resolver** | `withSpurvikLangGraph`, `spurvikInterrupt`, `resolveLangGraphInterrupts` (`@spurvik/sdk/langgraph`) | `POST /api/v1/hitl` then `GET /api/v1/hitl/:id` | Marks `finishReason: "interrupted"` when `state.__interrupt__` is non-empty, deduplicates interrupt IDs (`skippedDuplicateIds`), and returns `command: { resume }` ready for `new Command(...)`. |
| **Request approval & wait** *(in-process poll)* | `spurvik.requireHumanApproval(actionName, payload, options?)` | `POST /api/v1/hitl` then `GET /api/v1/hitl/:id` | Summarises `payload` into `spurvik.payload_summary.v1` (key names + keyed HMAC fingerprint, never raw values) and polls until status leaves `"pending"` / `"pending_confirmation"` or throws `SpurvikHitlTimeoutError(approvalId)`. |
| **Open pending approval without blocking** *(for checkpointed pause/resume)* | `buildPayloadSummary({ keys, contentFingerprint })` (`@spurvik/core`) | `POST /api/v1/hitl` | Creates a `"pending"` row and returns `HitlRecordWire` (`{ id, status: "pending", ... }`) immediately so a graph or workflow can checkpoint and exit. |
| **Record human decision via API** | `spurvik.submitHumanDecision(approvalId, { status, reason })` / `spurvik.overrideHumanDecision(approvalId, { reason })` | `POST /api/v1/hitl/:id/decision` | Requires `reviewerToken` (`spurvik_reviewer_...` in `x-spurvik-reviewer`). `status` is `"approved" \| "rejected" \| "overridden"`; `reason` (`1..2000` chars) is required. Decisions made in the console set `decisionSource: "console"`; API calls set `decisionSource: "api"`. |
| **Check `hitl.decision` webhook** | `verifyHitlWebhook({ secret, body, signature, timestamp })` (`@spurvik/sdk`) | Outbound `POST` from control plane | Checks `x-spurvik-signature` (`v1=<hex>`) and `x-spurvik-timestamp` (`5`-minute window) and returns `HitlWebhookEnvelope` (`{ type: "hitl.decision", deliveryId, projectId, approval }`). |
| **Engage or release stop (kill switch)** | `spurvik.engageKillSwitch({ reason, actionName })` / `spurvik.releaseKillSwitch({ reason, actionName })` | `POST /api/v1/oversight` | Requires `reviewerToken`. Blank reasons default in the SDK to `"Halted via SDK (no reason given)"` / `"Released via SDK (no reason given)"` (`reasonSource: "sdk_default"`). Direct API calls without a `reason` return `400`. |

> **Looking for `requestHumanApproval`, `waitForHumanDecision`, or `recordHumanDecision`?**
> In `@spurvik/sdk`, requesting and waiting are combined in **`requireHumanApproval(actionName, payload, options?)`** (and wrapped by **`resolveAgentInterruptions`**, **`spurvikInterrupt`**, and **`resolveLangGraphInterrupts`**), while recording a reviewer decision via API is **`submitHumanDecision(approvalId, { status, reason })`** (or **`overrideHumanDecision(approvalId, { reason })`**). For non-blocking checkpoint workflows, post to `POST /api/v1/hitl` with `buildPayloadSummary` and resume from **`verifyHitlWebhook`**.

---

## 1. Vercel AI SDK (`interrupted` `finishReason` & `tool-approval-request`)

Wrap your language model with `spurvikMiddleware` (`@spurvik/sdk/ai`). `@spurvik/sdk/ai` exports `extractFinishReason`, `isInterruptedFinishReason`, and `dedupeToolApprovalResponses`. When a step stops for tool approval (`isInterruptedFinishReason(extractFinishReason(step.finishReason))`, `step.rawFinishReason === "interrupted"`, or `part.type === "tool-approval-request"` in `step.content`), route each pending tool call to `spurvikClient.requireHumanApproval` and deduplicate approval responses with `dedupeToolApprovalResponses`:

```ts
import { generateText, jsonSchema, tool, wrapLanguageModel, type LanguageModelV4 } from "ai";
import {
  dedupeToolApprovalResponses,
  extractFinishReason,
  isInterruptedFinishReason,
  provenanceFromMetadata,
  spurvikMiddleware,
} from "@spurvik/sdk/ai";
import { SpurvikClient, type SpurvikConfig } from "@spurvik/sdk";

declare const baseModel: LanguageModelV4;

const config: SpurvikConfig = {
  apiKey: process.env.SPURVIK_API_KEY!, // spurvik_live_...
  signingSecret: process.env.SPURVIK_SIGNING_SECRET!, // >= 16 chars
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
  baseUrl: process.env.SPURVIK_BASE_URL!,
  riskTier: "high_annex3", // Set your own classification (as provider or deployer)
  enforceHaltOnInference: true,
};

const spurvik = spurvikMiddleware(config);
const spurvikClient = new SpurvikClient(config);
const model = wrapLanguageModel({ model: baseModel, middleware: spurvik });

const step = await generateText({
  model,
  prompt: "Refund order ord_42 for 450 EUR",
  tools: {
    issue_refund: tool({
      description: "Issue a customer refund",
      inputSchema: jsonSchema<{ orderId: string; amountCents: number }>({
        type: "object",
        properties: {
          orderId: { type: "string" },
          amountCents: { type: "number" },
        },
        required: ["orderId", "amountCents"],
        additionalProperties: false,
      }),
    }),
  },
  toolApproval: {
    issue_refund: "user-approval",
  },
});

const receipt = provenanceFromMetadata(step.providerMetadata);
const finishReason = extractFinishReason({
  unified: step.finishReason,
  raw: step.rawFinishReason,
});
const approvalRequests = step.content.filter((part) => part.type === "tool-approval-request");

if (isInterruptedFinishReason(finishReason) || approvalRequests.length > 0) {
  const rawResponses = [];
  for (const req of approvalRequests) {
    const decision = await spurvikClient.requireHumanApproval(
      req.toolCall.toolName,
      req.toolCall.input,
    );
    const approved = decision.status === "approved" || decision.status === "overridden";
    rawResponses.push({
      toolCallId: req.toolCall.toolCallId,
      approvalId: decision.id,
      approved,
    });
    if (!approved) {
      throw new Error(`Action ${req.toolCall.toolName} rejected (${decision.id}).`);
    }
  }
  const approvalResponses = dedupeToolApprovalResponses(rawResponses);
  void approvalResponses;
}

await spurvik.flush();
```

---

## 2. OpenAI Agents SDK (`createSpurvikNeedsApproval` & `resolveAgentInterruptions`)

Wrap your `ModelProvider` with `withSpurvikModelProvider` (or a single `Model` with `withSpurvikModel`) from `@spurvik/sdk/openai-agents`. Use `createSpurvikNeedsApproval(config, { actionName })` on side-effecting tools (which runs the halt check before returning `true` or your `when` predicate). When `runner.run(agent, input)` pauses with `paused.interruptions`, call `resolveAgentInterruptions(paused.interruptions, config, { state: paused.state })` (or `modelProvider.resolveInterruptions(paused.interruptions, { state: paused.state })`) to deduplicate tool-call IDs, wait on `/api/v1/hitl`, and automatically call `state.approve(item)` or `state.reject(item)`:

```ts
import { Agent, Runner, tool, type ModelProvider } from "@openai/agents";
import type { SpurvikConfig } from "@spurvik/sdk";
import {
  createSpurvikNeedsApproval,
  resolveAgentInterruptions,
  withSpurvikModelProvider,
} from "@spurvik/sdk/openai-agents";

declare const baseProvider: ModelProvider;
declare const config: SpurvikConfig;

const modelProvider = withSpurvikModelProvider(baseProvider, config);
const runner = new Runner({ modelProvider });

const refundTool = tool({
  name: "issue_refund",
  description: "Issue a customer refund",
  parameters: {
    type: "object",
    properties: {
      orderId: { type: "string" },
      amountCents: { type: "number" },
    },
    required: ["orderId", "amountCents"],
    additionalProperties: false,
  } as const,
  needsApproval: createSpurvikNeedsApproval(config, { actionName: "issue_refund" }),
  async execute(input) {
    return `Refunded ${input.amountCents} cents for ${input.orderId}`;
  },
});

const agent = new Agent({
  name: "RefundAgent",
  model: "gpt-4.1-mini",
  instructions: "Handle customer refunds.",
  tools: [refundTool],
});

const paused = await runner.run(agent, "Refund order ord_42 for 450 EUR");

if (paused.interruptions.length > 0) {
  await resolveAgentInterruptions(paused.interruptions, config, {
    state: paused.state,
  });
}

const resumed = paused.interruptions.length > 0
  ? await runner.run(agent, paused.state)
  : paused;

await modelProvider.flush();
```

---

## 3. LangGraph (`@spurvik/sdk/langgraph` — `spurvikInterrupt`, `resolveLangGraphInterrupts`, and Webhook Resume)

In LangGraph, you can either use the `@spurvik/sdk/langgraph` helpers (`withSpurvikLangGraph`, `spurvikInterrupt`, and `resolveLangGraphInterrupts`) or checkpoint the thread with `interrupt()` and resume when Spurvik delivers the signed `hitl.decision` webhook. See [`docs/langgraph-quickstart.md`](./langgraph-quickstart.md) for the full LangGraph quickstart.

### Option A — In-process `spurvikInterrupt` and `resolveLangGraphInterrupts` (`@spurvik/sdk/langgraph`)

```ts
import type { SpurvikConfig } from "@spurvik/sdk";
import {
  provenanceFromLangGraphState,
  resolveLangGraphInterrupts,
  spurvikInterrupt,
  withSpurvikLangGraph,
} from "@spurvik/sdk/langgraph";

declare const config: SpurvikConfig;
declare const compiledGraph: {
  invoke: (input: {
    messages: Array<{ role: string; content: string }>;
  }) => Promise<{
    messages: Array<{ role: string; content: string }>;
    __interrupt__?: Array<{ id?: string; value?: { actionName?: string; payload?: Record<string, unknown> } }>;
  }>;
};

const graph = withSpurvikLangGraph(compiledGraph, config);
const state = await graph.invoke({
  messages: [{ role: "user", content: "Refund order ord_42 for 450 EUR" }],
});

// When state.__interrupt__ is non-empty, receipt.finishReason is "interrupted" (non-enumerable).
const receipt = provenanceFromLangGraphState(state);

if (state.__interrupt__ && state.__interrupt__.length > 0) {
  // Deduplicates interrupt IDs and returns resolved.command ({ resume }) ready for new Command(resolved.command)
  const resolved = await resolveLangGraphInterrupts(state.__interrupt__, config);
  void resolved.command;
}

// Or call spurvikInterrupt directly inside a node:
const nodeDecision = await spurvikInterrupt(
  {
    actionName: "issue_refund",
    callId: "call_ord_42",
    payload: { orderId: "ord_42", amountCents: 45_000 },
  },
  config,
);
void receipt;
void nodeDecision;
await graph.flush();
```

### Option B — Non-blocking checkpoint pause (`interrupt()`) + `hitl.decision` webhook resume (`verifyHitlWebhook`)

```ts
import {
  buildPayloadSummary,
  canonicalJson,
  fingerprintContent,
  type HitlRecordWire,
} from "@spurvik/core";
import { verifyHitlWebhook } from "@spurvik/sdk";

// Replace with: import { Command, interrupt } from "@langchain/langgraph";
declare function interrupt<TInput, TResume = HitlRecordWire>(value: TInput): TResume;
declare class Command<TResume = HitlRecordWire> {
  constructor(input: { resume: TResume });
}

// Step A — Inside your LangGraph node before executing a side-effect action:
export async function refundNode(state: { orderId: string; amountCents: number }) {
  const payloadSummary = buildPayloadSummary({
    keys: Object.keys(state).sort(),
    contentFingerprint: await fingerprintContent(
      "keyed",
      canonicalJson(state),
      process.env.SPURVIK_CONTENT_HASH_SECRET!,
    ),
  });

  const res = await fetch(`${process.env.SPURVIK_BASE_URL}/api/v1/hitl`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-spurvik-api-key": process.env.SPURVIK_API_KEY!,
    },
    body: JSON.stringify({ actionName: "issue_refund", payloadSummary }),
  });
  const { data: pending } = (await res.json()) as { data: HitlRecordWire };

  // Pauses the graph checkpoint until resumed with Command({ resume: envelope.approval })
  const decision = interrupt({
    approvalId: pending.id,
    actionName: pending.actionName,
    payloadSummary: pending.payloadSummary,
  });

  if (decision.status !== "approved" && decision.status !== "overridden") {
    throw new Error(`Refund ${pending.id} rejected by reviewer.`);
  }
  return { refundStatus: "executed", approvalId: decision.id };
}

// Step B — In your webhook route receiving Spurvik's POST ("hitl.decision"):
export async function handleSpurvikHitlWebhook(
  request: Request,
  resumeGraphThread: (approvalId: string, cmd: Command<HitlRecordWire>) => Promise<void>,
): Promise<Response> {
  const rawBody = await request.text();
  const envelope = await verifyHitlWebhook({
    secret: process.env.SPURVIK_WEBHOOK_SECRET!,
    body: rawBody,
    signature: request.headers.get("x-spurvik-signature"),
    timestamp: request.headers.get("x-spurvik-timestamp"),
  });

  await resumeGraphThread(
    envelope.approval.id,
    new Command({ resume: envelope.approval }),
  );
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
```

---

## Payload Hygiene & Audit Scope

- **No raw values in `payloadSummary`:** `POST /api/v1/hitl` accepts only a canonical `spurvik.payload_summary.v1` JSON string (`<= 500` characters, `<= 32` identifier-shaped keys matching `/^[A-Za-z_][A-Za-z0-9_]{0,63}$/`, plus a 64-character hex `contentFingerprint` or `null`). Requests containing raw prompt or output fields return `400 raw_content_rejected`. Do not place personal data inside key names.
- **Two-person confirmation (`pending_confirmation`):** On projects where `biometricIdentification` (`high_annex3`) or `twoPersonEmployment` (`annexEmployment`) is enabled, the first `approved` or `overridden` decision moves the row to `"pending_confirmation"`, and a second, different organisation member must confirm before `status` becomes `"approved"` or `"overridden"` (`409 same_reviewer` if the same user tries to confirm both steps). `requireHumanApproval` continues polling through `"pending_confirmation"` until the final status is stored.
- **What the record shows:** The oversight and audit record (`hitl_approvals`, `oversight_states`, and `audit_logs`) shows **what** happened (`actionName`, `payloadSummary`, `status`), **when** (`createdAt`, `decidedAt`), and **who** acted (`reviewerId`, `decisionSource: "console" | "api"`) — **never why** a decision, halt, or release occurred. It is designed to support, and does not replace, Article 14 human oversight for high-risk AI systems (Annex III applies from 2 December 2027).
