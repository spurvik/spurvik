# First 5 Minutes in `console.spurvik.com/sandbox` (2x2 Interactive Cockpit)

> Source: https://github.com/spurvik/spurvik (npm: `spurvik@1.0.1`, `spurvik-sdk@1.0.1`, `spurvik-mcp-server@1.0.2`). Spurvik is developed by EyeTea Solutions ApS (CVR 37093378) in Trekantområdet, Denmark. Spurvik logs AI calls with HMAC receipts and offers disclosure and marking hooks. It does not mark content itself and does not mean your system meets the EU AI Act.

`https://console.spurvik.com/sandbox` (and `https://console.spurvik.com/`) renders the interactive 2x2 Obsidian Harbor cockpit. It is hosted in the EU (`fra1`), requires **no login or invite code**, sets **zero cookies before sign-in**, and fits in a single `1440×900` viewport without scrolling.

This guide walks you through the cockpit minute by minute and shows how every interactive control maps to `@spurvik/react`, `@spurvik/sdk`, `/api/mcp`, and `/r/eu-ai-act.json`.

---

## Cockpit Layout at a Glance

| Surface | UI Label / Pill | `data-testid` | What you can do in the browser | Production SDK / API counterpart |
| --- | --- | --- | --- | --- |
| **Left Icon Rail** (`7` focus items) | `Live Cockpit`, `Stack Scanner`, `Badge Studio (Art. 50)`, `Hash Vault (Art. 12)`, `Human Gate (Art. 14)`, `Legal Map (Pro €19)`, `Quick Connect` | `nav-all`, `nav-scanner`, `nav-badge`, `nav-hash`, `nav-gate`, `nav-legal`, `nav-connect` | Highlight a single card (dimming the other three to `50%` opacity), focus the URL scanner, or jump straight to the `Quick Connect` bar | Navigation helper for the 2x2 grid |
| **Top Workspace Bar** | Readiness Ring (`70%` default), active domain pill (`nordic-retail.example`), `Lovable SaaS`, `Stripe Refund Agent`, `AI Support Bot`, `Paste App URL...` + `Scan` | `readiness-ring`, `active-domain`, `preset-lovable`, `preset-stripe`, `preset-support`, `stack-scanner` | Switch stack presets or parse an app URL client-side to preview domain-specific prompts, risk scores, and obligation toggles | `withSpurvik(client, { systemName, riskTier, ... })` configuration |
| **Card 1 (Top-Left)** | `Badge Studio` · pill `Art. 50` | `card-badge-studio` | Toggle `With Spurvik` / `Without Spurvik`, switch between `Emerald Glass`, `Cyan Minimal`, and `Floating Pill`, and use `Open in v0`, `Copy Lovable/Replit Prompt`, or `Copy MCP URL` | `<AIDisclosureLabel />` (`@spurvik/react`), `https://spurvik.com/r/eu-ai-act.json` (`shadcn`), and `https://console.spurvik.com/api/mcp` |
| **Card 2 (Top-Right)** | `Human Gate` · pill `Art. 14` | `oversight-gate` | Inspect a paused agent action (`1 Pending`) and click `Approve (€450)`, `Block Agent`, `Kill Switch`, or `Reset` | `requireHumanApproval`, `submitHumanDecision`, `engageKillSwitch`, `releaseKillSwitch`, and policy gates (`PROCEED` / `ASK_HUMAN` / `HALT`) |
| **Card 3 (Bottom-Left)** | `Hash Vault` · pill `fra1` (`Frankfurt chain · Art. 12`) | `hash-chain` | Inspect chained blocks (`#1042`, `#1041`, `#1040`) and click `Fire Test AI Call` to prepend `#1043` with `raw_prompt: 0B`, `prev_hash`, `record_hash`, and `hmac` | `response._spurvik.record`, `verifyProvenanceSignature(record, secret)`, and `POST /api/v1/telemetry` (`audit_logs` chain) |
| **Card 4 (Bottom-Right)** | `Obligations Map` · pill `Pro €19` | `obligations-radar` | Toggle `User Chat · Art. 50(1)`, `Media Gen · Art. 50(2)`, and `High-Risk Actions · Art. 12/14`, compare `Free · active` vs. `Pro · `, and click `Preview Pro` | Your own risk-tier configuration (`minimal`, `limited_art50`, `high_annex3`) and workspace plan (`Free` / `Pro` / `Team` / `Enterprise`) |

