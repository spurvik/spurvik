# Console Onboarding Guide: Invites, Quotas, SIEM Webhooks, and `<AIDisclosureLabel />`

> **Pre-release (0.x).** Written for `aegis-ai` main at commit `8e16fad` (25 Oct 2026). APIs and behaviour may change. Not legal advice.
>
> *Pre-release documentation (aegis-ai 8e16fad).*

This guide documents how the Spurvik console (`apps/web` in the repository and `https://console.spurvik.com`) and `@spurvik/react` work in `aegis-ai` at commit `e599000`:

1. **Invites and member management** (`/signup`, `/invites`, organisation roles, and the hash-chained member audit log)
2. **Monthly event quotas and log retention** (`MONTHLY_EVENT_QUOTA`, response headers, `429` payloads, and Enterprise per-project caps)
3. **SIEM and HITL webhook setup** (`saveWebhook`, target validation, the three webhook envelopes, `reason` / `previousReason` behaviour, and signature verification)
4. **`<AIDisclosureLabel />` props and UI disclosure components** (`@spurvik/react` props, 24 EU locales, anti-hiding styles, opt-in disclosure beacon, and shadcn registry items)

Spurvik logs AI calls with HMAC receipts and offers disclosure and marking hooks. It does not mark content itself and does not make any system or organisation meet the EU AI Act. Its provenance record supports, but does not replace, Article 50(2) machine-readable marking.

---

## Live in `e599000` vs. planned on hosted tiers

> **Pricing notice:** Pre-release. Access by request. Planned prices at launch, excl. VAT.

| Area | Implemented in `aegis-ai` (`e599000`) & live console | Planned on hosted tiers |
|---|---|---|
| **Public visual sandbox** | Live at `https://console.spurvik.com/sandbox` (EU `fra1`, no login or invite code required): Hash-Chain Diagram, Oversight Gate Diagram, and Obligations Radar. | Additional interactive walkthrough presets. |
| **Account signup (`/signup`)** | Creates a `users` row and `spurvik_session` cookie (*"Console login only. No organisation and no project yet"*). Gated by `SPURVIK_INVITE_CODE` when that variable is set (`https://console.spurvik.com` requires an invite code; default local `.env.example` leaves it unset). | Self-serve organisation creation and self-serve plan checkout on `console.spurvik.com`. |
| **Joining an organisation & creating projects** | Today, an organisation is created either via `pnpm db:seed` (local `Demo Organization` on the `developer` plan) or by an operator provisioning the organisation row. Team members join via 7-day `spurvik_invite_...` tokens claimed at `/invites`. Organisation `owner`s create projects at `/dashboard/projects` and mint `spurvik_live_`, `spurvik_pub_`, per-project HMAC, and `spurvik_reviewer_` tokens. | Self-serve Free/Pro/Team/Enterprise workspace creation at signup. |
| **Monthly event quotas** | Enforced in `POST /api/v1/telemetry` (`apps/web/src/server/monthly-quota.ts`) with `x-spurvik-monthly-quota-*` headers and `429 monthly_quota_exceeded`. Enterprise projects can set custom per-project caps (`0..2,000,000,000` or `unlimited`) in the console. | Self-serve plan upgrades and billing alerts in `/dashboard/settings`. |
| **SIEM & HITL webhooks** | Live per-project HTTPS webhook with AES-256-GCM encrypted secret storage (`spurvik-enc:v1`), SSRF/DNS validation, 3 attempts with 5s timeout, `hitl.decision` and `oversight.changed` on all plans, and `telemetry.ingested` when **Telemetry export** is enabled on `team`, `business`, or `enterprise` plans. | Hosted webhook replay UI and multi-destination routing. |

---

## 1. Invites and member management

### How accounts, organisations, and projects connect

In `apps/web`, user logins (`users`), organisation memberships (`organization_members`), and projects (`projects`) are separate records:

