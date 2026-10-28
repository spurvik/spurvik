# LangGraph Quickstart (`@spurvik/sdk/langgraph`, `@spurvik/sdk`, and `@spurvik/react`)

> **.** LangGraph quickstart on `spurvik` `main` (`8e16fad`). Public MIT packages on npm: `spurvik@1.0.1`, `spurvik-sdk@1.0.1`, and `spurvik-mcp-server@1.0.2` (monorepo workspace packages `@spurvik/sdk`, `@spurvik/core`, and `@spurvik/react` use workspace version `1.0.1`, MIT). The `apps/web` control plane is outside that grant. Designed to support Article 50(1) notices and, for high-risk systems, Article 12 record-keeping and Article 14 human oversight. The oversight record shows what happened, when, and who acted. Not legal advice.
>
> *Source: https://github.com/spurvik/spurvik. npm: `spurvik@1.0.1`, `spurvik-sdk@1.0.1`, `spurvik-mcp-server@1.0.2`.*

---

## What You Will Build

In about 5 minutes, this guide walks through connecting a LangGraph (`@langchain/langgraph`) workflow to Spurvik:

1. **Wrap a compiled graph with `withSpurvikLangGraph` (`@spurvik/sdk/langgraph`)** so every `invoke()` and `stream()` run checks the project halt state, hashes user and assistant messages with keyed HMAC-SHA-256 (`0` bytes of raw prompt or output text stored at rest), and attaches a signed 16-field `ProvenanceRecord` onto the graph state (`provenanceFromLangGraphState(state)` / `provenanceOf(state)`).
2. **Wrap individual model calls inside a node (`withSpurvik` from `@spurvik/sdk`)** when a graph runs multiple model steps and you want a per-node receipt alongside the graph-level receipt.
3. **Return receipt metadata to a React UI (`@spurvik/react`)** using `<AIDisclosureLabel />`, `<AIArticle50Section3Notice />`, and `<AIDisclosureDetails />` — including the built-in Polish (`locale="pl"`) copy and optional gender-neutral override (Legal Ruling D24).
4. **Map LangGraph `interrupt()` and `Command({ resume })` pauses to Spurvik's human-oversight queue** using `spurvikInterrupt` and `resolveLangGraphInterrupts` (or non-blocking checkpoint pause + `verifyHitlWebhook`), with `engageKillSwitch` / `releaseKillSwitch` halt controls.

---

## 1. Prerequisites & Package Build

`@spurvik/sdk/langgraph` uses a structural `LangGraphRunnableLike` type (`invoke(input, callOptions?)` and optional `stream(input, callOptions?)`) and does not import `@langchain/langgraph` at runtime. `@langchain/langgraph` (`^1.0.0`) is an optional peer dependency in your application. The public packages expose the same subpath as `spurvik/langgraph` and `spurvik-sdk/langgraph`.

Install the live MIT packages first:

```bash
npm install @langchain/langgraph spurvik@1.0.1 spurvik-sdk@1.0.1
```

Or build the `1.0.1` workspace tarballs from https://github.com/spurvik/spurvik (plugin tree: https://github.com/spurvik/spurvik/tree/main/plugins/spurvik):

```bash
git clone https://github.com/spurvik/spurvik.git spurvik
cd spurvik
pnpm install
pnpm --filter @spurvik/core --filter @spurvik/sdk --filter @spurvik/react build
```

If you are installing the  packages into a separate LangGraph project, pack the tarballs from `packages/core`, `packages/sdk`, and `packages/react`:

```bash
(cd packages/core && pnpm pack --pack-destination /tmp)
(cd packages/sdk && pnpm pack --pack-destination /tmp)
(cd packages/react && pnpm pack --pack-destination /tmp)
```

Then install `@langchain/langgraph` and the packed tarballs in your application:

```bash
pnpm add @langchain/langgraph /tmp/spurvik-core-1.0.1.tgz /tmp/spurvik-sdk-1.0.1.tgz /tmp/spurvik-react-1.0.1.tgz
```

