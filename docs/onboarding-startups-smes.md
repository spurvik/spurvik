# Spurvik for startups and SMEs: a plain-language guide

> **Applies to the pre-release (0.x) build on `spurvik` main at `0e9cc89` (PR #3, PR #4, PR #7 and PR #8 merged). PR #3 includes the changes in PR #1 and PR #2.**

This guide is for founders, small product teams and SMEs that build with AI models and do not have a Data Protection Officer or an in-house legal team. It explains what Spurvik does, what it does not do, how to get set up on day one, and what to hand to your advisor.

Spurvik is made by EyeTea Solutions ApS (CVR 37093378), Trekantområdet, Denmark. It is pre-release software (0.x).

> **Not legal advice.** Nothing in this guide tells you what the EU AI Act, the GDPR or any other law asks of your company. Spurvik is a technical tool designed to support your work on those questions. This guide describes what the software does; it does not assess your system. For what applies to you, ask your own legal counsel.
>
> *Source: https://github.com/spurvik/spurvik. npm: `spurvik@1.0.1`, `spurvik-sdk@1.0.1`, `spurvik-mcp-server@1.0.2`.* Dates and code behaviour may change.

## What Spurvik does

Spurvik is designed to support work on **Article 50(1)** of the EU AI Act: a provider duty for AI systems intended to interact directly with people, so that those people are told they are interacting with an AI system. It applies from 2 August 2026.

Separately, and **for high-risk AI systems only**, Spurvik is designed to support work on **Article 12** (record-keeping) and **Article 14** (human oversight). For high-risk systems these apply from 2 December 2027 (Annex III) or 2 August 2028 (Annex I), under Regulation (EU) 2026/1744. Article 50 itself does not require logging. Whether any of these articles applies to your system, and whether you are its provider or deployer, is for you and your counsel to decide.

**1. It logs your AI calls with HMAC receipts.**
You wrap your existing OpenAI, Anthropic or Gemini client with `withSpurvik()`. For every call, Spurvik creates a *provenance record*: when the call happened, which model answered, fingerprints of the prompt and the answer, and a signature. In the default mode the fingerprints are keyed HMAC-SHA-256 values made with a signing secret that stays on your side. The record does not contain the prompt or answer text. Later you can check that a record's signed fields still match its signature. Anyone who holds your signing secret can make a matching signature, so limit who holds it.

**2. It sends events to your own control plane.**
The SDK sends an event for each call (fingerprints, model and timing details, no text) to a Spurvik control plane that you run. The control plane keeps the events in a hash-chained log and has a console for your team. A hash chain shows whether stored events changed after they were written. It does not stop whoever controls the database from rebuilding the chain. The control plane also has a human-review queue and a stop switch, designed to support human-oversight work for high-risk systems.

**3. It offers disclosure hooks.**
- A React label (`@spurvik/react`) that shows users they are dealing with an AI system, in all 24 official EU languages. Whether its wording and placement are clear enough for your users is your decision.
- A server call, `recordDisclosure()`, that logs that a notice was shown in a session.
- A configuration flag, `article50Disclosure`, that you set to `true` only when your interface really shows an AI interaction notice. The flag is copied into every provenance record.

**4. It offers marking hooks.**
The SDK has a place where *your own* marking step can plug in, and each record notes what was observed:

- `markingApplied` is `true` only when a watermark hook changed the text, a media hook embedded a manifest and changed the file, or your model provider's response confirmed a mark (`upstreamMarking: "provider_confirmed"`). Other hooks, including the optional text trailer in item 5, set `evidenceTrailerAttached` instead.
- `upstreamMarking` records what the provider indicated: `unknown` (default), `requested`, `provider_confirmed`, `not_requested` or `inferred`.
- `true` does not mean the mark is robust, detectable or adequate under Article 50(2).

**5. It can attach the signed record to text output (opt-in, off by default).**
If you set `marking: { text: "signed-trailer" }`, the SDK appends the signed provenance record to the text output as `[[[spurvik-provenance-record:…]]]` and returns that text on the record as `markedOutput`. Your model response changes only if you also set `marking.applyToMessageContent: true`. Then the trailer is part of the answer your end users see. It contains the record's keyed fingerprints and signature, and anyone who receives the text can see it and pass it on. It is evidence that links a text to a record. It is easy to remove, and only someone holding your signing secret can check it. The trailer is not a machine-readable mark under Article 50(2). The record shows it as `evidenceTrailerAttached: true`, while `markingApplied` stays `false`. Its provenance record supports, but does not replace, Article 50(2) machine-readable marking.

## What Spurvik does not do

- **It adds nothing to your content by default.** It records what your own marking step or your model provider did. The optional text trailer (item 5 above) is off unless you switch it on. Its provenance record supports, but does not replace, Article 50(2) machine-readable marking.
- **It does not make your system meet the EU AI Act.** It gives you records and controls that are designed to support that work. Whether your system meets the Act is a question for you and your counsel.
- **It does not classify your AI system.** You choose the `riskTier` setting. It is your own classification (as provider or deployer); Spurvik does not classify your use case. The SDK uses your choice to switch features on or off. It does not check it.
- **It is not a conformity assessment or CE marking.** It does not issue any approval, and it does not register anything in an EU database.
- **It does not send your prompts or outputs as text.** With the default settings, prompt and output text never leave your process. For each call the control plane receives an event id, a timestamp, the model provider and model id, keyed fingerprints of the prompt and output, the fingerprint mode, latency, temperature, which marking hook ran and what it recorded, and a signed note of what the provider indicated about marking. If you choose `contentHash.mode: "on"`, fingerprints are unkeyed and can be matched by anyone for short or predictable text; `"off"` sends no fingerprints.
- **It does not give legal advice.** The risk wizard in the console records *your* answers.

## Your first day

Plan for half a day with one developer. The [quickstart](quickstart.md) has every command.

> **Public MIT release.** `npm install spurvik@1.0.1 spurvik-sdk@1.0.1` and `npm install spurvik-mcp-server@1.0.2`. Source: https://github.com/spurvik/spurvik. Workspace packages `@spurvik/*` in this monorepo use version `0.1.0`. Builds previously served at spurvik.com/sdk/latest.tgz are not this SDK, are unsupported and must not be relied on to check records.

| # | Task | Who | Time |
| --- | --- | --- | --- |
| 1 | Ask for access to the `spurvik` repository at hello@spurvik.com. | Founder | 5 min |
| 2 | Install `spurvik@1.0.1` and `spurvik-sdk@1.0.1` from npm, or build the `0.1.0` workspace packages from https://github.com/spurvik/spurvik. ([quickstart step 1](quickstart.md#step-1-get-the-sdk-build-it-from-source)) | Developer | 15 min |
| 3 | Run the control plane locally and copy the `spurvik_live_` key it prints once. There is no hosted control plane yet; keys come from your own `pnpm db:seed`. Before the first start, set the two control-plane keys (`SPURVIK_LOG_CHECKPOINT_SECRET` and `SPURVIK_WEBHOOK_KEK`) in your own configuration: this build has no built-in defaults and will not start without them. The control plane (`apps/web`) is outside the MIT grant: run it only under a design-partner or pilot agreement. ([step 2](quickstart.md#step-2-run-a-local-control-plane-and-get-your-spurvik_live_-key)) | Developer | 20 min |
| 4 | Create two secrets (signing and fingerprint) and store them in your password manager or secret manager. Decide who holds them. | Founder + developer | 10 min |
| 5 | Wrap one AI call, run it, and check the record's signature. ([steps 5–6](quickstart.md#step-5-wrap-a-call-and-save-the-provenance-record)) | Developer | 30 min |
| 6 | If your interface shows an AI notice, set `article50Disclosure: true` and log notices with `recordDisclosure()` (below). | Developer | 20 min |
| 7 | Write down your `riskTier` choice and why, for your advisor. | Founder | 15 min |
| 8 | Fill in the advisor pack (below). | Founder | 30 min |

### Logging that a notice was shown

When your interface has shown its AI notice to a user, you can log it. Add this to the end of the quickstart's `app.js`, or run it on its own as `disclosure.js`:

```js
import OpenAI from "openai";
import { withSpurvik } from "@spurvik/sdk";

const ai = withSpurvik(new OpenAI(), {
  apiKey: process.env.SPURVIK_API_KEY,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET },
  baseUrl: process.env.SPURVIK_BASE_URL,
  riskTier: "limited_art50",
  article50Disclosure: true, // only because this interface shows an AI notice
});

const notice = await ai._spurvik.recordDisclosure({ sessionId: "session-123" });
console.log("Notice logged:", notice);

await ai._spurvik.shutdown();
```

```bash
node disclosure.js
```

Use a session id that does not identify a person, such as a random id. This logs that a notice event happened. It is not a finding that the notice was enough.

### Three settings to get right

| Setting | What to choose | Why it matters |
| --- | --- | --- |
| `riskTier` | `minimal`, `limited_art50` or `high_annex3`. This is **your own classification (as provider or deployer); Spurvik does not classify your use case**. Ask your advisor which one fits. | `high_annex3` switches on a check before each model call. If the control plane cannot be reached, the model call fails instead of running. This is designed to support human-oversight work; whether your oversight measures meet Article 14 is for you to assess. |
| `article50Disclosure` | `true` only if your interface really shows an AI interaction notice. | It is copied into every signed record. |
| Secrets | Two long random values, kept out of your code repository. | If you lose the signing secret, you can no longer check old records. |

## What to hand to your advisor

Your advisor (lawyer, external DPO service or AI Act consultant) will want facts, not conclusions. Copy this list into a document and fill it in:

1. **What the AI system does:** one paragraph, in plain words, including who uses it.
2. **Models and providers:** for example "OpenAI gpt-4o through the API".
3. **Your `riskTier` choice and your reasons,** including your own classification (as provider or deployer); Spurvik does not classify your use case. Ask the advisor to confirm or correct it.
4. **What users see:** screenshots of any AI notice or label, and whether `article50Disclosure` is `true`.
5. **What Spurvik records:** a sample provenance record (`record.json` from the quickstart), and your `contentHash.mode`. Explain that in `keyed` mode it holds keyed fingerprints, not text.
6. **Who holds the secrets** and where they are stored. Anyone you give the fingerprint secret to (for example a contractor, or Spurvik support under a data processing agreement) can also match fingerprints.
7. **Where the control plane runs** (which host and region) and its log retention setting.
8. **Marking:** what, if anything, marks your AI output, what the records show (`markingApplied`, `upstreamMarking`), and whether you switched on the optional text trailer. Include this sentence: *Its provenance record supports, but does not replace, Article 50(2) machine-readable marking.*
9. **Known limits:** the "What Spurvik does not do" list above, and what happens when the control plane is unreachable, in [quickstart.md](quickstart.md#what-happens-when-the-control-plane-is-unreachable).
10. **Your questions:** for example "Do we need a DPO?", "Which transparency duties apply to us?", "How long should we keep logs?"

## FAQ

**Do I need a DPO to use Spurvik?**
No. You can install and use Spurvik without one. Whether your company needs a DPO is a separate question for your legal counsel.

**Does using Spurvik mean we meet the EU AI Act?**
No. Spurvik is designed to support Article 50(1) transparency work and, for high-risk systems only, record-keeping and human-oversight work. Whether your system meets the Act depends on your system and your use of it. Ask your counsel.

**Does Spurvik mark our AI-generated content?**
By default, Spurvik adds nothing to your content. It records what your own marking step or your model provider did. You can switch on an optional text trailer that adds the signed record to text output (see item 5 under "What Spurvik does"). Its provenance record supports, but does not replace, Article 50(2) machine-readable marking.

**Does Spurvik store our users' prompts?**
No. In the default `keyed` mode, prompts and outputs are turned into keyed HMAC fingerprints inside your own process, and only the fingerprints are sent to the control plane you run. Treat these fingerprints as **pseudonymised personal data, not anonymous data** (GDPR Article 4(5) and Recital 26) whenever the prompt or output relates to a person: whoever holds your fingerprint secret can check whether a given text matches. Keep that secret in your own secret manager and decide who may hold it. Do not use the unkeyed `on` mode for prompts that may contain personal data, because unkeyed fingerprints of short or predictable text can be matched by anyone. Whether a recipient without the key holds personal data depends on its means of re-identification (CJEU, C-413/23 P, *EDPS v SRB*, 4 September 2025). Ask your counsel how this affects your privacy notice and records of processing.

**What happens if the control plane is down?**
Your AI calls keep working, except with `riskTier: "high_annex3"`, where they stop on purpose before anything is sent to your model provider. In short scripts the telemetry event is lost. Your `onTelemetryError` handler is told, and the script still exits normally. In this release, do not rely on the control plane as your only copy of these events. Keep your own records as well. See [troubleshooting.md](troubleshooting.md#telemetry-and-the-control-plane).

**Can I install it from npm?**
Yes. Install `spurvik@1.0.1`, `spurvik-sdk@1.0.1`, and `spurvik-mcp-server@1.0.2`. Source: https://github.com/spurvik/spurvik. Workspace packages `@spurvik/*` in this monorepo use version `0.1.0`. Builds previously served at spurvik.com/sdk/latest.tgz are unsupported.

**Where is our data stored?**
If you run the control plane yourself, the data goes to the PostgreSQL database you configure, in the region you choose. The SDK sends telemetry only to the `baseUrl` you set.

**Who do I contact?**
hello@spurvik.com
