# 5-Minute Quickstart

> Source: https://github.com/spurvik/spurvik (npm: `spurvik@1.0.1`, `spurvik-sdk@1.0.1`, `spurvik-mcp-server@1.0.2`). Spurvik is developed by EyeTea Solutions ApS (CVR 37093378) in Trekantområdet, Denmark. Spurvik logs AI calls with HMAC receipts and offers disclosure and marking hooks. It does not mark content itself and does not mean your system meets the EU AI Act.

Go from a fresh clone or workspace invite to a signed provenance receipt (`record.signature`), an ingested telemetry event (`201 Created`), and a working human-oversight check in five minutes.

---

## Choose Your Path: Sandbox vs. Hosted Console vs. Local Control Plane

Before running commands, pick the path that matches what you have in front of you:

| Path | Who it is for | Login / Invite required? | What you get |
| --- | --- | --- | --- |
| **Path A: Public 2x2 sandbox cockpit** (`https://console.spurvik.com/sandbox`) | Anyone evaluating Spurvik in the browser before setting up keys | **No login or invite code required** (live in EU `fra1`, sets `0` cookies before sign-in) | Interactive 2x2 cockpit (`Badge Studio`, `Human Gate`, `Hash Vault`, `Obligations Map`), `<AIDisclosureLabel />` style switcher, simulated HMAC receipt & hash-chain blocks, and a copy action for `/api/mcp` and `/r/eu-ai-act.json`. See [First 5 Minutes in `console.spurvik.com/sandbox`](./sandbox-first-5-minutes.md). |
| **Path B: Hosted console** (`https://console.spurvik.com`) | Pre-release teams with an access invite | **Yes** — `/signup` requires the pre-release `Invite code` (`SPURVIK_INVITE_CODE`) **and** an organisation owner must send you a workspace invite token (`spurvik_invite_...`) to claim at `/invites` | Hosted EU (`fra1`) control plane, organisation/project dashboard, live `spurvik_live_...` API keys, SIEM webhooks, and monthly quota tracking (`10,000` Free / `250,000` Pro / `2,000,000` Team events/month; pre-release planned prices at launch, excl. VAT). |
| **Path C: Local control plane** (`http://localhost:3000`) | Developers running `spurvik` on their own machine with PostgreSQL | **No external invite required** — `pnpm db:seed` creates a local organisation, project, and `spurvik_live_...` key | Full local Next.js control plane + Drizzle/PostgreSQL database with pre-seeded `spurvik_live_...` and `spurvik_reviewer_...` tokens. |

> **Important note on hosted `/signup`:** Creating an account at `https://console.spurvik.com/signup` with the pre-release gate code creates your user session (`spurvik_session`), **not** a default organisation or project. Until an organisation owner invites you and you claim the `spurvik_invite_...` token at `https://console.spurvik.com/invites` (or you run Path C locally), `/dashboard` will show *"No project yet"* and `POST /api/projects` will return `401 Unauthorized`. See [Console Onboarding Guide](./console-onboarding.md) for the invite flow.

---

## Prerequisites (Path B & Path C)

- **Node.js** `>= 20.9.0` and **pnpm** `10.x` (`corepack enable`).
- **PostgreSQL 15+** (required for Path C local control plane; optional if you already claimed a workspace invite on `https://console.spurvik.com` and created a `spurvik_live_...` key).
- Public MIT packages on npm: `spurvik@1.0.1`, `spurvik-sdk@1.0.1`, and `spurvik-mcp-server@1.0.2`, from https://github.com/spurvik/spurvik. In this monorepo, `@spurvik/core`, `@spurvik/sdk`, `@spurvik/react`, and `@spurvik/mcp` use workspace version `0.1.0`.

---

## 1. Clone and Build the Monorepo (1 min)

Clone the public repository https://github.com/spurvik/spurvik:

```bash
git clone https://github.com/spurvik/spurvik.git spurvik
cd spurvik
pnpm install
pnpm build
```

---

## 2. Get a `spurvik_live_` Project API Key (1 min)

### Option 2A — Local Control Plane (`pnpm db:seed`, fastest for local dev)

Configure `apps/web/.env`, run migrations, and seed the demo project.