1. **Signing up at `/signup` creates a login only.** The page states: *"Console login only. No organisation and no project yet."* Signing up inserts a row into `users` and sets the `spurvik_session` cookie, then redirects to `/dashboard`. It does **not** create an `organizations` row or a starter project.
2. **How you get an organisation and project today:**
   - **Invited to an existing organisation (`/invites`):** An existing `owner` or `admin` creates an invite from a project page (`/dashboard/projects/<projectId>` -> **Team -> Invite a member**). Claiming the `spurvik_invite_...` token at `/invites` creates your user account (if you do not already have one) and adds you to `organization_members`.
   - **Local control plane (`pnpm db:seed`):** Running `pnpm db:migrate && pnpm db:seed` creates `Demo Organization` (on the `developer` plan), an `owner` user (`reviewer.<hex>@spurvik.local` with a random one-time password), `Demo Project` (`riskTier: "limited_art50"`), a `spurvik_live_` API key, a `spurvik_pub_` disclosure key, and a `spurvik_reviewer_` token.
3. **Who can create a new project:** On `/dashboard/projects`, the **New project** form (`CreateProjectForm`) lists only organisations where your user has the `owner` role (`listOwnerOrganizations`). If you are not an `owner` of any organisation, `/dashboard/projects` displays *"You are not an owner of an organisation."*

### Organisation roles and permissions

Membership in `organization_members` is **organisation-wide** and uses four roles (`MEMBER_ROLE_VALUES` in `apps/web/src/db/schema.ts`):

| Action | `owner` | `admin` | `reviewer` | `member` |
|---|---|---|---|---|
| View project dashboard, audit chain, oversight state, and HITL queue | Yes | Yes | Yes | Yes |
| Record a console oversight halt/release or HITL decision (`CONSOLE_OVERSIGHT_ROLE`) | Yes | Yes | Yes | Yes |
| Use or revoke own `spurvik_reviewer_...` token | Yes | Yes | Yes | Yes |
| Invite `admin`, `reviewer`, or `member`; change their role; remove them; revoke their pending invites | Yes | Yes | No | No |
| Invite an `owner`, promote/demote an `owner`, or remove an `owner` (`canAssignRole`) | Yes | No | No | No |
| Create a project (`createProject`) | Yes | No | No | No |
| Mint or revoke `spurvik_live_` / `spurvik_pub_` keys, per-project HMAC keys, or reviewer tokens for members | Yes | No | No | No |
| Change project profile, retention, monthly event quota, webhook URL, SIEM export, or delete project data | Yes | No | No | No |

**Last-owner safeguard:** Every organisation must keep at least one `owner`. Attempting to remove or change the role of the sole `owner` fails with: `"The last owner stays an owner."`

### Creating, claiming, and revoking an invite (`spurvik_invite_...`)

1. **Create an invite (`/dashboard/projects/<projectId>` -> Team -> Invite a member):**
   - Enter the invitee's email address and select a role (`member`, `reviewer`, `admin`, or `owner` — only an `owner` can select `owner`).
   - The server (`createMemberInvite` in `apps/web/src/server/members.ts`) generates a one-time token formatted as `spurvik_invite_<43 base64url chars>`, stores only its SHA-256 hex digest (`token_hash`) in `project_invites` with a **7-day expiry** (`now() + interval '7 days'`), and shows the plaintext token **once** in a secret banner.
   - If that email already has an active, unexpired invite on the project, the server returns `"An invite is already pending for that email."` If an earlier invite for that email has already expired, creating a new invite automatically marks the expired row as revoked (`revoked_at = now()`) before inserting the new one.
2. **Claim an invite (`/invites`):**
   - Open `/invites` and paste the `spurvik_invite_...` token.
   - **If no user account exists for the invited email:** Enter your name and a password (at least 8 characters) on the `/invites` form. Claiming creates the `users` row, adds the user to `organization_members` with the invited role, marks the invite `accepted_at = now()`, and signs the user in.
   - **If a user account already exists for the invited email:** You must sign in at `/login` with that exact email before claiming (`"Sign in with that email to claim this invite."` / `"This invite is for a different email."`).
   - **Rate limit:** `/invites` enforces `CLAIM_INVITE_LIMIT` (`10` attempts per window per client IP/key); exceeding it returns `"Too many invite claims. Retry after the window resets."`
3. **Revoke a pending invite:**
   - Under **Pending invites** on the project's **Team** panel, an `owner` (or an `admin` for non-owner invites) can click **Revoke** (`revokeMemberInvite`), which sets `revoked_at = now()` so the token can no longer be claimed.

### Hash-chained member audit log and personal-data redaction

Every team change on a project appends a hash-chained record to `audit_events` (`kind: "member_audit"`):

