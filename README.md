# Spurvik

Spurvik is a developer control plane that **supports your EU AI Act work**: hash-chained record-keeping, human-oversight hooks, and transparency notices. It is infrastructure. It is not a conformity assessment, a certification, or legal advice.

Regulation (EU) 2024/1689 is the legal instrument. Dates below follow the AI Omnibus timeline and the Commission’s Code of Practice on Transparency of AI-generated Content. Have counsel confirm how they apply to a specific system.

## What this repository contains

Milestones 1–4, scoped to the EU market.

| Piece | Role |
| --- | --- |
| `apps/web` | Next.js control plane, ingestion API, and operator console. |
| `packages/sdk` | `withSpurvik()` wrapper for OpenAI, Anthropic, and Gemini-shaped clients, `spurvikMiddleware()` for the Vercel AI SDK, plus Mastra, OpenAI Agents, and LangGraph adapters. |
| `packages/react` | Always-visible Article 50 labels, in all 24 official EU languages. |
| `packages/core` | Hashing, provenance signatures, text-marking hook, audit-chain checks, webhook signatures. |
| `packages/mcp` | Local stdio MCP server. Setup snippets, an unwrapped-call scan, HMAC receipt explanations, and marking-hook notes. Private. Not published. |

Features designed to support Article 12(3) logging for remote biometric identification systems (Annex III point 1(a); high-risk requirements apply from 2 December 2027) are in the control plane. Two-person confirmation is a product setting. It checks that two different member accounts confirmed the decision. Image marking support (`@spurvik/c2pa`) is a separate package under the MIT License. It stays private in this repository.

## Quickstart

> **Licence.** `@spurvik/sdk`, `@spurvik/core`, `@spurvik/react`, `@spurvik/mcp`, and `@spurvik/c2pa` are licensed under the MIT License (Copyright (c) 2026 EyeTea Solutions ApS (CVR 37093378)) and are provided without warranty. The control plane in `apps/web` is not open source and is outside that grant: you may run it only under a design-partner or pilot agreement with EyeTea Solutions ApS. See **Trademark** below.

The full walkthrough, with expected output for every step, is in [`docs/quickstart.md`](docs/quickstart.md). Errors we hit while testing it are in [`docs/troubleshooting.md`](docs/troubleshooting.md). For a plain-language overview, see [`docs/onboarding-startups-smes.md`](docs/onboarding-startups-smes.md).

Guides: [`docs/quickstart.md`](docs/quickstart.md), [`docs/5-minute-quickstart.md`](docs/5-minute-quickstart.md), [`docs/sandbox-first-5-minutes.md`](docs/sandbox-first-5-minutes.md), [`docs/langgraph-quickstart.md`](docs/langgraph-quickstart.md), [`docs/hitl-approval-mapping.md`](docs/hitl-approval-mapping.md), [`docs/console-onboarding.md`](docs/console-onboarding.md), [`docs/adapters-quick-cards.md`](docs/adapters-quick-cards.md), [`docs/claude-code-plugin.md`](docs/claude-code-plugin.md), [`docs/faq-additions.md`](docs/faq-additions.md), [`docs/faq-sandbox-2x2.md`](docs/faq-sandbox-2x2.md), [`docs/faq-console-and-quickstart.md`](docs/faq-console-and-quickstart.md), [`docs/faq-hitl-and-plugin.md`](docs/faq-hitl-and-plugin.md), and [`docs/faq-art50-marking-and-pl-locale.md`](docs/faq-art50-marking-and-pl-locale.md).

**Get the package.** `@spurvik/sdk` is not on npm, so `npm install @spurvik/sdk` returns 404. We will announce it here if and when it is published to npm. Use only the 0.1.0 packages you build from this repository. Do not install `@spurvik/sdk` from npm or from any URL, including `spurvik.com/sdk/latest.tgz`. Builds previously served at spurvik.com/sdk/latest.tgz are not this SDK, are unsupported and must not be relied on to check records. Build and pack the two packages (Node.js 22 or later, as in `engines`):

```bash
pnpm install
pnpm --filter "@spurvik/sdk..." build
mkdir -p ../spurvik-packs
(cd packages/core && pnpm pack --pack-destination ../../../spurvik-packs)
(cd packages/sdk && pnpm pack --pack-destination ../../../spurvik-packs)
```

