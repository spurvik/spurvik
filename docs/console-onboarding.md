# Console onboarding

> Source: https://github.com/spurvik/spurvik. npm: `spurvik@1.0.3`, `spurvik-sdk@1.0.3`, `spurvik-mcp-server@1.0.2`.
>
> Not legal advice. This guide describes the hosted console and the packages in this repository. It does not assess your system.

The hosted console at https://console.spurvik.com is a hosted service. Its source is not in this repository and the MIT licence does not cover it.

`baseUrl` is where SDK telemetry and the halt stream go. For an invited organisation, that address is `https://console.spurvik.com`.

The public sandbox cockpit is at https://console.spurvik.com/sandbox. See [sandbox-first-5-minutes.md](sandbox-first-5-minutes.md).

## Install

```bash
npm install openai spurvik@1.0.3
```

```bash
npm i -D spurvik-mcp-server@1.0.2
./node_modules/.bin/spurvik-mcp-server --root .
```

`--root` is required in `spurvik-mcp-server@1.0.2`. Import the SDK as `spurvik`, and the label as `spurvik/react`.

## Keys

An organisation owner creates, rotates, or revokes live and disclosure keys in the hosted console. The project API key has the form `spurvik_live_` plus at least 32 base64url characters. A disclosure key has the form `spurvik_pub_`. The server stores a hash, not the plaintext, after the key is shown.

Deciding through the API needs a reviewer token, which only an organisation owner can issue. Any organisation member can halt or decide in the console. You choose who in your organisation does human oversight (Art. 26(2), for high-risk AI systems).

```bash
export SPURVIK_API_KEY="spurvik_live_<your-key>"
export SPURVIK_SIGNING_SECRET="$(openssl rand -hex 32)"
export SPURVIK_CONTENT_HASH_SECRET="$(openssl rand -hex 32)"
export SPURVIK_BASE_URL="https://console.spurvik.com"
```

The SDK reads none of these variables by itself. Your code passes them in. `SPURVIK_SIGNING_SECRET` and `SPURVIK_CONTENT_HASH_SECRET` stay in the caller and are never sent.

## Log retention

Retention periods are (planned). This repository does not apply them.

| Plan | Default retention (planned) |
| --- | --- |
| Developer (free) | 30 days |
| Team | 90 days |
| Business | 12 months |
| Enterprise | A per-project period, in days. Unset Enterprise projects keep 365 days until an owner sets one. |

Business is the plan between Team and Enterprise. These rules are (planned). For a project recorded as `high_annex3`, the planned floor is six months. Spurvik does not check another law an owner might record. That is a product rule. It is not a finding that the project meets Articles 19 or 26(6).

The purge function exists. The Spurvik operator runs it by hand on the hosted control plane. Nothing schedules it. Retention periods are (planned). A purge is not erasure of the project.

## Webhooks

Decisions and halt changes are POSTed as canonical JSON. `x-spurvik-signature` is `v1=` plus HMAC-SHA-256 of `` `${timestamp}.${body}` ``, and `x-spurvik-timestamp` is unix seconds. Check a human-decision envelope with `verifyHitlWebhook` from `spurvik`.

```ts
import { createHmac } from "node:crypto";
import { verifyHitlWebhook } from "spurvik";

const secret = process.env.SPURVIK_WEBHOOK_SECRET ?? "example-webhook-secret";
const body = JSON.stringify({
  type: "hitl.decision",
  deliveryId: "example",
  projectId: "example",
  approval: { id: "example" },
});
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = "v1=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

const envelope = await verifyHitlWebhook({ secret, body, signature, timestamp });
console.log(envelope.deliveryId);
```

That sample signs its own body, so the check can run without a live delivery. Replace `body`, `signature`, and `timestamp` with the raw request when you receive one.

A match shows the timestamp and body still match the HMAC-SHA-256 signature made with your webhook secret, and that the timestamp is within five minutes of your clock (the default). It does not show that your oversight measures meet Article 14.

## Disclosure label

`spurvik/react` exports `AIDisclosureLabel`, `AIDisclosureDetails`, `AIArticle50Section3Notice`, and `EuMark`. The words are in the page without a click.

```tsx
import { AIDisclosureLabel } from "spurvik/react";

export function AssistantHeader({ analyticsConsent }: { analyticsConsent: boolean }) {
  return (
    <AIDisclosureLabel
      notice="interaction"
      presentation="block"
      locale="da"
      brandName="Acme Support"
      systemName="Support Assistant"
      euIcon={{ mark: "basic", tone: "black" }}
      beacon={{
        endpoint: "https://your-endpoint.example/beacon",
        apiKey: process.env.NEXT_PUBLIC_SPURVIK_PUB_KEY!,
        jurisdiction: "EU",
        consent: analyticsConsent,
      }}
    />
  );
}
```

Pass `spurvik_pub_…`, not the live key. Omit `beacon`, or omit `consent`, and the label sends nothing.

Built-in Polish copy is in `packages/react/src/locales.ts` (`interaction`: "Korzystasz z systemu AI."). To change one string at runtime:

```tsx
import { disclosureCopy, registerDisclosureLocale } from "spurvik/react";

registerDisclosureLocale("pl", {
  ...disclosureCopy("pl"),
  emotionBiometric:
    "Objęty działaniem systemu rozpoznawania emocji lub kategoryzacji biometrycznej.",
});
```

## Where next

- [5-minute-quickstart.md](5-minute-quickstart.md)
- [quickstart.md](quickstart.md)
- [faq-console-and-quickstart.md](faq-console-and-quickstart.md)
- [faq-art50-marking-and-pl-locale.md](faq-art50-marking-and-pl-locale.md)
