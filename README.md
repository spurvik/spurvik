# Spurvik

Spurvik is a developer control plane that **supports your EU AI Act work**: hash-chained record-keeping, human-oversight hooks, and transparency notices. It is infrastructure. It is not a conformity assessment, a certification, or legal advice.

Regulation (EU) 2024/1689 is the legal instrument. Dates below follow the AI Omnibus timeline and the Commission’s Code of Practice on Transparency of AI-generated Content. Have counsel confirm how they apply to a specific system.

## What this repository contains

Milestones 1–4, scoped to the EU market.

| Piece | Role |
| --- | --- |
| `packages/sdk` | `withSpurvik()` wrapper for OpenAI, Anthropic, and Gemini-shaped clients, `spurvikMiddleware()` for the Vercel AI SDK, plus Mastra, OpenAI Agents, and LangGraph adapters. |
| `packages/react` | Always-visible Article 50 labels, in all 24 official EU languages. |
| `packages/core` | Hashing, provenance signatures, text-marking hook, audit-chain checks, webhook signatures. |
| `packages/mcp` | Local stdio MCP server. Setup snippets, an unwrapped-call scan, HMAC receipt explanations, and marking-hook notes. Published on npm as `spurvik-mcp-server@1.0.2` (MIT). Workspace package `@spurvik/mcp` (`1.0.2`). |

Features designed to support Article 12(3) logging for remote biometric identification systems (Annex III point 1(a); high-risk requirements apply from 2 December 2027) are in the control plane. Two-person confirmation is a product setting. It checks that two different member accounts confirmed the decision. Image marking support is `packages/c2pa` (`@spurvik/c2pa`). That directory is in this repository. Its `package.json` sets `"private": true` and `"license": "MIT"`. It is not published on npm.

## Quickstart

> **Licence.** `packages/sdk` (published as `spurvik` and `spurvik-sdk`), `@spurvik/core`, `@spurvik/react`, and `@spurvik/mcp` are licensed under the MIT License (Copyright (c) 2026 EyeTea Solutions ApS (CVR 37093378)) and are provided without warranty. `packages/c2pa` (`@spurvik/c2pa`) is in this repository with `"private": true` and `"license": "MIT"`, and it is not published on npm. The hosted console at https://console.spurvik.com is a hosted service. Its source is not in this repository and the MIT licence does not cover it. See **Trademark** below.

The walkthrough is in [`docs/quickstart.md`](docs/quickstart.md). Errors we hit while testing it are in [`docs/troubleshooting.md`](docs/troubleshooting.md). For a plain-language overview, see [`docs/onboarding-startups-smes.md`](docs/onboarding-startups-smes.md).

Guides: [`docs/quickstart.md`](docs/quickstart.md), [`docs/5-minute-quickstart.md`](docs/5-minute-quickstart.md), [`docs/sandbox-first-5-minutes.md`](docs/sandbox-first-5-minutes.md), [`docs/langgraph-quickstart.md`](docs/langgraph-quickstart.md), [`docs/hitl-approval-mapping.md`](docs/hitl-approval-mapping.md), [`docs/console-onboarding.md`](docs/console-onboarding.md), [`docs/adapters-quick-cards.md`](docs/adapters-quick-cards.md), [`docs/claude-code-plugin.md`](docs/claude-code-plugin.md), [`docs/faq-additions.md`](docs/faq-additions.md), [`docs/faq-sandbox-2x2.md`](docs/faq-sandbox-2x2.md), [`docs/faq-console-and-quickstart.md`](docs/faq-console-and-quickstart.md), [`docs/faq-hitl-and-plugin.md`](docs/faq-hitl-and-plugin.md), and [`docs/faq-art50-marking-and-pl-locale.md`](docs/faq-art50-marking-and-pl-locale.md).

**Get the package.** Install the live MIT packages from npm. Builds previously served at spurvik.com/sdk/latest.tgz are not this SDK, are unsupported and must not be relied on to check records.

(a) npm:

```bash
npm install spurvik@1.0.3 spurvik-sdk@1.0.3
```

`spurvik` and `spurvik-sdk` publish the same SDK. Import it as `spurvik`. Subpaths are `spurvik/ai`, `spurvik/mastra`, `spurvik/langgraph`, `spurvik/openai-agents`, and `spurvik/react`.

(b) Local MCP server. `--root` is required in `spurvik-mcp-server@1.0.2`:

```bash
npm i -D spurvik-mcp-server@1.0.2
./node_modules/.bin/spurvik-mcp-server --root .
```

In your app (an ES module project, because the example uses top-level `await`):

```bash
npm pkg set type=module
npm install openai spurvik@1.0.3
```

**Wrap a call and check the record:**