Set your project credentials in the environment (the SDK never reads `process.env` implicitly; pass each field in `SpurvikConfig`):

```bash
export SPURVIK_API_KEY="spurvik_live_<your_40_hex_char_project_key>"
export SPURVIK_SIGNING_SECRET="<your_signing_secret_at_least_16_chars>"
export SPURVIK_CONTENT_HASH_SECRET="<your_content_hash_secret_at_least_16_chars>"
export SPURVIK_BASE_URL="https://console.spurvik.com" # or http://127.0.0.1:3000 for local control plane
export SPURVIK_REVIEWER_TOKEN="spurvik_reviewer_<your_40_hex_char_reviewer_token>"
```

> **Local control-plane note (`@next/env` shell variable precedence):** If you run the local control plane (`apps/web`), `loadEnvConfig` does not overwrite variables already exported in your shell. Run `env | grep -E '^(SPURVIK_|AEGIS_|DATABASE_URL=)'` and `unset SPURVIK_WEBHOOK_KEK DATABASE_URL` before `pnpm db:seed` or `pnpm --filter @spurvik/web dev` if stale variables are present. See [`docs/5-minute-quickstart.md`](./5-minute-quickstart.md#troubleshooting-stale-shell-variables-nextenv-precedence-trap-spurvik_webhook_kek--database_url).

---

## 2. Wrap a Compiled LangGraph (`withSpurvikLangGraph`)

Import `withSpurvikLangGraph`, `provenanceFromLangGraphState`, and `provenanceOf` from `@spurvik/sdk/langgraph`:

```ts
import { verifyProvenanceSignature, type ProvenanceRecord } from "@spurvik/core";
import type { SpurvikConfig } from "@spurvik/sdk";
import {
  provenanceFromLangGraphState,
  provenanceOf,
  withSpurvikLangGraph,
} from "@spurvik/sdk/langgraph";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Set it in the environment.`);
  return value;
}

const spurvikConfig = {
  apiKey: requireEnv("SPURVIK_API_KEY"),
  signingSecret: requireEnv("SPURVIK_SIGNING_SECRET"),
  contentHash: {
    mode: "keyed",
    secret: requireEnv("SPURVIK_CONTENT_HASH_SECRET"),
  },
  baseUrl: requireEnv("SPURVIK_BASE_URL"),
  riskTier: "limited_art50", // Sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.
  article50Disclosure: true, // Set true only when your UI renders an Art. 50(1) interaction notice.
} satisfies SpurvikConfig;

interface ChatMessage {
  role: string;
  content: string;
}

interface SupportState {
  messages: ChatMessage[];
  __interrupt__?: Array<{ id?: string; value?: unknown }>;
}

