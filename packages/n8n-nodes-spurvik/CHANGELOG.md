## n8n-nodes-spurvik 1.0.5 — 2026-11-13

- Added the **Scan Live Domain (Art. 50 & Client Brief)** operation (`scanDomain`). It needs no credential and no API key: the `spurvikApi` credential is hidden for this operation (`displayOptions.hide`) and is still required for `art50_disclosure`, `art12_hmac_log`, and `art14_ask_human`. The operation never reads the credential and sends no `Authorization` header.
- New parameter `domainOrUrl` (shown only for `scanDomain`). Accepts a bare domain or an http(s) URL and keeps only the lower-case hostname. localhost and `*.localhost`, IPv4 and IPv6 literals (including decimal, hex, and octal forms), `.local`, `.internal`, `.lan`, `.home.arpa`, single-label hosts, `user@` credentials, non-default ports, and invalid labels are refused with an error before any request.
- Calls `GET {consoleBaseUrl}/api/v1/sandbox/scan?url=<host>` (8 s timeout, redirects refused). `consoleBaseUrl` must be `https://` (`http://` only for localhost). A timeout, network error, non-2xx answer, invalid JSON, or `ok: false` returns `scanStatus: "offline"` with `reachable: false` instead of failing the workflow. The error and the response body are never copied to the output.
- Output: `domain`, `reachable`, `detectedWidgets`, `detectedSdks`, `art50NoticeDetected`, `badgeSnippet` (the same `badge.js` tag as the MCP server's scan tool), `reportUrl`, `sandboxUrl`, `agencyCalculatorUrl`, `upgradeUrls` (Pro €19/mo, Team €79/mo, Done-For-You €199 once; signup links prefill `appUrl`), plus `scanStatus`, `reason`, and `markers`. Nothing from the incoming item is copied.
- `systemName` and `passThroughFields` are hidden for `scanDomain`. The three existing operations, their parameters, and the default (`art50_disclosure`) are unchanged.
- `index.ts` also exports `scanSpurvikDomain` and `normalizeScanDomain`.

## n8n-nodes-spurvik 1.0.4 — 2026-11-11

- Added optional `consoleApiKey` password field on the `spurvikApi` credential and `consoleBaseUrl` node parameter (`https://console.spurvik.com`) to sync hashed receipts (`POST /api/v1/telemetry`), disclosure sessions (`POST /api/v1/disclosure`), and `ask_human()` oversight rows (`POST /api/v1/hitl` with canonical `spurvik.payload_summary.v1`) without transmitting raw prompt text.
- Bumped `spurvik-sdk` dependency to `^1.0.8`.

## n8n-nodes-spurvik 1.0.3

- Fixed: a passThroughFields entry equal to inputField no longer copies the input value to the output (affected 1.0.0–1.0.2).

## n8n-nodes-spurvik 1.0.2

The published 1.0.1 class lived in `dist/index.js`, so n8n looked for an export named `index` and failed to load the package. 1.0.2 ships `dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js` and `dist/credentials/SpurvikApi.credentials.js`.

- The node type id stays `spurvikEuAiActGuard`.
- `execute()` calls `executeSpurvikWorkflowStep`. The notice, digest, and approval operations are separate.
- The HMAC secret is read only from the `spurvikApi` credential. A missing secret throws.
- The notice operation reads outputField (default outputText) and inputField (default promptText). inputField is shown for the notice and the digest. It throws if outputField is missing or is not a string, if outputField equals inputField in any letter case, or if outputField matches promptText, prompt, chatInput, query, or input in any letter case. It does not read the prompt field. Output is { spurvik: result } plus explicitly named fields other than those prompt names. Those prompt names are never copied. The digest is HMAC-SHA256 of the prefix spurvik:workflow:input:v1| plus the input field.
- Nine channels are listed. Monday.com creates an item only.

## n8n-nodes-spurvik 1.0.1

Published from main. n8n 2.46.4 did not register it (`require(...).index is not a constructor`). `execute()` also called `executeSpurvikN8nGuard`, which was not defined.