```ts
import OpenAI from "openai";
import { provenanceOf, verifyProvenanceSignature, withSpurvik } from "spurvik";

const ai = withSpurvik(new OpenAI(), {
  apiKey: process.env.SPURVIK_API_KEY!, // spurvik_live_…
  signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
  baseUrl: process.env.SPURVIK_BASE_URL!, // the SDK throws without it when NODE_ENV is production
  riskTier: "limited_art50", // Sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.
  article50Disclosure: false, // set true only when an interaction notice is shown
  onTelemetryError: (error) => console.error("Spurvik telemetry not delivered:", error),
});

const completion = await ai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});
const record = await provenanceOf(completion);

// Argument order: record first, signing secret second. Swapped arguments return false.
const matches = await verifyProvenanceSignature(record!, process.env.SPURVIK_SIGNING_SECRET!);

await ai._spurvik.shutdown(); // scripts: send queued telemetry before exit
```

`provenanceOf(res)` returns the signed provenance record attached to a non-streaming response. For a stream it returns a promise of the record: read the stream, then `await provenanceOf(stream)`. A record means the signature can be checked. It is not a conformity assessment.

`matches` is `true` when the signed fields match a signature made with that secret. Any change to a signed field makes the check return `false`, unless whoever changed it also re-signed it with the same secret. So a match shows that the signed fields still match a signature made with that secret. Anyone who holds the secret can make a matching signature, so limit who holds it.

**Keys and environment variables.** The project API key has the form `spurvik_live_` plus at least 32 base64url characters. It is sent as a Bearer token, and the server stores only its SHA-256 hash. `SPURVIK_SIGNING_SECRET` and `SPURVIK_CONTENT_HASH_SECRET` stay in the caller and are never sent to the control plane. Keep them: records signed with a lost secret can no longer be checked. None of these has a built-in default. The SDK reads none of these variables by itself; your code passes them in. `AEGIS_*` environment variables are read only by the control plane server in this release, with a deprecation warning. Keys issued as `aegis_live_` and `aegis_pub_` still authenticate. New keys use the Spurvik prefixes.

`baseUrl` is where SDK telemetry and the halt stream go. For an invited organisation, that address is `https://console.spurvik.com`. In production the SDK throws if it is omitted. Development and tests still default to `http://127.0.0.1:43123`.

**If `baseUrl` is unreachable,** the wrapped model call still succeeds and returns its record (except for `high_annex3`, which fails closed). In a short script the telemetry event is lost: `onTelemetryError` is called once, `await shutdown()` returns, and the process exits with code 0. A long-running process calls `onTelemetryError` once. In this build, an event that is queued after a failed flush stays in memory (up to 500 events; the oldest are dropped first) and is sent with a later flush: on the next wrapped call, on `await ai._spurvik.shutdown()`, or once when the process ends on its own. Nothing retries it on a timer. The event whose flush already failed is not tried again when the process ends on its own unless something was queued after it, and `process.exit()` or a signal such as Ctrl+C skips that last flush. Calling `await ai._spurvik.shutdown()` before the process exits gives queued events one more try (up to 8 seconds by default). With `high_annex3`, a halt check that times out throws `SpurvikOversightTimeoutError` (a `SpurvikHaltedError`), while an error response from the control plane throws `SpurvikApiError`, an API error that is a `SpurvikError`, not a `SpurvikHaltedError`; in both cases the provider is not called. See `docs/troubleshooting.md`. In this release, do not rely on the control plane as your only copy of these events. Keep your own records as well.

`article50Disclosure` defaults to false. Set it to true only when you state that an Article 50(1) interaction notice is shown. The flag is configuration. It is not a finding that the notice was shown or that it is sufficient.

`riskTier` is your own classification (as provider or deployer); Spurvik does not classify your use case.

- `minimal` — no transparency or high-risk controls configured by default.
- `limited_art50` — Article 50 transparency support (interaction notice, optional marking hook).
- `high_annex3` — for high-risk use under Annex III. The wrapper checks the human stop before inference.

Article 12 (record-keeping) and Article 11 with Annex IV (technical documentation) apply to high-risk (Annex III) systems from **2 December 2027**. Article 14 applies to high-risk AI systems listed in Annex III from 2 December 2027. Annex I systems embedded in regulated products follow **2 August 2028** and are not a separate tier here.

## Documentation

