# FAQ Additions — Article 50(2) Marking Ahead of 2 December 2026, Polish (`locale="pl"`) Disclosure Copy (Ruling D24), and LangGraph (`@spurvik/sdk/langgraph`)

> **Applies to:** `aegis-ai` `main` (`8e16fad`, `@spurvik/sdk` `0.1.0`, `@spurvik/core` `0.1.0`, `@spurvik/react` `0.1.0`, and `@spurvik/mcp` `0.1.0` pre-release) at https://github.com/spurvik/spurvik (plugin tree: https://github.com/spurvik/spurvik/tree/main/plugins/spurvik).
>
> **Scope.** Designed to support Article 50(1) AI-interaction notices and, for high-risk AI systems, Article 12 record-keeping and Article 14 human oversight. Spurvik does not mark content itself. Its provenance record supports, but does not replace, Article 50(2) machine-readable marking. The oversight and audit record shows what happened, when, and who acted — never why. Pre-release. Access by request. Planned prices at launch, excl. VAT. This is not legal advice.
>
> *Pre-release documentation (aegis-ai 8e16fad).*

---

### 21. What changes on 2 December 2026 for Article 50(2) machine-readable marking, and how does that relate to 2 August 2026?

Under Regulation (EU) 2024/1689 (the EU AI Act) as amended by the AI Omnibus Regulation (**Regulation (EU) 2026/1744**, published 24 July 2026, in force 27 July 2026):

- **2 August 2026 (`Article 113`):** General application date for **Article 50** transparency obligations (`Article 50(1)` AI-interaction notices, `Article 50(2)` machine-readable marking of synthetic audio, image, video, or text content for systems placed on the market on or after 2 August 2026, `Article 50(3)` emotion-recognition and biometric-categorisation notices, and `Article 50(4)` deepfake and public-interest text notices).
- **2 December 2026 (`Article 111(4)`, inserted by Regulation (EU) 2026/1744):** End of the transition window specifically for **Article 50(2)** machine-readable marking and detectability of **generative AI systems placed on the market before 2 August 2026**. Systems placed on the market on or after 2 August 2026 have been subject to Article 50(2) since 2 August 2026. *(Separately, the new prohibited practices in Article 5(1)(ba) and 5(1)(bb) also apply from 2 December 2026.)*
- **2 February 2027 (voluntary Code of Practice milestone):** Signatories to the European Commission's voluntary Code of Practice on marking and labelling of AI-generated content (published 10 June 2026) have until 2 February 2027 to provide an interoperable detection interface or detector under Measure 3.4(c).
- **2 December 2027 (`Article 113(c)(i)`, as amended):** High-risk AI system obligations for Annex III systems (including Article 12 logging, Article 14 human oversight, Article 17 quality management, and Annex IV technical documentation) apply from 2 December 2027.

Spurvik does not mark content itself. Its provenance record supports, but does not replace, Article 50(2) machine-readable marking. This timeline summary is technical context, not legal advice; consult your legal counsel for how Article 50(2) and Article 111(4) apply to your role as provider or deployer.

---

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
  - **What providers and deployers must still implement:** If you are a provider subject to Article 50(2), you must supply and validate the actual machine-readable marking and detection mechanism (for example multi-layer metadata + imperceptible watermarking in your media pipeline). Note that the pre-release `@spurvik/c2pa` package in the monorepo is unpublished and stays private. It is licensed under the MIT License. Do not rely on `@spurvik/c2pa` for production deployments.

---

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

---

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

---

### 25. How do I wrap a LangGraph workflow (`@spurvik/sdk/langgraph`) and connect `interrupt()` pauses to Spurvik's human-oversight queue?

`@spurvik/sdk/langgraph` exports `withSpurvikLangGraph`, `spurvikInterrupt`, `resolveLangGraphInterrupts`, `provenanceFromLangGraphState`, and `provenanceOf`:

1. **Wrap the compiled graph:** Pass your compiled `StateGraph` (`invoke` and optional `stream`) to `withSpurvikLangGraph(compiledGraph, config, { modelId })`. Every run checks `beforeInference()`, hashes non-tool messages (`role` or `type` in `"tool"`, `"function"`, `"function_call_result"` are excluded from `inputHash`), and attaches a signed 16-field `ProvenanceRecord` on `_spurvik_provenance` (readable via `provenanceFromLangGraphState(state)` or `provenanceOf(state)`).
2. **Detect interrupted runs:** When the returned state has a non-empty `__interrupt__` array, `withSpurvikLangGraph` sets non-enumerable `receipt.finishReason = "interrupted"` and `receipt.interrupted = true` while keeping the 16 signed fields unchanged for `verifyProvenanceSignature(receipt, signingSecret)`.
3. **Route interrupts through `/api/v1/hitl`:** Call `spurvikInterrupt({ actionName, callId, payload, interrupt }, config)` inside a node or `resolveLangGraphInterrupts(state.__interrupt__, config)` outside the node (which deduplicates interrupt IDs via `skippedDuplicateIds` and returns `resolved.command` ready for `new Command(resolved.command)`). For long-running reviews, create a pending row via `POST /api/v1/hitl` with `buildPayloadSummary`, pause with `interrupt(...)`, and resume when `verifyHitlWebhook` receives `hitl.decision`.

See [`docs/langgraph-quickstart.md`](./langgraph-quickstart.md) and [`docs/hitl-approval-mapping.md`](./hitl-approval-mapping.md) for full copy-paste examples.