---

## Minute 1: Orient in the Top Bar, Stack Presets, and `Stack Scanner`

Open `https://console.spurvik.com/sandbox` in your browser.

1. **Check the Readiness Ring (`data-testid="readiness-ring"`) and Active Domain Pill (`data-testid="active-domain"`):**
   - By default, the cockpit loads the **`Stripe Refund Agent`** preset (`nordic-retail.example`) with the circular Readiness Ring at **`70%`**.
   - The ring is a visual indicator of which sandbox controls are toggled on (`40% Free` when `Without Spurvik` is selected; `55%` base with `With Spurvik` + `+5%` per active obligation toggle + `+4%` when a Human Gate decision is recorded + `+4%` when a test receipt is fired, up to `100% Pro €19/mo`). It is a UI preview of active sandbox controls, not a legal score.
2. **Switch between the three stack presets** in the top workspace bar to see how the 2x2 cards adapt:

   | Preset Button | Active Domain Pill | Model | System Name | Paused Action in `Human Gate` | Default Obligation Toggles | Initial Ring |
   | --- | --- | --- | --- | --- | --- | --- |
   | `Lovable SaaS` (`preset-lovable`) | `lovable.app` | `gpt-4o` | `Lovable assistant` | `lovable-agent wants to run workspace.publish() for workspace #2201 (harbor-labs) · Risk: 42%` | `User Chat` (`ON`), `Media Gen` (`ON`), `High-Risk Actions` (`OFF`) | `65%` |
   | `Stripe Refund Agent` (`preset-stripe`, default) | `nordic-retail.example` | `gpt-4o` | `Refund assistant` | `refund-agent wants to run stripe.refunds.create(€450) for order #4821 (nordic-retail) · Risk: 88%` | `User Chat` (`ON`), `Media Gen` (`ON`), `High-Risk Actions` (`ON`) | `70%` |
   | `AI Support Bot` (`preset-support`) | `support.example` | `claude-3-7` | `Support assistant` | `support-bot wants to run ticket.reply() for ticket #9033 (harbor-support) · Risk: 31%` | `User Chat` (`ON`), `Media Gen` (`OFF`), `High-Risk Actions` (`OFF`) | `60%` |

3. **Test the `Stack Scanner` (`Paste App URL...` + `Scan`):**
   - Click `Stack Scanner` (`Scan`) in the left icon rail (`nav-scanner`) or click directly into the `Paste App URL...` input (`url-scanner-input`).
   - Type any URL or hostname (for example `https://checkout.stripe-demo.eu` or `https://my-agent.internal.example`) and click **`Scan`** (`url-scan-btn`).
   - **Zero external network calls:** The scanner parses the hostname in browser memory (`new URL(...)`), caps the domain pill at `28` characters, and switches to `Lovable SaaS`, `Stripe Refund Agent`, or `AI Support Bot` if the hostname contains `lovable`, `stripe`, or `support`.

---

## Minute 2: Preview `<AIDisclosureLabel />` and `Quick Connect` in `Badge Studio (Art. 50)`

Look at **Card 1 (`Badge Studio`, top-left, pill `Art. 50`)**, or click `Badge Studio (Art. 50)` (`nav-badge`) in the left rail to isolate it.