| Guide | What it covers |
| --- | --- |
| [Full quickstart](docs/quickstart.md) | Install the published SDK and wrap one model call. |
| [5-minute quickstart](docs/5-minute-quickstart.md) | Wrap one model call, keep the provenance record, and check its HMAC signature. |
| [Sandbox first 5 minutes](docs/sandbox-first-5-minutes.md) | Public 2x2 sandbox cockpit before you set up keys. |
| [Console onboarding](docs/console-onboarding.md) | Sandbox and the hosted console. |
| [LangGraph quickstart](docs/langgraph-quickstart.md) | Wrap compiled LangGraph workflows (`spurvik/langgraph`), read HMAC receipts, render `<AIDisclosureLabel />` (including Polish `locale="pl"` copy), and map `interrupt()` / `Command({ resume })` to `/api/v1/hitl`. |
| [HITL approval mapping](docs/hitl-approval-mapping.md) | Map Vercel AI SDK `interrupted`, OpenAI Agents `needsApproval`, and LangGraph `interrupt()` into Spurvik's human-oversight queue. |
| [Adapter quick cards](docs/adapters-quick-cards.md) | `withSpurvikMastra`, `withSpurvikModel` / `withSpurvikModelProvider`, and `withSpurvikLangGraph`. |
| [Claude Code plugin](docs/claude-code-plugin.md) | `/spurvik:check`, `/spurvik:wrap`, and `/spurvik:engineering-summary`. |
| [FAQ additions](docs/faq-additions.md) | Pricing, install, MCP tools, HITL, Polish `locale="pl"`, and Art. 50(2) marking questions. |
| [FAQ: sandbox 2x2](docs/faq-sandbox-2x2.md) | Sandbox cockpit behaviour and shell environment precedence. |
| [FAQ: console and quickstart](docs/faq-console-and-quickstart.md) | Signup, keys, and the 5-minute path. |
| [FAQ: HITL and plugin](docs/faq-hitl-and-plugin.md) | Tool approvals, checkpoint pause/resume, and Claude Code plugin install. |
| [FAQ: Art. 50(2) marking and Polish locale](docs/faq-art50-marking-and-pl-locale.md) | Art. 50(2) marking ahead of 2 December 2026 (Art. 111(4)), Polish `locale="pl"` copy, and LangGraph. |
| [Claude Code submission draft](docs/distribution/claude-code-submission.md) | Staged directory-submission draft. |
| [Website marketplace manifest](docs/distribution/spurvik-com-marketplace.json) | Staged website marketplace manifest for `spurvik.com/.claude-plugin/marketplace.json`. |

## Provenance is not Article 50(2) marking

`provenanceOf(res)` is exported from `spurvik`. It reads a **provenance record**: timestamp, model id, keyed fingerprints, an Article 50(1) disclosure flag, the upstream marking status, and an HMAC-SHA-256 signature. `markingApplied` and `evidenceTrailerAttached` are inside that signature. The same value is on `res._spurvik_provenance`. `provenanceOf` also reads `_aegis_provenance` from earlier responses. Check the signature with `verifyProvenanceSignature`. A match shows the signed fields still match the HMAC-SHA-256 signature made with your signing secret. It does not show that a notice was shown, that output is marked, or that your system meets the Act.

`withSpurvik` is the wrapper. The old `withCompliance` alias is removed; use `withSpurvik`. That old name did not mean the wrapped client meets the Act. `withAegis` is the previous product-name alias and is removed in the next release.

A field on the API object does not travel with the content after the object is discarded, so it is not, by itself, the machine-readable marking in Article 50(2).

The marking module is a hook:

- `signed-trailer` embeds the provenance record in text. That is an application-level binding, not a C2PA manifest and not a determination that Article 50(2) is met.
- `@spurvik/c2pa` implements `MediaMarkingHook` for PNG and JPEG. `POST /api/v1/provenance/verify` reads a manifest. A matching signature checks that manifest. It is not a conformity assessment. A private CA is reported as `not_on_trust_list`.

Article 50 transparency obligations apply from **2 August 2026**. For AI systems placed on the market before that date, the Article 50(2) marking and detection duty runs to **2 December 2026**. Signatories to the Code of Practice on Transparency of AI-generated Content commit to an interoperability solution for detection by **2 February 2027**.

## Pseudonymised fingerprints

Prompt and output hashing is configurable:

| `contentHash.mode` | Behaviour |
| --- | --- |
| `keyed` (default) | HMAC-SHA-256 with a client-held secret or salt. The server cannot recompute it. |
| `on` | Unsalted SHA-256. |
| `off` | No fingerprint is computed or stored. |

A fingerprint of text that relates to an identifiable person can still be personal data under the GDPR. Keyed mode is designed to support **pseudonymisation** (Article 4(5) GDPR): the additional information, the HMAC key, stays with the client. It is not anonymisation. Do not describe these values as non-personal data.