In your app (an ES module project, because the example uses top-level `await`):

```bash
npm pkg set type=module
npm install openai ../spurvik-packs/spurvik-core-0.1.0.tgz ../spurvik-packs/spurvik-sdk-0.1.0.tgz
```

**Wrap a call and check the record:**

```ts
import OpenAI from "openai";
import { provenanceOf, verifyProvenanceSignature, withSpurvik } from "@spurvik/sdk";

const ai = withSpurvik(new OpenAI(), {
  apiKey: process.env.SPURVIK_API_KEY!, // spurvik_live_…, printed once by `pnpm db:seed`
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

**Keys and environment variables.** The project API key has the form `spurvik_live_` plus at least 32 base64url characters. `pnpm db:seed` prints one for local use (43 characters after the prefix). It is sent as a Bearer token, and the server stores only its SHA-256 hash. `SPURVIK_SIGNING_SECRET` and `SPURVIK_CONTENT_HASH_SECRET` stay in the caller and are never sent to the control plane. Keep them: records signed with a lost secret can no longer be checked. None of these has a built-in default: the project key comes from your own `pnpm db:seed`, and the two secrets from your own configuration. The SDK reads none of these variables by itself; your code passes them in. `AEGIS_*` environment variables are read only by the control plane server (`apps/web`) in this release, with a deprecation warning. Keys issued as `aegis_live_` and `aegis_pub_` still authenticate. New keys use the Spurvik prefixes.

`baseUrl` is the control plane you run. In production the SDK throws if it is omitted. Development and tests still default to `http://127.0.0.1:43123`.

**If the control plane is unreachable,** the wrapped model call still succeeds and returns its record (except for `high_annex3`, which fails closed). In a short script the telemetry event is lost: `onTelemetryError` is called once, `await shutdown()` returns, and the process exits with code 0. A long-running process calls `onTelemetryError` once. In this pre-release build, an event that is queued after a failed flush stays in memory (up to 500 events; the oldest are dropped first) and is sent with a later flush: on the next wrapped call, on `await ai._spurvik.shutdown()`, or once when the process ends on its own. Nothing retries it on a timer. The event whose flush already failed is not tried again when the process ends on its own unless something was queued after it, and `process.exit()` or a signal such as Ctrl+C skips that last flush. Calling `await ai._spurvik.shutdown()` before the process exits gives queued events one more try (up to 8 seconds by default). This is not in `987ec86`, the build design partners run. With `high_annex3`, a halt check that times out throws `SpurvikOversightTimeoutError` (a `SpurvikHaltedError`), while an error response from the control plane throws `SpurvikApiError`, an API error that is a `SpurvikError`, not a `SpurvikHaltedError`; in both cases the provider is not called. See `docs/troubleshooting.md`. In this release, do not rely on the control plane as your only copy of these events. Keep your own records as well.

`article50Disclosure` defaults to false. Set it to true only when you state that an Article 50(1) interaction notice is shown. The flag is configuration. It is not a finding that the notice was shown or that it is sufficient.

`riskTier` is your own classification (as provider or deployer); Spurvik does not classify your use case.

- `minimal` — no transparency or high-risk controls configured by default.
- `limited_art50` — Article 50 transparency support (interaction notice, optional marking hook).
- `high_annex3` — for high-risk use under Annex III. The wrapper checks the human stop before inference.

Article 12 (record-keeping) and Article 11 with Annex IV (technical documentation) apply to high-risk (Annex III) systems from **2 December 2027**. Article 14 applies to high-risk AI systems listed in Annex III from 2 December 2027. Annex I systems embedded in regulated products follow **2 August 2028** and are not a separate tier here.

## Documentation