1. **Toggle `With Spurvik` vs. `Without Spurvik` (`data-testid="switch-spurvik-mode"`):**
   - When **`With Spurvik`** is active, the `#0B111E` dark-glass chat bubble (`chat-bubble`) renders the live `@spurvik/react` `<AIDisclosureLabel />` component inline:
     ```text
     Refund assistant. You are interacting with an AI system.
     ```
   - Click the switch to toggle to **`Without Spurvik`**. The `<AIDisclosureLabel />` unmounts, a rose status pill (`Notice off`) appears, and the Readiness Ring in the top bar drops to **`40% Free`**. Click the switch again to return to **`With Spurvik`**.
2. **Switch between the three dark-glass badge styles:**
   - **`Emerald Glass`** (`style-emerald`): `backgroundColor="rgba(16, 185, 129, 0.14)"`, `textColor="#ECFDF5"`, `borderColor="rgba(52, 211, 153, 0.45)"`, `accentColor="#10B981"`.
   - **`Cyan Minimal`** (`style-cyan`): `backgroundColor="rgba(56, 189, 248, 0.14)"`, `textColor="#E0F2FE"`, `borderColor="rgba(56, 189, 248, 0.45)"`, `accentColor="#38BDF8"`.
   - **`Floating Pill`** (`style-floating`): `backgroundColor="rgba(129, 140, 248, 0.16)"`, `textColor="#EEF2FF"`, `borderColor="rgba(129, 140, 248, 0.5)"`, `accentColor="#818CF8"`.
3. **Use the `Quick Connect` bar (`data-testid="quick-connect"`) at the bottom of Card 1:**
   - **`Open in v0`:** Opens the `shadcn` registry item (`https://console.spurvik.com/r/eu-ai-act.json`) directly in `v0.dev`.
   - **`Copy Lovable/Replit Prompt` (`copy-builder-prompt`):** Copies the one-line builder prompt (`Add Spurvik EU AI Act Art. 50(1) AI disclosure badge and keyed HMAC receipt hook from https://console.spurvik.com/r/eu-ai-act.json and connect MCP https://console.spurvik.com/api/mcp`) and changes the button label to `Prompt copied`.
   - **`Copy MCP URL` (`copy-mcp-url`):** Copies `https://console.spurvik.com/api/mcp` and changes the button label to `URL copied`.

---

## Minute 3: Exercise `Human Gate (Art. 14)` and See the Hash-Chain Receipt

Look at **Card 2 (`Human Gate`, top-right, pill `Art. 14`)**, or click `Human Gate (Art. 14)` (`nav-gate`) in the left rail.

1. **Inspect the paused action:**
   - The status pill (`gate-status`) starts at **`1 Pending`** (also mirrored in the left rail badge next to `Gate`) with the subtitle `order / ticket id`.
   - On the `Stripe Refund Agent` preset, the card displays:
     ```text
     refund-agent wants to run stripe.refunds.create(€450) for order #4821 (nordic-retail) · Risk: 88%
     ```
   - Below the risk bar, a 3-step progress bar shows `Paused` → `Human` → `Receipt`.
2. **Click a decision button (`Approve (€450)`, `Block Agent`, or `Kill Switch`) and watch Card 3 (`Hash Vault`):**
   - Click **`Approve (€450)`** (`gate-approve-btn`):
     - The status pill changes to **`Approved`** (emerald), all 3 progress steps (`Paused` → `Human` → `Receipt`) light up, and the Readiness Ring reaches **`100% Pro €19/mo`** (when all three obligation toggles in Card 4 are on).
     - At the same moment, **Card 3 (`Hash Vault`)** prepends a new chained receipt block at the top of the chain:
       ```text
       #1043 · hitl.decision · raw_prompt: 0B · prev_hash: 8f3a…9c1d · record_hash: d4f2…77c0 · hmac: d4f2…77c0 · fra1
       ```
   - Click **`Block Agent`** (`gate-block-btn`) to transition the status pill to **`Blocked`** (amber) and append another `hitl.decision` block (`#1044`).
   - Click **`Kill Switch`** (`gate-kill-btn`) to transition the status pill to **`Halted`** (rose) and append a `hitl.decision` block.
   - Click **`Reset`** (`gate-reset-btn`) at any time to return the gate status to **`1 Pending`**.