// Pass any compiled StateGraph (e.g. new StateGraph(...).compile({ checkpointer }))
export async function runSupportGraph(
  compiledGraph: {
    invoke: (input: SupportState, callOptions?: unknown) => Promise<SupportState>;
    stream?: (input: SupportState, callOptions?: unknown) => AsyncIterable<SupportState>;
  },
  userMessage: string,
): Promise<{
  state: SupportState;
  receipt: ProvenanceRecord | undefined;
  signatureMatches: boolean;
}> {
  const graph = withSpurvikLangGraph(compiledGraph, spurvikConfig, {
    modelId: "gpt-4o-mini",
  });

  const state = await graph.invoke({
    messages: [{ role: "user", content: userMessage }],
  });

  // Read the 16-field HMAC-SHA-256 provenance receipt from state
  const receipt = provenanceFromLangGraphState(state) ?? (await provenanceOf(state));
  const signatureMatches = receipt
    ? await verifyProvenanceSignature(receipt, spurvikConfig.signingSecret)
    : false;

  await graph.flush();
  return { state, receipt, signatureMatches };
}
```

### How `withSpurvikLangGraph` handles messages, streams, and interrupts

| Behaviour | Detail |
|---|---|
| **Pre-execution halt check** | Before `invoke()` or `stream()` runs, `withSpurvikLangGraph` calls `client.beforeInference()`. When `enforceHaltOnInference` is active (default `true` for `riskTier: "high_annex3"`) and the project is halted, it throws `SpurvikHaltedError` before the graph executes (`0` nodes run). |
| **Input & output fingerprinting** | `inputHash` hashes user/system/human messages from the input state and skips tool messages (`role` or `type` in `"tool"`, `"function"`, `"function_call_result"`), keeping raw tool payloads out of the fingerprint. `outputHash` hashes the final assistant/AI message content (or `output` / `content` string). The telemetry batch sent to `POST /api/v1/telemetry` contains `0` bytes of raw prompt or output text. |
| **Reading the receipt (`invoke` vs. `stream`)** | On `invoke()`, read the receipt synchronously with `provenanceFromLangGraphState(state)` or `provenanceOf(state)`. On `stream()`, `provenanceFromLangGraphState(lastChunk)` reads the receipt attached to the final chunk, and `await provenanceOf(stream)` resolves once the async iterator completes. |
| **Interrupted state (`__interrupt__`)** | When the returned state (or final stream chunk) contains a non-empty `__interrupt__` array, `withSpurvikLangGraph` defines `receipt.finishReason = "interrupted"` and `receipt.interrupted = true` as non-enumerable properties (`enumerable: false`). Because they are omitted from `Object.keys(receipt)` and `JSON.stringify(receipt)`, `verifyProvenanceSignature(receipt, signingSecret)` still checks the exact 16 canonical signed fields. |

---

## 3. Wrap Individual Model Calls Inside a Graph Node (`withSpurvik`)

If your LangGraph workflow runs multiple model nodes and you want a dedicated `ProvenanceRecord` per model call in addition to (or instead of) wrapping the outer compiled graph, wrap the provider client inside the node with `withSpurvik` from `@spurvik/sdk`:

```ts
import OpenAI from "openai";
import { verifyProvenanceSignature, type ProvenanceRecord } from "@spurvik/core";
import { provenanceOf, withSpurvik, type SpurvikConfig } from "@spurvik/sdk";

export interface NodeState {
  prompt: string;
  reply?: string;
  nodeReceipt?: ProvenanceRecord;
  signatureMatches?: boolean;
}

export function createDraftReplyNode(openaiClient: OpenAI, config: SpurvikConfig) {
  const ai = withSpurvik(openaiClient, config);

  return {
    node: async (state: NodeState): Promise<NodeState> => {
      const completion = await ai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: state.prompt }],
      });
      const reply = completion.choices[0]?.message?.content ?? "";
      const nodeReceipt = provenanceOf(completion);
      const signatureMatches = nodeReceipt
        ? await verifyProvenanceSignature(nodeReceipt, config.signingSecret)
        : false;

      return {
        ...state,
        reply,
        nodeReceipt,
        signatureMatches,
      };
    },
    flush: () => ai._spurvik.flush(),
  };
}
```

---

## 4. Render the Disclosure Notice & Receipt in React (`@spurvik/react`) + Polish (`locale="pl"`) Note (Ruling D24)

Pass the `ProvenanceRecord` returned by `provenanceFromLangGraphState(state)` (or stored on `state.nodeReceipt`) to your React UI and render `<AIDisclosureLabel />` and `<AIDisclosureDetails />` from `@spurvik/react`:

```tsx
import type { ProvenanceRecord } from "@spurvik/core";
import {
  AIArticle50Section3Notice,
  AIDisclosureDetails,
  AIDisclosureLabel,
  disclosureCopy,
  registerDisclosureLocale,
} from "@spurvik/react";