- `member.invited`
- `member.accepted`
- `member.role_changed`
- `member.removed`
- `invite.revoked`

Each row links to the project's previous `audit_events` row via `seq`, `prev_hash`, and `record_hash` (`sealMemberAudit`).

**GDPR personal-data erasure design:** `subject_email` is stored on `audit_events` for readability in console exports (`auditEvents` in the JSON export), but **`subject_email` is excluded from the `sealMemberAudit` hash input**. As a result:

- Calling `redactMemberPersonalData(db, { projectId, email })` (or running the retention purge `purgeExpiredAuditLogs`) sets `subject_email = null` on matching `audit_events` rows and deletes expired or revoked `project_invites` rows.
- `verifyMemberAuditChain(events)` continues to pass without breaking the project's hash chain.

---

## 2. Monthly event quotas and log retention

### Plan quotas and retention defaults

> **Pricing notice:** Pre-release. Access by request. Planned prices at launch, excl. VAT.

Each organisation has a `plan` column (`organization_plan` enum in `apps/web/src/db/schema.ts`, aligned with `ORGANIZATION_PLANS` in `@spurvik/core`):

| Plan (`organization.plan`) | Planned launch price (excl. VAT) | Monthly `model_call` quota per project (`MONTHLY_EVENT_QUOTA`) | Default log retention (`PLAN_RETENTION_DAYS`) | Custom per-project quota & retention? | SIEM `telemetry.ingested` webhook stream? |
|---|---|---|---|---|---|
| `free` | €0 / month | `10,000` / UTC month | `30` days | No | No |
| `developer` *(default on `organizations` and `pnpm db:seed`)* | Pre-release / local default | `10,000` / UTC month | `30` days | No | No |
| `pro` | €19 / month (€190 / year) | `250,000` / UTC month | `90` days | No | No |
| `team` | €79 / month (€790 / year) | `2,000,000` / UTC month | `90` days | No | Yes (`siemExportEnabled`) |
| `business` | Legacy / internal tier | `2,000,000` / UTC month | `365` days (12 months) | No | Yes (`siemExportEnabled`) |
| `enterprise` | From €499 / month (custom) | Custom (`0..2,000,000,000`) or `unlimited` (`null`) | `365` days default (`1..3,650` days custom) | Yes (set per project by `owner`) | Yes (`siemExportEnabled`) |

*Note on `high_annex3` retention floor:* For projects classified by the operator as `high_annex3`, `effectiveRetentionDays` enforces a minimum floor of `183` days (6 months) across plans unless an Enterprise `owner` enables `retentionOtherLaw` with a written law note of at least 8 characters (`projects_retention_other_law_chk`).

### What counts toward the monthly event quota

In `apps/web/src/server/monthly-quota.ts` (`countProjectMonthModelCalls` and `checkMonthlyEventQuota`):

- **Counted:** Only rows in `audit_logs` where `record_kind = 'model_call'` and `created_at` (the server ingestion timestamp, **not** the client-supplied `timestamp` field) is within the current UTC calendar month `[utcMonthStart(now), utcMonthReset(now))`.
- **Not counted:**
  - Duplicate `eventId`s already present in `audit_logs` (`duplicates` in the response)
  - Sequence gap markers (`record_kind = 'chain_gap'`)
  - Human-in-the-loop approval/rejection/override records (`record_kind = 'human_decision'`)
  - Oversight halt and release records (`record_kind = 'oversight'`)
  - Team membership audit events in `audit_events` (`member_audit`)

### All-or-nothing batch enforcement

When the SDK flushes a batch to `POST /api/v1/telemetry`:

1. `POST /api/v1/telemetry` deduplicates `eventId`s within the incoming payload and checks how many of those `eventId`s are not yet stored in `audit_logs`.
2. The server checks the monthly quota before opening the write transaction and checks it **again inside the per-project `SELECT ... FOR UPDATE` lock** (`appendAuditLogs`).
3. If `used + newIncomingCount > quota`, the server throws `MonthlyQuotaExceeded`, rejects the **entire batch** (0 rows from that request are inserted), and returns HTTP `429`.

### Response headers and `429` error payload

Every authenticated `POST /api/v1/telemetry` response that reaches quota evaluation (`200 OK` and `429 monthly_quota_exceeded`) includes three headers (`monthlyQuotaHeaders`):

