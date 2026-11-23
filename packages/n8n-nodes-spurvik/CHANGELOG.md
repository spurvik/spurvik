## n8n-nodes-spurvik 1.0.11 — 2026-11-23

- **Scan Live Domain** (`scanDomain`) and **Batch Scan** (`batchScanDomains`): surface `detectedPlatforms`, 1-click CMS/GTM `platformInstallerUrls`, 2 Dec 2026 `heroImageProxy` C2PA CDN-strip diagnosis, H121 `widgetDisclosureClass` dual-use widget classification, `prefilledPortfolioUrl`, and Free €0 + Pro/Team Annual (`€190/yr`, `€790/yr`) `upgradeUrls`.
- **Check Image C2PA & CDN Strip** (`checkImageC2paUrl`) and **Answer Vendor Security Questionnaire** (`vendorQuestionnaireAnswers`): add Free €0 and annual `upgradeUrls` and clarify 1-field email signup copy.
- Scan Live Domain, Batch Scan Domains, Check Image C2PA, and console sync now send `User-Agent: n8n-nodes-spurvik/1.0.11`, and `dependencies.spurvik-sdk` moves to `^1.0.14`.

## n8n-nodes-spurvik 1.0.10 — 2026-11-22

- Marked `n8n-workflow` as an optional peer dependency (`"peerDependenciesMeta": { "n8n-workflow": { "optional": true } }`), preventing bare `npm install n8n-nodes-spurvik` outside an n8n Docker container (including on Node.js 26) from compiling `isolated-vm` C++ addons on the host.
- `art14_ask_human`: when a Free-plan `consoleApiKey` receives `HTTP 402` on `POST {consoleBaseUrl}/api/v1/hitl`, the node keeps the dispatched channel approval receipt (`status: "pending_human_approval"`) and returns `consoleSync: { endpoint: "/api/v1/hitl", httpStatus: 402, synced: false, remoteId: null, planRequired: "pro" }` alongside `upgradeUrls` instead of failing the workflow.
- Scan Live Domain, Batch Scan Domains, Check Image C2PA, and console sync now send `User-Agent: n8n-nodes-spurvik/1.0.10`, and `dependencies.spurvik-sdk` moves to `^1.0.13`.

## n8n-nodes-spurvik 1.0.9 — 2026-11-18

- **Scan Live Domain** (`scanDomain`) and **Batch Scan** (`batchScanDomains`): honour the upstream page's `<html lang>` code returned by `/api/v1/sandbox/scan` (`pageLocale` / `detectedLocale` / `htmlLang` / `lang`, reduced to one of the 24 official EU languages, e.g. `fr-FR` → `fr` on `.com`/`.ai`/`.app` hosts) when generating `badgeSnippet`, falling back to the country-code TLD and `en`.
- **Check Image C2PA & CDN Strip** (`checkImageC2paUrl`): detects Shopify CDN (`cdn.shopify.com` and `/cdn/shop/`), WordPress Jetpack Photon (`i0.wp.com`–`i3.wp.com`), and Webflow Image CDN (`*.website-files.com` / `*.webflow.com`) C2PA JUMBF stripping alongside `/_next/image`, Cloudflare `/cdn-cgi/image/`, Cloudinary, and imgix, with platform-specific remediation advice in `diagnosis`. Shared CDN hosts (`cdn.shopify.com`, `i*.wp.com`, `*.website-files.com`, `*.webflow.com`, Cloudinary, imgix) omit `appUrl` on `upgradeUrls` and use `en` in `art50GeneratedBadgeSnippet`.
- Scan Live Domain, Batch Scan Domains, and console sync (`/api/v1/disclosure`, `/api/v1/telemetry`, `/api/v1/hitl`) now send `User-Agent: n8n-nodes-spurvik/1.0.9`, matching Check Image C2PA. No other header, URL, or output field changes. `N8N_NODES_SPURVIK_VERSION` and `N8N_NODES_SPURVIK_USER_AGENT` live in `scan-domain.ts`; `index.ts` and `check-image-c2pa-url.ts` export them as before. Still depends on `spurvik-sdk@^1.0.8`.

## n8n-nodes-spurvik 1.0.8 — 2026-11-17