```bash
cp apps/web/.env.example apps/web/.env
```

Generate the required secrets and append them to `apps/web/.env`:

```bash
cat <<EOF >> apps/web/.env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/spurvik
SPURVIK_SESSION_SECRET=$(openssl rand -base64 32)
SPURVIK_SIGNING_SECRET=$(openssl rand -base64 32)
SPURVIK_LOG_CHECKPOINT_SECRET=$(openssl rand -base64 32)
SPURVIK_WEBHOOK_KEK=$(openssl rand -base64 32)
EOF
```

Clear any stale `SPURVIK_*` or `DATABASE_URL` variables already exported in your shell, then migrate, seed, and start the local server:

```bash
unset SPURVIK_WEBHOOK_KEK DATABASE_URL SPURVIK_SESSION_SECRET SPURVIK_SIGNING_SECRET SPURVIK_LOG_CHECKPOINT_SECRET SPURVIK_ALLOW_TEST_KEYS
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm db:seed` prints a ready-to-use `spurvik_live_...` API key and a `spurvik_reviewer_...` reviewer token in your terminal:

```text
Seed complete.
  Project ID : <uuid>
  API key    : spurvik_live_<48-hex-chars>
  Reviewer   : spurvik_reviewer_<48-hex-chars>
```

### Troubleshooting: Stale Shell Variables (`@next/env` Precedence Trap: `SPURVIK_WEBHOOK_KEK` / `DATABASE_URL`)

If `pnpm dev`, `pnpm db:migrate`, `pnpm db:seed`, or `POST /api/v1/telemetry` fails even after you updated `apps/web/.env`, check whether an older terminal session exported `SPURVIK_*` (or legacy `AEGIS_*`) or `DATABASE_URL` into your shell environment:

- **Why this happens:**
  1. Before `next dev` or `next start` launches, `apps/web/src/scripts/refuse-missing-keys.ts` calls `loadEnvConfig` from `@next/env` and validates `SPURVIK_LOG_CHECKPOINT_SECRET` and `SPURVIK_WEBHOOK_KEK` (`apps/web/src/server/required-keys.ts`).
  2. Before `pnpm db:migrate`, `pnpm db:seed`, or `pnpm purge-logs` runs, `apps/web/src/db/load-env.ts` parses `apps/web/.env` with `if (key && process.env[key] === undefined) process.env[key] = value`.
  3. Neither `@next/env` (`loadEnvConfig`) nor `loadEnv()` overwrites environment variables that are already set in your shell's `process.env` (and `readSpurvikEnv` in `@spurvik/core` reads `process.env.SPURVIK_<NAME>` first, falling back to `process.env.AEGIS_<NAME>`).
- **Exact symptoms:**
  - `pnpm dev` exits with code `1` before Next.js prints `✓ Ready`:
    ```text
    SPURVIK_WEBHOOK_KEK must be 32 bytes (base64url, hex, or 32-byte utf8).
    ```
    or:
    ```text
    SPURVIK_LOG_CHECKPOINT_SECRET is shorter than 16 characters.
    ```
  - `POST /api/v1/telemetry` returns `500 Internal Server Error` (or `pnpm db:migrate` / `pnpm db:seed` fails with `ECONNREFUSED` or connects to the wrong database) because a stale `DATABASE_URL` or `SPURVIK_WEBHOOK_KEK` exported in the shell overrides `apps/web/.env`.
- **One-line check:**
  ```bash
  env | grep -E '^(SPURVIK_|AEGIS_|DATABASE_URL=)'
  ```
- **One-line fix (run before `pnpm db:migrate`, `pnpm db:seed`, or `pnpm dev`):**
  ```bash
  unset SPURVIK_WEBHOOK_KEK DATABASE_URL SPURVIK_SESSION_SECRET SPURVIK_SIGNING_SECRET SPURVIK_LOG_CHECKPOINT_SECRET SPURVIK_ALLOW_TEST_KEYS
  ```

### Option 2B — Hosted Console (`https://console.spurvik.com`)