3. **How `Human Gate` maps to production SDK & API calls:**
   - **Per-action approval (`Approve` / `Block Agent`):** In `@spurvik/sdk`, calling `await ai._spurvik.requireHumanApproval(actionName, payload)` records a `pending` row (or `pending_confirmation` when two-person confirmation is enabled) via `POST /api/v1/hitl`. A human reviewer decides in `/dashboard/projects/<projectId>/oversight` or calls `submitHumanDecision(id, { status: "approved" | "rejected" | "overridden", reason })` with a `spurvik_reviewer_` token.
   - **Project or action stop (`Kill Switch` / `Reset`):** Calling `await ai._spurvik.engageKillSwitch({ reason, actionName })` or `await ai._spurvik.releaseKillSwitch({ reason, actionName })` (or clicking **Engage stop** / **Release stop** in the console) toggles the stop checked before every `high_annex3` call (`PROCEED` vs. `HALT`, throwing `SpurvikHaltedError` when active).
   - **Scope of the audit record:** The oversight and audit record shows what happened, when, and who acted — never why.

---

## Minute 4: Inspect Keyed HMAC Receipts in `Hash Vault (Art. 12)`

Look at **Card 3 (`Hash Vault`, bottom-left, pill `fra1`, subtitle `Frankfurt chain · Art. 12`)**.

1. **Read the three visible chain blocks:**
   - Before you click any buttons, the vault displays blocks `#1042`, `#1041`, and `#1040` in reverse chronological order (newest at top):
     ```text
     #1042 · gpt-4o · raw_prompt: 0B · hmac: 8f3a…9c1d · fra1
     #1041 · claude-3-7 · raw_prompt: 0B · prev_hash: 4b2e…1a9c · record_hash: 8f3a…9c1d · fra1
     #1040 · gemini-2.5 · raw_prompt: 0B · hmac: 4b2e…1a9c · fra1
     ```
2. **Click `Fire Test AI Call` (`data-testid="fire-test-call-btn"`):**
   - Each click prepends a new block (`#1043`, `#1044`, …) for the active preset's model (`gpt-4o` or `claude-3-7`) and links its `prev_hash` to the prior top block's hash.
