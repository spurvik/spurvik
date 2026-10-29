# Troubleshooting

> **Applies to the 1.0.1 build on `spurvik` main at `0e9cc89` (PR #3, PR #4, PR #7 and PR #8 merged). PR #3 includes the changes in PR #1 and PR #2.**

Every entry below is an error or symptom we actually hit while testing [quickstart.md](quickstart.md) with Node.js 22.23 (the repository's `engines` field asks for Node 22 or later) and `openai` 7.42–7.43. Messages are copied from the terminal. The entries were first tested against the SDK built from `spurvik` main (commit `987ec86`). The [Starting the control plane](#starting-the-control-plane), [Telemetry and the control plane](#telemetry-and-the-control-plane) and [Streaming](#streaming) entries were tested against commit `a350ee2`. To see which commit you built from, run `git rev-parse --short HEAD` in your `spurvik` folder.

Quick links:

- [Installing and building](#installing-and-building)
- [Running your app](#running-your-app)
- [Starting the control plane](#starting-the-control-plane)
- [Configuration errors from the SDK](#configuration-errors-from-the-sdk)
- [Telemetry and the control plane](#telemetry-and-the-control-plane)
- [Signature checks](#signature-checks)
- [Streaming](#streaming)

---

## Installing and building

### `npm error 404 Not Found - GET https://registry.npmjs.org/@spurvik%2fsdk`

```text
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/@spurvik%2fsdk - Not found
```

**Cause:** The public MIT packages are `spurvik@1.0.3` and `spurvik-sdk@1.0.3` on npm, from https://github.com/spurvik/spurvik. `@spurvik/sdk` is the workspace package name at `1.0.1` in the monorepo.

**Fix:** Install the public packages:

```bash
npm install spurvik@1.0.3 spurvik-sdk@1.0.3
```

Or build the `1.0.1` workspace packages from https://github.com/spurvik/spurvik. See [quickstart step 1](quickstart.md#step-1-get-the-sdk-build-it-from-source).

Builds previously served at spurvik.com/sdk/latest.tgz are not this SDK, are unsupported and must not be relied on to check records. The local stdio MCP server is `spurvik-mcp-server@1.0.2`.

### `npm error 404 … @spurvik%2fcore` when installing the SDK package file

```text
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/@spurvik%2fcore - Not found
```

**Cause:** You installed the workspace `spurvik-sdk-1.0.1.tgz` on its own. That workspace package depends on `@spurvik/core` at `1.0.1`. The public `spurvik@1.0.3` and `spurvik-sdk@1.0.3` packages already include that core code.

**Fix:** Install both package files in one command:

```bash
npm install openai ../spurvik-packs/spurvik-core-1.0.1.tgz ../spurvik-packs/spurvik-sdk-1.0.1.tgz
```

### `Error: EACCES: permission denied, mkdir '/usr/local/share/corepack/v1'` when running `pnpm`

On Node.js 22.23, `pnpm --version` in the repository fails with:

```text
Error: EACCES: permission denied, mkdir '/usr/local/share/corepack/v1'
    at mkdirSync (node:fs:1370:26)
    at getTemporaryFolder (…/lib/node_modules/corepack/dist/lib/corepack.cjs:13030:27)
  errno: -13,
  code: 'EACCES',
  syscall: 'mkdir',
  path: '/usr/local/share/corepack/v1'
```

**Cause:** The repository pins its pnpm version (`packageManager: "pnpm@10.33.4"` in `package.json`). Corepack tries to download that version into its cache folder, and your user cannot write to it. We saw this on a machine where `COREPACK_HOME` was preset to a root-owned folder (`/usr/local/share/corepack`); the path in your message shows which folder Corepack used.

**Fix:** Point Corepack at a folder you own, then run the command again:

```bash
export COREPACK_HOME="$HOME/.cache/corepack"
pnpm --version
```

### `ERR_PNPM_UNUSED_PATCH … @contentauth/c2pa-node@0.9.10`

```text
 ERR_PNPM_UNUSED_PATCH  The following patches were not used: @contentauth/c2pa-node@0.9.10
```

**Cause:** We saw this when we tried to install only the SDK's part of the workspace (`pnpm install --filter "@spurvik/sdk..."`). The root `package.json` patches a dependency of another workspace package, and a filtered install never uses that patch.

**Fix:** Run a plain `pnpm install` in the repository root, as in the quickstart. Then build only what you need with `pnpm --filter "@spurvik/sdk..." build`.

---

## Running your app

### `SyntaxError: Cannot use import statement outside a module`

```text
Warning: Failed to load the ES module: …/app.js. Make sure to set "type": "module" in the nearest package.json file or use the .mjs extension.
SyntaxError: Cannot use import statement outside a module
```

**Cause:** Your `package.json` says `"type": "commonjs"` (some npm versions write that on `npm init -y`). The quickstart examples use `import` and top-level `await`.

If your `package.json` has no `type` field at all, Node 22 runs the file but prints `[MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of … is not specified and it doesn't parse as CommonJS.` The fix is the same.

**Fix:** In your app folder:

```bash
npm pkg set type=module
```

With `tsx` and a `.ts` file, the same problem shows up as:

```text
ERROR: Top-level await is currently not supported with the "cjs" output format
```

The fix is the same.

### `OpenAIError: Missing credentials`

```text
OpenAIError: Missing credentials. Please pass an `apiKey`, `workloadIdentity`, `adminAPIKey`, or set the `OPENAI_API_KEY` or `OPENAI_ADMIN_KEY` environment variable.
```

**Cause:** This comes from the OpenAI SDK, before Spurvik is involved. `new OpenAI()` found no key.

**Fix:** `export OPENAI_API_KEY="sk-…"`, or use the mock in [quickstart: try it without an OpenAI key](quickstart.md#optional-try-it-without-an-openai-key).

---

## Starting the control plane

### The control plane will not start

```text
Refusing to start. Missing SPURVIK_LOG_CHECKPOINT_SECRET and SPURVIK_WEBHOOK_KEK.
```

**What you see:** `pnpm dev` prints this message before Next.js starts (there is no `✓ Ready` line), then `Exit status 1` and `ELIFECYCLE Command failed with exit code 1.` The process exits with code 1 and nothing is left listening on port 43123. The control plane is not running, so your app's telemetry fails with `fetch failed`.

**Cause:** this build has no built-in default keys. The control plane checks its keys when it starts and stops if one is missing or unusable. These are the messages we saw. Each one is printed on its own line, and the process then exits with code 1:

| Message | Cause | Fix |
| --- | --- | --- |
| `Refusing to start. Missing SPURVIK_LOG_CHECKPOINT_SECRET and SPURVIK_WEBHOOK_KEK.` | Neither key is set, either in your shell or in `apps/web/.env`. `pnpm dev` and `pnpm start` read both, and a value in your shell takes precedence over the file. If only one is missing, the message names only that one, for example `Refusing to start. Missing SPURVIK_WEBHOOK_KEK.` | Generate the keys as in [step 2](quickstart.md#step-2-run-a-local-control-plane-and-get-your-spurvik_live_-key) and start again. |
| `SPURVIK_LOG_CHECKPOINT_SECRET is shorter than 16 characters.` | The checkpoint secret is too short. `SPURVIK_ALLOW_TEST_KEYS=1` does not get around this. | Use a longer secret, for example one generated as in step 2. |
| `SPURVIK_WEBHOOK_KEK must be 32 bytes (base64url, hex, or 32-byte utf8).` | The webhook key is not 32 bytes. | Generate a new one as in step 2. |
| `Refusing to start. SPURVIK_ALLOW_TEST_KEYS=1 is refused when NODE_ENV or VERCEL_ENV is production.` | `SPURVIK_ALLOW_TEST_KEYS=1` is set while `NODE_ENV` or `VERCEL_ENV` is `production`. This happens even when both keys are set. | Remove `SPURVIK_ALLOW_TEST_KEYS` and set both keys. |
| `SPURVIK_LOG_CHECKPOINT_SECRET is missing or only whitespace.` (or the same for `SPURVIK_WEBHOOK_KEK`) | The variable is set to spaces only. `SPURVIK_ALLOW_TEST_KEYS=1` does not get around this. | Set a real value as in step 2, or remove the line. |

`pnpm db:migrate` and `pnpm db:seed` run without these keys, so step 2 can get as far as `pnpm dev` before you see the error. `pnpm db:seed` does not create these keys.

**Production server (`pnpm start`):** the same check runs first, with the keys from your shell or `apps/web/.env`. It prints the same messages before Next.js starts, then `Exit status 1`, and exits with code 1. With both keys set and no test flag, the server stays up and `GET /api/v1/health` returns 200. With `SPURVIK_ALLOW_TEST_KEYS=1`, `pnpm start` prints `Refusing to start. SPURVIK_ALLOW_TEST_KEYS=1 is refused when NODE_ENV or VERCEL_ENV is production.` before `✓ Ready` and exits with code 1. This happens even if both keys are set, and also when the flag is only in `apps/web/.env`. If the keys are missing too, the `integrity protection is off` warning is printed first, then that refusal. If you run `next start` or `next dev` directly (for example `pnpm exec next start`), the same check runs before `✓ Ready`. A missing or unusable key, or the test flag in production, is refused with the same message, and the process exits with code 1.

### `SPURVIK_ALLOW_TEST_KEYS=1: integrity protection is off. This is for local testing only.`

`SPURVIK_ALLOW_TEST_KEYS=1` is set outside production, and the control plane is running with random keys made for that process. They are gone when it stops. Webhook secrets saved while the flag is on cannot be read after a restart, and while the flag is on, saved checkpoints do not check. Use it only for throwaway local testing. For anything you want to keep, unset it and set both keys as in step 2.

### `Set SPURVIK_LOG_CHECKPOINT_SECRET (at least 16 characters) before purging logs. SPURVIK_ALLOW_TEST_KEYS does not sign a purge.`

`pnpm purge-logs` exits with code 1. It needs your real checkpoint secret, in your shell or in `apps/web/.env`, and it never accepts `SPURVIK_ALLOW_TEST_KEYS=1`. If the secret is set to spaces only, the message is `SPURVIK_LOG_CHECKPOINT_SECRET is missing or only whitespace.` An empty value counts as not set and gives the message above. Set the same `SPURVIK_LOG_CHECKPOINT_SECRET` your control plane uses.

---

## Configuration errors from the SDK

`withSpurvik()` checks its configuration before your first call and throws a `SpurvikConfigError`.

### `apiKey must be a spurvik_live_ project key.`

```text
SpurvikConfigError: apiKey must be a spurvik_live_ project key.
```

**Causes we hit:**

- `SPURVIK_API_KEY` was not set in the shell that ran `node`.
- The placeholder `spurvik_live_PASTE_THE_KEY_FROM_DB_SEED` was still in place. It has the right prefix but is too short.

**Fix:** Use the key that `pnpm db:seed` printed. The SDK checks for `spurvik_live_` (or the older `aegis_live_`) followed by at least 32 characters from `A–Z a–z 0–9 _ -`. A seeded key has 43 characters after the prefix. The SDK only checks the shape. Whether the key is valid is decided by the control plane.

### `signingSecret must be a client-held secret of at least 16 characters.`

**Fix:** Generate one and keep it:

```bash
export SPURVIK_SIGNING_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
```

### `Keyed prompt and output fingerprints require contentHash.secret …`

```text
SpurvikConfigError: Keyed prompt and output fingerprints require contentHash.secret (a client-held secret or salt, at least 16 characters). It is not sent to the control plane.
```

**Cause:** `contentHash.mode` defaults to `keyed`, and `SPURVIK_CONTENT_HASH_SECRET` was empty.

**Fix:** Set `SPURVIK_CONTENT_HASH_SECRET` the same way as the signing secret, using a different value.

### `baseUrl is required when NODE_ENV is production.`

```text
SpurvikConfigError: baseUrl is required when NODE_ENV is production. Point it at the control plane you run.
```

**Fix:** Set `SPURVIK_BASE_URL` and pass it as `baseUrl`. Outside production the SDK falls back to `http://127.0.0.1:43123`.

### I set `AEGIS_API_KEY` but the SDK still says the key is missing

**Cause:** `AEGIS_*` variables are read only by the control plane server (`apps/web`), with a deprecation warning. The SDK in your app reads no `SPURVIK_*` or `AEGIS_*` variables by itself. Your code passes values into `withSpurvik()`.

**Fix:** Rename the variables to `SPURVIK_*` and pass them in, as in [quickstart step 5](quickstart.md#step-5-wrap-a-call-and-save-the-provenance-record).

---

## Telemetry and the control plane

### `Spurvik telemetry was not delivered: …` after the record is saved

```text
Model said: Hello! How can I help you today?
Saved provenance record 3604534c-f64d-4ce9-be9c-4c1df44e200e to record.json
Spurvik telemetry was not delivered: fetch failed
```

**Symptom:** `node app.js` prints the model answer and saves `record.json`. A few seconds later your `onTelemetryError` handler prints a message, `await ai._spurvik.shutdown()` returns, and the script ends with exit code **0**.

**Cause:** The control plane at `SPURVIK_BASE_URL` did not accept the telemetry event. The SDK tries 5 times (the first try plus 4 retries, with backoff), and a single `flush()` or `shutdown()` stops trying after `telemetry.flushTimeoutMs` (8 seconds by default). Then it calls `onTelemetryError` once. What you see depends on the control plane:

| Control plane at `SPURVIK_BASE_URL` | `error.name` | `error.message` | `onTelemetryError` called after |
| --- | --- | --- | --- |
| Nothing listening (connection refused) | `TypeError` | `fetch failed` | about 3 s |
| Answers with an error status, for example 503 | `SpurvikApiError` | The message from the response, for example `Service Unavailable` | about 3 s |
| Answers, but is not a Spurvik control plane (for example an HTML page) | `SpurvikApiError` | `Control plane response had no data.` | about 3 s |
| Accepts the connection but never answers | `TimeoutError` | `The telemetry flush timed out.` | about 8 s |

**The telemetry event for that call is lost when the script ends.** The provenance record returned to your code is unaffected, and its signature still checks. In this build, an event that is queued after a failed flush stays in memory (up to 500 events; the oldest are dropped first) and is sent with a later flush: on the next wrapped call, on `await ai._spurvik.shutdown()`, or once when the process ends on its own. Nothing retries it on a timer. The event whose flush already failed is not tried again when the process ends on its own unless something was queued after it, and `process.exit()` or a signal such as Ctrl+C skips that last flush. Calling `await ai._spurvik.shutdown()` before the process exits gives queued events one more try (up to 8 seconds by default). This is not in `987ec86`, the build design partners run. The exit code does not tell you that telemetry failed. Only `onTelemetryError` does, so do not leave it out.

What to do:

1. Check the control plane before you run a script:

   ```bash
   curl -sS "$SPURVIK_BASE_URL/api/v1/health"
   ```

   A running control plane answers:

   ```json
   {"data":{"ok":true,"service":"spurvik-control-plane","vendorTelemetry":"off"}}
   ```

   If nothing is listening you get `curl: (7) Failed to connect …`.

2. Make `onTelemetryError` visible to whoever runs the script. For example, log it to your error tracker. If a batch job should fail when telemetry is not delivered, set `process.exitCode = 1` inside the handler.

3. Keep your provenance records (for example `record.json`) on your side. They do not depend on the control plane. In this release, do not rely on the control plane as your only copy of these events. Keep your own records as well.

In a **long-running server**, `onTelemetryError` is called once, about 4 seconds after the call (about 9 seconds if the control plane never answers). The event is not delivered by those attempts. It stays queued (up to 500 events) and is sent with a later flush, for example with the next wrapped call after the control plane comes back. Nothing retries it on a timer. It is lost if the process stops first, so keep your own records. Calling `await ai._spurvik.shutdown()` before the process exits gives queued events a last try. This is not in `987ec86`, the build design partners run.

**Older builds:** if `git rev-parse --short HEAD` shows `987ec86`, a script in this situation exits with code **13** instead. Node prints `Warning: Detected unsettled top-level await`, nothing after `await ai._spurvik.shutdown()` runs, and `onTelemetryError` is not called. Rebuild the SDK from commit `a350ee2` or later.

### `429` with `monthly_quota_exceeded`

```json
{"error":"monthly_quota_exceeded","plan":"developer","quota":10000,"used":10000,"resetAt":"2026-11-01T00:00:00.000Z"}
```

**Cause:** A capped plan (`free`, `developer`, `pro`, `team`, or `business`) has reached its monthly event cap. `POST /api/v1/telemetry` returns HTTP `429` with `error` `monthly_quota_exceeded` for the rest of that UTC calendar month. The cap resets at `resetAt`.

**What still works:** The SDK still builds a `ProvenanceRecord` on the client, and `durableBuffer` keeps queueing events on the client. The control plane does not store more model-call rows for that project until the UTC month resets. An uncapped `enterprise` plan does not return this status for the plan cap.

### The model call fails before it is sent (`high_annex3`)

With `riskTier: "high_annex3"` the SDK checks the human-stop state on the control plane before each model call and fails closed. If that check does not succeed, your model call throws and **the request is never sent to your model provider**. The SDK does this on purpose for that tier. It is not a bug in your code. These are the errors we reproduced:

| What happened | Error thrown | When | `instanceof SpurvikHaltedError` |
| --- | --- | --- | --- |
| Nothing listening at `SPURVIK_BASE_URL` | `TypeError: fetch failed` (the raw network error, not a Spurvik error class) | at once | No |
| The control plane accepts the connection but never answers | `SpurvikOversightTimeoutError`: `The halt check timed out before the control plane answered. The call was not sent.` | after 5 s | **Yes** (it is a subclass of `SpurvikHaltedError`) |
| The control plane answers with a non-2xx status (for example 503), or with a body that is not Spurvik JSON (for example an HTML page) | `SpurvikApiError`: an API error. It is a `SpurvikError`, not a `SpurvikHaltedError`, and it does not mean a human stop is engaged. (`error.status` is the HTTP status; `error.code` is the code from the body, or `invalid_response`.) | at once | **No** |
| Your code called `abort()` on a stream, for example from `ai.chat.completions.stream()`, while the check was still running | `AbortError`: `The stream was aborted.` | at once | No |
| A person engaged a human stop for the project or action | `SpurvikHaltedError` | at once | Yes |

```text
TypeError: fetch failed
  [cause]: Error: connect ECONNREFUSED 127.0.0.1:49999
```

> **Watch out:** if your code catches only `SpurvikHaltedError`, an API error (`SpurvikApiError`, a `SpurvikError`) or a network `TypeError` is not caught by that branch. Handle the other errors as well, as in the example below.

```js
import { SpurvikApiError, SpurvikHaltedError, SpurvikOversightTimeoutError } from "@spurvik/sdk";

try {
  const completion = await ai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hello" }],
  });
  console.log("Model said:", completion.choices[0].message.content);
} catch (error) {
  if (error instanceof SpurvikOversightTimeoutError) {
    console.error("Halt check timed out. The call was not sent.");
  } else if (error instanceof SpurvikHaltedError) {
    console.error("A human stop is engaged. The call was not sent.");
  } else if (error instanceof SpurvikApiError) {
    console.error(`Control plane API error (HTTP ${error.status}, ${error.code}). The call was not sent.`);
  } else {
    console.error("The call failed:", error.message); // for example `fetch failed`, or `AbortError` after abort()
  }
}
```

Check `SpurvikOversightTimeoutError` before `SpurvikHaltedError`, because a timeout is also a `SpurvikHaltedError`. After `abort()` on a silent control plane, the pending halt check can keep a short script running for up to 5 s before it exits.

**Fix:** Make sure the control plane is reachable and is a Spurvik control plane (see the `curl` check above).

**Older builds:** `987ec86` has no `SpurvikOversightTimeoutError`. Rebuild the SDK from commit `a350ee2` or later before you rely on the table above.

---

## Halting and releasing a human stop

The control plane stores a reason with every halt and every release. Each check applies to one scope: the whole project, or one `actionName`. A stop on the whole project and a stop on one action are separate.

### `Enter a reason for releasing.` or `Halting a project or action requires a reason.` (HTTP 400 `reason_required`)

**Cause:** A direct call to `POST /api/v1/oversight` sent a missing or blank reason. The control plane refuses it, and nothing changes. The SDK's `engageKillSwitch()` and `releaseKillSwitch()` do not get this error for a missing reason: they send a fixed sentence instead (next entry).

**Fix:** Send a reason. In the console, open the project's oversight page, fill in **Action name** (leave it empty for the whole project) and **Reason**, and choose **Engage stop** or **Release stop**. In code, pass it to the SDK: `releaseKillSwitch({ reason: "…" })`. Or call the API yourself with the project API key and a reviewer token:

```bash
curl -sS -X POST "$SPURVIK_BASE_URL/api/v1/oversight" \
  -H "authorization: Bearer $SPURVIK_API_KEY" \
  -H "x-spurvik-reviewer: $SPURVIK_REVIEWER_TOKEN" \
  -H "content-type: application/json" \
  -d '{"op":"release","reason":"Checked the output, resuming"}'
```

Add `"actionName":"export_record"` to the body to release one action. `SPURVIK_REVIEWER_TOKEN` is only a name used in this example; the SDK does not read it.

### The stored reason is `Halted via SDK (no reason given)` or `Released via SDK (no reason given)`

**Cause:** An `engageKillSwitch()` or `releaseKillSwitch()` call had no reason, or a blank one. The SDK sent this sentence in its place, and the control plane stored it like any other reason. A direct API call can send the same text, so the sentence alone does not show that the SDK made the call.

**Fix:** Pass a reason in every halt and release call. A stored reason is free text that someone entered; Spurvik does not check it.

### After a release, `GET /api/v1/oversight` still shows the halt reason

**Cause:** In a `GET /api/v1/oversight` response, `reason` is the reason stored with the last halt on that scope, and it stays there after a release. `previousReason` is always `null` in this response.

**Fix:** Read `projectHalted` and `actionHalted` to see whether a stop is engaged. The release reason is in the response to the release call itself (`reason`, with the halt reason that was in effect in `previousReason`).

### `This is already halted. Release it first to change the reason.` (HTTP 409 `already_halted`)

**Cause:** You halted a project or action that is already halted. Nothing changes: the first halt and its reason stay in place.

**Fix:** To change the reason, release the stop (with a reason), then halt it again with the new reason.

### `This is not halted.` (HTTP 409 `not_halted`)

**Cause:** You released a project or action that is not halted. Nothing changes.

**Fix:** Check the scope. A release with an `actionName` does not release a stop on the whole project, and a release without one does not release a stop on one action.

---

## Signature checks

### `verifyProvenanceSignature` returns `false`

Causes we reproduced:

| Cause | What to do |
| --- | --- |
| Arguments swapped: `verifyProvenanceSignature(secret, record)` | Use `verifyProvenanceSignature(record, secret)`. The record comes first. The swapped call does not throw. It just returns `false`. |
| A new `SPURVIK_SIGNING_SECRET` was generated (for example in a new shell) | Use the secret the record was signed with. Store the secret in a secret manager. |
| A signed field in the record was changed | Expected. Any change to a signed field makes the check return `false`, unless the record was re-signed with the same secret. |

---

## Streaming

### `TypeError: Cannot read properties of undefined (reading 'signatureAlg')`

```text
TypeError: Cannot read properties of undefined (reading 'signatureAlg')
```

**Cause:** You're on a `987ec86` build, where `provenanceOf(stream)` returns `undefined`. Rebuild from `a350ee2` or later. On `a350ee2`, forgetting `await` gives `undefined` rather than an error.

**Fix:** Read the whole stream, then await the record:

```js
const record = await provenanceOf(stream);
```

See [quickstart step 8](quickstart.md#step-8-streaming).

---

Still stuck? Write to hello@spurvik.com with the exact error text, your Node.js version (`node --version`), and the `spurvik` commit you built from (`git rev-parse --short HEAD`).