1. Sign in at `https://console.spurvik.com/login` (or create your account at `/signup` using your pre-release access code and then claim your organisation's `spurvik_invite_...` token at `https://console.spurvik.com/invites`).
2. Open **Dashboard → API Keys** (`/dashboard/keys`), enter a label (for example `quickstart-key`), and click **Generate key**.
3. Copy the plaintext `spurvik_live_...` value immediately — the server stores only its SHA-256 hash (`key_hash`) and never displays the full secret again.

---

## 3. Export Client Environment Variables (1 min)

In the terminal where you will run your application code, export your project key, your local signing and content-hash secrets, and the control-plane base URL:

```bash
export SPURVIK_API_KEY="spurvik_live_<your-key>"
export SPURVIK_SIGNING_SECRET="$(openssl rand -hex 32)"
export SPURVIK_CONTENT_HASH_SECRET="$(openssl rand -hex 32)"
# Use http://localhost:3000 for Path C (local) or https://console.spurvik.com for Path B (hosted):
export SPURVIK_BASE_URL="http://localhost:3000"
```

- `SPURVIK_API_KEY`: Authenticates telemetry ingestion (`POST /api/v1/telemetry`) and oversight calls (`GET/POST /api/v1/oversight`, `POST /api/v1/hitl`).
- `SPURVIK_SIGNING_SECRET`: Signs every provenance receipt locally (`HMAC-SHA-256`). Must be at least 16 characters.
- `SPURVIK_CONTENT_HASH_SECRET`: Keyed HMAC secret used on your server to hash prompt and output text (`inputHash`, `outputHash`) before telemetry leaves your process. Raw prompts and outputs are never sent to the Spurvik control plane.

---

## 4. Wrap a Client, Send Your First Event, and Verify the Receipt (1.5 min)

Create `quickstart-check.ts` at the root of the monorepo and run it with `pnpm --filter @spurvik/sdk exec tsx ../../quickstart-check.ts`:

```ts
import { verifyProvenanceSignature } from "@spurvik/core";
import { withSpurvik } from "@spurvik/sdk";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// Replace mockOpenAIClient with `new OpenAI()` when calling the live OpenAI API.
const mockOpenAIClient = {
  chat: {
    completions: {
      create: async (params: { model: string; messages: Array<{ role: string; content: string }> }) => ({
        id: "chatcmpl-quickstart-001",
        model: params.model,
        choices: [{ index: 0, message: { role: "assistant", content: "Hello from Spurvik quickstart." } }],
        usage: { prompt_tokens: 14, completion_tokens: 7, total_tokens: 21 },
      }),
    },
  },
};

const ai = withSpurvik(mockOpenAIClient, {
  apiKey: requireEnv("SPURVIK_API_KEY"),
  signingSecret: requireEnv("SPURVIK_SIGNING_SECRET"),
  contentHash: {
    mode: "keyed",
    secret: requireEnv("SPURVIK_CONTENT_HASH_SECRET"),
  },
  baseUrl: requireEnv("SPURVIK_BASE_URL"),
  // Sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.
  riskTier: "limited_art50",
  systemName: "support-assistant",
});

async function main() {
  const response = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Summarise my order status." }],
  });

  const { record, markedOutput } = response._spurvik;
  const signatureOk = await verifyProvenanceSignature(record, requireEnv("SPURVIK_SIGNING_SECRET"));

  console.log("Model:", record.modelId);
  console.log("Signature alg:", record.signatureAlg);
  console.log("Signature valid:", signatureOk);
  console.log("Input HMAC:", record.inputHash);
  console.log("Output HMAC:", record.outputHash);
  console.log("Marking hook:", markedOutput.watermark.instructions);

  // Flush the background telemetry queue so the event lands in the control plane before exit.
  await ai._spurvik.shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Expected output:

```text
Model: gpt-4o-mini
Signature alg: HMAC-SHA-256
Signature valid: true
Input HMAC: <64-char hex>
Output HMAC: <64-char hex>
Marking hook: Embed the C2PA manifest or watermark metadata before serving to end users.
```

> **Article 50(2) scope:** `markedOutput` provides hooks and metadata (`recordId`, `outputHash`, `timestamp`, `signature`) for your own downstream watermarking or C2PA pipeline. Its provenance record supports, but does not replace, Article 50(2) machine-readable marking.

When `await ai._spurvik.shutdown()` completes, `POST /api/v1/telemetry` returns `201 Created` (`{"data":{"inserted":1,"quota":{"tier":"free","limit":10000,"used":1,"remaining":9999}}}`) along with `x-spurvik-monthly-quota-limit`, `x-spurvik-monthly-quota-used`, and `x-spurvik-monthly-quota-remaining` headers. You can view the hash-chained entry in `/dashboard` (Audit Log Explorer).

---

## 5. Verify the Human Oversight Kill Switch (0.5 min)

Test engaging and releasing the project kill switch (`Article 14` human oversight support):

```ts
const halted = await ai._spurvik.engageKillSwitch({
  reason: "Quickstart halt drill",
});
console.log("Halted:", halted.killSwitchActive, "Reason:", halted.reason);

const released = await ai._spurvik.releaseKillSwitch({
  reason: "Quickstart halt drill complete",
});
console.log("Released:", !released.killSwitchActive, "Previous:", released.previousReason);
```

- Both `engageKillSwitch({ reason })` and `releaseKillSwitch({ reason })` accept an optional `reason` in the SDK (defaulting to `"Halted via SDK (no reason given)"` and `"Released via SDK (no reason given)"`). Direct HTTP calls to `POST /api/v1/oversight` require a non-empty `reason` string (`400 Bad Request` if omitted).
- The oversight and audit record shows what happened, when, and who acted — never why.

---

## 6. Add the User-Facing Disclosure Badge (`Article 50(1)`)

Render `<AIDisclosureLabel />` from `@spurvik/react` next to your chat or assistant surface:

```tsx
import { AIDisclosureLabel } from "@spurvik/react";

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

Or install the standalone copy-paste component via the `shadcn` registry endpoint:

```bash
pnpm dlx shadcn@latest add https://spurvik.com/r/eu-ai-act.json
```

> **Polish (`locale="pl"`) note (Legal Ruling D24):** `@spurvik/react` includes built-in translations for all 24 EU languages in `EU_DISCLOSURE_LOCALES`. The Polish (`locale="pl"`) copy (`interaction: "Korzystasz z systemu AI."`, `emotionBiometric: "Jesteś narażony na system rozpoznawania emocji lub kategoryzacji biometrycznej."`) is cleared as written under Ruling D24. If your team prefers gender-neutral Polish phrasing on `<AIArticle50Section3Notice locale="pl" />`, call `registerDisclosureLocale("pl", { ...disclosureCopy("pl"), emotionBiometric: "Objęty działaniem systemu rozpoznawania emocji lub kategoryzacji biometrycznej." })` at startup.

---

## Where Next

- **First 5 minutes in the 2x2 sandbox cockpit:** [`docs/sandbox-first-5-minutes.md`](./sandbox-first-5-minutes.md)
- **Console onboarding (invites, roles, quotas, SIEM webhooks, `<AIDisclosureLabel />` props):** [`docs/console-onboarding.md`](./console-onboarding.md)
- **LangGraph quickstart (`@spurvik/sdk/langgraph`):** [`docs/langgraph-quickstart.md`](./langgraph-quickstart.md)
- **HITL & tool-approval mapping (AI SDK, OpenAI Agents, LangGraph):** [`docs/hitl-approval-mapping.md`](./hitl-approval-mapping.md)
- **Mastra, OpenAI Agents & LangGraph quick-cards:** [`docs/adapters-quick-cards.md`](./adapters-quick-cards.md)
- **Claude Code plugin & MCP tools:** [`docs/claude-code-plugin.md`](./claude-code-plugin.md)
- **Troubleshooting:** [`docs/troubleshooting.md`](./troubleshooting.md)
- **FAQ additions:** [`docs/faq-additions.md`](./faq-additions.md), [`docs/faq-sandbox-2x2.md`](./faq-sandbox-2x2.md), [`docs/faq-hitl-and-plugin.md`](./faq-hitl-and-plugin.md), and [`docs/faq-art50-marking-and-pl-locale.md`](./faq-art50-marking-and-pl-locale.md)