```http
x-spurvik-monthly-quota-limit: 10000
x-spurvik-monthly-quota-remaining: 9998
x-spurvik-monthly-quota-reset: 2026-11-01T00:00:00.000Z
```

- On an `enterprise` project with no cap (`monthlyEventQuota = null`), both `x-spurvik-monthly-quota-limit` and `x-spurvik-monthly-quota-remaining` are set to `"unlimited"`.
- Note: `401` (missing/invalid `spurvik_live_` key) and `429 rate_limited` (per-minute rate limit, `120` requests per minute) return before quota evaluation and do not carry `x-spurvik-monthly-quota-*` headers.

When a batch exceeds the project's monthly cap, `POST /api/v1/telemetry` returns HTTP `429` with a flat JSON body:

```json
{
  "error": "monthly_quota_exceeded",
  "plan": "free",
  "quota": 10000,
  "used": 10000,
  "resetAt": "2026-11-01T00:00:00.000Z"
}
```

### Setting a custom cap on Enterprise projects

On an `enterprise` organisation, an `owner` can open `/dashboard/projects/<projectId>` -> **Monthly events** (`saveMonthlyEventQuota`):

- Enter an integer between `0` and `2000000000` (`2,000,000,000`) to set a per-project monthly cap (setting `0` blocks all new `model_call` ingestions immediately).
- Leave the field blank and click **Save cap** to set `monthly_event_quota = null` (`unlimited`).
- On non-Enterprise plans, `saveMonthlyEventQuota` returns `"Only the Enterprise plan sets a per-project monthly event cap."`

---

## 3. SIEM and HITL webhook setup

### Configuring the project webhook URL and secret

An organisation `owner` configures webhooks on `/dashboard/projects/<projectId>` under **HITL webhook** (`saveWebhook`):

1. **Set or rotate the webhook:** Paste an `https://` endpoint URL into **Endpoint URL** and click **Save webhook**.
   - Every time you save a non-empty URL, the server generates a new signing secret (`crypto.randomUUID() + crypto.randomUUID()`), displays the plaintext secret **once** in a secret banner (`Webhook signing secret (shown once)`), and stores it encrypted at rest in `projects.webhook_secret` using AES-256-GCM (`spurvik-enc:v1:<keyId>:<iv>:<tag>:<ciphertext>`) under `SPURVIK_WEBHOOK_KEK`.
2. **Clear the webhook:** Clear the **Endpoint URL** field and click **Save webhook**. This sets both `webhook_url` and `webhook_secret` to `null`.
3. **Enable SIEM telemetry export (`telemetry.ingested`):** On `team`, `business`, and `enterprise` plans (`planStreamsTelemetryExport(plan)`), an `owner` can check **Stream `telemetry.ingested` events to the project webhook** under **Telemetry export** (`saveSiemExport`). On `free`, `developer`, and `pro` plans, attempting to enable it returns `"Telemetry export to a webhook is available on Team, Business, and Enterprise plans."`

### Target URL validation (SSRF and DNS checks)

Both when saving the URL in the console (`webhookUrlProblem`) and immediately before each delivery (`webhookUrlProblemResolved` in `apps/web/src/server/webhook-url.ts`), the server validates the target:

- Must be a valid `https:` URL (plain `http:` is rejected with `"Webhook URL must use https."`).
- Must not include a username or password in the URL (`"Webhook URL must not include credentials."`).
- Hostname must not be `localhost`, `*.localhost`, `*.local`, or `*.internal`.
- Neither a literal IP host nor any A/AAAA address returned by DNS (`dns.promises.lookup(host, { all: true })`) may fall in a private or reserved range:
  - Loopback: `127.0.0.0/8`, `::1`
  - Unspecified: `0.0.0.0/8`, `::`
  - Private RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
  - Carrier-grade NAT: `100.64.0.0/10`
  - Link-local & cloud metadata: `169.254.0.0/16`, `fe80::/10`
  - IPv6 unique local: `fc00::/7`

### The three webhook event envelopes

All webhook bodies are serialized with deterministic key ordering (`canonicalJson` from `@spurvik/core`) so the raw JSON string matches the HMAC signature.

#### 1. `hitl.decision` (all plans when a webhook URL is configured)

Sent when a human decision (`approved`, `rejected`, or `overridden`) is finalized via the console or `POST /api/v1/hitl/[id]/decision`:

```json
{
  "approval": {
    "actionName": "issue_refund",
    "createdAt": "2026-10-25T01:10:00.000Z",
    "decidedAt": "2026-10-25T01:11:05.000Z",
    "decisionReason": "Checked invoice total against order record",
    "decisionSource": "console",
    "id": "8e105b08-3960-4d04-8364-2a4f5082f7e8",
    "overrideReason": null,
    "payloadSummary": "{\"sha256\":\"...\",\"byteLength\":48,\"kind\":\"object\"}",
    "projectId": "79976bbd-58c9-4a2e-ac58-57e66e20ad34",
    "reviewerId": "93ebbfd2-a961-4b3c-8a25-9985c1d0280e",
    "status": "approved"
  },
  "deliveryId": "520102ca-27ef-4d7c-a40a-8443d329c597",
  "projectId": "79976bbd-58c9-4a2e-ac58-57e66e20ad34",
  "type": "hitl.decision"
}
```

*(Note: On two-person biometric or two-person employment projects, the first approval moves the item to `pending_confirmation` and does **not** fire `hitl.decision`; the webhook fires when the second reviewer confirms or when any reviewer rejects.)*

#### 2. `oversight.changed` (all plans when a webhook URL is configured)

Sent when a project or action is halted or released via the console or `POST /api/v1/oversight`:

```json
{
  "deliveryId": "c1f9c242-3a8e-4826-99d6-1434824f4e45",
  "epoch": 2,
  "projectId": "79976bbd-58c9-4a2e-ac58-57e66e20ad34",
  "state": {
    "actionHalted": false,
    "actionName": null,
    "epoch": 2,
    "previousReason": "Halted via SDK (no reason given)",
    "projectHalted": false,
    "reason": "Incident resolved",
    "reviewerId": "93ebbfd2-a961-4b3c-8a25-9985c1d0280e",
    "updatedAt": "2026-10-25T01:20:33.570Z"
  },
  "type": "oversight.changed"
}
```