- Added zero-credential operation #7, **Answer Vendor Security Questionnaire (Art. 50/12/14 RFP)** (`vendorQuestionnaireAnswers`): copy-paste Markdown answers to the five EU AI Act questions in enterprise vendor security questionnaires and DPO RFPs (Art. 50(1)/50(2), Art. 12, GDPR Art. 5(1)(c) and Frankfurt residency, Art. 14, retention and DPO evidence). The Markdown is byte-identical to `spurvik-mcp-server@1.0.8` tool #10 (`spurvik_vendor_questionnaire_answers`). It is built locally: no request, no credential, no API key, and nothing from the incoming item is copied. `spurvikApi`, `systemName`, `passThroughFields`, and `consoleBaseUrl` are hidden for it, and the credential is never read when every item runs a zero-key operation.
- New parameters, shown only for `vendorQuestionnaireAnswers`: `questionnairePlan` (`free`, `pro` (default), `team`, `concierge`), `questionnaireProvider` (`openai` (default), `anthropic`, `google-genai`, `vercel-ai-sdk`, `langgraph`, `openai-agents`, `mastra`, `custom`), `hasHighRiskActions` (default `true`), `generatesMedia` (default `false`), and optional `questionnaireDomain`. A domain that is not a public hostname (localhost, IP literals, internal suffixes, credentials, ports, non-ASCII) is ignored and never echoed. A plan, provider, or flag outside those values throws without repeating it.
- Output (fixed key order): `plan`, `provider`, `hasHighRiskActions`, `generatesMedia`, `domain` (or `null`), `markdown`, `interactiveUrl` (`https://spurvik.com/eu-ai-act-vendor-security-questionnaire`), `reportUrl` (or `null`), and `upgradeUrls` (`freeApiKey10sEur0`, `proWhiteLabelEur19`, `teamAgencyEur79`, `doneForYou24hEur199`; Pro and Done-For-You carry `appUrl=<domain>`). Plan facts: Free €0 (10,000 events/mo, 30 days), Pro €19/mo (250,000 events/mo, 90 days), Team €79/mo (2,000,000 events/mo, 12 months), Done-For-You €199 once (incl. 1 yr Pro).
- `art50_disclosure`, `art12_hmac_log`, and `art14_ask_human` results add `upgradeUrls` (the same four keys, on `consoleBaseUrl` or `https://console.spurvik.com` when it is empty or not a valid https URL) when no `consoleApiKey` is set, and `null` once `consoleSync` is set. An invalid `consoleBaseUrl` still never fails these operations without a key.
- `User-Agent` for Check Image C2PA is now `n8n-nodes-spurvik/1.0.8`. `index.ts` also exports `spurvikVendorQuestionnaireAnswers`, `questionnaireHostname`, `SPURVIK_QUESTIONNAIRE_PLANS`, `SPURVIK_QUESTIONNAIRE_PROVIDERS`, `SPURVIK_VENDOR_QUESTIONNAIRE_URL`, and `workflowUpgradeUrls`. Still depends on `spurvik-sdk@^1.0.8`. The other operations, their parameters, and the default (`art50_disclosure`) are unchanged.

## n8n-nodes-spurvik 1.0.7 — 2026-11-17