| Guide | What it covers |
| --- | --- |
| [Full quickstart](docs/quickstart.md) | Expected output for every step of the local walkthrough. |
| [5-minute quickstart](docs/5-minute-quickstart.md) | Wrap one model call, keep the provenance record, and check its HMAC signature. |
| [Sandbox first 5 minutes](docs/sandbox-first-5-minutes.md) | Public 2x2 sandbox cockpit before you set up keys. |
| [Console onboarding](docs/console-onboarding.md) | Sandbox, hosted console, and a local control plane. |
| [LangGraph quickstart](docs/langgraph-quickstart.md) | Wrap compiled LangGraph workflows (`@spurvik/sdk/langgraph`), read HMAC receipts, render `<AIDisclosureLabel />` (including Polish `locale="pl"` copy), and map `interrupt()` / `Command({ resume })` to `/api/v1/hitl`. |
| [HITL approval mapping](docs/hitl-approval-mapping.md) | Map Vercel AI SDK `interrupted`, OpenAI Agents `needsApproval`, and LangGraph `interrupt()` into Spurvik's human-oversight queue. |
| [Adapter quick cards](docs/adapters-quick-cards.md) | `withSpurvikMastra`, `withSpurvikModel` / `withSpurvikModelProvider`, and `withSpurvikLangGraph`. |
| [Claude Code plugin](docs/claude-code-plugin.md) | `/spurvik:check`, `/spurvik:wrap`, and `/spurvik:engineering-summary`. |
| [FAQ additions](docs/faq-additions.md) | Pricing, install, MCP tools, HITL, Polish `locale="pl"`, and Art. 50(2) marking questions. |
| [FAQ: sandbox 2x2](docs/faq-sandbox-2x2.md) | Sandbox cockpit behaviour and shell environment precedence. |
| [FAQ: console and quickstart](docs/faq-console-and-quickstart.md) | Signup, keys, and the 5-minute path. |
| [FAQ: HITL and plugin](docs/faq-hitl-and-plugin.md) | Tool approvals, checkpoint pause/resume, and Claude Code plugin install. |
| [FAQ: Art. 50(2) marking and Polish locale](docs/faq-art50-marking-and-pl-locale.md) | Art. 50(2) marking ahead of 2 December 2026 (Art. 111(4)), Polish `locale="pl"` copy (Ruling D24), and LangGraph. |
| [Claude Code submission draft](docs/distribution/claude-code-submission.md) | Pre-release draft. Do not submit. |
| [Website marketplace manifest](docs/distribution/spurvik-com-marketplace.json) | Staged website marketplace manifest for `spurvik.com/.claude-plugin/marketplace.json`. |

## Provenance is not Article 50(2) marking

`provenanceOf(res)` is exported from `@spurvik/sdk`. It reads a **provenance record**: timestamp, model id, keyed fingerprints, an Article 50(1) disclosure flag, the upstream marking status, and an HMAC-SHA-256 signature. `markingApplied` and `evidenceTrailerAttached` are inside that signature. The same value is on `res._spurvik_provenance`. `provenanceOf` also reads `_aegis_provenance` from earlier responses. Check the signature with `verifyProvenanceSignature`. A match shows the signed fields still match the HMAC-SHA-256 signature made with your signing secret. It does not show that a notice was shown, that output is marked, or that your system meets the Act.

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

The methods `withSpurvik` records, and the ones it leaves alone, are listed in `packages/sdk/README.md`. Embeddings, image generation, speech, moderations, batches, and file uploads have no provenance record. Chat, messages, responses, Gemini `generateContent`, and Gemini chat `sendMessage` are wrapped, including the stream helpers covered in that table. `@spurvik/sdk/ai` exports `spurvikMiddleware` for `wrapLanguageModel`. `@spurvik/sdk/mastra` passes that middleware to `wrapLanguageModel` for a Mastra agent model. `@spurvik/sdk/openai-agents` wraps an Agents SDK `Model` and `ModelProvider`. A thrown provider call does not produce a record. Telemetry is queued and sent in batches, on `shutdown()`, and once as the process exits. A call does not flush the queue by itself.

The disclosure label does not write browser storage unless the integrator sets `beacon.consent` to true. The site operator obtains that consent. Without it, the label still renders and sends nothing. A server-side note that a page containing the label was served does not use the beacon.

## Upstream marking evidence

