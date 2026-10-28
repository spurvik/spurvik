# FAQ — Human-Oversight Queue Mapping & Claude Code Plugin

> **.** Tested against `spurvik` `main` (`8e16fad`). Not legal advice. For legal questions, contact your counsel or `hello@spurvik.com`.
>
> *Source: https://github.com/spurvik/spurvik. npm: `spurvik@1.0.1`, `spurvik-sdk@1.0.1`, `spurvik-mcp-server@1.0.2`.*

---

## 16. How do I map Vercel AI SDK `interrupted` / `tool-approval-request`, OpenAI Agents `needsApproval`, and LangGraph `interrupt()` into Spurvik's human-oversight queue?

`@spurvik/sdk` provides framework-specific helpers alongside `requireHumanApproval(actionName, payload, options?)` for in-process waits, `submitHumanDecision(approvalId, { status, reason })` / `overrideHumanDecision(approvalId, { reason })` for API-driven reviewer decisions, and `verifyHitlWebhook({ secret, body, signature, timestamp })` for event-driven webhook resumes:

- **Vercel AI SDK (`@spurvik/sdk/ai`):** Wrap your model with `spurvikMiddleware(config)`. Use `extractFinishReason` and `isInterruptedFinishReason` to check for `"interrupted"` stops (`step.rawFinishReason === "interrupted"` or `step.content` parts with `part.type === "tool-approval-request"`), pass `req.toolCall.toolName` and `req.toolCall.input` to `await spurvikClient.requireHumanApproval(...)`, and deduplicate responses with `dedupeToolApprovalResponses`.
- **OpenAI Agents SDK (`@spurvik/sdk/openai-agents`):** Wrap your model or provider with `withSpurvikModel` or `withSpurvikModelProvider` and set `needsApproval: createSpurvikNeedsApproval(config, { actionName })` on side-effect tools. Pass `paused.interruptions` to `await resolveAgentInterruptions(paused.interruptions, config, { state: paused.state })` (which deduplicates `callId` items, polls `/api/v1/hitl`, and calls `state.approve` or `state.reject`), then resume with `await runner.run(agent, paused.state)`.
- **LangGraph (`@spurvik/sdk/langgraph`):** Wrap your compiled graph with `withSpurvikLangGraph(compiled, config)`. Either call `await spurvikInterrupt({ actionName, callId, payload, interrupt }, config)` inside a node, call `await resolveLangGraphInterrupts(state.__interrupt__, config)` outside the node (which deduplicates interrupt IDs and returns `resolved.command` for `new Command(resolved.command)`), or create a `"pending"` row via `POST /api/v1/hitl` using `buildPayloadSummary({ keys, contentFingerprint })`, pause the graph checkpoint with `interrupt({ approvalId, actionName, payloadSummary })`, and resume with `new Command({ resume: envelope.approval })` when `verifyHitlWebhook` receives the `hitl.decision` webhook.

See [Mapping Tool Approvals & Interruptions to Spurvik's Human-Oversight Queue](hitl-approval-mapping.md) and [LangGraph Quickstart](langgraph-quickstart.md) for copy-paste examples.

---

## 17. How do I pause a checkpointed agent without polling inside a serverless function, and resume when `hitl.decision` fires?

Instead of polling with `requireHumanApproval` inside a short-lived serverless handler:

1. **Create the pending row (`POST /api/v1/hitl`):** Build a canonical `spurvik.payload_summary.v1` string with `buildPayloadSummary({ keys, contentFingerprint })` (`@spurvik/core`) and `POST { actionName, payloadSummary }` with your `x-spurvik-api-key` (`spurvik_live_...`). The control plane returns `HitlRecordWire` with `status: "pending"` and an `id`.
2. **Checkpoint the agent:** Pass `{ approvalId: pending.id, actionName, payloadSummary }` into LangGraph's `interrupt(...)` (or persist OpenAI Agents' `paused.state` keyed by `pending.id`) and let the request exit.
3. **Resume from the `hitl.decision` webhook:** Register an HTTPS webhook endpoint in the console (`hitl.decision` event). When a reviewer decides in `/dashboard/projects/<projectId>/oversight` or via `submitHumanDecision`, Spurvik sends a signed `POST`. Check the payload with `verifyHitlWebhook({ secret, body, signature, timestamp })` (`@spurvik/sdk`), which checks `x-spurvik-signature` (`v1=<hex>`) and `x-spurvik-timestamp` (`5`-minute replay window) and returns `HitlWebhookEnvelope` (`envelope.approval`), then resume your thread (`new Command({ resume: envelope.approval })`).