// Optional (Legal Ruling D24): Override the Polish Art. 50(3) emotion/biometric sentence
// if your team prefers gender-neutral Polish phrasing instead of the literal EU AI Act
// masculine singular participle ("Jesteś narażony...").
export function registerGenderNeutralPolishEmotionNotice(): void {
  const basePl = disclosureCopy("pl");
  registerDisclosureLocale("pl", {
    ...basePl,
    emotionBiometric:
      "Objęty działaniem systemu rozpoznawania emocji lub kategoryzacji biometrycznej.",
  });
}

export function LangGraphAssistantCard(props: {
  reply: string;
  receipt: ProvenanceRecord;
  signatureMatches: boolean;
  locale?: string;
  showEmotionBiometricNotice?: boolean;
}) {
  const locale = props.locale ?? "en";
  return (
    <section>
      <AIDisclosureLabel
        notice="interaction"
        systemName="Support Workflow"
        locale={locale}
        presentation="block"
      />
      {props.showEmotionBiometricNotice ? (
        <AIArticle50Section3Notice locale={locale} presentation="block" />
      ) : null}
      <p>{props.reply}</p>
      <AIDisclosureDetails
        record={props.receipt}
        signatureMatches={props.signatureMatches}
        locale={locale}
      />
    </section>
  );
}
```

### Polish (`locale="pl"`) disclosure copy in `@spurvik/react` (Legal Ruling D24)

`@spurvik/react` ships built-in copy for all 24 EU languages in `EU_DISCLOSURE_LOCALES` (`packages/react/src/locales.ts`). Under **Legal Ruling D24**, the built-in Polish (`locale="pl"`) strings are cleared for production use as written:

| Key in `EU_DISCLOSURE_LOCALES.pl` | Surface / EU AI Act reference | Built-in Polish string |
|---|---|---|
| `interaction` | `<AIDisclosureLabel notice="interaction" locale="pl" />` (Art. 50(1)) | `"Korzystasz z systemu AI."` |
| `emotionBiometric` | `<AIArticle50Section3Notice locale="pl" />` or `notice="emotion-biometric"` (Art. 50(3)) | `"Jesteś narażony na system rozpoznawania emocji lub kategoryzacji biometrycznej."` |
| `generated` / `generatedDetail` | `<AIDisclosureLabel notice="generated" locale="pl" />` | `"Wygenerowane przez AI"` / `"Te treści zostały wygenerowane przez system AI."` |
| `deepfake` | `<AIDisclosureLabel notice="deepfake" locale="pl" />` (Art. 50(4) subpara. 1) | `"Te treści zostały sztucznie wygenerowane lub zmanipulowane."` |
| `publicInterest` | `<AIDisclosureLabel notice="public-interest" locale="pl" />` (Art. 50(4) subpara. 2) | `"Ten tekst został sztucznie wygenerowany lub zmanipulowany i opublikowany w sprawie o znaczeniu publicznym."` |
| `riskTier` | `<AIDisclosureDetails locale="pl" />` | `"Zapisany poziom ryzyka"` *(role-neutral; does not assign provider/deployer status)* |
| `humanReadable` | `<AIDisclosureDetails locale="pl" />` | `"Ta etykieta jest informacją czytelną dla człowieka. Sama w sobie nie jest oznaczeniem maszynowym."` |
| `notLegalAdvice` | `<AIDisclosureDetails locale="pl" />` | `"Ta informacja wspiera obowiązki przejrzystości. Nie jest poradą prawną."` |
| `signatureMatches` | `<AIDisclosureDetails locale="pl" />` | `"Podpis jest zgodny z tym zapisem proweniencji."` |

- **Gender-neutral option for `emotionBiometric` (Ruling D24):** The built-in `emotionBiometric` string (`"Jesteś narażony na system rozpoznawania emocji lub kategoryzacji biometrycznej."`) mirrors the Polish EU AI Act text for Article 50(3) (*"osoby fizyczne, które są narażone na działanie systemu..."*) using a masculine singular adjective (`narażony`). If your product team prefers a gender-neutral phrasing in Polish, call `registerDisclosureLocale("pl", { ...disclosureCopy("pl"), emotionBiometric: "Objęty działaniem systemu rozpoznawania emocji lub kategoryzacji biometrycznej." })` (or `"Znajdujesz się w zasięgu działania systemu rozpoznawania emocji lub kategoryzacji biometrycznej."`) once at startup, as shown above.
- **Human-readable notice vs. Article 50(2) marking:** `<AIDisclosureLabel />` renders a visible DOM notice (`<aside role="note">`). Spurvik does not mark content itself. Its provenance record supports, but does not replace, Article 50(2) machine-readable marking.

---

## 5. Map LangGraph `interrupt()` and `Command({ resume })` to Spurvik's Human-Oversight Queue

When a high-risk LangGraph workflow (`riskTier: "high_annex3"`) pauses before a side-effecting tool or node, `@spurvik/sdk/langgraph` provides two patterns to connect LangGraph's `interrupt()` and `Command({ resume })` lifecycle to Spurvik's human-oversight queue (`/api/v1/hitl`). For a cross-framework comparison with Vercel AI SDK and OpenAI Agents SDK, see [`docs/hitl-approval-mapping.md`](./hitl-approval-mapping.md).

### Pattern A — `spurvikInterrupt` and `resolveLangGraphInterrupts` (`@spurvik/sdk/langgraph`)

1. **Inside a node (`spurvikInterrupt`):** Pass your action name, call ID, payload, and optional LangGraph `interrupt` function. `spurvikInterrupt` checks `assertNotHalted(actionName)` first (failing closed with `SpurvikHaltedError` if halted). If `interrupt(...)` returns an already-settled resume value (`{ approved, status, approvalId }`), `spurvikInterrupt` returns it immediately without creating a duplicate `/api/v1/hitl` row. Otherwise, it opens and polls the `/api/v1/hitl` row and returns `decision.command` (`{ resume }`).
2. **Outside the graph (`resolveLangGraphInterrupts` or `graph.resolveInterrupts`):** When `state.__interrupt__` contains one or more paused interrupts, `resolveLangGraphInterrupts(state.__interrupt__, config)` deduplicates interrupt IDs (`skippedDuplicateIds`), sends only structural field names (`payloadSummary`) to `POST /api/v1/hitl`, and returns `{ decisions, allApproved, skippedDuplicateIds, resumeById, command: { resume } }` ready to pass to `new Command(resolved.command)`.

```ts
import type { SpurvikConfig } from "@spurvik/sdk";
import {
  resolveLangGraphInterrupts,
  spurvikInterrupt,
  withSpurvikLangGraph,
} from "@spurvik/sdk/langgraph";