The telemetry body carries fingerprints, model version, temperature, and latency. `contentMarkingApplied` / `markingApplied` is true only when a C2PA manifest was embedded, a watermark hook changed the content, or the upstream status is `provider_confirmed` (the response or a marking header said a mark was present). It is false for a signed text trailer, a metadata hook, a mere request, a support-table inference, an unknown model, and a failed call. `evidenceTrailerAttached` records the trailer or metadata hook separately and is also inside the provenance signature. The status on the record is `upstreamMarking`: `requested` (a marking parameter was on the request), `provider_confirmed`, `not_requested` (the request or response said marking was off), `inferred` (the model id is on the dated support table and the SDK object had no signal), or `unknown`. Unknown is the default. This does not show the mark is robust, detectable or adequate under Art. 50(2). The previous ingest boolean name is still accepted for one minor version and stored as `contentMarkingApplied`. Rows sealed before that rename keep matching: the same boolean was hashed under the old field name. The ingestion route rejects prompt or output text.

The methods `withSpurvik` records, and the ones it leaves alone, are listed in `packages/sdk/README.md`. Embeddings, image generation, speech, moderations, batches, and file uploads have no provenance record. Chat, messages, responses, Gemini `generateContent`, and Gemini chat `sendMessage` are wrapped, including the stream helpers covered in that table. `spurvik/ai` exports `spurvikMiddleware` for `wrapLanguageModel`. `spurvik/mastra` passes that middleware to `wrapLanguageModel` for a Mastra agent model. `spurvik/openai-agents` wraps an Agents SDK `Model` and `ModelProvider`. A thrown provider call does not produce a record. Telemetry is queued and sent in batches, on `shutdown()`, and once as the process exits. A call does not flush the queue by itself.

The disclosure label does not write browser storage unless the integrator sets `beacon.consent` to true. The site operator obtains that consent. Without it, the label still renders and sends nothing. A server-side note that a page containing the label was served does not use the beacon.

## Upstream marking evidence

A deployer that wraps a third-party model may rely on that provider's output marking only when it can show the marking works. `withSpurvik` (and the `withAegis` alias) records one signed evidence event per wrapped call. The event stores the provider, the model, the modality, marking settings the request and the response actually expose, and `upstreamMarking`. Settings are read only from flags and headers the SDK object carries (`watermark`, `synthid`, `c2pa`, provenance headers, and the same names inside `metadata`, `generationConfig`, or a `withResponse()` body). When the public SDK object has no such field, the status is `unknown`, including OpenAI text (no per-request parameter), Anthropic models the dated help-center table does not list, Gemini text, and Mistral. Cloud-partner routes (Bedrock, Vertex, Foundry, Azure) are not inferred from the first-party table. The support table in `packages/core/src/upstream-support.ts` is dated and lists a source URL on each row.

The evidence is HMAC-SHA-256 with the client-held signing secret and is stored beside the audit chain. It is not part of the record hash. Each event records `routeKind` (`direct`, `bedrock`, `vertex`, `azure`, or `foundry`) and `markingSource` (`response`, `request`, `header`, or `none`). Set `upstreamRoute` on `withSpurvik` when the SDK path does not contain the route name. The control plane checks the payload shape and that the event id matches. It does not hold the secret, so it does not recompute the signature. The published `spurvik@1.0.3` package does not export a function that checks this signature. It is designed to support your EU AI Act work.

`packages/core/src/marking-registry.ts` lists OpenAI, Anthropic, Google, Mistral, and open-weight models for text, image, audio, and video. Each entry has a source URL and the date that source was read (`sourceReadOn`). Edit that list when a public page changes.

The project page **Marking** writes a documented-limits statement for text outputs, where a robust mark is not something the stored SDK signals can show, plus coverage per model and modality. Download JSON from that page. The same rows are included in the owner project export. Deleting the project removes them.

## Human oversight

The human-review queue is built into this control plane. The oversight page and `submitHumanDecision()` write the same decision rows. Any organisation member can halt or decide in the console. Deciding through the API needs a reviewer token, which only an organisation owner can issue. You choose who in your organisation does human oversight (Art. 26(2), for high-risk AI systems). Article 14 applies to high-risk AI systems listed in Annex III from 2 December 2027.

Article 14 requires more than an approve/reject gate for high-risk systems, including the ability to override the system and to interrupt it.