A deployer that wraps a third-party model may rely on that provider's output marking only when it can show the marking works. `withSpurvik` (and the `withAegis` alias) records one signed evidence event per wrapped call. The event stores the provider, the model, the modality, marking settings the request and the response actually expose, and `upstreamMarking`. Settings are read only from flags and headers the SDK object carries (`watermark`, `synthid`, `c2pa`, provenance headers, and the same names inside `metadata`, `generationConfig`, or a `withResponse()` body). When the public SDK object has no such field, the status is `unknown`, including OpenAI text (no per-request parameter), Anthropic models the dated help-center table does not list, Gemini text, and Mistral. Cloud-partner routes (Bedrock, Vertex, Foundry, Azure) are not inferred from the first-party table. The support table in `packages/core/src/upstream-support.ts` is dated and lists a source URL on each row.

The evidence is HMAC-SHA-256 with the client-held signing secret and is stored beside the audit chain. It is not part of the record hash. Each event records `routeKind` (`direct`, `bedrock`, `vertex`, `azure`, or `foundry`) and `markingSource` (`response`, `request`, `header`, or `none`). Set `upstreamRoute` on `withSpurvik` when the SDK path does not contain the route name. The control plane checks the payload shape and that the event id matches. It does not hold the secret, so it does not recompute the signature. `verifyUpstreamMarkingEvidence` does that on the client. A match shows the payload still matches the HMAC-SHA-256 signature made with your signing secret. It is designed to support your EU AI Act work.

`packages/core/src/marking-registry.ts` lists OpenAI, Anthropic, Google, Mistral, and open-weight models for text, image, audio, and video. Each entry has a source URL and the date that source was read (`sourceReadOn`). Edit that list when a public page changes.

The project page **Marking** writes a documented-limits statement for text outputs, where a robust mark is not something the stored SDK signals can show, plus coverage per model and modality. Download JSON from that page. The same rows are included in the owner project export. Deleting the project removes them.

## Human oversight

The human-review queue is built into this control plane. The oversight page and `submitHumanDecision()` write the same decision rows. Any organisation member can halt or decide in the console. Deciding through the API needs a reviewer token, which only an organisation owner can issue. You choose who in your organisation does human oversight (Art. 26(2), for high-risk AI systems). Article 14 applies to high-risk AI systems listed in Annex III from 2 December 2027.

Article 14 requires more than an approve/reject gate for high-risk systems, including the ability to override the system and to interrupt it.

- `requireHumanApproval(actionName, payload)` creates a pending row and polls `/api/v1/hitl/:id` until the status leaves `pending` and `pending_confirmation`, or the wait ends.
- `submitHumanDecision(id, { status, reason })` records an API decision. `decisionSource` is `api`. The console sets `console`. Approve, reject, and override each require a reason. The reason stays on the decision row and is not an input to the record hash.
- A final decision, and the first half of a two-person confirmation, appends a `human_decision` hash-chain row. That row stores the approval id, the status, and the source. Rows sealed before this field omit it, so their hashes still match.
- `overrideHumanDecision(id, { reason })` records a human reversal. The caller is `reviewerToken`, not a free-text id.
- `engageKillSwitch({ reason, actionName })` halts a whole project or one action, and `releaseKillSwitch({ reason, actionName })` releases it (leave out `actionName` for the whole project). Both need `reviewerToken` and send `x-spurvik-reviewer`. In the SDK, `reason` is optional for both. Always pass one:

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

## Run locally

Requirements: Node.js 22, pnpm 10, PostgreSQL 16.

```bash
docker compose up -d   # or use a local Postgres on port 5432
cp apps/web/.env.example apps/web/.env
# Generate your own values. Do not copy a sample secret. For example: openssl rand -hex 32
echo "SPURVIK_LOG_CHECKPOINT_SECRET=$(openssl rand -hex 32)" >> apps/web/.env
echo "SPURVIK_WEBHOOK_KEK=$(openssl rand -hex 32)" >> apps/web/.env
pnpm install
pnpm --filter "@spurvik/web^..." build
pnpm db:migrate
pnpm db:seed           # prints a reviewer login, a spurvik_live_ key, a spurvik_pub_ key, and a spurvik_reviewer_ token once
pnpm dev               # http://127.0.0.1:43123
```

Default database URL: `postgres://aegis:aegis@127.0.0.1:5432/aegis`.