// 1. Inside a LangGraph node: gate an action with spurvikInterrupt
export async function issueRefundNode(
  input: { refundId: string; amountEur: number; customerEmail: string },
  config: SpurvikConfig,
  langGraphInterrupt?: (value: unknown) => unknown,
) {
  const decision = await spurvikInterrupt(
    {
      actionName: "issue_refund",
      callId: `refund_${input.refundId}`,
      // Only structural field names ("amountEur,customerEmail,refundId") + a keyed hash are sent.
      // Raw field values such as customerEmail are never sent to /api/v1/hitl.
      payload: input,
      interrupt: langGraphInterrupt,
    },
    config,
    { pollIntervalMs: 1_500, timeoutMs: 300_000 },
  );

  if (!decision.approved) {
    return {
      status: "halted_by_reviewer" as const,
      hitlStatus: decision.status, // "rejected" | "expired"
      approvalId: decision.resume.approvalId,
    };
  }

  return {
    status: "executed" as const,
    hitlStatus: decision.status, // "approved" | "overridden"
    approvalId: decision.resume.approvalId,
  };
}

// 2. Outside the graph: resolve state.__interrupt__ and build the Command({ resume }) payload
export async function resolvePausedGraphInterrupts(
  interrupts: ReadonlyArray<{
    id?: string;
    callId?: string;
    actionName?: string;
    value?: { id?: string; callId?: string; actionName?: string; payload?: Record<string, unknown> };
  }>,
  config: SpurvikConfig,
) {
  const resolved = await resolveLangGraphInterrupts(interrupts, config, {
    pollIntervalMs: 1_500,
    timeoutMs: 300_000,
  });

  // Pass resolved.command directly to new Command(resolved.command) when resuming compiledGraph.invoke(...)
  // - Single interrupt: resolved.command is { resume: decision.resume }
  // - Multiple interrupts: resolved.command is { resume: resolved.resumeById }
  return resolved;
}
```

### Pattern B — Non-blocking checkpoint pause + `hitl.decision` webhook resume

When human review takes minutes or hours and you do not want a worker holding an open polling loop:

1. Compute `const payloadSummary = buildPayloadSummary({ keys: Object.keys(payload).sort(), contentFingerprint: await fingerprintContent("keyed", canonicalJson(payload), hashSecret) })` (`@spurvik/core`) and `POST /api/v1/hitl` with `{ actionName, payloadSummary }` to create a `"pending"` row (`approval.id`).
2. Call LangGraph's `interrupt({ hitlApprovalId: approval.id, actionName, payloadSummary })` so the checkpointer persists the thread and exits the worker.
3. When a reviewer calls `client.submitHumanDecision(...)` (or `client.overrideHumanDecision(...)`), Spurvik signs and sends a `hitl.decision` webhook (`x-spurvik-signature`, `x-spurvik-timestamp`). Verify it with `verifyHitlWebhook` from `@spurvik/sdk` and resume the LangGraph thread with `new Command({ resume: envelope.approval })`.

See [`docs/hitl-approval-mapping.md`](./hitl-approval-mapping.md#3-langgraph-spurviksdklanggraph--spurvikinterrupt-resolvelanggraphinterrupts-and-webhook-resume) for the complete non-blocking webhook receiver code.

### Emergency halt and release (`engageKillSwitch` / `releaseKillSwitch`)

Reviewers holding a `spurvik_reviewer_...` token can halt or release an entire project or a single `actionName`:

```ts
import { SpurvikClient, type SpurvikConfig } from "@spurvik/sdk";

