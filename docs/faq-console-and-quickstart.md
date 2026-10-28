# FAQ: Console Onboarding and 5-Minute Quickstart (10 Entries)

> **Pre-release (0.x).** Written for `spurvik` main at commit `e599000` (25 Oct 2026). Pre-release. Access by request. Planned prices at launch, excl. VAT. Not legal advice.
>
> *Source: https://github.com/spurvik/spurvik. npm: `spurvik@1.0.1`, `spurvik-sdk@1.0.1`, `spurvik-mcp-server@1.0.2`.*

## Signup, Sandbox, and Keys

### 1. Can I try the console without an invite code, and why does `/signup` say "No organisation and no project yet"?

Yes — open [console.spurvik.com/sandbox](https://console.spurvik.com/sandbox) (EU `fra1`) to inspect the interactive Hash-Chain Diagram, Oversight Gate Diagram, and Obligations Radar with no login or invite code.

On `https://console.spurvik.com/signup`, account creation is gated by `SPURVIK_INVITE_CODE` and creates a console login (`users` row and `spurvik_session` cookie) only — it does not create an organisation or starter project. You get an organisation, project, and `spurvik_live_` key in one of two ways:

1. **Hosted console (`/invites`):** An existing organisation `owner` or `admin` invites you from `/dashboard/projects/<projectId>` (**Team -> Invite a member**) and shares a one-time `spurvik_invite_...` token to claim at `https://console.spurvik.com/invites`. Once you are an `owner` of an organisation, create a project on `/dashboard/projects` and mint a `spurvik_live_` key on the project page.
2. **Local control plane (`pnpm db:seed`):** Running `pnpm db:migrate && pnpm db:seed` in `spurvik` creates a local `Demo Organization`, `owner` login, `Demo Project`, and prints a ready-to-use `spurvik_live_` key. See the [5-minute quickstart](5-minute-quickstart.md) and [Console Onboarding Guide](console-onboarding.md).

### 2. What is the difference between `spurvik_live_`, `spurvik_pub_`, `spurvik_reviewer_`, and `spurvik_invite_` tokens?

Each prefix is scoped to a specific surface, shown once when created, and stored on the server only as a SHA-256 hex digest:

| Prefix | Issued by | Used for |
|---|---|---|
| `spurvik_live_` | `owner` (**Keys -> Create or rotate live key** or `pnpm db:seed`) | Server-side SDK calls to `POST /api/v1/telemetry`, `GET/POST /api/v1/oversight`, `GET/POST /api/v1/hitl`, and `POST /api/v1/disclosure`. |
| `spurvik_pub_` | `owner` (**Keys -> Create disclosure key** or `pnpm db:seed`) | Browser-side `<AIDisclosureLabel />` opt-in beacon (`POST /api/v1/disclosure` only; rejected by telemetry, oversight, and HITL endpoints). |
| `spurvik_reviewer_` | `owner` (**Reviewer token -> Issue reviewer token** or `pnpm db:seed`) | Sent in the `x-spurvik-reviewer` header (`reviewerToken` in `SpurvikConfig`) alongside a `spurvik_live_` key when calling `engageKillSwitch`, `releaseKillSwitch`, or `submitHumanDecision` via the API. |
| `spurvik_invite_` | `owner` or `admin` (**Team -> Invite a member**) | One-time organisation invite token (valid for 7 days), claimed at `/invites`. |

### 3. Why did `pnpm dev` fail with `SPURVIK_WEBHOOK_KEK must be 32 bytes` or `POST /api/v1/telemetry` return `500` after I edited `apps/web/.env`?

Before starting Next.js, `apps/web/src/scripts/refuse-missing-keys.ts` loads `apps/web/.env` using `@next/env`, which **never overwrites environment variables that are already exported in your shell (`process.env`)**. If `SPURVIK_WEBHOOK_KEK`, `SPURVIK_LOG_CHECKPOINT_SECRET`, or `DATABASE_URL` is already set in your terminal from an earlier command or test run, clear those shell variables before starting the server:

```bash
unset DATABASE_URL SPURVIK_SESSION_SECRET SPURVIK_LOG_CHECKPOINT_SECRET SPURVIK_WEBHOOK_KEK SPURVIK_ALLOW_TEST_KEYS
pnpm dev
```

---

## Team Invites and Member Management

### 4. How do team invites and organisation roles (`owner`, `admin`, `reviewer`, `member`) work?

Membership (`organization_members`) is organisation-wide and supports four roles:

- **`owner`:** Full control over projects, API keys, per-project HMAC keys, reviewer tokens, retention, Enterprise monthly quotas, webhooks, SIEM export, project data deletion, and all team roles (including `owner`). Every organisation must keep at least one `owner` (`"The last owner stays an owner."`).
- **`admin`:** Can invite `admin`, `reviewer`, and `member` users, change their roles, remove them, and revoke their pending invites, but cannot assign or modify the `owner` role (`"Only an owner can assign or change the owner role."`).
- **`reviewer` and `member`:** Can view project dashboards, audit logs, and HITL queues, record oversight halts/releases and HITL decisions in the console, and revoke their own `spurvik_reviewer_` token, but cannot modify team members or project settings.

Invite tokens (`spurvik_invite_...`) expire after **7 days**. Claiming an invite at `/invites` creates a user account if the email is new, or requires signing in with that exact email first if an account already exists. `/invites` is rate-limited to `10` attempts per window.

### 5. If we remove a team member or redact their email for a data-erasure request, does the member audit hash chain break?

No. Every invite, acceptance, role change, removal, and invite revocation is appended to `audit_events` (`kind: "member_audit"`) with a per-project `seq`, `prev_hash`, and `record_hash`. While `subject_email` is stored on the row for console inspection and export, **`subject_email` is excluded from `sealMemberAudit`**. Calling `redactMemberPersonalData` (or running `purgeExpiredAuditLogs`) sets `subject_email = null` and deletes expired or revoked `project_invites` rows while `verifyMemberAuditChain` continues to pass.

---

## Monthly Event Quotas and SIEM Webhooks

### 6. What counts toward my monthly event quota, and what happens when a batch exceeds the limit?

Monthly quotas (`MONTHLY_EVENT_QUOTA`, per project per UTC calendar month) count **only newly inserted `audit_logs` rows with `record_kind = 'model_call'`** based on the server ingestion timestamp (`created_at`, not the client `timestamp`):

- **Free / Developer:** `10,000` `model_call` events / UTC month (30-day default retention)
- **Pro:** `250,000` `model_call` events / UTC month (90-day default retention; planned price €19/mo or €190/yr, excl. VAT)
- **Team / Business:** `2,000,000` `model_call` events / UTC month (90-day default retention on Team, 365-day on Business; planned Team price €79/mo or €790/yr, excl. VAT)
- **Enterprise:** Custom per-project cap (`0..2,000,000,000`) or `unlimited` (`null`), configurable by an `owner` under **Monthly events** (planned price from €499/mo, excl. VAT)

*(Pre-release. Access by request. Planned prices at launch, excl. VAT.)*

Duplicate `eventId`s (`duplicates`), `chain_gap` rows, `human_decision` rows, `oversight` rows, and `member_audit` events do not increment the counter. Every `POST /api/v1/telemetry` response that reaches quota evaluation includes `x-spurvik-monthly-quota-limit`, `x-spurvik-monthly-quota-remaining`, and `x-spurvik-monthly-quota-reset`. If `used + incoming > quota`, the entire batch is rejected (0 rows from that request are written) and the endpoint returns HTTP `429` with `{ "error": "monthly_quota_exceeded", "plan", "quota", "used", "resetAt" }`.

### 7. Which webhook events does Spurvik send, and how do I check the webhook HMAC signature?

When an `owner` saves an `https://` endpoint URL under **HITL webhook** on `/dashboard/projects/<projectId>`, the server generates a signing secret (shown once and stored encrypted at rest with AES-256-GCM under `SPURVIK_WEBHOOK_KEK`), blocks private/loopback/link-local targets via URL + DNS checks, and delivers up to 3 attempts (5-second timeout per attempt, no redirects followed) for:

1. **`hitl.decision`** (all plans): `{ type: "hitl.decision", deliveryId, projectId, approval }`
2. **`oversight.changed`** (all plans): `{ type: "oversight.changed", deliveryId, projectId, epoch, state }`
3. **`telemetry.ingested`** (`team`, `business`, and `enterprise` plans when **Telemetry export** `siemExportEnabled` is enabled): `{ type: "telemetry.ingested", deliveryId, projectId, inserted, duplicates, eventIds }` (counts and `eventId`s only, never prompt or output text)

Every request carries `x-spurvik-timestamp` (Unix seconds) and `x-spurvik-signature: v1=<hex>` (`HMAC-SHA256(secret, "${timestamp}.${rawBody}")`), plus `x-spurvik-signature-256: t=<timestamp>,v1=<hex>` on `telemetry.ingested`. Check signatures with `verifyWebhookSignature` from `@spurvik/core` or `verifyHitlWebhook` from `@spurvik/sdk`.

### 8. Why do `state.reason` and `state.previousReason` differ between a release response/webhook and a later `GET /api/v1/oversight`?

- **On a halt (`op: "halt"`):** `state.reason` is the halt reason (defaulting to `"Halted via SDK (no reason given)"` when `engageKillSwitch()` is called without a reason) and `state.previousReason` is `null`.
- **On a release (`op: "release"`):** Both the `POST /api/v1/oversight` response and the `oversight.changed` webhook payload return `state.reason` set to the release reason just recorded (defaulting to `"Released via SDK (no reason given)"` when `releaseKillSwitch()` is called without a reason) and `state.previousReason` set to the halt reason that was previously active.
- **On a subsequent `GET /api/v1/oversight`:** The control row (`oversight_controls`) keeps the last halt reason in `reason` while `projectHalted` / `actionHalted` is `false`, and returns `previousReason: null`. Both the halt and release are recorded separately in `oversight_halts`, `oversight_releases` (with `reason_source: "caller" | "sdk_default"`), and `audit_logs` (`record_kind = 'oversight'`).

The oversight and audit record shows what happened, when, and who acted — never an independent finding of why the halt or release occurred.

---

## `<AIDisclosureLabel />` and UI Components

### 9. Does `<AIDisclosureLabel />` send network requests or touch `sessionStorage` by default?

No. By default, `<AIDisclosureLabel />` in `@spurvik/react` is purely a local React component (`<aside role="note" lang={locale} aria-describedby={noteId} data-aegis-disclosure={notice}>`) with built-in copy in all 24 official EU languages (`locale`), `"block"` and `"inline"` presentations (`presentation`), optional `<EuMark />` icon (`euIcon`), and anti-hiding CSS rules (`display: "inline-flex"`, `visibility: "visible"`, `opacity: 1`, and non-transparent text color).

Even if you pass the `beacon` prop, `sendDisclosureBeacon` checks `beacon.consent === true` first. Unless `beacon.consent === true`, it returns immediately without reading or writing `sessionStorage` and without sending `POST /api/v1/disclosure`.

### 10. What is the difference between `@spurvik/react` `<AIDisclosureLabel />` and the `shadcn` registry components at `/r/eu-ai-act.json`?

- **`@spurvik/react` (`packages/react` in `spurvik`):** Full component library exporting `<AIDisclosureLabel />` (5 `notice` kinds, 24 EU locales + `registerDisclosureLocale`, `"block" | "inline"` presentation, `euIcon`, anti-hiding styles, opt-in `beacon`), `<AIArticle50Section3Notice />`, `<AIDisclosureDetails />`, and `<EuMark />`.
- **`https://spurvik.com/r/eu-ai-act.json` (`pnpm dlx shadcn@latest add https://spurvik.com/r/eu-ai-act.json`):** Zero-dependency starter that copies `components/spurvik-ai-disclosure-label.tsx` (`{ model?, receipt?, label?, className? }`) and a sample `app/api/chat/route.ts` into your project.
- **`https://console.spurvik.com/r/eu-ai-act.json` (`pnpm dlx shadcn@latest add https://console.spurvik.com/r/eu-ai-act.json`):** Zero-dependency starter that copies `components/spurvik/ai-disclosure-badge.tsx` (`AiDisclosureBadge` with `{ systemName? }`) and `hooks/use-spurvik-receipt.ts` (`useSpurvikReceipt`, `readReceipt`) into your project.