- `requireHumanApproval(actionName, payload)` creates a pending row and polls `/api/v1/hitl/:id` until the status leaves `pending` and `pending_confirmation`, or the wait ends.
- `submitHumanDecision(id, { status, reason })` records an API decision. `decisionSource` is `api`. The console sets `console`. Approve, reject, and override each require a reason. The reason stays on the decision row and is not an input to the record hash.
- A final decision, and the first half of a two-person confirmation, appends a `human_decision` hash-chain row. That row stores the approval id, the status, and the source. Rows sealed before this field omit it, so their hashes still match.
- `overrideHumanDecision(id, { reason })` records a human reversal. The caller is `reviewerToken`, not a free-text id.
- `engageKillSwitch({ reason, actionName })` halts a whole project or one action, and `releaseKillSwitch({ reason, actionName })` releases it (leave out `actionName` for the whole project). Both need `reviewerToken` and send `x-spurvik-reviewer`. In the SDK, `reason` is optional for both.   Always pass one. Continuation of the quickstart `ai` binding above. This fragment is not a standalone file:

  ```ts
  await ai._spurvik.releaseKillSwitch({ reason: "Operator released the stop." });
  ```

  A stored reason is free text that someone entered. Spurvik does not check it.
- When the reason is missing or blank, the SDK sends `Halted via SDK (no reason given)` or `Released via SDK (no reason given)` instead. The control plane does not fill that in: a direct `POST /api/v1/oversight` call with a missing or blank reason gets HTTP 400 `reason_required` ("Halting a project or action requires a reason." or "Enter a reason for releasing."). You can also halt or release from the console: on the project's oversight page, enter a reason and choose **Engage stop** or **Release stop**.
- The SDK sends `reasonSource` with those calls: `caller` when you passed a reason, and `sdk_default` when it substituted the sentence above. The value is client-asserted. The server does not verify it. Console writes store NULL. A raw API call that omits the field stores NULL. A halt response sets `previousReason` to null. The signed `oversight.changed` webhook posts that write: `reason` is the new reason, and `previousReason` is null on a halt and the halt reason on a release.
- The release response `reason` is the release reason just stored. The halt reason that was in effect is `previousReason`. In a `GET /api/v1/oversight` response, `previousReason` is `null` and `reason` is the last halt reason, also after a release; `projectHalted` and `actionHalted` show whether a stop is engaged.
- Halting something that is already halted returns HTTP 409 `already_halted` ("This is already halted. Release it first to change the reason."); the first halt and its reason stay in place. Releasing something that is not halted returns HTTP 409 `not_halted` ("This is not halted."); nothing changes.
- For `high_annex3`, wrapped inference checks the last-known halt state and fails closed. `oversight.cacheMs` sets the window (`0` refreshes every call). `oversight.pushInvalidation` (default on when halt enforcement is on) listens to `GET /api/v1/oversight/stream` and drops the cache. That stream is single-process. A signed `oversight.changed` webhook covers other instances. `invalidateHaltCache()` drops the cache directly.

Any organisation member can halt or decide in the console. Deciding through the API needs a reviewer token, which only an organisation owner can issue. You choose who in your organisation does human oversight (Art. 26(2), for high-risk AI systems). The console signs reviewers in as organisation members. Ingestion decisions require a `spurvik_reviewer_` token for a member of the project organisation, sent as `x-spurvik-reviewer`. Tokens issued as `aegis_reviewer_` are still accepted this release. The stored reviewer id is that member's user id. The session cookie is `spurvik_session`. `aegis_session` is still read until 26 January 2027 and is not set on new logins.

Two-person confirmation is a product setting. It checks that two different member accounts confirmed the decision. For a project marked as Annex III point 1(a) remote biometric identification (`high_annex3` and the wizard flag), approval and override wait for a second, different member (`pending_confirmation`). One member can reject. An organisation owner can turn on the same two-person confirmation for an employment-category project from the oversight page. When it is on, approval and override wait for a second, different member. One member can reject. It is an option, not the biometric rule. Real-time remote biometric identification in public spaces for law enforcement is an Article 5(1)(h) prohibited practice. The wizard labels it Prohibited and does not emit an SDK setup.

The project page can issue a provenance HMAC key and a content-fingerprint HMAC key for that project only. Each plaintext is shown once. The control plane stores the SHA-256 and the last four characters and cannot recompute either HMAC. Use a different pair for each project.

Article 12(3) references (period of use, reference database, input reference, and the member ids who checked the result) can ride on a telemetry event. They are included in the record hash when present and omitted when absent. Send a URI or keyed fingerprint, not a sample, image, embedding, or template.