export async function haltAndReleaseRefundAction(config: SpurvikConfig) {
  const client = new SpurvikClient(config);

  const halted = await client.engageKillSwitch({
    actionName: "issue_refund",
    reason: "Manual audit of refund node",
  });

  const released = await client.releaseKillSwitch({
    actionName: "issue_refund",
    reason: "Manual audit completed",
  });

  await client.shutdown();
  return { halted, released };
}
```

- Both `engageKillSwitch({ reason })` and `releaseKillSwitch({ reason })` accept an optional `reason` in the SDK (defaulting to `"Halted via SDK (no reason given)"` and `"Released via SDK (no reason given)"`). Direct HTTP calls to `POST /api/v1/oversight` require a non-empty `reason` string (`400 Bad Request` if omitted).
- The oversight and audit record shows what happened, when, and who acted — never why.

---

## Where Next

- **HITL & approval mapping across Vercel AI SDK, OpenAI Agents, and LangGraph:** [`docs/hitl-approval-mapping.md`](./hitl-approval-mapping.md)
- **Mastra, OpenAI Agents, and LangGraph quick-cards:** [`docs/adapters-quick-cards.md`](./adapters-quick-cards.md)
- **Article 50(2) marking ahead of 2 December 2026 & Polish (`locale="pl"`) FAQ:** [`docs/faq-art50-marking-and-pl-locale.md`](./faq-art50-marking-and-pl-locale.md)
- **Console onboarding (`<AIDisclosureLabel />` props, webhooks, quotas, roles):** [`docs/console-onboarding.md`](./console-onboarding.md)
- **5-minute quickstart:** [`docs/5-minute-quickstart.md`](./5-minute-quickstart.md)