The two `echo` lines set the control-plane keys. There are no built-in defaults: without `SPURVIK_LOG_CHECKPOINT_SECRET` (at least 16 characters) and `SPURVIK_WEBHOOK_KEK` (32 bytes), `pnpm dev` stops with `Refusing to start. Missing SPURVIK_LOG_CHECKPOINT_SECRET and SPURVIK_WEBHOOK_KEK.` and exits with code 1. `pnpm dev` reads the two keys from `apps/web/.env`; a value already set in your shell takes precedence. `pnpm db:seed` does not create them. Keep both keys; checkpoints and webhook secrets made with one key cannot be checked or read with another.

```bash
pnpm build
pnpm test
pnpm typecheck
bash scripts/ci/no-default-keys.sh
```

The default-key scan is that script. Each package under `packages/` also runs it from `prepublishOnly`. `.github/workflows/no-default-keys.yml` runs it for GitHub pull requests and for pushes to `main`. Origin does not run GitHub Actions. This repository has no Depot, Buildkite, or CircleCI app connected, so an Origin pull request does not show that check until one of those apps is connected. Run the script before publishing.

Integration tests use `postgres://aegis:aegis@127.0.0.1:5432/aegis_test` and apply the same migrations. Create that database before `pnpm test` if it does not exist.

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

Each organisation has a plan, shown on the project page:

| Plan | Default retention |
| --- | --- |
| Developer (free) | 30 days |
| Team | 90 days |
| Business | 12 months |
| Enterprise | A per-project period, in days. Unset Enterprise projects keep 365 days until an owner sets one. |

Business is the plan between Team and Enterprise. The plan applies to the whole organisation. For a project recorded as `high_annex3`, retention cannot go below six months. Until an owner confirms the risk tier, the project is treated as `high_annex3` for retention: logs are kept for at least six calendar months, and a recorded other law is not applied. Articles 19 and 26(6) require logs to be kept at least that long unless another law says otherwise. Once the tier is confirmed, an owner can record that other law, with a short note, and the floor is then not applied. Spurvik does not check that law. That is a product rule. It is not a finding that the project meets those articles.

`pnpm purge-logs` deletes a prefix of audit rows older than the project's period and writes a signed checkpoint of the last purged hash. Remaining rows are not rewritten, so their hashes still match, and the next append continues from the chain head. Schedule it daily. Set `SPURVIK_LOG_CHECKPOINT_SECRET` (at least 16 characters) and keep it: the ledger uses the same secret to check the checkpoint. The key is required in every mode. The app refuses to run a purge when that variable is missing or only whitespace, including when `SPURVIK_ALLOW_TEST_KEYS=1` is set. That flag is for local testing only, gives no integrity protection, and is refused when `NODE_ENV` or `VERCEL_ENV` is production. It does not sign a purge. Checkpoints signed with the old development fallback will not verify. Do not reuse any key or secret value from an earlier release. Expect those checkpoints to fail verification. A matching checkpoint shows that the checkpoint's fields (project, sequence number, that hash and the purge time) still match the HMAC-SHA-256 signature made with your checkpoint secret. It is not a finding that your system meets the Act. A purge is not erasure of the project.

## Project export and deletion

An organisation owner can download `GET /dashboard/projects/:id/export`. The JSON includes the project profile, audit logs, human decisions, oversight, disclosures, API key metadata (kind, last four characters, revoked time), purge checkpoints, and the webhook URL. It omits the webhook secret and API key hashes. Deleting the project removes the project row. Related logs, keys, and checkpoints cascade. Member accounts and reviewer tokens stay. That deletion is separate from the retention purge.

## Self-hosted calls

A deployment that runs `apps/web` and its own Postgres, with the SDK `baseUrl` pointed at that deployment, does not send data to the publisher of this software. SDK telemetry and the halt stream go to `baseUrl`. The disclosure beacon goes to the endpoint you pass. Webhooks go to the project webhook URL. There is no licence ping, error reporter, update check, or analytics call. `SPURVIK_TELEMETRY` is ignored unless it is `off`, and `GET /api/v1/health` reports `vendorTelemetry: "off"`. There is no switch that turns a vendor sink on. The console uses the system font stack, so a build does not request a font host.

## Disclosure labels