A project can set a webhook URL. Decisions and halt changes are POSTed as canonical JSON. `x-spurvik-signature` is `v1=` plus HMAC-SHA-256 of `` `${timestamp}.${body}` ``, and `x-spurvik-timestamp` is unix seconds. Check it with `verifyHitlWebhook`. A match shows the timestamp and body still match the HMAC-SHA-256 signature made with your webhook secret, and that the timestamp is within five minutes of your clock (the default). It does not show that your oversight measures meet Article 14, which applies to high-risk AI systems. The status route remains the source of truth if delivery fails. The signing secret is shown once when the webhook is saved. New saves store it as an AES-256-GCM envelope (`spurvik-enc:v1`) under `SPURVIK_WEBHOOK_KEK`, 32 bytes (base64url, hex, or 32-byte utf8). The key is required in every mode. Without it the app refuses to start or seal a secret. The only exception is `SPURVIK_ALLOW_TEST_KEYS=1` outside production: the app then generates a random key for that process and warns once, and a secret sealed with that key does not open after a restart. That flag is for local testing only, gives no integrity protection, and is refused when `NODE_ENV` or `VERCEL_ENV` is production. Webhook secrets sealed with the old development fallback will not open. Re-enter each webhook secret. A secret stored as plaintext before this change is still accepted when signing.

The human-approval summary is `spurvik.payload_summary.v1`: canonical JSON with identifier-shaped field names (at most 32, each at most 64 characters) and an optional hex fingerprint. It is at most 500 characters. Values are not included. Do not put personal data in a field name. The ingestion route rejects free text. Older rows may still hold free text; new writes cannot.

For `high_annex3`, telemetry is not dropped when the queue is full. The SDK fsyncs events to an on-disk buffer (or a `DurableTelemetryBuffer` / `KvTelemetryBuffer` you pass in) before the call is treated as recorded locally. If that write fails, `enqueue` rejects with `SpurvikTelemetryBufferError`. Other tiers still drop the oldest in-memory event when the queue is full. A jump in `clientSeq` for one process is stored as a `chain_gap` row inside the hash chain, so the ledger can show the missing sequences. Deleting the on-disk buffer removes events that had not been acknowledged.

## Run the SDK

The SDK and MCP server are MIT and run in your own stack.

The hosted console at https://console.spurvik.com is a hosted service. Its source is not in this repository and the MIT licence does not cover it.

Generate client-held secrets (do not send these to Spurvik):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### Ingestion routes

All of these require `Authorization: Bearer spurvik_live_…` (an `aegis_live_…` key issued earlier still works).

- `POST /api/v1/telemetry`
- `POST /api/v1/hitl` and `GET /api/v1/hitl/:id`
- `POST /api/v1/hitl/:id/decision`
- `GET /api/v1/oversight` and `POST /api/v1/oversight`
- `POST /api/v1/disclosure` also accepts a publishable `spurvik_pub_` key, or an `aegis_pub_` key issued earlier. `GET` does not.

Audit rows are chained per project. The append takes a row lock on `audit_chain_heads`, so concurrent inserts for one project cannot fork the chain. The ledger button **Verify hash chain** recomputes each record hash and checks `prev_log_hash`. A match means the stored rows still link. It is not a certification of the AI system.

## Log retention

Retention periods are (planned). This repository does not apply them.

| Plan | Default retention (planned) |
| --- | --- |
| Developer (free) | 30 days |
| Team | 90 days |
| Business | 12 months |
| Enterprise | A per-project period, in days. Unset Enterprise projects keep 365 days until an owner sets one. |

Business is the plan between Team and Enterprise. These rules are (planned). The plan would apply to the whole organisation. For a project recorded as `high_annex3`, the planned floor is six months. Until an owner confirms the risk tier, the planned rule treats the project as `high_annex3` for retention. Articles 19 and 26(6) require logs to be kept at least that long unless another law says otherwise. Once the tier is confirmed, an owner could record that other law, with a short note, and the floor would then not be applied. Spurvik does not check that law. That is a product rule. It is not a finding that the project meets those articles.

The purge function exists. The Spurvik operator runs it by hand on the hosted control plane. Nothing schedules it. Retention periods in the table are (planned). A matching checkpoint shows that the checkpoint's fields (project, sequence number, that hash and the purge time) still match the HMAC-SHA-256 signature made with the operator's checkpoint secret. It is not a finding that your system meets the Act. A purge is not erasure of the project.

## Project export and deletion

An organisation owner can download `GET /dashboard/projects/:id/export`. The JSON includes the project profile, audit logs, human decisions, oversight, disclosures, API key metadata (kind, last four characters, revoked time), purge checkpoints, and the webhook URL. It omits the webhook secret and API key hashes. Deleting the project removes the project row. Related logs, keys, and checkpoints cascade. Member accounts and reviewer tokens stay. That deletion is separate from the retention purge.

## Where calls go

SDK telemetry and the halt stream go to `baseUrl`. For an invited organisation, that address is `https://console.spurvik.com`. The disclosure beacon goes to the endpoint you pass. Webhooks go to the project webhook URL. There is no licence ping, error reporter, update check, or analytics call. `SPURVIK_TELEMETRY` is ignored unless it is `off`, and `GET /api/v1/health` reports `vendorTelemetry: "off"`. There is no switch that turns a vendor sink on. The console uses the system font stack, so a build does not request a font host.