- Added operation #6, **Check Image C2PA & CDN Strip (Art. 50(2))** (`checkImageC2paUrl`): a read-only C2PA JUMBF manifest & CDN-strip checker for one public https image URL (PNG, JPEG or WebP, up to 4 MB), ahead of Art. 50(2) machine-readable marking (applies from 2 December 2026). It never signs or adds a manifest. Like the scan operations it needs no credential and no API key: `spurvikApi`, `systemName`, and `passThroughFields` are hidden for it, and the credential is never read when every item runs a zero-key operation.
- New parameter `imageUrl` (shown only for `checkImageC2paUrl`). The URL and `consoleBaseUrl` are checked before any request. Refused, fail-closed: any scheme other than `https`, ports other than 443, `user:password@`, localhost and `*.localhost`, `.local`, `.internal`, `.lan`, `.home.arpa`, `.localdomain`, `.intranet`, `.corp`, single-label hosts, and every IPv4 or IPv6 literal (including decimal, hex, octal, and IPv4-mapped forms). Error messages never repeat the input. The fragment is dropped.
- Calls `POST {consoleBaseUrl}/api/v1/provenance/public-check-url` with `{ "url": imageUrl }`, `Content-Type: application/json`, `Accept: application/json`, and `User-Agent: n8n-nodes-spurvik/1.0.7` (15 s timeout, redirects refused, no `Authorization` header). A timeout, network error, console refusal (`rate_limited`, `image_too_large`, `unsupported_media`, ...), invalid JSON, or unreadable report returns `checkStatus: "not_checked"` with a short `reason` code and every C2PA field `null`, instead of failing the workflow. The upstream error text and body are never copied.
- Output (fixed key order, nothing from the incoming item): `imageUrl`, `imageHost`, `checkStatus` (`manifest_valid`, `signature_mismatch`, `no_manifest`, `not_checked`), `reason`, `fileName`, `mediaType`, `byteLength`, `manifestFound`, `embedded`, `signatureMatches`, `trustAnchor`, `claimGenerator` and `validationCodes` (sanitized with the same rules as `spurvik-mcp-server@1.0.7`), `cdnRewriteSuspected` and `cdnProvider` (`/_next/image`, `/cdn-cgi/image/`, Cloudinary, imgix), `diagnosis`, `art50GeneratedBadgeSnippet` (`badge.js` with `data-notice="generated"`), `c2paCheckerUrl` (`https://console.spurvik.com/c2pa`), and `upgradeUrls` (Pro €19/mo, Team €79/mo, Done-For-You €199 once) with `appUrl=<image host>`. As in `spurvik-mcp-server@1.0.7`, `appUrl` is omitted, and the snippet locale is `en`, for shared image CDN hosts (Cloudinary, imgix).
- `index.ts` also exports `checkSpurvikImageC2paUrl`, `normalizeC2paImageUrl`, `detectImageProxy`, `N8N_NODES_SPURVIK_VERSION`, and `N8N_NODES_SPURVIK_USER_AGENT`. The existing operations, their parameters, and the default (`art50_disclosure`) are unchanged.
- Console sync (pending, console-git): add the `n8n-nodes-spurvik/` User-Agent prefix to `FIRST_PARTY_CLIENT_USER_AGENT_RE`.
- For self-hosted n8n. This package has not been reviewed for n8n Cloud.

## n8n-nodes-spurvik 1.0.6 — 2026-11-17

- Added the **Batch Scan up to 10 Domains (Agency Roster)** operation (`batchScanDomains`). It needs no credential and no API key: `spurvikApi` is hidden for `scanDomain` and `batchScanDomains`, and both never read it. New parameter `domainsList` (shown only for `batchScanDomains`, 3 rows): 1 to 10 domains or http(s) URLs separated by commas, spaces, or new lines, or an array of strings from an expression.
- Every batch entry and `consoleBaseUrl` are validated before the first request. An empty list, more than 10 entries, or one entry that Scan Live Domain would refuse (localhost, IP literals, internal names, `user@`, non-default ports, non-http schemes, non-strings) throws with the entry position only and sends nothing. Duplicate hosts are scanned once.
- Hosts are scanned with the Scan Live Domain call, at most 4 in flight. Output: `totalDomains`, `gapsFound` (reachable hosts with a detected widget and no Art. 50 notice), `results` (one Scan Live Domain row per host, input order), `portfolioUrl`, `agencyCalculatorUrl`, and plan `upgradeUrls` (Pro €19/mo, Team €79/mo, Done-For-You €199 once). A failing host returns its own `scanStatus: "offline"` row. Nothing from the incoming item is copied.
- Scan Live Domain output adds `portfolioUrl`, `statusShieldUrl` (`/api/v1/badge/status.svg?domain=<host>`), and `statusShieldMarkdown` (the shield linked to `reportUrl`), live and offline. All three `upgradeUrls` keep `appUrl=<host>`.
- `systemName` and `passThroughFields` are hidden for both scan operations. The existing operations, their parameters, and the default (`art50_disclosure`) are unchanged.
- `index.ts` also exports `batchScanSpurvikDomains` and `parseBatchDomains`.

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
