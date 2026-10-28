# Quickstart: wrap your first AI call with `withSpurvik`

> **Applies to the pre-release (0.x) build on `spurvik` main at `427ae53` (through PR #21).** For a 5-minute monorepo walkthrough, see [5-minute-quickstart.md](5-minute-quickstart.md). To explore the zero-login 2x2 browser cockpit first, see [sandbox-first-5-minutes.md](sandbox-first-5-minutes.md).

> **Not legal advice.** This guide describes what the software does; it does not assess your system. Ask your own legal counsel how the EU AI Act and other laws apply to you.
>
> **Licence.** `@spurvik/sdk`, `@spurvik/core`, `@spurvik/react`, and `@spurvik/c2pa` are licensed under the MIT License and are provided without warranty. The control plane in `apps/web` is not open source and is outside that grant: you may run it only under a design-partner or pilot agreement with EyeTea Solutions ApS.
>
> *Source: https://github.com/spurvik/spurvik. npm: `spurvik@1.0.1`, `spurvik-sdk@1.0.1`, `spurvik-mcp-server@1.0.2`.*

This guide takes you from nothing to a signed provenance record for one OpenAI call, and shows you how to check that record later. It takes about 20 minutes.

Spurvik is pre-release (0.x). What you get:

- `withSpurvik()` wraps your existing OpenAI, Anthropic or Gemini client. Your code calls the model the same way as before.
- Each wrapped call returns a **provenance record**: a timestamp, the model id, keyed HMAC fingerprints of the prompt and output (not the text itself), your AI-notice setting (`article50Disclosure`), and an HMAC-SHA-256 signature made with a secret that stays on your side.
- The SDK sends a telemetry event with those fingerprints to **your** Spurvik control plane. Prompt and output text are not sent.

The SDK is designed to support transparency work under **Article 50(1)** of the EU AI Act: a provider duty for AI systems that interact directly with people, which applies from 2 August 2026.

Separately, and **for high-risk AI systems only**, it is designed to support record-keeping (Article 12) and human-oversight (Article 14) work. Those are requirements for high-risk AI systems only, applying from 2 December 2027 (Annex III) or 2 August 2028 (Annex I). Article 50 does not require logging.

Using Spurvik does not, on its own, mean your system meets the Act. Ask your own legal counsel how the Act applies to your system, including your own classification (as provider or deployer); Spurvik does not classify your use case.

## Before you start

| You need | Notes |
| --- | --- |
| Node.js 22 or later | The repository's `package.json` sets `"engines": { "node": ">=22" }`. This guide was tested on Node.js 22.23. |
| pnpm 10 | Run `corepack enable` once. The repository pins its pnpm version. |
| Read access to the `spurvik` repository | The SDK source lives there. Write to hello@spurvik.com about design-partner access. You receive the repository URL once a design-partner or pilot agreement is signed. |
| Docker, or PostgreSQL on port 5432 | Only for the local control plane in step 2. Docker Compose uses the `postgres:16` image. Without Docker, use your own PostgreSQL 16 or later (also tested on 17) and create the `aegis` role and database as shown in step 2. |
| An OpenAI API key | Or use the mock server in [Optional: try it without an OpenAI key](#optional-try-it-without-an-openai-key). |

The commands below assume this layout, with every folder side by side:

```text
workspace/
  spurvik/         the Spurvik source (step 1)
  spurvik-packs/    the two package files you build (step 1)
  my-ai-app/        your app (step 3)
```

## Step 1: Get the SDK (build it from source)

Install the live MIT packages from npm:

```bash
npm install spurvik@1.0.1 spurvik-sdk@1.0.1
npm install spurvik-mcp-server@1.0.2
```

`spurvik` and `spurvik-sdk` publish the same SDK. `spurvik-mcp-server` is the local stdio MCP server. Source: https://github.com/spurvik/spurvik. In this monorepo, `@spurvik/sdk` and `@spurvik/core` use workspace version `0.1.0`.

> Builds previously served at spurvik.com/sdk/latest.tgz are not this SDK, are unsupported and must not be relied on to check records.

Or build those `0.1.0` workspace packages from https://github.com/spurvik/spurvik. From your `workspace/` folder:

```bash
git clone https://github.com/spurvik/spurvik.git spurvik
cd spurvik
pnpm install
pnpm --filter "@spurvik/sdk..." build
mkdir -p ../spurvik-packs
(cd packages/core && pnpm pack --pack-destination ../../../spurvik-packs)
(cd packages/sdk && pnpm pack --pack-destination ../../../spurvik-packs)
cd ..
ls spurvik-packs
```

You should see:

```text
spurvik-core-0.1.0.tgz
spurvik-sdk-0.1.0.tgz
```

You need **both** workspace files when you pack `0.1.0` from the clone. `@spurvik/sdk` lists `@spurvik/core` as a workspace dependency. The public `spurvik` and `spurvik-sdk` packages already include that core code.

## Step 2: Run a local control plane and get your `spurvik_live_` key

> **Browser sandbox, invite-gated hosted console, or local control plane:**
> - **Public 2x2 sandbox (`https://console.spurvik.com/sandbox`):** Live in EU (`fra1`) with no login or invite code required; see [sandbox-first-5-minutes.md](sandbox-first-5-minutes.md).
> - **Hosted console (`https://console.spurvik.com`):** Pre-release and invite-gated (`/signup` requires `SPURVIK_INVITE_CODE` and claiming an organisation `spurvik_invite_…` token at `/invites`; see [console-onboarding.md](console-onboarding.md)).
> - **Local control plane (walked below):** Keys come from your own `pnpm db:seed`, against the control plane you run locally.

The SDK sends telemetry to a control plane that you run (`apps/web` in the same repository, or `https://console.spurvik.com` if you have a hosted workspace invite). `apps/web` is outside the MIT grant: run it only under a design-partner or pilot agreement (see **Licence** at the top). In a second terminal, from `workspace/spurvik`:

```bash
docker compose up -d
cp apps/web/.env.example apps/web/.env
echo "SPURVIK_LOG_CHECKPOINT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")" >> apps/web/.env
echo "SPURVIK_WEBHOOK_KEK=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")" >> apps/web/.env
unset SPURVIK_WEBHOOK_KEK DATABASE_URL SPURVIK_SESSION_SECRET SPURVIK_SIGNING_SECRET SPURVIK_LOG_CHECKPOINT_SECRET SPURVIK_ALLOW_TEST_KEYS
pnpm db:migrate
pnpm db:seed
pnpm dev
```

**Control-plane keys: there are no built-in defaults.** This build will not start without two keys of your own. The two `echo` lines above generate them and add them to `apps/web/.env`:

| Variable | What it is for | Rule |
| --- | --- | --- |
| `SPURVIK_LOG_CHECKPOINT_SECRET` | The HMAC key for log-retention checkpoints | At least 16 characters |
| `SPURVIK_WEBHOOK_KEK` | The key that encrypts stored webhook secrets | 32 bytes: 43 base64url characters (as generated above), 64 hex characters, or text that is 32 bytes in UTF-8 |

Every key in this quickstart comes from one of two places, never from a built-in default:

- **`pnpm db:seed`** prints the project key (`spurvik_live_…`), the disclosure key (`spurvik_pub_…`), the reviewer token (`spurvik_reviewer_…`) and the demo reviewer password. It does **not** create the two control-plane keys.
- **Your own configuration** holds the two control-plane keys above and the SDK's `SPURVIK_SIGNING_SECRET` and `SPURVIK_CONTENT_HASH_SECRET` (step 4).

Keep the two control-plane keys, for example in your secret manager. A checkpoint signed with one checkpoint secret checks only with that same secret, and webhook secrets encrypted with one key can be read only with that key. In this build both keys are required in every mode, as `apps/web/.env.example` says.

If a key is missing, `pnpm dev` prints `Refusing to start. Missing SPURVIK_LOG_CHECKPOINT_SECRET and SPURVIK_WEBHOOK_KEK.` before Next.js starts (there is no `✓ Ready` line) and exits with code 1. `pnpm dev` reads the two keys from `apps/web/.env`. A value already set in your shell takes precedence over the file. See [The control plane will not start](troubleshooting.md#the-control-plane-will-not-start).

### Troubleshooting: `@next/env` stale-shell-variable trap (`SPURVIK_WEBHOOK_KEK` / `DATABASE_URL`)

If `pnpm dev`, `pnpm db:migrate`, `pnpm db:seed`, or `POST /api/v1/telemetry` fails even after you updated `apps/web/.env`, check whether an earlier command exported `SPURVIK_*` (or legacy `AEGIS_*`) or `DATABASE_URL` in your terminal session:

- **Why this happens:**
  1. Before `next dev` or `next start` runs, `apps/web/src/scripts/refuse-missing-keys.ts` calls `loadEnvConfig` from `@next/env` and validates `SPURVIK_LOG_CHECKPOINT_SECRET` and `SPURVIK_WEBHOOK_KEK` (`apps/web/src/server/required-keys.ts`).
  2. Before `pnpm db:migrate`, `pnpm db:seed`, or `pnpm purge-logs` runs, `apps/web/src/db/load-env.ts` parses `apps/web/.env` using `if (key && process.env[key] === undefined) process.env[key] = value`.
  3. Neither `@next/env` (`loadEnvConfig`) nor `loadEnv()` overwrites variables already exported in the developer's shell (`process.env`), and `readSpurvikEnv` (`packages/core/src/env.ts`) reads `process.env.SPURVIK_<NAME>` first (falling back to `process.env.AEGIS_<NAME>`).
- **Exact symptoms:**
  - `refuse-missing-keys.ts` refuses to start before Next.js logs `✓ Ready`:
    ```text
    SPURVIK_WEBHOOK_KEK must be 32 bytes (base64url, hex, or 32-byte utf8).
    ```
    or `SPURVIK_LOG_CHECKPOINT_SECRET is shorter than 16 characters.`
  - `POST /api/v1/telemetry` returns `500 Internal Server Error` (or `pnpm db:migrate` / `pnpm db:seed` fails with `ECONNREFUSED` or connects to the wrong database) when a stale `DATABASE_URL` or `SPURVIK_WEBHOOK_KEK` is exported in the terminal.
- **One-line check:**
  ```bash
  env | grep -E '^(SPURVIK_|AEGIS_|DATABASE_URL=)'
  ```
- **One-line fix (run before `pnpm db:migrate`, `pnpm db:seed`, or `pnpm dev`):**
  ```bash
  unset SPURVIK_WEBHOOK_KEK DATABASE_URL SPURVIK_SESSION_SECRET SPURVIK_SIGNING_SECRET SPURVIK_LOG_CHECKPOINT_SECRET SPURVIK_ALLOW_TEST_KEYS
  ```

> **`SPURVIK_ALLOW_TEST_KEYS=1` is for throwaway local testing only. This quickstart does not use it.** Outside production, the flag lets the control plane start without the two keys. It generates random keys for that process only and prints `SPURVIK_ALLOW_TEST_KEYS=1: integrity protection is off. This is for local testing only.` Those keys are gone when the process stops. Webhook secrets saved while the flag is on cannot be read after a restart, and while the flag is on, saved checkpoints do not check, because checkpoints are signed only by `pnpm purge-logs` with your real secret. The control plane refuses to start with this flag when `NODE_ENV` or `VERCEL_ENV` is `production`, even if both keys are set, and `pnpm purge-logs` never accepts it.

**Without Docker:** `docker compose up -d` only starts PostgreSQL with a role, password and database that are all named `aegis`, the values `apps/web/.env.example` expects (`postgres://aegis:aegis@127.0.0.1:5432/aegis`). With your own PostgreSQL on port 5432, create them once as a database superuser, then run the other commands above (skip `docker compose up -d`):

```bash
sudo -u postgres psql -c "CREATE ROLE aegis WITH LOGIN PASSWORD 'aegis';"
sudo -u postgres psql -c "CREATE DATABASE aegis OWNER aegis;"
psql "postgres://aegis:aegis@127.0.0.1:5432/aegis" -c "select current_user;"
```

The last command should print `aegis`. These are local development values only; do not reuse them on a shared or reachable database. (The `aegis` names are the repository's current defaults.)

`pnpm db:seed` prints these values, **each shown once**. Copy what you need right away: the control plane stores only hashes of the keys and tokens, so it cannot show them again.

| Seed output | Looks like | What it is for |
| --- | --- | --- |
| Reviewer email and password | a `reviewer.…@spurvik.local` address | Signing in to the operator console as the demo reviewer. |
| Project API key | `spurvik_live_…` | The server-side SDK key. Put it in `SPURVIK_API_KEY` (step 4). Keep it out of browsers. |
| Disclosure key | `spurvik_pub_…` | The browser key for the `@spurvik/react` label's notice beacon. It can only record that a notice was shown; it cannot read the ledger. Not needed in this quickstart. |
| Reviewer token | `spurvik_reviewer_…` | Sent by a human reviewer in the `x-spurvik-reviewer` header to the oversight and human-review decision API. Not needed in this quickstart. |

The seed output also lists the demo organization and project ids. The SDK does not read `SPURVIK_API_KEY` or any other environment variable by itself. Put the key in `SPURVIK_API_KEY` and pass it in (steps 4 and 5).

The key looks like this:

```text
spurvik_live_<43 characters of base64url>
```

The SDK checks the shape before it does anything else: the prefix `spurvik_live_` followed by at least 32 characters from `A–Z a–z 0–9 _ -`. Keys issued before the rename (`aegis_live_…`) are still accepted in this release.

`pnpm dev` serves the control plane on port 43123 and listens on **all network interfaces** (`next dev --hostname 0.0.0.0`), not only on `127.0.0.1`. Your app reaches it at `http://127.0.0.1:43123`. Leave it running.

> **On a shared network** (office Wi-Fi, a shared VM or a cloud box with open ports), other machines can reach this development control plane and its console with the demo login. Run it only on a machine and network you trust, block port 43123 in your firewall, or start it bound to the local interface instead: `pnpm --filter @spurvik/web exec next dev --hostname 127.0.0.1 --port 43123`.

## Step 3: Create your app

From `workspace/`:

```bash
mkdir my-ai-app
cd my-ai-app
npm init -y
npm pkg set type=module
npm install openai ../spurvik-packs/spurvik-core-0.1.0.tgz ../spurvik-packs/spurvik-sdk-0.1.0.tgz
```

`npm pkg set type=module` matters. The examples use `import` and top-level `await`, which need an ES module project. If your `package.json` says `"type": "commonjs"` (some npm versions write that on `npm init`), Node stops with `SyntaxError: Cannot use import statement outside a module`. If it has no `type` field, Node 22 prints a `MODULE_TYPELESS_PACKAGE_JSON` warning and re-parses the file each run.

## Step 4: Set your environment variables

```bash
export SPURVIK_API_KEY="spurvik_live_PASTE_THE_KEY_FROM_DB_SEED"
export SPURVIK_SIGNING_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
export SPURVIK_CONTENT_HASH_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
export SPURVIK_BASE_URL="http://127.0.0.1:43123"
export OPENAI_API_KEY="sk-your-openai-key"
```

| Variable | What it is | Sent to the control plane? |
| --- | --- | --- |
| `SPURVIK_API_KEY` | Project key from `pnpm db:seed` (or your project page). | Yes, as `Authorization: Bearer …`. |
| `SPURVIK_SIGNING_SECRET` | Your HMAC key for provenance records. At least 16 characters. | **No.** It stays in your process. |
| `SPURVIK_CONTENT_HASH_SECRET` | Your HMAC key for prompt and output fingerprints. At least 16 characters. | **No.** |
| `SPURVIK_BASE_URL` | The control plane you run. | — |

`contentHash.mode: "keyed"` (used throughout this guide) fingerprints text with your secret. The other modes are `"on"` (unkeyed SHA-256) and `"off"` (no fingerprints). Unkeyed fingerprints of short or predictable text can be matched by anyone who guesses the text, so do not use `"on"` for prompts that may contain personal data.

Store both secrets in your secret manager and keep them. If you generate a new `SPURVIK_SIGNING_SECRET` in every shell, records signed with the old secret no longer match.

The SDK does not read these variables by itself. Your code passes them into `withSpurvik()`, as in step 5. The variable names are a convention. The old `AEGIS_*` names are read **only by the control plane server** (`apps/web`), with a deprecation warning. They do nothing for the SDK in your app.

## Step 5: Wrap a call and save the provenance record

Create `app.js`:

```js
import { writeFile } from "node:fs/promises";
import OpenAI from "openai";
import { provenanceOf, withSpurvik } from "@spurvik/sdk";

const ai = withSpurvik(new OpenAI(), {
  apiKey: process.env.SPURVIK_API_KEY,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET },
  baseUrl: process.env.SPURVIK_BASE_URL, // the SDK throws without it when NODE_ENV=production
  riskTier: "limited_art50", // your own classification (as provider or deployer); Spurvik does not classify your use case
  article50Disclosure: false, // set true only if your UI shows an AI interaction notice
  onTelemetryError: (error) => console.error("Spurvik telemetry was not delivered:", error.message),
});

const completion = await ai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});
console.log("Model said:", completion.choices[0].message.content);

const record = await provenanceOf(completion);
await writeFile("record.json", JSON.stringify(record, null, 2));
console.log("Saved provenance record", record.eventId, "to record.json");

// Scripts: deliver queued telemetry before Node exits. See "Flush and shut down".
await ai._spurvik.shutdown();
```

Run it:

```bash
node app.js
```

You should see something like:

```text
Model said: Hello! How can I help you today?
Saved provenance record 1132733d-ac82-4a00-a5cd-047f375ebd4e to record.json
```

`record.json` holds fields like these:

```json
{
  "kind": "provenance_record",
  "modelId": "gpt-4o-2024-08-06",
  "modelProvider": "openai",
  "contentHashMode": "keyed",
  "inputHash": "43b0f4e7…",
  "outputHash": "db10281f…",
  "article50Disclosure": false,
  "markingApplied": false,
  "upstreamMarking": "unknown",
  "signature": "7b69aba5…",
  "signatureAlg": "HMAC-SHA-256"
}
```

`provenanceOf(res)` returns the record for a normal (non-streaming) response. For a stream it returns a promise of the record, so `await` it after the stream ends (see step 8). Using `await` for both, as above, is fine.

The provenance record is a signed log entry. Its provenance record supports, but does not replace, Article 50(2) machine-readable marking.

## Step 6: Check a record's signature

Create `check-record.js`:

```js
import { readFile } from "node:fs/promises";
import { verifyProvenanceSignature } from "@spurvik/sdk";

const record = JSON.parse(await readFile("record.json", "utf8"));
const secret = process.env.SPURVIK_SIGNING_SECRET;

// Argument order: the RECORD first, the SIGNING SECRET second.
const matches = await verifyProvenanceSignature(record, secret);
console.log("Signature matches:", matches);

// Any change to a signed field makes the check return false,
// unless whoever changed it also re-signed it with the same secret.
const edited = { ...record, modelId: "some-other-model" };
console.log("After editing modelId:", await verifyProvenanceSignature(edited, secret));
```

Run it:

```bash
node check-record.js
```

Expected output:

```text
Signature matches: true
After editing modelId: false
```

Things to know:

- **Argument order is `verifyProvenanceSignature(record, secret)`.** If you swap them, the function does not throw. It returns `false`, which looks like a bad record.
- It returns `false` for the wrong secret, for an edited signed field (unless it was re-signed with the same secret), and for anything that is not a provenance record.
- `true` shows that the record's signed fields still match the HMAC-SHA-256 signature made with your signing secret. Anyone who holds that secret can make a matching signature, including for edited fields, so limit who holds it. `true` does not show that a notice was shown, that the output carries a machine-readable mark, or that your system meets the Act, and it is not a conformity assessment.

## Step 7: Flush and shut down (scripts, jobs, serverless)

Telemetry is queued and sent in the background, about once a second. A long-running server needs nothing extra. A script, cron job or serverless handler should flush before it ends:

| Call | What it does |
| --- | --- |
| `await ai._spurvik.flush()` | Sends everything queued now. The client stays usable. |
| `await ai._spurvik.shutdown()` | Stops background work and sends what is queued. Use it once, at the end. |

`ai._spurvik` is the `SpurvikClient` that `withSpurvik()` created for that wrapped client.

## Step 8: Streaming

Read the stream first, then `await provenanceOf(stream)`. For a stream it returns a promise that resolves to the signed record when the stream ends.

> Builds from `987ec86` return `undefined` here. Build from commit `a350ee2` or later (this draft was re-checked at `0e9cc89`) (check with `git rev-parse --short HEAD`).

```js
import OpenAI from "openai";
import { provenanceOf, withSpurvik } from "@spurvik/sdk";

const ai = withSpurvik(new OpenAI(), {
  apiKey: process.env.SPURVIK_API_KEY,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET },
  baseUrl: process.env.SPURVIK_BASE_URL,
  riskTier: "limited_art50",
});

const stream = await ai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
  stream: true,
});
let text = "";
for await (const chunk of stream) text += chunk.choices[0]?.delta?.content ?? "";
console.log("Model said:", text);

const record = await provenanceOf(stream); // resolves after the stream ends
console.log("Record signature algorithm:", record.signatureAlg);

await ai._spurvik.shutdown();
```

Save it as `stream.js` and run `node stream.js`.

## Optional: the signed text trailer (off by default)

The SDK can append the signed provenance record to the model's text output. This is **opt-in and off by default**. It takes two settings:

- `marking: { text: "signed-trailer" }` computes the text with the trailer and returns it on the record as `markedOutput`. Your model response is unchanged.
- Add `applyToMessageContent: true` and the trailer is also appended to the response text itself (non-streaming responses only), which is where your end users see it.

```js
import OpenAI from "openai";
import { provenanceOf, withSpurvik } from "@spurvik/sdk";

const ai = withSpurvik(new OpenAI(), {
  apiKey: process.env.SPURVIK_API_KEY,
  signingSecret: process.env.SPURVIK_SIGNING_SECRET,
  contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET },
  baseUrl: process.env.SPURVIK_BASE_URL,
  riskTier: "limited_art50",
  marking: { text: "signed-trailer", applyToMessageContent: true }, // opt-in
});

const completion = await ai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});
const record = await provenanceOf(completion);
console.log("Response text now ends with:", completion.choices[0].message.content.slice(-40));
console.log("evidenceTrailerAttached:", record.evidenceTrailerAttached, "| markingApplied:", record.markingApplied);

await ai._spurvik.shutdown();
```

Save it as `trailer.js` and run `node trailer.js`. Expected output (the end of the text varies):

```text
Response text now ends with: …(base64url characters)…]]]
evidenceTrailerAttached: true | markingApplied: false
```

What to know before you switch it on:

- It appends `[[[spurvik-provenance-record:…]]]`, a base64url copy of the whole signed record, **including the keyed input and output fingerprints and the signature**. Anyone who receives the text can see it and pass it on.
- It adds roughly 900 characters to every answer in our test, and anyone can remove it by editing the text.
- Only someone holding your signing secret can check it.
- The record shows it as `evidenceTrailerAttached: true`. `markingApplied` stays `false`. It is evidence that links a text to a record. The trailer is not a machine-readable mark under Article 50(2).

## What happens when the control plane is unreachable

The SDK never blocks or fails your model call because telemetry could not be delivered (except for `high_annex3`, below). The outcome for the telemetry event depends on how your process runs. This was tested on `spurvik` commit `a350ee2`. Up to main `0e9cc89`, the `packages/sdk` changes are the halt and release calls (PR #8) and the new `@spurvik/sdk/mastra` and `@spurvik/sdk/openai-agents` entry points (PR #7: new adapter files plus their package.json exports and build entries); the telemetry code is unchanged:

| Situation | Model call | Provenance record | Telemetry event | `onTelemetryError` |
| --- | --- | --- | --- | --- |
| **Script / short job** (`limited_art50` or `minimal`) that awaits `flush()` or `shutdown()` | Succeeds | Returned, and the signature check passes | **Lost** when the script ends. The SDK tries 5 times (the first try plus 4 retries, with backoff). `await shutdown()` then returns and the script exits with code **0**. | Called once: after about 3 s (for example `fetch failed`), or about 8 s if the control plane never answers |
| **Long-running server** | Succeeds | Returned | The event is not delivered by those attempts. It stays queued (up to 500 events) and is sent with a later flush, for example with the next wrapped call after the control plane comes back. Nothing retries it on a timer. It is lost if the process stops first, so keep your own records. Calling `await ai._spurvik.shutdown()` before the process exits gives queued events a last try. | Called once, about 4 s after the call (about 9 s if the control plane never answers) |
| **`riskTier: "high_annex3"`** (halt check on) | **Fails before it is sent.** The SDK checks the human-stop state first and fails closed. The provider is not called. | None | None | — |

The `high_annex3` halt check is designed to support human-oversight work; whether your oversight measures meet Article 14 is for you to assess.

So for a script, a missing control plane means the telemetry event is lost, and the exit code stays 0. In this pre-release build, an event that is queued after a failed flush stays in memory (up to 500 events; the oldest are dropped first) and is sent with a later flush: on the next wrapped call, on `await ai._spurvik.shutdown()`, or once when the process ends on its own. Nothing retries it on a timer. The event whose flush already failed is not tried again when the process ends on its own unless something was queued after it, and `process.exit()` or a signal such as Ctrl+C skips that last flush. Calling `await ai._spurvik.shutdown()` before the process exits gives queued events one more try (up to 8 seconds by default). This is not in `987ec86`, the build design partners run. `onTelemetryError` is how you find out. To be safe:

- Check that `SPURVIK_BASE_URL` is right and the control plane is up before you run batch jobs. `GET /api/v1/health` on the control plane should answer.
- Always pass `onTelemetryError` and make its output visible, for example in your error tracker.
- Keep `record.json`, or wherever you store provenance records, on your side. The record and its signature do not depend on the control plane.
- In this release, do not rely on the control plane as your only copy of these events. Keep your own records as well.
- See [troubleshooting.md](troubleshooting.md#telemetry-and-the-control-plane) for the error messages, including the errors `high_annex3` throws and which of them are a `SpurvikHaltedError`.

## Optional: try it without an OpenAI key

This mock answers like the OpenAI Chat Completions API (normal and streaming), so you can test the wrapper without spending credits. Save it as `mock-openai.mjs` in `my-ai-app`:

```js
import http from "node:http";

http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const stream = JSON.parse(body || "{}").stream === true;
    const model = "gpt-4o-2024-08-06";
    if (stream) {
      res.setHeader("content-type", "text/event-stream");
      for (const piece of ["Hello ", "from the mock"]) {
        const chunk = { id: "mock", object: "chat.completion.chunk", created: 0, model,
          choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      const last = { id: "mock", object: "chat.completion.chunk", created: 0, model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
      res.write(`data: ${JSON.stringify(last)}\n\n`);
      return res.end("data: [DONE]\n\n");
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: "mock", object: "chat.completion", created: 0, model,
      choices: [{ index: 0, message: { role: "assistant", content: "Hello from the mock" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 4, total_tokens: 5 } }));
  });
}).listen(4010, "127.0.0.1", () => console.log("Mock OpenAI API on http://127.0.0.1:4010/v1"));
```

Start it in its own terminal, then point the OpenAI client at it:

```bash
node mock-openai.mjs
```

```bash
export OPENAI_API_KEY="sk-mock-not-a-real-key"
export OPENAI_BASE_URL="http://127.0.0.1:4010/v1"
node app.js
```

## Next steps

- [5-minute-quickstart.md](5-minute-quickstart.md): condensed walkthrough across the sandbox, hosted console, and local control plane.
- [sandbox-first-5-minutes.md](sandbox-first-5-minutes.md): step-by-step guide to the first 5 minutes in the `console.spurvik.com/sandbox` 2x2 interactive cockpit.
- [langgraph-quickstart.md](langgraph-quickstart.md): wrap compiled LangGraph workflows (`@spurvik/sdk/langgraph`), attach HMAC receipts to graph state, render `<AIDisclosureLabel />` (including Polish `locale="pl"` copy per Ruling D24), and map `interrupt()` / `Command({ resume })` to Spurvik's human-oversight queue.
- [hitl-approval-mapping.md](hitl-approval-mapping.md): map Vercel AI SDK `interrupted`, OpenAI Agents `needsApproval`, and LangGraph `interrupt()` into `/api/v1/hitl`.
- [console-onboarding.md](console-onboarding.md): organisation roles, `spurvik_invite_…` tokens, monthly event quotas, SIEM webhooks, and `<AIDisclosureLabel />` props (including Polish `locale="pl"` copy per Ruling D24).
- [onboarding-startups-smes.md](onboarding-startups-smes.md): what Spurvik does and does not do, in plain language.
- [troubleshooting.md](troubleshooting.md), [faq-additions.md](faq-additions.md), [faq-sandbox-2x2.md](faq-sandbox-2x2.md), [faq-hitl-and-plugin.md](faq-hitl-and-plugin.md), and [faq-art50-marking-and-pl-locale.md](faq-art50-marking-and-pl-locale.md): every error we hit while testing this guide and answers to common developer questions.
- The repository `README.md` covers human-oversight calls, risk tiers, retention and the operator console.