## Disclosure labels

```tsx
import { AIDisclosureLabel, AIDisclosureDetails } from "spurvik/react";

export function DisclosureExample() {
  return (
    <>
      <AIDisclosureLabel
        notice="interaction" // or "generated" | "deepfake" | "public-interest"
        presentation="inline" // pill; "block" is the default
        locale="de" // 24 official EU languages, or registerDisclosureLocale
        euIcon // optional Commission icon; always paired with visible text
        beacon={{ endpoint: "https://your-endpoint.example/beacon", apiKey: process.env.NEXT_PUBLIC_SPURVIK_PUB_KEY! }}
      />
      <AIDisclosureDetails riskTier="limited_art50" modelSummary="gpt-4o" provenance={{ signature: "unchecked" }} />
    </>
  );
}
```

Sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.

The label text is in the page without a click. The dialog is supplementary. A beacon fires once per session after `IntersectionObserver` reports the label on screen. Pass `spurvik_pub_…`, not the live key. Browser keys `aegis.disclosure.*` are copied to `spurvik.disclosure.*` and then deleted. That migration is removed in 1.0, and no later than 26 January 2027. The official EU icons (basic, AI-generated, AI-modified) are the Commission’s optional marks for Article 50(4). Using one does not by itself meet Article 50.

`/labels` renders the variants, including `AIArticle50Section3Notice` for Article 50(3). The console is at `/login`.

## Operator console

Organisation members sign in with an email and a scrypt password. Any organisation member can halt or decide in the console. Deciding through the API needs a reviewer token, which only an organisation owner can issue. You choose who in your organisation does human oversight (Art. 26(2), for high-risk AI systems). Only an organisation owner can create, rotate, or revoke live and disclosure keys. A member can revoke their own reviewer token. Only an organisation owner can issue a reviewer token. Retention periods are (planned). The purge function exists and the operator runs it by hand. Nothing schedules it. You can run the EU risk wizard, read the hash-chained log designed to support Article 12 record-keeping, read upstream marking coverage, decide the human-oversight queue, engage a stop, download **Annex IV technical documentation (draft)** as Markdown or PDF, and, as an owner, export or delete the project. The Data inventory page lists what an owner can export and what is withheld. There is no switching fee in this software.

The wizard asks whether the system is on the EU market, whether an Article 5 practice is Prohibited, which Annex III areas apply, and which Article 50 triggers apply. Prohibited answers do not produce an SDK snippet. Social scoring covers public and private actors (Article 5(1)(c)). Non-consensual intimate deepfakes (Article 5(1)(ba)) and generating child sexual abuse material (Article 5(1)(bb)) are included and apply from 2 December 2026. The recorded tier is your answer.

The Annex IV file is a draft assembled from project fields and ledger counts. Section 2 carries the system description, including the wizard answers. Section 5, the Article 9 risk-management system, says “To be completed by the provider.” Conformity assessment, the EU declaration of conformity, and CE marking are separate steps and are not produced by the export.

## Not legal advice

Spurvik helps a team implement technical measures that map to parts of Articles 12, 14, and 50 and to the Annex III / Article 50 product taxonomy. Using it does not make a system conformant. It does not perform a conformity assessment, issue an EU declaration of conformity, apply CE marking, run a quality management system, or register a system in the EU database. The Annex IV download is a draft. The risk wizard records your answers. It labels Article 5 practices Prohibited. It does not decide that a use is high-risk under Article 6.

This tree does not claim that data stays in the EU. A draft Cyber Resilience Act reporting runbook is in `docs/cra-article-14-reporting.md`. Data Act export notes are in `docs/data-act.md`. Open packages are released under the MIT License (`spurvik@1.0.3`, `spurvik-sdk@1.0.3`, `spurvik-mcp-server@1.0.2`) and synced to https://github.com/spurvik/spurvik; see `LICENSE`.

## MCP server

`spurvik/ai` exports `spurvikMiddleware` for the Vercel AI SDK (`ai` 7). Pass it to `wrapLanguageModel`. It logs the call and attaches an HMAC provenance receipt. It does not mark content. A marking hook is the caller's.