---

## 18. What does Spurvik store on a human-oversight or `hitl.decision` record, and when does `pending_confirmation` appear?

- **Payload summary only (`spurvik.payload_summary.v1`):** `POST /api/v1/hitl` stores `payloadSummary` containing up to `32` top-level key names (`<= 500` characters total, matching `/^[A-Za-z_][A-Za-z0-9_]{0,63}$/`) and a 64-character hex `contentFingerprint` (or `null`). Raw prompt or output fields (`prompt`, `messages`, `input`, `output`, `completion`, `content`, `text`, `body`, `args`, `arguments`, `parameters`, `response`) are rejected with `400 raw_content_rejected`. Do not place personal data in key names.
- **Two-person confirmation (`pending_confirmation`):** On projects configured with `biometricIdentification: true` (`high_annex3`) or `twoPersonEmployment: true` (`annexEmployment`), the first `approved` or `overridden` decision moves the approval row to `status: "pending_confirmation"` (`firstReviewerId`, `firstDecisionAt`). A second, distinct organisation member must confirm before `status` becomes `"approved"` or `"overridden"` (`409 same_reviewer` if the same user attempts both steps).
- **What the audit record shows:** The oversight and audit record (`hitl_approvals`, `oversight_states`, and `audit_logs`) shows **what** happened (`actionName`, `payloadSummary`, `status`), **when** (`createdAt`, `decidedAt`), and **who** acted (`reviewerId`, `decisionSource: "console" | "api"`) — **never why** a decision, halt, or release occurred. It is designed to support, and does not replace, Article 14 human oversight for high-risk AI systems (Annex III applies from 2 December 2027).

---

## 19. Where is `/spurvik:dpo-pack` in the Claude Code plugin, and what does `/spurvik:engineering-summary` generate?

`/spurvik:dpo-pack` was renamed to **`/spurvik:engineering-summary`** in PR #6 (`plugins/spurvik/commands/engineering-summary.md` replaced `commands/dpo-pack.md`). The plugin provides three slash commands:

- `/spurvik:check` — scans the workspace for unwrapped model calls, logs that print prompt/message text, user-facing AI UIs without an Art. 50(1) notice, and side-effect tools without a human-oversight call.
- `/spurvik:wrap` — wraps model calls with `withSpurvik`, `spurvikMiddleware`, `withSpurvikMastra`, `withSpurvikModel`, `withSpurvikModelProvider`, or `withSpurvikLangGraph`, and adds `<AIDisclosureLabel />` where needed.
- `/spurvik:engineering-summary` *(formerly `/spurvik:dpo-pack`)* — writes `SPURVIK-ENGINEERING-SUMMARY.md` with four engineering sections (AI system inventory, Art. 50(1) notices, Art. 12 record-keeping for high-risk AI systems, and Art. 14 human oversight for high-risk AI systems). `SPURVIK-ENGINEERING-SUMMARY.md` is an engineering summary for your DPO or counsel; it is not evidence of conformity and it is not legal advice.

See [Spurvik Claude Code Plugin](claude-code-plugin.md) for full details.

---

## 20. How do I install the Spurvik Claude Code plugin via `.claude-plugin/marketplace.json` or `--plugin-dir`?

The public repository is live at https://github.com/spurvik/spurvik (MIT). npm packages are live at `spurvik@1.0.1`, `spurvik-sdk@1.0.1`, and `spurvik-mcp-server@1.0.2`. Clone `https://github.com/spurvik/spurvik.git` and use either local method:

```bash
git clone https://github.com/spurvik/spurvik.git spurvik
```

1. **Option 1 — local marketplace catalog (`.claude-plugin/marketplace.json` in the repo root):**
   ```text
   /plugin marketplace add /path/to/spurvik
   /plugin install spurvik@spurvik-marketplace
   ```
2. **Option 2 — single-session flag (`--plugin-dir`):**
   ```bash
   claude --plugin-dir /path/to/spurvik/plugins/spurvik
   ```

The repository also includes `docs/distribution/spurvik-com-marketplace.json` (`name: "spurvik-marketplace"`, `source: "git-subdir"`, `path: "plugins/spurvik"`, `ref: "main"`, `version: "1.0.2"`) staged for `https://spurvik.com/.claude-plugin/marketplace.json`. Serve that file when the website catalog should install `plugins/spurvik`. Until it is served, use the local clone above.