3. **What each field means when you run `@spurvik/sdk`:**
   - `raw_prompt: 0B`: Your application hashes prompt and output strings locally with `contentHash: { mode: "keyed", secret: process.env.SPURVIK_CONTENT_HASH_SECRET! }`. Raw prompts and model outputs are never sent to `POST /api/v1/telemetry`.
   - `hmac`: The `HMAC-SHA-256` signature (`record.signature`) computed on your server using `SPURVIK_SIGNING_SECRET`. You can check any receipt locally with `await verifyProvenanceSignature(record, process.env.SPURVIK_SIGNING_SECRET!)` or explain its fields via the `spurvik_explain_receipt` MCP tool.
   - `prev_hash` and `record_hash`: When telemetry is ingested into the control plane (`audit_logs`), each project row chains `prev_hash` (the previous row's `record_hash`, or `"GENESIS"` on the first row) into `record_hash = SHA-256(canonical({ prevHash, projectId, record }))`.

---

## Minute 5: Toggle `Obligations Map (Pro €19)` and Move to Your Codebase

Look at **Card 4 (`Obligations Map`, bottom-right, pill `Pro €19`)**.

1. **Toggle the three EU AI Act obligation switches:**
   - **`User Chat · Art. 50(1)` (`toggle-chats`):** Toggles the `Art. 50(1) notice` pill (`"Article 50(1) AI-interaction notice (applies since 2 Aug 2026)."`).
   - **`Media Gen · Art. 50(2)` (`toggle-generates`):** Toggles the `Art. 50(2) marking` pill (`"Article 50(2) machine-readable marking (applies since 2 Aug 2026; pre-2 Aug 2026 systems have until 2 Dec 2026 under Art. 111(4))."`). Its provenance record supports, but does not replace, Article 50(2) machine-readable marking.
   - **`High-Risk Actions · Art. 12/14` (`toggle-high-risk`):** Toggles the `Art. 12 & Art. 14` pill (`"Article 12 logging & Article 14 human oversight for high-risk AI systems (Annex III applies from 2 Dec 2027)."`).
2. **Compare `Free · active` vs. `Pro · ` (`B2B subscription pricing, excl. VAT (ekskl. moms), B2B only.`):**
   - **`Free · active` (`€0/mo`, `10k events/mo`):** `Art. 50(1) Badge`, `Keyed HMAC Receipts`, `Local /spurvik:check`.
   - **`Pro · ` (`€19/mo` or `€190/yr`, excl. VAT · B2B only · `250k events/mo`):** `Plain-English Obligations Map`, `90-Day EU fra1 Vault`, `Hosted Human Gate Queue`, `DPO Engineering Summary`.
   - Click **`Preview Pro`** (`pro-preview-btn`) to preview the `100% Pro €19/mo` state on the Readiness Ring, or click **`Unlock Pro €19/mo ->`** to open `/signup` if you have a  access code.

---

## Copy-Paste: Move from the Browser Sandbox to Your Codebase

### 1. Install the UI Disclosure Component (`shadcn` Registry)

To drop the standalone badge into a Next.js or React project without workspace credentials:

```bash
# Site starter (components/spurvik-ai-disclosure-label.tsx + sample app/api/chat/route.ts):
pnpm dlx shadcn@latest add https://spurvik.com/r/eu-ai-act.json

# Console starter opened by "Open in v0" (components/spurvik/ai-disclosure-badge.tsx + hooks/use-spurvik-receipt.ts):
pnpm dlx shadcn@latest add https://console.spurvik.com/r/eu-ai-act.json
```

### 2. Query the Hosted Streamable HTTP MCP Endpoint (`/api/mcp`)

`https://console.spurvik.com/api/mcp` exposes four read-only, zero-auth MCP tools (`spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, `spurvik_marking_hooks`). Test it from your terminal:

```bash
curl -sS -X POST https://console.spurvik.com/api/mcp \
  -H "content-type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "spurvik_setup_snippet",
      "arguments": { "target": "openai", "runtime": "next" }
    }
  }'
```

### 3. Connect Your App to a Local or Hosted Control Plane

When you are ready to mint a real `spurvik_live_...` project key and ingest signed receipts:

- Follow the **[5-Minute Quickstart](./5-minute-quickstart.md)** (remembering to run `unset SPURVIK_WEBHOOK_KEK DATABASE_URL SPURVIK_SESSION_SECRET SPURVIK_SIGNING_SECRET SPURVIK_LOG_CHECKPOINT_SECRET SPURVIK_ALLOW_TEST_KEYS` before `pnpm db:migrate`, `pnpm db:seed`, or `pnpm dev` if you had earlier shell variables exported).
- Read the **[Console Onboarding Guide](./console-onboarding.md)** for organisation invites (`spurvik_invite_...`), monthly quotas, SIEM webhooks, and `<AIDisclosureLabel />` props.
- Check **[2x2 Sandbox & Environment FAQ](./faq-sandbox-2x2.md)** for answers to common developer questions.

---

*Informational overview () — your own EU AI Act classification applies; Spurvik supports parts of your Art. 50, Art. 12 and Art. 14 work and is not legal advice. · EyeTea Solutions ApS (CVR 37093378) · [Privacy Notice](https://spurvik.com/privacy.html)*
