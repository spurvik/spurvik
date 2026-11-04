# 5-Minute Quickstart

> Source: https://github.com/spurvik/spurvik (npm: `spurvik@1.0.6`, `spurvik-sdk@1.0.6`, `spurvik-mcp-server@1.0.2`). Spurvik is developed by EyeTea Solutions ApS (CVR 37093378). The SDK logs AI calls with HMAC receipts and offers disclosure and marking hooks. It does not mark content itself and does not mean your system meets the EU AI Act.

## Sandbox and hosted console

| Path | Who it is for | What you use |
| --- | --- | --- |
| Public sandbox | Anyone looking at the browser cockpit before setting up keys | https://console.spurvik.com/sandbox. See [sandbox-first-5-minutes.md](sandbox-first-5-minutes.md). |
| Hosted console | An invited organisation | https://console.spurvik.com. `baseUrl` for that organisation is `https://console.spurvik.com`. |

The hosted console is a hosted service. Its source is not in this repository and the MIT licence does not cover it.

## Install

Node.js 20 or later.

```bash
npm install openai spurvik@1.0.6
npm pkg set type=module
```

Import the SDK as `spurvik`. Subpaths are `spurvik/ai`, `spurvik/mastra`, `spurvik/langgraph`, `spurvik/openai-agents`, and `spurvik/react`.

```bash
npm i -D spurvik-mcp-server@1.0.2
./node_modules/.bin/spurvik-mcp-server --root .
```

`--root` is required in `spurvik-mcp-server@1.0.2`.

## Environment

```bash
export SPURVIK_API_KEY="spurvik_live_<your-key>"
export SPURVIK_SIGNING_SECRET="$(openssl rand -hex 32)"
export SPURVIK_CONTENT_HASH_SECRET="$(openssl rand -hex 32)"
export SPURVIK_BASE_URL="https://console.spurvik.com"
export SPURVIK_REVIEWER_TOKEN="spurvik_reviewer_<your-reviewer-token>"
```

For an invited organisation, `SPURVIK_BASE_URL` is `https://console.spurvik.com`. In production the SDK throws if `baseUrl` is omitted. Development and tests still default to `http://127.0.0.1:43123`. The SDK does not read these variables by itself.

## Wrap a call and check the record

```ts
import OpenAI from "openai";
import { provenanceOf, verifyProvenanceSignature, withSpurvik } from "spurvik";

const ai = withSpurvik(new OpenAI(), {
  apiKey: process.env.SPURVIK_API_KEY!,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
  baseUrl: process.env.SPURVIK_BASE_URL!,
  riskTier: "limited_art50",
  article50Disclosure: false,
  onTelemetryError: (error) => console.error("Spurvik telemetry not delivered:", error),
});

const completion = await ai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Summarise my order status." }],
});

const record = await provenanceOf(completion);
const signatureOk = await verifyProvenanceSignature(record!, process.env.SPURVIK_SIGNING_SECRET!);
console.log(record!.modelId, record!.signatureAlg, signatureOk);

await ai._spurvik.shutdown();
```

`provenanceOf` reads the signed record. A match shows that the signed fields still match a signature made with your signing secret. It does not show that a notice was shown, that output is marked, or that your system meets the Act.

## Halt and release

Warning: `engageKillSwitch` halts the real project at `baseUrl`. Do not run this against a project you need to keep serving until you mean to stop it.

Run a `.ts` snippet with `npx tsx file.ts` from the app folder after `npm install openai spurvik@1.0.6`.

```ts
import OpenAI from "openai";
import { withSpurvik } from "spurvik";

const ai = withSpurvik(new OpenAI(), {
  apiKey: process.env.SPURVIK_API_KEY!,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET!,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! },
  baseUrl: process.env.SPURVIK_BASE_URL!,
  riskTier: "limited_art50",
  reviewerToken: process.env.SPURVIK_REVIEWER_TOKEN!,
});

const halted = await ai._spurvik.engageKillSwitch({
  reason: "Quickstart halt drill",
});
console.log(halted.projectHalted, halted.reason);

const released = await ai._spurvik.releaseKillSwitch({
  reason: "Quickstart halt drill complete",
});
console.log(released.projectHalted, released.previousReason);

await ai._spurvik.shutdown();
```

In the SDK, `reason` is optional for both calls. A direct `POST /api/v1/oversight` with a missing or blank reason gets HTTP 400.

## Disclosure label

```tsx
import { AIDisclosureLabel } from "spurvik/react";

export function AssistantHeader() {
  return (
    <AIDisclosureLabel
      notice="interaction"
      systemName="Customer Support Assistant"
      locale="en"
      presentation="inline"
    />
  );
}
```

Built-in copy for 24 EU languages, including Polish `locale="pl"`, is in `packages/react/src/locales.ts`.

## Log retention

The purge function exists. The Spurvik operator runs it by hand on the hosted control plane. Nothing schedules it. Retention periods are (planned).

## Where next

- [quickstart.md](quickstart.md)
- [console-onboarding.md](console-onboarding.md)
- [langgraph-quickstart.md](langgraph-quickstart.md) (`spurvik/langgraph`)
- [hitl-approval-mapping.md](hitl-approval-mapping.md)
- [adapters-quick-cards.md](adapters-quick-cards.md)
- [claude-code-plugin.md](claude-code-plugin.md)
- [troubleshooting.md](troubleshooting.md)
