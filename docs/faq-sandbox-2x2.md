# FAQ: 2x2 Sandbox Cockpit (`console.spurvik.com/sandbox`) and `@next/env` Shell Precedence

> Source: https://github.com/spurvik/spurvik (npm: `spurvik@1.0.8`, `spurvik-sdk@1.0.8`, `spurvik-mcp-server@1.0.4`). Spurvik is developed by EyeTea Solutions ApS (CVR 37093378) in Trekantområdet, Denmark. Spurvik logs AI calls with HMAC receipts and offers disclosure and marking hooks. It does not mark content itself and does not mean your system meets the EU AI Act.

---

### 1. Does the `console.spurvik.com/sandbox` 2x2 cockpit make network calls when I scan my app URL or click `Fire Test AI Call`, and does it set cookies?

No. The public 2x2 cockpit at `https://console.spurvik.com/sandbox` (and `https://console.spurvik.com/`, hosted in EU `fra1`) sets **zero cookies before sign-in** and runs all sandbox interactions in browser state:

- **`Stack Scanner` (`Paste App URL...` + `Scan`):** Parses the hostname locally in your browser (`new URL(...)`), updates the active domain pill in the top bar (capped at `28` characters), and selects the matching preset (`Lovable SaaS`, `Stripe Refund Agent`, or `AI Support Bot`) if the hostname contains `lovable`, `stripe`, or `support`. It never crawls or sends an HTTP request to the URL you enter.
- **`Fire Test AI Call` and `Human Gate` buttons (`Approve (€450)`, `Block Agent`, `Kill Switch`):** Prepend simulated hash-chain blocks (`#1043`, `#1044`, …) in browser memory so you can inspect how `raw_prompt: 0B`, `prev_hash`, `record_hash`, and `hmac` link together without an API key.

### 2. How do the `Human Gate (Art. 14)` controls (`Approve (€450)`, `Block Agent`, `Kill Switch`, `Reset`) in the sandbox map to SDK and API calls in production?

Card 2 (`Human Gate · Art. 14`) previews two production mechanisms side by side:

- **Per-action human review (`Approve (€450)` and `Block Agent`):** In `spurvik`, calling `await ai._spurvik.requireHumanApproval(actionName, payload)` sends `POST /api/v1/hitl`, which creates a `pending` row (or `pending_confirmation` when two-person confirmation is enabled on the project) and polls until a reviewer decides in `/dashboard/projects/<projectId>/oversight` or calls `submitHumanDecision(id, { status: "approved" | "rejected" | "overridden", reason })` with a `spurvik_reviewer_...` token. From 1.0.7, `requireHumanApproval` throws `SpurvikHitlRejectedError` on `rejected` and `overridden`; continue only when it returns status `approved`.
- **Project or action stop (`Kill Switch` and `Reset`):** Calling `await ai._spurvik.engageKillSwitch({ reason, actionName })` or `await ai._spurvik.releaseKillSwitch({ reason, actionName })` (or clicking **Engage stop** / **Release stop** on `/dashboard/projects/<projectId>/oversight`) toggles the stop checked before every `high_annex3` call (`GET /api/v1/oversight` -> `PROCEED` vs. `HALT`, throwing `SpurvikHaltedError` while active).
- **Audit scope:** Both in the sandbox (`#1043 · hitl.decision`) and in production (`audit_logs` / `oversight_states`), the oversight and audit record shows what happened, when, and who acted. A free-text reason is recorded only with a reviewer's decision or override and with halt and release calls (a blank halt or release reason gets a default text), never with per-call events.

### 3. How do I move from `Badge Studio (Art. 50)` (`Open in v0`, `Copy Lovable/Replit Prompt`, `Copy MCP URL`) to my own codebase?

Card 1 (`Badge Studio · Art. 50`) gives you three copy-paste bridges into your repository:

1. **Install the disclosure badge via `shadcn` or `spurvik/react`:**
   - Run `npx shadcn@latest add https://spurvik.com/r/eu-ai-act.json` (installs `components/spurvik-ai-disclosure-label.tsx` and a sample `app/api/chat/route.ts` with `PROCEED` / `ASK_HUMAN` / `HALT` gate evaluation) or `npx shadcn@latest add https://console.spurvik.com/r/eu-ai-act.json` (the registry opened by **`Open in v0`**, which installs `components/spurvik/ai-disclosure-badge.tsx` and `hooks/use-spurvik-receipt.ts`).
   - Or import `<AIDisclosureLabel />` from `spurvik/react` and pass the same `backgroundColor`, `textColor`, `borderColor`, and `accentColor` props shown by the `Emerald Glass`, `Cyan Minimal`, and `Floating Pill` presets.
   - If your system generates synthetic content (`Media Gen · Art. 50(2)`), remember that Spurvik's provenance record supports, but does not replace, Article 50(2) machine-readable marking.
2. **Connect the hosted Streamable HTTP MCP server (`https://console.spurvik.com/api/mcp`):**
   - Click **`Copy MCP URL`** (or **`Copy Lovable/Replit Prompt`**) to connect your agent or IDE to `https://console.spurvik.com/api/mcp`. It exposes four read-only, zero-auth tools: `spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, and `spurvik_marking_hooks`.
   - Over HTTP, `spurvik_find_unwrapped_calls` scans inline `code` or `files` payloads (up to `128 KB`) because it cannot read your local disk; to scan a local directory, run the stdio `spurvik-mcp-server` server or `/spurvik:check`.
3. **Mint a `spurvik_live_...` key:** Follow the [5-Minute Quickstart](./5-minute-quickstart.md). For a hosted console workspace, create the key in the hosted console and set `baseUrl` to `https://console.spurvik.com`.

### 4. What does the Readiness Ring (`40% Free` → `70%` → `100% Pro €19/mo`) in the top bar calculate?

The Readiness Ring (`data-testid="readiness-ring"`) is a live UI indicator of which controls you have toggled on inside the sandbox cockpit in the hosted sandbox. That UI is a hosted service and its source is not in this repository.

- **`40% Free`:** Shown when the `With Spurvik` switch in Card 1 is toggled off (`Without Spurvik`).
- **`55%` to `70%`:** Starts at `55%` when `With Spurvik` is on, adding `+5%` for each active toggle in Card 4 (`User Chat · Art. 50(1)`, `Media Gen · Art. 50(2)`, `High-Risk Actions · Art. 12/14` → `70%` when all three are on). Recording a `Human Gate` decision adds `+4%`, and clicking `Fire Test AI Call` adds `+4%` (capped at `75%` when fewer than three toggles are on).
- **`100% Pro €19/mo`:** Shown when you click **`Preview Pro`** in Card 4, or when all three obligation toggles are on and you trigger a `Human Gate` decision (which also appends a receipt block).
- The ring previews feature coverage inside the sandbox UI (with planned tier pricing at launch: Free `€0/mo`, Pro `€19/mo` or `€190/yr`, Team `€79/mo` or `€790/yr`, Enterprise from `€499/mo`; B2B subscription pricing, excl. VAT (ekskl. moms), B2B only.). It is not a legal assessment or a measure of whether your system meets the EU AI Act.

### 5. This repository does not include those start or purge scripts

Install with `npm install openai spurvik@1.0.8`. For a hosted console workspace, `baseUrl` is `https://console.spurvik.com`. Purging audit rows older than a project's period is a step the Spurvik operator runs by hand on the hosted control plane. Nothing in this repository schedules that step. Retention periods are (planned).

---

*Informational overview () — your own EU AI Act classification applies; Spurvik supports parts of your Art. 50, Art. 12 and Art. 14 work and is not legal advice. If you have a legal question about how the EU AI Act applies to your organisation, please consult qualified legal counsel or contact `hello@spurvik.com` to route product-scope questions to Legal.*