```tsx
import { AIDisclosureLabel, AIDisclosureDetails } from "@spurvik/react";

<AIDisclosureLabel
  notice="interaction" // or "generated" | "deepfake" | "public-interest"
  presentation="inline" // pill; "block" is the default
  locale="de" // 24 official EU languages, or registerDisclosureLocale
  euIcon // optional Commission icon; always paired with visible text
  beacon={{ endpoint: "http://127.0.0.1:43123/api/v1/disclosure", apiKey: process.env.NEXT_PUBLIC_SPURVIK_PUB_KEY! }}
/>
<AIDisclosureDetails riskTier="limited_art50" modelSummary="gpt-4o" provenance={{ signature: "unchecked" }} />
```

Sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.

The label text is in the page without a click. The dialog is supplementary. A beacon fires once per session after `IntersectionObserver` reports the label on screen. Pass `spurvik_pub_…`, not the live key. Browser keys `aegis.disclosure.*` are copied to `spurvik.disclosure.*` and then deleted. That migration is removed in 1.0, and no later than 26 January 2027. The official EU icons (basic, AI-generated, AI-modified) are the Commission’s optional marks for Article 50(4). Using one does not by itself meet Article 50.

`/labels` renders the variants, including `AIArticle50Section3Notice` for Article 50(3). The console is at `/login`.

## Operator console

Organisation members sign in with an email and a scrypt password. `pnpm db:seed` prints a reviewer password and a reviewer token once. Any organisation member can halt or decide in the console. Deciding through the API needs a reviewer token, which only an organisation owner can issue. You choose who in your organisation does human oversight (Art. 26(2), for high-risk AI systems). Only an organisation owner can create, rotate, or revoke live and disclosure keys. A member can revoke their own reviewer token. Only an organisation owner can issue a reviewer token. You can set log retention, run the EU risk wizard, read the hash-chained log designed to support Article 12 record-keeping, read upstream marking coverage, decide the human-oversight queue, engage a stop, download **Annex IV technical documentation (draft)** as Markdown or PDF, and, as an owner, export or delete the project. The Data inventory page lists what an owner can export and what is withheld. There is no switching fee in this software.

The wizard asks whether the system is on the EU market, whether an Article 5 practice is Prohibited, which Annex III areas apply, and which Article 50 triggers apply. Prohibited answers do not produce an SDK snippet. Social scoring covers public and private actors (Article 5(1)(c)). Non-consensual intimate deepfakes (Article 5(1)(ba)) and generating child sexual abuse material (Article 5(1)(bb)) are included and apply from 2 December 2026. The recorded tier is your answer.

The Annex IV file is a draft assembled from project fields and ledger counts. Section 2 carries the system description, including the wizard answers. Section 5, the Article 9 risk-management system, says “To be completed by the provider.” Conformity assessment, the EU declaration of conformity, and CE marking are separate steps and are not produced by the export.

## Not legal advice

Spurvik helps a team implement technical measures that map to parts of Articles 12, 14, and 50 and to the Annex III / Article 50 product taxonomy. Using it does not make a system conformant. It does not perform a conformity assessment, issue an EU declaration of conformity, apply CE marking, run a quality management system, or register a system in the EU database. The Annex IV download is a draft. The risk wizard records your answers. It labels Article 5 practices Prohibited. It does not decide that a use is high-risk under Article 6.

Deploy notes and the environment checklist are in `DEPLOY.md`. This tree does not claim that data stays in the EU. Security headers, rate limits, and secret handling are in `THREAT_MODEL.md` and `SECURITY.md`. A draft Cyber Resilience Act reporting runbook is in `docs/cra-article-14-reporting.md`. Data Act export notes are in `docs/data-act.md`. Packages stay private until the trademark is filed; see `LICENSE` and `SPLIT.md`.

## Starters

`templates/` and `integrations/` are 0.x starters. `@spurvik/sdk` is 0.1.0, private, and not on npm. The starters depend on it with `workspace:*`. Build them with `pnpm templates:build`.

`@spurvik/sdk/ai` exports `spurvikMiddleware` for the Vercel AI SDK (`ai` 7). Pass it to `wrapLanguageModel`. It logs the call and attaches an HMAC provenance receipt. It does not mark content. A marking hook is the caller's.