**How `state.reason` and `state.previousReason` behave (PR #8 + cleanup):**

- **When halting (`op: "halt"`):** `state.reason` is the halt reason (or `"Halted via SDK (no reason given)"` when `engageKillSwitch()` was called without a reason) and `state.previousReason` is `null`.
- **When releasing (`op: "release"`):** Both the `POST /api/v1/oversight` response and the `oversight.changed` webhook payload set `state.reason` to the release reason just submitted (or `"Released via SDK (no reason given)"` when `releaseKillSwitch()` was called without a reason) and `state.previousReason` to the halt reason that was previously in effect.
- **On a later `GET /api/v1/oversight` after a release:** `oversight_controls.reason` retains the last halt reason on the control row while `projectHalted` / `actionHalted` is `false`, and `previousReason` is `null`. Both the halt and the release are stored separately in `oversight_halts`, `oversight_releases` (with `reason_source: "caller" | "sdk_default"`), and `audit_logs` (`record_kind = 'oversight'`).
- **Scope note:** The oversight and audit record shows what happened, when, and who acted (along with the string entered in `reason`), never an independent finding of why the action was taken.

#### 3. `telemetry.ingested` (Team, Business, and Enterprise when `siemExportEnabled = true`)

Sent after `POST /api/v1/telemetry` commits a batch (including when all events in the batch were duplicates):

```json
{
  "deliveryId": "f4c12d9e-91c2-437e-9262-79923d46bf98",
  "duplicates": 0,
  "eventIds": [
    "cece5aeb-995c-4eb3-bfd9-e08fc779f8ce"
  ],
  "inserted": 1,
  "projectId": "79976bbd-58c9-4a2e-ac58-57e66e20ad34",
  "type": "telemetry.ingested"
}
```

`telemetry.ingested` carries counts and `eventId` UUIDs only — never prompt or output text.

### Headers, HMAC signature verification, and retry behaviour

Every webhook `POST` sends:

| Header | Value | Present on |
|---|---|---|
| `content-type` | `application/json` | All webhook events |
| `x-spurvik-timestamp` *(and legacy `x-aegis-timestamp`)* | Unix epoch seconds as a string (e.g. `"1792891233"`) | All webhook events |
| `x-spurvik-signature` *(and legacy `x-aegis-signature`)* | `v1=<64-char hex>` where the hex digest is `HMAC-SHA256(secret, "${timestamp}.${rawBody}")` | All webhook events |
| `x-spurvik-signature-256` | `t=<timestamp>,v1=<64-char hex>` | `telemetry.ingested` only |

**Delivery & retries (`deliverWebhook` in `apps/web/src/server/webhook.ts`):**

- Up to **3 attempts** per delivery (`attempt = 1..3`), each with a **5-second timeout** (`AbortSignal.timeout(5_000)`) and `redirect: "error"` (HTTP 3xx redirects are rejected, not followed).
- Recorded in `webhook_deliveries` (`status`: `"pending"` -> `"delivered"` or `"failed"`, `attempts`, `last_error`, `delivered_at`).
- A webhook failure never rolls back the local database write (`audit_logs`, `hitl_approvals`, or `oversight_controls`).

**Verifying webhooks in your receiver:**

Use `verifyWebhookSignature` from `@spurvik/core` (returns `{ ok: boolean; reason?: string }` for any of the three event types) or `verifyHitlWebhook` from `@spurvik/sdk` (returns `HitlWebhookEnvelope` and throws `SpurvikError` on mismatch or timestamp skew > 5 minutes):

```ts
import { verifyWebhookSignature, type WebhookEnvelope } from "@spurvik/core";
import { verifyHitlWebhook } from "@spurvik/sdk";

// Option A: Check any webhook event (hitl.decision, oversight.changed, telemetry.ingested)
const check = await verifyWebhookSignature({
  secret: process.env.SPURVIK_WEBHOOK_SECRET!,
  body: rawBody, // exact UTF-8 request body string before JSON.parse
  signature: req.headers.get("x-spurvik-signature"),
  timestamp: req.headers.get("x-spurvik-timestamp"),
  toleranceMs: 5 * 60 * 1000, // default: 5 minutes
});
if (!check.ok) {
  throw new Error(check.reason ?? "Webhook signature check failed.");
}
const event = JSON.parse(rawBody) as WebhookEnvelope;

// Option B: Check and parse a hitl.decision envelope (throws SpurvikError on mismatch)
const hitlEnvelope = await verifyHitlWebhook({
  secret: process.env.SPURVIK_WEBHOOK_SECRET!,
  body: rawBody,
  signature: req.headers.get("x-spurvik-signature"),
  timestamp: req.headers.get("x-spurvik-timestamp"),
});
```

---

## 4. `<AIDisclosureLabel />` props and UI disclosure components

### `@spurvik/react` `<AIDisclosureLabel />` prop reference

Import `<AIDisclosureLabel />` from `@spurvik/react`:

```tsx
import { AIDisclosureLabel } from "@spurvik/react";
```

| Prop | TypeScript type | Default | Behaviour |
|---|---|---|---|
| `notice` | `"interaction" \| "generated" \| "deepfake" \| "public-interest" \| "emotion-biometric"` (`DisclosureNotice`) | `"interaction"` | Selects the disclosure copy and sets `data-aegis-disclosure={notice}` on the root `<aside>`. |
| `presentation` | `"block" \| "inline"` | `"block"` | `"block"` renders a two-line card (bold headline + full sentence). `"inline"` renders a compact pill and visually hides the secondary sentence (`sr-only` style) while keeping it in the DOM for `aria-describedby`. |
| `locale` | `string` | `"en"` | Sets `lang={locale}` and selects built-in copy from `EU_DISCLOSURE_LOCALES` (all 24 EU languages: `bg, es, cs, da, de, et, el, en, fr, ga, hr, it, lv, lt, hu, mt, nl, pl, pt, ro, sk, sl, fi, sv`). Base language tags (e.g. `"da-DK"` -> `"da"`) resolve automatically; unknown codes fall back to `"en"`. Custom locales can be registered with `registerDisclosureLocale(code, copy)`. |
| `systemName` | `string \| undefined` | `undefined` | When `notice === "interaction"` and `systemName` is non-empty, prefixes the secondary sentence as `"${systemName}. ${copy.interaction}"`. |
| `brandName` | `string \| undefined` | `undefined` | When non-empty, prefixes the bold headline as `"${brandName.trim()}. ${headline}"` while keeping the disclosure sentence unchanged. |
| `euIcon` | `boolean \| { mark?: "basic" \| "generated" \| "modified"; tone?: "black" \| "white" }` | `false` | Renders the optional `<EuMark />` SVG (`aria-hidden="true"`, `22px` height in `"inline"` mode, `32px` in `"block"` mode). Passing `euIcon={true}` selects `"generated"` when `notice === "generated"` and `"basic"` otherwise, in `"black"` tone. |
| `accentColor` | `string \| undefined` | `undefined` | Applies a left inset accent bar (`boxShadow: "inset 3px 0 0 ${accentColor}"`) and sets `borderColor` to `accentColor` unless `borderColor` is also passed. |
| `backgroundColor` | `string \| undefined` | `"#f8fafc"` | Sets the container `backgroundColor`. |
| `textColor` | `string \| undefined` | `"#0f172a"` | Sets the container `color` (unless `"transparent"`, which is ignored). |
| `borderColor` | `string \| undefined` | `"#cbd5e1"` | Sets the `1px solid` border color. |
| `className` | `string \| undefined` | `undefined` | Optional CSS class name on the `<aside>` element. |
| `style` | `CSSProperties \| undefined` | `undefined` | Optional inline styles merged onto the `<aside>` element before anti-hiding overrides are applied. |
| `beacon` | `Omit<DisclosureBeaconOptions, "noticeKind"> \| undefined` | `undefined` | Optional opt-in telemetry beacon (`{ endpoint, apiKey, jurisdiction?, sessionId?, consent? }`). See **Opt-in disclosure beacon** below. |

### Accessibility attributes and anti-hiding safeguards

- **DOM structure:** `<AIDisclosureLabel />` renders `<aside role="note" lang={locale} aria-describedby={noteId} data-aegis-disclosure={notice}>`. The secondary sentence `<span id={noteId}>` is always present in the DOM so screen readers announce both the headline and the full sentence in both `"block"` and `"inline"` presentations.
- **Anti-hiding safeguards (`labelStyle`):** Regardless of what is passed in `style` or `textColor`, `<AIDisclosureLabel />` forces `display: "inline-flex"`, `visibility: "visible"`, and `opacity: 1`, and strips `color: "transparent"` so caller styles cannot make the notice invisible.

### Opt-in disclosure beacon (`spurvik_pub_...`)

`<AIDisclosureLabel />` does **not** make any network request or touch `sessionStorage` by default:

1. **Consent gate:** `sendDisclosureBeacon` checks `options.consent === true` first. If `beacon` is omitted or `beacon.consent` is `false` or `undefined`, it returns `false` immediately without reading `sessionStorage`, writing `sessionStorage`, or calling `fetch`.
2. **Viewport trigger and once-per-session deduplication:** When `beacon.consent === true` and the `<aside>` enters the viewport (`IntersectionObserver`), the component sends one `POST /api/v1/disclosure` request per browser session (keyed in `sessionStorage` under `spurvik.disclosure.sent:${endpoint}:${noticeKind}:${jurisdiction}`) using your publishable `spurvik_pub_...` key (`Authorization: Bearer spurvik_pub_...`).
3. **What the control plane stores:** `POST /api/v1/disclosure` accepts only `"disclosure"` keys (`spurvik_pub_...`) or `"live"` keys, hashes the caller's `sessionId` with SHA-256 (`hashSessionId`), and stores `(project_id, session_id_hash, notice_kind, jurisdiction, displayed_at)` in `disclosure_events`.

```tsx
import { AIDisclosureLabel } from "@spurvik/react";

export function AssistantHeader({ analyticsConsent }: { analyticsConsent: boolean }) {
  return (
    <AIDisclosureLabel
      notice="interaction"
      presentation="block"
      locale="da"
      brandName="Acme Support"
      systemName="Support Assistant"
      euIcon={{ mark: "basic", tone: "black" }}
      accentColor="#0ea5e9"
      beacon={{
        endpoint: "https://console.spurvik.com",
        apiKey: process.env.NEXT_PUBLIC_SPURVIK_DISCLOSURE_KEY!, // spurvik_pub_...
        jurisdiction: "EU",
        consent: analyticsConsent, // nothing is stored or sent unless true
      }}
    />
  );
}
```

### Polish (`locale="pl"`) disclosure copy (Legal Ruling D24)

Under **Legal Ruling D24**, the built-in Polish (`locale="pl"`) strings in `EU_DISCLOSURE_LOCALES.pl` (`packages/react/src/locales.ts:405–426`) are cleared for production use as written:

- `interaction` (Art. 50(1)): `"Korzystasz z systemu AI."`
- `emotionBiometric` (Art. 50(3)): `"Jesteś narażony na system rozpoznawania emocji lub kategoryzacji biometrycznej."`
- `generated` / `generatedDetail`: `"Wygenerowane przez AI"` / `"Te treści zostały wygenerowane przez system AI."`
- `deepfake` (Art. 50(4) subpara. 1): `"Te treści zostały sztucznie wygenerowane lub zmanipulowane."`
- `publicInterest` (Art. 50(4) subpara. 2): `"Ten tekst został sztucznie wygenerowany lub zmanipulowany i opublikowany w sprawie o znaczeniu publicznym."`
- `riskTier`, `humanReadable`, `notLegalAdvice`, `signatureMatches`: `"Zapisany poziom ryzyka"` *(role-neutral)*, `"Ta etykieta jest informacją czytelną dla człowieka. Sama w sobie nie jest oznaczeniem maszynowym."`, `"Ta informacja wspiera obowiązki przejrzystości. Nie jest poradą prawną."`, and `"Podpis jest zgodny z tym zapisem proweniencji."`.

**Optional gender-neutral override for `emotionBiometric`:** The default `emotionBiometric` string mirrors the literal Polish EU AI Act wording for Article 50(3) (*"osoby fizyczne, które są narażone na działanie systemu..."*) using a masculine singular adjective (`narażony`). Teams that prefer gender-neutral phrasing on `<AIArticle50Section3Notice locale="pl" />` (or `<AIDisclosureLabel notice="emotion-biometric" locale="pl" />`) can override `pl` at runtime with `registerDisclosureLocale`:

```tsx
import { disclosureCopy, registerDisclosureLocale } from "@spurvik/react";

registerDisclosureLocale("pl", {
  ...disclosureCopy("pl"),
  emotionBiometric:
    "Objęty działaniem systemu rozpoznawania emocji lub kategoryzacji biometrycznej.",
});
```

### Companion `@spurvik/react` components vs. shadcn registry items

In addition to `<AIDisclosureLabel />`, `@spurvik/react` exports:

- `<AIArticle50Section3Notice />`: Convenience wrapper around `<AIDisclosureLabel notice="emotion-biometric" />` for Article 50(3) emotion-recognition or biometric-categorisation notices.
- `<AIDisclosureDetails />`: Modal `<dialog>` component showing `riskTier`, `modelSummary`, and `provenance` (`{ timestamp, modelId, signature: "matches" | "mismatch" | "unchecked" }`).
- `<EuMark />`: Standalone SVG renderer for the `"basic"`, `"generated"`, and `"modified"` marks in `"black"` or `"white"` tone.

**How `@spurvik/react` differs from the zero-dependency `shadcn` registry starters:**

Spurvik also serves two zero-dependency `shadcn` registry JSON manifests for teams that want copy-paste starter files in their repo without installing `@spurvik/react`:

| Source | Install command | Installed files & props |
|---|---|---|
| **`@spurvik/react` package** (`packages/react` in `aegis-ai`) | `pnpm --filter @spurvik/react pack` (from source repo) | Full `<AIDisclosureLabel />` (`notice`, `presentation`, 24 EU `locale`s, `euIcon`, `beacon`, anti-hiding styles), `<AIArticle50Section3Notice />`, `<AIDisclosureDetails />`, `<EuMark />`. |
| **Marketing site registry** (`https://spurvik.com/r/eu-ai-act.json`) | `pnpm dlx shadcn@latest add https://spurvik.com/r/eu-ai-act.json` | Zero-dependency starter: `components/spurvik-ai-disclosure-label.tsx` (`AIDisclosureLabel` with `{ model?: string; receipt?: string; label?: string; className?: string }`) and `app/api/chat/route.ts`. |
| **Console registry** (`https://console.spurvik.com/r/eu-ai-act.json`) | `pnpm dlx shadcn@latest add https://console.spurvik.com/r/eu-ai-act.json` | Zero-dependency starter: `components/spurvik/ai-disclosure-badge.tsx` (`AiDisclosureBadge` with `{ systemName?: string }`) and `hooks/use-spurvik-receipt.ts` (`useSpurvikReceipt`, `readReceipt`). |
