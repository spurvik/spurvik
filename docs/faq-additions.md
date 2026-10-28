# FAQ additions

> **.** Answers describe the  build (`spurvik` main at `427ae53`, which includes PR #3, PR #4, PR #7, PR #8, PR #9, PR #11, PR #19, PR #20 and PR #21) and the spurvik.com pricing section as fetched on 25 Oct 2026. Not legal advice.
>
> *Source: https://github.com/spurvik/spurvik. npm: `spurvik@1.0.1`, `spurvik-sdk@1.0.1`, `spurvik-mcp-server@1.0.2`.*

## Pricing

### What does Spurvik cost?

B2B subscription pricing, excl. VAT (ekskl. moms), B2B only. Spurvik is for businesses only (B2B).

| Plan | Price | Monthly `model_call` quota per project |
| --- | --- | --- |
| Free | €0 per month | `10,000` / UTC month |
| Pro | €19 per month, or €190 per year | `250,000` / UTC month |
| Team | €79 per month, or €790 per year | `2,000,000` / UTC month |
| Enterprise | from €499 per month | Custom (`0..2,000,000,000`) or `unlimited` |

Current prices are on [spurvik.com/#pricing](https://spurvik.com/#pricing).

### Can I change my plan in the console?

No. The console does not change plans. Its settings page says: "This console does not change an organisation's plan." Write to us to change plans.

## What is not available yet

### Can I install the SDK from npm?

Yes. The public MIT packages are `spurvik@1.0.1` and `spurvik-sdk@1.0.1`, and the local stdio MCP server is `spurvik-mcp-server@1.0.2`. Source is https://github.com/spurvik/spurvik. Inside this monorepo, `@spurvik/sdk`, `@spurvik/core`, and `@spurvik/react` use workspace version `1.0.1`. See the [5-minute quickstart](5-minute-quickstart.md).

### Are there ready-made recipes for Lovable, Replit and v0?

There are starters for Lovable, Replit, v0 and a Next.js app in the repository's `templates/` folder, plus zero-dependency `shadcn` registry starters at `https://spurvik.com/r/eu-ai-act.json` and `https://console.spurvik.com/r/eu-ai-act.json`. The full repository templates depend on the workspace packages at `1.0.1` (`workspace:*`), so they build inside the repository. The public npm release is `spurvik@1.0.1` and `spurvik-sdk@1.0.1`.

### Is there a hosted Spurvik service or dashboard?

The SDK has no hosted address built in: your code passes `baseUrl` explicitly. You can run the control plane and its console (`apps/web`) yourself (for example on `http://127.0.0.1:43123`), inspect the open visual sandbox at [console.spurvik.com/sandbox](https://console.spurvik.com/sandbox) (EU `fra1`, no login required), or connect to an invited organisation on `https://console.spurvik.com`. See the [Console Onboarding Guide](console-onboarding.md).

### Is there an MCP server?

Yes, in two forms:

- **Local stdio server:** Published on npm as `spurvik-mcp-server@1.0.2` (MIT). The workspace package `@spurvik/mcp` stays at `1.0.2` in this monorepo and is bundled inside the Claude Code plugin (`.mcp.json` runs `node ${CLAUDE_PLUGIN_ROOT}/bin/spurvik-mcp.mjs --root ${CLAUDE_PROJECT_DIR}`). Its four read-only tools (`spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, `spurvik_marking_hooks`) run locally and do not call any network. `spurvik_explain_receipt` checks the receipt's HMAC locally when you pass `signingSecret` to the tool or set `SPURVIK_SIGNING_SECRET` in the server's environment (a passed secret takes precedence).
- **Stateless HTTP JSON-RPC endpoint (`/api/mcp`):** Exposed by `apps/web` (and live at `https://console.spurvik.com/api/mcp`, discovery manifest at `https://spurvik.com/.well-known/mcp.json`) with the same four read-only tools.

## Marking and Article 50

### Does Spurvik mark AI-generated content?

No. Spurvik records your AI calls with HMAC-SHA-256 receipts and offers hooks where you add your own AI notice and your own marking. Its provenance record supports, but does not replace, Article 50(2) machine-readable marking.

### What does a matching signature tell me?

A match shows the signed fields still match the HMAC-SHA-256 signature made with your signing secret. It does not show that a notice was shown, that output is marked, or that your system meets the Act.

### When does Article 50 apply?

Article 50 transparency obligations apply from 2 August 2026. For generative systems placed on the market before 2 August 2026, Article 50(2) applies from 2 December 2026 (Art. 111(4)). Article 50 does not require logging. Please check these dates with your own counsel.

### Who can halt an AI action or decide on a review?

Any organisation member can halt or decide in the console. Deciding through the API needs a reviewer token (`spurvik_reviewer_...`), which only an organisation owner can issue. You choose who in your organisation does human oversight (Art. 26(2), for high-risk AI systems).

### Does using Spurvik make my system meet the EU AI Act?

No. Spurvik is software designed to support parts of your own work under the Act, such as AI notices and, for high-risk AI systems, record-keeping and human oversight. Whether and how the Act applies to you is a legal question for your own counsel. We cannot give legal advice.

## Console Onboarding and 5-Minute Quickstart

### 1. Can I try the console without an invite code, and why does `/signup` say "No organisation and no project yet"?

Yes — open [console.spurvik.com/sandbox](https://console.spurvik.com/sandbox) (EU `fra1`) to inspect the interactive Hash-Chain Diagram, Oversight Gate Diagram, and Obligations Radar with no login or invite code.

On `https://console.spurvik.com/signup`, account creation is gated by `SPURVIK_INVITE_CODE` and creates a console login (`users` row and `spurvik_session` cookie) only — it does not create an organisation or starter project. You get an organisation, project, and `spurvik_live_` key in one of two ways:

1. **Hosted console (`/invites`):** An existing organisation `owner` or `admin` invites you from `/dashboard/projects/<projectId>` (**Team -> Invite a member**) and shares a one-time `spurvik_invite_...` token to claim at `https://console.spurvik.com/invites`. Once you are an `owner` of an organisation, create a project on `/dashboard/projects` and mint a `spurvik_live_` key on the project page.
2. **Local control plane (`pnpm db:seed`):** Running `pnpm db:migrate && pnpm db:seed` in `spurvik` creates a local `Demo Organization`, `owner` login, `Demo Project`, and prints a ready-to-use `spurvik_live_` key. See the [5-minute quickstart](5-minute-quickstart.md) and [Console Onboarding Guide](console-onboarding.md).

### 2. What is the difference between `spurvik_live_`, `spurvik_pub_`, `spurvik_reviewer_`, and `spurvik_invite_` tokens?

Each prefix is scoped to a specific surface, shown once when created, and stored on the server only as a SHA-256 hex digest:

| Prefix | Issued by | Used for |
|---|---|---|
| `spurvik_live_` | `owner` (**Keys -> Create or rotate live key** or `pnpm db:seed`) | Server-side SDK calls to `POST /api/v1/telemetry`, `GET/POST /api/v1/oversight`, `GET/POST /api/v1/hitl`, and `POST /api/v1/disclosure`. |
| `spurvik_pub_` | `owner` (**Keys -> Create disclosure key** or `pnpm db:seed`) | Browser-side `<AIDisclosureLabel />` opt-in beacon (`POST /api/v1/disclosure` only; rejected by telemetry, oversight, and HITL endpoints). |
| `spurvik_reviewer_` | `owner` (**Reviewer token -> Issue reviewer token** or `pnpm db:seed`) | Sent in the `x-spurvik-reviewer` header (`reviewerToken` in `SpurvikConfig`) alongside a `spurvik_live_` key when calling `engageKillSwitch`, `releaseKillSwitch`, or `submitHumanDecision` via the API. |
| `spurvik_invite_` | `owner` or `admin` (**Team -> Invite a member**) | One-time organisation invite token (valid for 7 days), claimed at `/invites`. |

### 3. Why did `pnpm dev` fail with `SPURVIK_WEBHOOK_KEK must be 32 bytes` or `POST /api/v1/telemetry` return `500` after I edited `apps/web/.env`?

Before starting Next.js, `apps/web/src/scripts/refuse-missing-keys.ts` loads `apps/web/.env` using `@next/env`, which **never overwrites environment variables that are already exported in your shell (`process.env`)**. If `SPURVIK_WEBHOOK_KEK`, `SPURVIK_LOG_CHECKPOINT_SECRET`, or `DATABASE_URL` is already set in your terminal from an earlier command or test run, clear those shell variables before starting the server:

```bash
unset DATABASE_URL SPURVIK_SESSION_SECRET SPURVIK_LOG_CHECKPOINT_SECRET SPURVIK_WEBHOOK_KEK SPURVIK_ALLOW_TEST_KEYS
pnpm dev
```

### 4. How do team invites and organisation roles (`owner`, `admin`, `reviewer`, `member`) work?

Membership (`organization_members`) is organisation-wide and supports four roles:

- **`owner`:** Full control over projects, API keys, per-project HMAC keys, reviewer tokens, retention, Enterprise monthly quotas, webhooks, SIEM export, project data deletion, and all team roles (including `owner`). Every organisation must keep at least one `owner` (`"The last owner stays an owner."`).
- **`admin`:** Can invite `admin`, `reviewer`, and `member` users, change their roles, remove them, and revoke their pending invites, but cannot assign or modify the `owner` role (`"Only an owner can assign or change the owner role."`).
- **`reviewer` and `member`:** Can view project dashboards, audit logs, and HITL queues, record oversight halts/releases and HITL decisions in the console, and revoke their own `spurvik_reviewer_` token, but cannot modify team members or project settings.

Invite tokens (`spurvik_invite_...`) expire after **7 days**. Claiming an invite at `/invites` creates a user account if the email is new, or requires signing in with that exact email first if an account already exists. `/invites` is rate-limited to `10` attempts per window.

### 5. If we remove a team member or redact their email for a data-erasure request, does the member audit hash chain break?

No. Every invite, acceptance, role change, removal, and invite revocation is appended to `audit_events` (`kind: "member_audit"`) with a per-project `seq`, `prev_hash`, and `record_hash`. While `subject_email` is stored on the row for console inspection and export, **`subject_email` is excluded from `sealMemberAudit`**. Calling `redactMemberPersonalData` (or running `purgeExpiredAuditLogs`) sets `subject_email = null` and deletes expired or revoked `project_invites` rows while `verifyMemberAuditChain` continues to pass.

### 6. What counts toward my monthly event quota, and what happens when a batch exceeds the limit?

Monthly quotas (`MONTHLY_EVENT_QUOTA`, per project per UTC calendar month) count **only newly inserted `audit_logs` rows with `record_kind = 'model_call'`** based on the server ingestion timestamp (`created_at`, not the client `timestamp`):

- **Free / Developer:** `10,000` `model_call` events / UTC month (30-day default retention)
- **Pro:** `250,000` `model_call` events / UTC month (90-day default retention; planned price €19/mo or €190/yr, excl. VAT)
- **Team / Business:** `2,000,000` `model_call` events / UTC month (90-day default retention on Team, 365-day on Business; planned Team price €79/mo or €790/yr, excl. VAT)
- **Enterprise:** Custom per-project cap (`0..2,000,000,000`) or `unlimited` (`null`), configurable by an `owner` under **Monthly events** (planned price from €499/mo, excl. VAT)

*(B2B subscription pricing, excl. VAT (ekskl. moms), B2B only.)*

Duplicate `eventId`s (`duplicates`), `chain_gap` rows, `human_decision` rows, `oversight` rows, and `member_audit` events do not increment the counter. Every `POST /api/v1/telemetry` response that reaches quota evaluation includes `x-spurvik-monthly-quota-limit`, `x-spurvik-monthly-quota-remaining`, and `x-spurvik-monthly-quota-reset`. If `used + incoming > quota`, the entire batch is rejected (0 rows from that request are written) and the endpoint returns HTTP `429` with `{ "error": "monthly_quota_exceeded", "plan", "quota", "used", "resetAt" }`.

### 7. Which webhook events does Spurvik send, and how do I check the webhook HMAC signature?

When an `owner` saves an `https://` endpoint URL under **HITL webhook** on `/dashboard/projects/<projectId>`, the server generates a signing secret (shown once and stored encrypted at rest with AES-256-GCM under `SPURVIK_WEBHOOK_KEK`), blocks private/loopback/link-local targets via URL + DNS checks, and delivers up to 3 attempts (5-second timeout per attempt, no redirects followed) for:

1. **`hitl.decision`** (all plans): `{ type: "hitl.decision", deliveryId, projectId, approval }`
2. **`oversight.changed`** (all plans): `{ type: "oversight.changed", deliveryId, projectId, epoch, state }`
3. **`telemetry.ingested`** (`team`, `business`, and `enterprise` plans when **Telemetry export** `siemExportEnabled` is enabled): `{ type: "telemetry.ingested", deliveryId, projectId, inserted, duplicates, eventIds }` (counts and `eventId`s only, never prompt or output text)

Every request carries `x-spurvik-timestamp` (Unix seconds) and `x-spurvik-signature: v1=<hex>` (`HMAC-SHA256(secret, "${timestamp}.${rawBody}")`), plus `x-spurvik-signature-256: t=<timestamp>,v1=<hex>` on `telemetry.ingested`. Check signatures with `verifyWebhookSignature` from `@spurvik/core` or `verifyHitlWebhook` from `@spurvik/sdk`.

### 8. Why do `state.reason` and `state.previousReason` differ between a release response/webhook and a later `GET /api/v1/oversight`?

- **On a halt (`op: "halt"`):** `state.reason` is the halt reason (defaulting to `"Halted via SDK (no reason given)"` when `engageKillSwitch()` is called without a reason) and `state.previousReason` is `null`.
- **On a release (`op: "release"`):** Both the `POST /api/v1/oversight` response and the `oversight.changed` webhook payload return `state.reason` set to the release reason just recorded (defaulting to `"Released via SDK (no reason given)"` when `releaseKillSwitch()` is called without a reason) and `state.previousReason` set to the halt reason that was previously active.
- **On a subsequent `GET /api/v1/oversight`:** The control row (`oversight_controls`) keeps the last halt reason in `reason` while `projectHalted` / `actionHalted` is `false`, and returns `previousReason: null`. Both the halt and release are recorded separately in `oversight_halts`, `oversight_releases` (with `reason_source: "caller" | "sdk_default"`), and `audit_logs` (`record_kind = 'oversight'`).

The oversight and audit record shows what happened, when, and who acted — never an independent finding of why the halt or release occurred.

### 9. Does `<AIDisclosureLabel />` send network requests or touch `sessionStorage` by default?

No. By default, `<AIDisclosureLabel />` in `@spurvik/react` is purely a local React component (`<aside role="note" lang={locale} aria-describedby={noteId} data-aegis-disclosure={notice}>`) with built-in copy in all 24 EU languages (`locale`), `"block"` and `"inline"` presentations (`presentation`), optional `<EuMark />` icon (`euIcon`), and anti-hiding CSS rules (`display: "inline-flex"`, `visibility: "visible"`, `opacity: 1`, and non-transparent text color).

Even if you pass the `beacon` prop, `sendDisclosureBeacon` checks `beacon.consent === true` first. Unless `beacon.consent === true`, it returns immediately without reading or writing `sessionStorage` and without sending `POST /api/v1/disclosure`.

### 10. What is the difference between `@spurvik/react` `<AIDisclosureLabel />` and the `shadcn` registry components at `/r/eu-ai-act.json`?

- **`@spurvik/react` (`packages/react` in `spurvik`):** Full component library exporting `<AIDisclosureLabel />` (5 `notice` kinds, 24 EU locales + `registerDisclosureLocale`, `"block" | "inline"` presentation, `euIcon`, anti-hiding styles, opt-in `beacon`), `<AIArticle50Section3Notice />`, `<AIDisclosureDetails />`, and `<EuMark />`.
- **`https://spurvik.com/r/eu-ai-act.json` (`pnpm dlx shadcn@latest add https://spurvik.com/r/eu-ai-act.json`):** Zero-dependency starter that copies `components/spurvik-ai-disclosure-label.tsx` (`{ model?, receipt?, label?, className? }`) and a sample `app/api/chat/route.ts` into your project.
- **`https://console.spurvik.com/r/eu-ai-act.json` (`pnpm dlx shadcn@latest add https://console.spurvik.com/r/eu-ai-act.json`):** Zero-dependency starter that copies `components/spurvik/ai-disclosure-badge.tsx` (`AiDisclosureBadge` with `{ systemName? }`) and `hooks/use-spurvik-receipt.ts` (`useSpurvikReceipt`, `readReceipt`) into your project.

---

## Interactive 2x2 Sandbox Cockpit (`console.spurvik.com/sandbox`) and Local Environment

### 11. Does the `console.spurvik.com/sandbox` 2x2 cockpit make network calls when I scan my app URL or click `Fire Test AI Call`, and does it set cookies?

No. The public 2x2 cockpit at `https://console.spurvik.com/sandbox` (and `https://console.spurvik.com/`, hosted in EU `fra1`) sets **zero cookies before sign-in** and runs all sandbox interactions in browser state:

- **`Stack Scanner` (`Paste App URL...` + `Scan`):** Parses the hostname locally in your browser (`new URL(...)`), updates the active domain pill in the top bar (capped at `28` characters), and selects the matching preset (`Lovable SaaS`, `Stripe Refund Agent`, or `AI Support Bot`) if the hostname contains `lovable`, `stripe`, or `support`. It never crawls or sends an HTTP request to the URL you enter.
- **`Fire Test AI Call` and `Human Gate` buttons (`Approve (€450)`, `Block Agent`, `Kill Switch`):** Prepend simulated hash-chain blocks (`#1043`, `#1044`, …) in browser memory so you can inspect how `raw_prompt: 0B`, `prev_hash`, `record_hash`, and `hmac` link together without an API key or invite code. See [First 5 Minutes in `console.spurvik.com/sandbox`](./sandbox-first-5-minutes.md).

### 12. How do the `Human Gate (Art. 14)` controls (`Approve (€450)`, `Block Agent`, `Kill Switch`, `Reset`) in the sandbox map to SDK and API calls in production?

Card 2 (`Human Gate · Art. 14`) previews two production mechanisms side by side:

- **Per-action human review (`Approve (€450)` and `Block Agent`):** In `@spurvik/sdk`, calling `await ai._spurvik.requireHumanApproval(actionName, payload)` sends `POST /api/v1/hitl`, which creates a `pending` row (or `pending_confirmation` when two-person confirmation is enabled on the project) and polls until a reviewer decides in `/dashboard/projects/<projectId>/oversight` or calls `submitHumanDecision(id, { status: "approved" | "rejected" | "overridden", reason })` with a `spurvik_reviewer_...` token.
- **Project or action stop (`Kill Switch` and `Reset`):** Calling `await ai._spurvik.engageKillSwitch({ reason, actionName })` or `await ai._spurvik.releaseKillSwitch({ reason, actionName })` (or clicking **Engage stop** / **Release stop** on `/dashboard/projects/<projectId>/oversight`) toggles the stop checked before every `high_annex3` call (`GET /api/v1/oversight` -> `PROCEED` vs. `HALT`, throwing `SpurvikHaltedError` while active).
- **Audit scope:** Both in the sandbox (`#1043 · hitl.decision`) and in production (`audit_logs` / `oversight_states`), the oversight and audit record shows what happened, when, and who acted — never why.

### 13. How do I move from `Badge Studio (Art. 50)` (`Open in v0`, `Copy Lovable/Replit Prompt`, `Copy MCP URL`) to my own codebase?

Card 1 (`Badge Studio · Art. 50`) gives you three copy-paste bridges into your repository:

1. **Install the disclosure badge via `shadcn` or `@spurvik/react`:**
   - Run `pnpm dlx shadcn@latest add https://spurvik.com/r/eu-ai-act.json` (installs `components/spurvik-ai-disclosure-label.tsx` and a sample `app/api/chat/route.ts` with `PROCEED` / `ASK_HUMAN` / `HALT` gate evaluation) or `pnpm dlx shadcn@latest add https://console.spurvik.com/r/eu-ai-act.json` (the registry opened by **`Open in v0`**, which installs `components/spurvik/ai-disclosure-badge.tsx` and `hooks/use-spurvik-receipt.ts`).
   - Or import `<AIDisclosureLabel />` from `@spurvik/react` and pass the same `backgroundColor`, `textColor`, `borderColor`, and `accentColor` props shown by the `Emerald Glass`, `Cyan Minimal`, and `Floating Pill` presets.
   - If your system generates synthetic content (`Media Gen · Art. 50(2)`), remember that Spurvik's provenance record supports, but does not replace, Article 50(2) machine-readable marking.
2. **Connect the hosted Streamable HTTP MCP server (`https://console.spurvik.com/api/mcp`):**
   - Click **`Copy MCP URL`** (or **`Copy Lovable/Replit Prompt`**) to connect your agent or IDE to `https://console.spurvik.com/api/mcp`. It exposes four read-only, zero-auth tools: `spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, and `spurvik_marking_hooks`.
   - Over HTTP, `spurvik_find_unwrapped_calls` scans inline `code` or `files` payloads (up to `128 KB`) because it cannot read your local disk; to scan a local directory, run the stdio `@spurvik/mcp` server or `/spurvik:check`.
3. **Mint a `spurvik_live_...` key:** Follow the [5-Minute Quickstart](./5-minute-quickstart.md) to run `pnpm db:seed` locally or claim an organisation `spurvik_invite_...` token at `https://console.spurvik.com/invites`.

### 14. What does the Readiness Ring (`40% Free` → `70%` → `100% Pro €19/mo`) in the top bar calculate?

The Readiness Ring (`data-testid="readiness-ring"`) is a live UI indicator of which controls you have toggled on inside the sandbox cockpit (`readiness()` in `apps/web/src/components/obligations/radar.tsx`):

- **`40% Free`:** Shown when the `With Spurvik` switch in Card 1 is toggled off (`Without Spurvik`).
- **`55%` to `70%`:** Starts at `55%` when `With Spurvik` is on, adding `+5%` for each active toggle in Card 4 (`User Chat · Art. 50(1)`, `Media Gen · Art. 50(2)`, `High-Risk Actions · Art. 12/14` → `70%` when all three are on). Recording a `Human Gate` decision adds `+4%`, and clicking `Fire Test AI Call` adds `+4%` (capped at `75%` when fewer than three toggles are on).
- **`100% Pro €19/mo`:** Shown when you click **`Preview Pro`** in Card 4, or when all three obligation toggles are on and you trigger a `Human Gate` decision (which also appends a receipt block).
- The ring previews feature coverage inside the sandbox UI (with planned tier pricing at launch: Free `€0/mo`, Pro `€19/mo` or `€190/yr`, Team `€79/mo` or `€790/yr`, Enterprise from `€499/mo`; B2B subscription pricing, excl. VAT (ekskl. moms), B2B only.). It is not a legal assessment or a measure of whether your system meets the EU AI Act.

### 15. Why does `pnpm dev`, `pnpm db:migrate`, or `pnpm db:seed` fail with `SPURVIK_WEBHOOK_KEK must be 32 bytes` or `500 Internal Server Error` even after I fixed `apps/web/.env`?

Neither environment loader in `apps/web` overwrites variables that are already exported in your terminal shell (`process.env`):

- Before `next dev` or `next start` launches, `apps/web/src/scripts/refuse-missing-keys.ts` calls `loadEnvConfig` from `@next/env` and checks `SPURVIK_LOG_CHECKPOINT_SECRET` and `SPURVIK_WEBHOOK_KEK` (`apps/web/src/server/required-keys.ts`).
- Before `pnpm db:migrate`, `pnpm db:seed`, or `pnpm purge-logs` runs, `apps/web/src/db/load-env.ts` loads `apps/web/.env` with `if (key && process.env[key] === undefined) process.env[key] = value`.
- In addition, `readSpurvikEnv` (`packages/core/src/env.ts`) reads `process.env.SPURVIK_<NAME>` first and falls back to legacy `process.env.AEGIS_<NAME>`.

If an earlier command in your terminal exported a placeholder `SPURVIK_WEBHOOK_KEK` or a stale `DATABASE_URL`, `apps/web/.env` is ignored for those keys — causing `refuse-missing-keys.ts` to exit with `SPURVIK_WEBHOOK_KEK must be 32 bytes (base64url, hex, or 32-byte utf8).` or causing `POST /api/v1/telemetry` to return `500 Internal Server Error`.

Check and clear stale shell variables before starting `pnpm db:migrate`, `pnpm db:seed`, or `pnpm dev`:

```bash
env | grep -E '^(SPURVIK_|AEGIS_|DATABASE_URL=)'
unset SPURVIK_WEBHOOK_KEK DATABASE_URL SPURVIK_SESSION_SECRET SPURVIK_SIGNING_SECRET SPURVIK_LOG_CHECKPOINT_SECRET SPURVIK_ALLOW_TEST_KEYS
```

---

## Human-Oversight Queue Mapping & Claude Code Plugin

### 16. How do I map Vercel AI SDK `interrupted` / `tool-approval-request`, OpenAI Agents `needsApproval`, and LangGraph `interrupt()` into Spurvik's human-oversight queue?

`@spurvik/sdk` provides framework-specific helpers alongside `requireHumanApproval(actionName, payload, options?)` for in-process waits, `submitHumanDecision(approvalId, { status, reason })` / `overrideHumanDecision(approvalId, { reason })` for API-driven reviewer decisions, and `verifyHitlWebhook({ secret, body, signature, timestamp })` for event-driven webhook resumes:

- **Vercel AI SDK (`@spurvik/sdk/ai`):** Wrap your model with `spurvikMiddleware(config)`. Use `extractFinishReason` and `isInterruptedFinishReason` to check for `"interrupted"` stops (`step.rawFinishReason === "interrupted"` or `step.content` parts with `part.type === "tool-approval-request"`), pass `req.toolCall.toolName` and `req.toolCall.input` to `await spurvikClient.requireHumanApproval(...)`, and deduplicate responses with `dedupeToolApprovalResponses`.
- **OpenAI Agents SDK (`@spurvik/sdk/openai-agents`):** Wrap your model or provider with `withSpurvikModel` or `withSpurvikModelProvider` and set `needsApproval: createSpurvikNeedsApproval(config, { actionName })` on side-effect tools. Pass `paused.interruptions` to `await resolveAgentInterruptions(paused.interruptions, config, { state: paused.state })` (which deduplicates `callId` items, polls `/api/v1/hitl`, and calls `state.approve` or `state.reject`), then resume with `await runner.run(agent, paused.state)`.
- **LangGraph (`@spurvik/sdk/langgraph`):** Wrap your compiled graph with `withSpurvikLangGraph(compiled, config)`. Either call `await spurvikInterrupt({ actionName, callId, payload, interrupt }, config)` inside a node, call `await resolveLangGraphInterrupts(state.__interrupt__, config)` outside the node (which deduplicates interrupt IDs and returns `resolved.command` for `new Command(resolved.command)`), or create a `"pending"` row via `POST /api/v1/hitl` using `buildPayloadSummary({ keys, contentFingerprint })`, pause the graph checkpoint with `interrupt({ approvalId, actionName, payloadSummary })`, and resume with `new Command({ resume: envelope.approval })` when `verifyHitlWebhook` receives the `hitl.decision` webhook.

See [Mapping Tool Approvals & Interruptions to Spurvik's Human-Oversight Queue](hitl-approval-mapping.md) and [LangGraph Quickstart](langgraph-quickstart.md) for copy-paste examples.


### 17. How do I pause a checkpointed agent without polling inside a serverless function, and resume when `hitl.decision` fires?

Instead of polling with `requireHumanApproval` inside a short-lived serverless handler:

1. **Create the pending row (`POST /api/v1/hitl`):** Build a canonical `spurvik.payload_summary.v1` string with `buildPayloadSummary({ keys, contentFingerprint })` (`@spurvik/core`) and `POST { actionName, payloadSummary }` with your `x-spurvik-api-key` (`spurvik_live_...`). The control plane returns `HitlRecordWire` with `status: "pending"` and an `id`.
2. **Checkpoint the agent:** Pass `{ approvalId: pending.id, actionName, payloadSummary }` into LangGraph's `interrupt(...)` (or persist OpenAI Agents' `paused.state` keyed by `pending.id`) and let the request exit.
3. **Resume from the `hitl.decision` webhook:** Register an HTTPS webhook endpoint in the console (`hitl.decision` event). When a reviewer decides in `/dashboard/projects/<projectId>/oversight` or via `submitHumanDecision`, Spurvik sends a signed `POST`. Check the payload with `verifyHitlWebhook({ secret, body, signature, timestamp })` (`@spurvik/sdk`), which checks `x-spurvik-signature` (`v1=<hex>`) and `x-spurvik-timestamp` (`5`-minute replay window) and returns `HitlWebhookEnvelope` (`envelope.approval`), then resume your thread (`new Command({ resume: envelope.approval })`).


### 18. What does Spurvik store on a human-oversight or `hitl.decision` record, and when does `pending_confirmation` appear?

- **Payload summary only (`spurvik.payload_summary.v1`):** `POST /api/v1/hitl` stores `payloadSummary` containing up to `32` top-level key names (`<= 500` characters total, matching `/^[A-Za-z_][A-Za-z0-9_]{0,63}$/`) and a 64-character hex `contentFingerprint` (or `null`). Raw prompt or output fields (`prompt`, `messages`, `input`, `output`, `completion`, `content`, `text`, `body`, `args`, `arguments`, `parameters`, `response`) are rejected with `400 raw_content_rejected`. Do not place personal data in key names.
- **Two-person confirmation (`pending_confirmation`):** On projects configured with `biometricIdentification: true` (`high_annex3`) or `twoPersonEmployment: true` (`annexEmployment`), the first `approved` or `overridden` decision moves the approval row to `status: "pending_confirmation"` (`firstReviewerId`, `firstDecisionAt`). A second, distinct organisation member must confirm before `status` becomes `"approved"` or `"overridden"` (`409 same_reviewer` if the same user attempts both steps).
- **What the audit record shows:** The oversight and audit record (`hitl_approvals`, `oversight_states`, and `audit_logs`) shows **what** happened (`actionName`, `payloadSummary`, `status`), **when** (`createdAt`, `decidedAt`), and **who** acted (`reviewerId`, `decisionSource: "console" | "api"`) — **never why** a decision, halt, or release occurred. It is designed to support, and does not replace, Article 14 human oversight for high-risk AI systems (Annex III applies from 2 December 2027).


### 19. Where is `/spurvik:dpo-pack` in the Claude Code plugin, and what does `/spurvik:engineering-summary` generate?

`/spurvik:dpo-pack` was renamed to **`/spurvik:engineering-summary`** in PR #6 (`plugins/spurvik/commands/engineering-summary.md` replaced `commands/dpo-pack.md`). The plugin provides three slash commands:

- `/spurvik:check` — scans the workspace for unwrapped model calls, logs that print prompt/message text, user-facing AI UIs without an Art. 50(1) notice, and side-effect tools without a human-oversight call.
- `/spurvik:wrap` — wraps model calls with `withSpurvik`, `spurvikMiddleware`, `withSpurvikMastra`, `withSpurvikModel`, `withSpurvikModelProvider`, or `withSpurvikLangGraph`, and adds `<AIDisclosureLabel />` where needed.
- `/spurvik:engineering-summary` *(formerly `/spurvik:dpo-pack`)* — writes `SPURVIK-ENGINEERING-SUMMARY.md` with four engineering sections (AI system inventory, Art. 50(1) notices, Art. 12 record-keeping for high-risk AI systems, and Art. 14 human oversight for high-risk AI systems). `SPURVIK-ENGINEERING-SUMMARY.md` is an engineering summary for your DPO or counsel; it is not evidence of conformity and it is not legal advice.

See [Spurvik Claude Code Plugin](claude-code-plugin.md) for full details.


### 20. How do I install the Spurvik Claude Code plugin via `.claude-plugin/marketplace.json` or `--plugin-dir`?

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

---

## Article 50(2) Marking Ahead of 2 December 2026, Polish (`locale="pl"`) Copy (Ruling D24), and LangGraph

### 21. What changes on 2 December 2026 for Article 50(2) machine-readable marking, and how does that relate to 2 August 2026?

Under Regulation (EU) 2024/1689 (the EU AI Act) as amended by the AI Omnibus Regulation (**Regulation (EU) 2026/1744**, published 24 July 2026, in force 27 July 2026):

- **2 August 2026 (`Article 113`):** General application date for **Article 50** transparency obligations (`Article 50(1)` AI-interaction notices, `Article 50(2)` machine-readable marking of synthetic audio, image, video, or text content for systems placed on the market on or after 2 August 2026, `Article 50(3)` emotion-recognition and biometric-categorisation notices, and `Article 50(4)` deepfake and public-interest text notices).
- **2 December 2026 (`Article 111(4)`, inserted by Regulation (EU) 2026/1744):** End of the transition window specifically for **Article 50(2)** machine-readable marking and detectability of **generative AI systems placed on the market before 2 August 2026**. Systems placed on the market on or after 2 August 2026 have been subject to Article 50(2) since 2 August 2026. *(Separately, the new prohibited practices in Article 5(1)(ba) and 5(1)(bb) also apply from 2 December 2026.)*
- **2 February 2027 (voluntary Code of Practice milestone):** Signatories to the European Commission's voluntary Code of Practice on marking and labelling of AI-generated content (published 10 June 2026) have until 2 February 2027 to provide an interoperable detection interface or detector under Measure 3.4(c).
- **2 December 2027 (`Article 113(c)(i)`, as amended):** High-risk AI system obligations for Annex III systems (including Article 12 logging, Article 14 human oversight, Article 17 quality management, and Annex IV technical documentation) apply from 2 December 2027.

Spurvik does not mark content itself. Its provenance record supports, but does not replace, Article 50(2) machine-readable marking. This timeline summary is technical context, not legal advice; consult your legal counsel for how Article 50(2) and Article 111(4) apply to your role as provider or deployer.


### 22. What does Spurvik provide for Article 50(2) ahead of 2 December 2026, and what must a provider or deployer still implement?

Spurvik separates call provenance and UI disclosure from content marking:

- **What Spurvik provides:**
  1. **Signed HMAC-SHA-256 call receipts (`@spurvik/sdk`, `@spurvik/core`):** Every wrapped model or graph call produces a 16-field `ProvenanceRecord` (`eventId`, `timestamp`, `modelProvider`, `modelId`, `inputHash`, `outputHash`, `contentHashMode`, `article50Disclosure`, `markingApplied`, `markingHookId`, `evidenceTrailerAttached`, `upstreamMarking`, `kind`, `provenanceVersion`, `signatureAlg: "HMAC-SHA256"`, `signature`) with `0` bytes of raw prompt or output text stored at rest by default (`contentHash: { mode: "keyed", secret }`).
  2. **Human-readable disclosure components (`@spurvik/react`):** `<AIDisclosureLabel />`, `<AIArticle50Section3Notice />`, and `<AIDisclosureDetails />` render visible DOM notices in 24 EU languages for Article 50(1), 50(3), and 50(4) surfaces.
  3. **Opt-in application marking hooks (`config.marking` and `spurvik_marking_hooks`):** Hook interfaces (`TextMarkingHook` and `MediaMarkingHook`) where you plug in your own text or media marking pipeline and record the hook ID (`markingHookId`) on the receipt.
- **What Spurvik does NOT do:**
  - Spurvik **does not mark content itself** (it does not embed pixel, audio, or video watermarks or C2PA manifests into generated files, and it does not make any system meet the EU AI Act).
  - Its provenance record supports, but does not replace, Article 50(2) machine-readable marking.
  - **Why an API receipt or database log alone is not Article 50(2) marking:** A JSON field attached to an SDK return value (`_spurvik_provenance` or `providerMetadata.spurvik`) or stored in a telemetry database does not travel with exported text, images, audio, or video once the response object is discarded. The voluntary Commission Code of Practice on marking and labelling of AI-generated content (10 June 2026, section 1.1.3) also notes that relying on fingerprinting or logging alone is not sufficient for content marking.
  - **What providers and deployers must still implement:** If you are a provider subject to Article 50(2), you must supply and validate the actual machine-readable marking and detection mechanism (for example multi-layer metadata + imperceptible watermarking in your media pipeline). Note that the  `@spurvik/c2pa` package in the monorepo is unpublished and stays private. It is licensed under the MIT License. Do not rely on `@spurvik/c2pa` for production deployments.


### 23. How do I plug a custom marking hook into `config.marking` (`TextMarkingHook`, `MediaMarkingHook`, `signed-trailer`), and what do `markingApplied` and `evidenceTrailerAttached` record?

Leave `config.marking` unset unless you are plugging in your own hook (or run `spurvik_marking_hooks` in `@spurvik/mcp` to inspect the hook templates).

```ts
import type { MediaMarkingHook, TextMarkingHook } from "@spurvik/core";
import OpenAI from "openai";
import { provenanceOf, withSpurvik, type SpurvikConfig } from "@spurvik/sdk";

const customTextHook: TextMarkingHook = {
  id: "customer-text-hook",
  mark(text, provenance) {
    // Plug in your own text-marking transform here.
    return `${text}\n<!-- ai-event:${provenance.eventId} -->`;
  },
};

const customMediaHook: MediaMarkingHook = {
  id: "customer-media-hook",
  async mark(input) {
    // Plug in your own image/audio/video marking pipeline here.
    return {
      bytes: input.bytes,
      mediaType: input.mediaType,
      manifestEmbedded: false,
    };
  },
};

export function createClientWithCustomHooks(openai: OpenAI, baseConfig: SpurvikConfig) {
  return withSpurvik(openai, {
    ...baseConfig,
    marking: {
      text: customTextHook,
      media: customMediaHook,
      applyToMessageContent: true,
    },
  });
}
```

| Receipt field | When it is `true` | What it means |
|---|---|---|
| `evidenceTrailerAttached` | When `marking.text` is set to `"signed-trailer"` (`markingHookId: "spurvik:signed-text-trailer:v1"`). | An application-level base64url provenance trailer (`[[[spurvik-provenance-record:...]]]`) was appended to `markedOutput` (and to non-streaming message content when `applyToMessageContent: true`). It is **not** a C2PA manifest and is **not**, by itself, an Article 50(2) machine-readable mark (`markingApplied` remains `false`). |
| `markingApplied` | Only when (a) your custom `TextMarkingHook` modifies the text, (b) your `MediaMarkingHook` returns `manifestEmbedded: true`, or (c) `upstreamMarking` is `"provider_confirmed"`. | Records that your configured hook or upstream provider reported applying a mark. It is a configuration and execution record, not a technical or legal verification that the mark is robust or detectable under Article 50(2). |


### 24. How does `@spurvik/react` handle the Polish (`locale="pl"`) disclosure copy (Ruling D24), and how can we customize `emotionBiometric` for gender-neutral phrasing?

`@spurvik/react` includes built-in translations for all 24 EU languages in `EU_DISCLOSURE_LOCALES` (`packages/react/src/locales.ts`). Under **Legal Ruling D24**, the built-in Polish (`locale="pl"`) copy in `EU_DISCLOSURE_LOCALES.pl` (`packages/react/src/locales.ts:405–426`) was reviewed against the Polish EU AI Act text and cleared as written:

- **Article 50(1) (`notice="interaction"`):** `"Korzystasz z systemu AI."`
- **Article 50(3) (`<AIArticle50Section3Notice locale="pl" />` or `notice="emotion-biometric"`):** `"Jesteś narażony na system rozpoznawania emocji lub kategoryzacji biometrycznej."`
- **Article 50(4) (`notice="deepfake"` / `notice="public-interest"`):** `"Te treści zostały sztucznie wygenerowane lub zmanipulowane."` / `"Ten tekst został sztucznie wygenerowany lub zmanipulowany i opublikowany w sprawie o znaczeniu publicznym."`
- **Generated badge (`notice="generated"`):** `"Wygenerowane przez AI"` (`"Te treści zostały wygenerowane przez system AI."`)
- **Details panel (`<AIDisclosureDetails locale="pl" />`):** Uses role-neutral wording (`riskTier: "Zapisany poziom ryzyka"`) and states the human-readable scope (`"Ta etykieta jest informacją czytelną dla człowieka. Sama w sobie nie jest oznaczeniem maszynowym."` and `"Ta informacja wspiera obowiązki przejrzystości. Nie jest poradą prawną."`).

**Optional gender-neutral override for `emotionBiometric` (Ruling D24):**
The default `emotionBiometric` sentence (`"Jesteś narażony..."`) mirrors the literal Polish EU AI Act wording for Article 50(3) (*"osoby fizyczne, które są narażone na działanie systemu..."*) using a masculine singular adjective (`narażony`). If your team prefers a gender-neutral Polish phrasing on `<AIArticle50Section3Notice locale="pl" />`, override `pl` at runtime with `registerDisclosureLocale`:

```tsx
import {
  AIArticle50Section3Notice,
  disclosureCopy,
  registerDisclosureLocale,
} from "@spurvik/react";

registerDisclosureLocale("pl", {
  ...disclosureCopy("pl"),
  emotionBiometric:
    "Objęty działaniem systemu rozpoznawania emocji lub kategoryzacji biometrycznej.",
});

export function PolishBiometricBanner() {
  return <AIArticle50Section3Notice locale="pl" presentation="block" />;
}
```

**National procedural context (Poland):** Poland's Act of 3 July 2026 on artificial intelligence systems (Dz.U. 2026 poz. 1003) makes the Komisja Rozwoju i Bezpieczeństwa Sztucznej Inteligencji (KRiBSI) Poland's market surveillance authority under the AI Act. Its powers to inspect, issue warnings and orders, and impose administrative fines apply from 28 October 2026. The Act sets no fine amounts of its own: it refers to the AI Act. Fines can only follow AI Act obligations that already apply on their own dates. From the same date, businesses can ask KRiBSI for an individual opinion on how the AI Act applies to them.

Spurvik is designed to help providers and deployers document the measures they take under the AI Act. The obligations remain theirs; Spurvik is not legal advice.


### 25. How do I wrap a LangGraph workflow (`@spurvik/sdk/langgraph`) and connect `interrupt()` pauses to Spurvik's human-oversight queue?

`@spurvik/sdk/langgraph` exports `withSpurvikLangGraph`, `spurvikInterrupt`, `resolveLangGraphInterrupts`, `provenanceFromLangGraphState`, and `provenanceOf`:

1. **Wrap the compiled graph:** Pass your compiled `StateGraph` (`invoke` and optional `stream`) to `withSpurvikLangGraph(compiledGraph, config, { modelId })`. Every run checks `beforeInference()`, hashes non-tool messages (`role` or `type` in `"tool"`, `"function"`, `"function_call_result"` are excluded from `inputHash`), and attaches a signed 16-field `ProvenanceRecord` on `_spurvik_provenance` (readable via `provenanceFromLangGraphState(state)` or `provenanceOf(state)`).
2. **Detect interrupted runs:** When the returned state has a non-empty `__interrupt__` array, `withSpurvikLangGraph` sets non-enumerable `receipt.finishReason = "interrupted"` and `receipt.interrupted = true` while keeping the 16 signed fields unchanged for `verifyProvenanceSignature(receipt, signingSecret)`.
3. **Route interrupts through `/api/v1/hitl`:** Call `spurvikInterrupt({ actionName, callId, payload, interrupt }, config)` inside a node or `resolveLangGraphInterrupts(state.__interrupt__, config)` outside the node (which deduplicates interrupt IDs via `skippedDuplicateIds` and returns `resolved.command` ready for `new Command(resolved.command)`). For long-running reviews, create a pending row via `POST /api/v1/hitl` with `buildPayloadSummary`, pause with `interrupt(...)`, and resume when `verifyHitlWebhook` receives `hitl.decision`.

See [`docs/langgraph-quickstart.md`](./langgraph-quickstart.md) and [`docs/hitl-approval-mapping.md`](./hitl-approval-mapping.md) for full copy-paste examples.