| Piece | MCP setup |
| --- | --- |
| `packages/mcp` | `@spurvik/mcp` 0.1.0, `"private": true`, not published. Read-only tools: `spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, `spurvik_marking_hooks`. `.cursor/mcp.json` and `.vscode/mcp.json` run `node ${workspaceFolder}/packages/mcp/dist/index.js --root ${workspaceFolder}`. `plugins/spurvik/.mcp.json` runs `node ${CLAUDE_PLUGIN_ROOT}/bin/spurvik-mcp.mjs --root ${CLAUDE_PROJECT_DIR}`, bundled from `@spurvik/mcp` 0.1.0 via `node packages/mcp/scripts/bundle-plugin.mjs`. `apps/web` serves the stateless Streamable HTTP MCP route `/api/mcp`. |
| `plugins/spurvik` | Claude Code plugin. The same four read-only tools are `spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, and `spurvik_marking_hooks`. `plugins/spurvik/.mcp.json` runs `node ${CLAUDE_PLUGIN_ROOT}/bin/spurvik-mcp.mjs --root ${CLAUDE_PROJECT_DIR}`, bundled from `@spurvik/mcp` 0.1.0 via `node packages/mcp/scripts/bundle-plugin.mjs`. `.cursor/mcp.json` and `.vscode/mcp.json` run `node ${workspaceFolder}/packages/mcp/dist/index.js --root ${workspaceFolder}`. `apps/web` serves the stateless Streamable HTTP MCP route `/api/mcp`. |

`packages/mcp` (`@spurvik/mcp`) and `plugins/spurvik` expose the same four read-only MCP tools: `spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, and `spurvik_marking_hooks`. `packages/mcp` is a local stdio MCP server for Cursor, VS Code, and other MCP clients. Version 0.1.0. `"private": true`. Not published. It is a pre-release, and there is nothing to install from npm. Build it with `pnpm install` and then `pnpm --filter "@spurvik/mcp..." build`, and start `node packages/mcp/dist/index.js --root .`. Cursor and VS Code read `.cursor/mcp.json` and `.vscode/mcp.json`, which run `node ${workspaceFolder}/packages/mcp/dist/index.js --root ${workspaceFolder}`. The Claude Code plugin reads `plugins/spurvik/.mcp.json`, which runs `node ${CLAUDE_PLUGIN_ROOT}/bin/spurvik-mcp.mjs --root ${CLAUDE_PROJECT_DIR}`. That server file is bundled from `@spurvik/mcp` 0.1.0 via `node packages/mcp/scripts/bundle-plugin.mjs`. `apps/web` also serves the stateless Streamable HTTP MCP route `/api/mcp`. The tools do not call the Spurvik API or any network. The SDK logs the call and attaches an HMAC receipt. It does not mark content. `riskTier` in a snippet is a sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case. The scanner skips files named .env or .env.* (any case), including through symlinks and hard links. Config examples are in `packages/mcp/README.md`.

## Still open

- **Code of Practice detection.** Signatories commit to interoperable detection by 2 February 2027. The C2PA hook is a manifest writer and reader, not that detection programme.
- **Public C2PA trust.** A private CA signs, and the verify route reports `not_on_trust_list`. Putting a certificate on a public trust list is the operator's step.
- **Article 5.** Prohibited practices are not a risk-tier value. The wizard shows an SDK setup when the answers produce a tier. It shows "No SDK setup is offered for this answer set." when the answers are Prohibited or outside the EU. An unanswered form shows neither. The wizard does not block a caller who ignores it.
- **Annex I.** Product-embedded systems follow 2 August 2028 and are not a separate tier.
- **Shared limits.** The ingestion rate limit and the halt SSE bus are single-process.
- **Trademark.** The MIT License text in the repository `LICENSE` applies to `packages/sdk`, `packages/core`, `packages/react`, `packages/mcp`, and `packages/c2pa`, as scoped in `NOTICE`. Starter folders under `templates/` and `integrations/` carry the same MIT text. Those workspace packages and starters stay `"private": true` at `0.1.0`. `apps/web` is outside that grant. See `SPLIT.md`.