| Piece | MCP setup |
| --- | --- |
| `packages/mcp` | Published to npm as `spurvik-mcp-server@1.0.2` (MIT); workspace package `@spurvik/mcp` stays `"private": true` at `1.0.2` in this repository. Read-only tools: `spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, `spurvik_marking_hooks`. `plugins/spurvik/.mcp.json` runs `node ${CLAUDE_PLUGIN_ROOT}/bin/spurvik-mcp.mjs --root ${CLAUDE_PROJECT_DIR}`, bundled from `@spurvik/mcp` 1.0.2 via `node packages/mcp/scripts/bundle-plugin.mjs`. |
| `plugins/spurvik` | Claude Code plugin. The same four read-only tools are `spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, and `spurvik_marking_hooks`. `plugins/spurvik/.mcp.json` runs `node ${CLAUDE_PLUGIN_ROOT}/bin/spurvik-mcp.mjs --root ${CLAUDE_PROJECT_DIR}`, bundled from `@spurvik/mcp` 1.0.2 via `node packages/mcp/scripts/bundle-plugin.mjs`. |

`packages/mcp` (`@spurvik/mcp`) and `plugins/spurvik` expose the same four read-only MCP tools: `spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, and `spurvik_marking_hooks`. `packages/mcp` is a local stdio MCP server for Cursor, VS Code, and other MCP clients. Published to npm as `spurvik-mcp-server@1.0.2` (MIT); workspace package `@spurvik/mcp` stays `"private": true` at `1.0.2` in this repository. Install and start it with `npm i -D spurvik-mcp-server@1.0.2` and then `./node_modules/.bin/spurvik-mcp-server --root .`. `--root` is required in 1.0.2. The Claude Code plugin reads `plugins/spurvik/.mcp.json`, which runs `node ${CLAUDE_PLUGIN_ROOT}/bin/spurvik-mcp.mjs --root ${CLAUDE_PROJECT_DIR}`. That server file is bundled from `@spurvik/mcp` 1.0.2 via `node packages/mcp/scripts/bundle-plugin.mjs`. The tools do not call the Spurvik API or any network. The SDK logs the call and attaches an HMAC receipt. It does not mark content. `riskTier` in a snippet is a sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case. The scanner skips files named .env or .env.* (any case), including through symlinks and hard links. Config examples are in `packages/mcp/README.md`.

## Multi-channel `ask_human()` router & `n8n` / `Make.com` workflow guard (from 1.0.4, planned)

- **`packages/sdk/src/channels.ts` (`createMultiChannelApprovalRouter`, `dispatchHumanApprovalChannel` & `verifyChannelApprovalToken`)** (from 1.0.4, planned): `createMultiChannelApprovalRouter` sends a pre-flight approval request with an HMAC-SHA256 digest of the gate id, action name, and context. `dispatchHumanApprovalChannel` sends signed **Approve / Block** links on **Slack**, **Telegram**, **Email (Resend)**, **Discord**, **Microsoft Teams**, **Linear**, **Jira**, and **Asana**. **Monday.com** creates an item for the request. The `ask_human()` gate step is that request, designed to support Article 14 human oversight. The digest is designed to support Article 12 record-keeping.
- **`packages/n8n-nodes-spurvik`** (planned): `n8n` node and importable [`make-com-blueprint.json`](packages/n8n-nodes-spurvik/make-com-blueprint.json). The step prepends an AI interaction notice, logs the call as an HMAC-SHA256 digest in place of the raw prompt text, designed to support Article 12 record-keeping, and on the `ask_human()` gate step sends **Approve / Block** links on Slack, Telegram, Email (Resend), Discord, Microsoft Teams, Linear, Jira, and Asana. Monday.com creates an item for the request, designed to support Article 14 human oversight.
- Full quickstart & callback verification examples: [`docs/multi-channel-hitl-and-n8n.md`](docs/multi-channel-hitl-and-n8n.md).

## Still open

- **Code of Practice detection.** Signatories commit to interoperable detection by 2 February 2027. The C2PA hook is a manifest writer and reader, not that detection programme.
- **Public C2PA trust.** A private CA signs, and the verify route reports `not_on_trust_list`. Putting a certificate on a public trust list is the operator's step.
- **Article 5.** Prohibited practices are not a risk-tier value. The wizard shows an SDK setup when the answers produce a tier. It shows "No SDK setup is offered for this answer set." when the answers are Prohibited or outside the EU. An unanswered form shows neither. The wizard does not block a caller who ignores it.
- **Annex I.** Product-embedded systems follow 2 August 2028 and are not a separate tier.
- **Shared limits.** The ingestion rate limit and the halt SSE bus are single-process.
- **Trademark.** The MIT License text in the repository `LICENSE` applies to `packages/sdk`, `packages/core`, `packages/react`, `packages/mcp`, and `packages/c2pa`. Those workspace packages stay `"private": true`. Published versions are `spurvik@1.0.3`, `spurvik-sdk@1.0.3`, and `spurvik-mcp-server@1.0.2`. The hosted console at https://console.spurvik.com is a hosted service. Its source is not in this repository and the MIT licence does not cover it.
