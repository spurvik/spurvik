# spurvik-mcp-server

## 1.0.9 — 2026-11-18

Published as `spurvik-mcp-server@1.0.9`. Both the local stdio server and the hosted Streamable HTTP server (`https://console.spurvik.com/api/mcp`) expose all ten zero-key read-only tools.

### Changed

- `spurvik_scan_live_url` and `spurvik_batch_scan_domains`: honour the upstream page's `<html lang>` code returned by `/api/v1/sandbox/scan` (`pageLocale` / `detectedLocale` / `htmlLang` / `lang`, normalized to one of the 24 official EU languages, e.g. `fr-FR` → `fr` on `.com`/`.ai`/`.app` domains) when building `badgeSnippet`, falling back to the country-code TLD and `en`.
- `spurvik_check_image_c2pa_url`: detects Shopify CDN (`cdn.shopify.com` and `/cdn/shop/`), WordPress Jetpack Photon (`i0.wp.com`–`i3.wp.com`), and Webflow Image CDN (`*.website-files.com` / `*.webflow.com`) C2PA manifest stripping alongside `/_next/image`, Cloudflare `/cdn-cgi/image/`, Cloudinary, and imgix, and omits `&appUrl=` on shared CDN hosts so `links.pro` and `links.concierge` never prefill a third-party CDN hostname.
- `spurvik_setup_snippet` pins `spurvik@1.0.12` and `spurvik-sdk@1.0.12` (`SNIPPET_SDK_VERSION`), which ship multi-domain `spurvik scan` and 24-EU-locale `spurvik badge --lang`.
- `User-Agent` is now `spurvik-mcp-server/1.0.9`. Listing manifests (`server.json`, `smithery.yaml`, `glama.json`), Claude plugin manifests (`1.0.9`), `spurvik-com-well-known-mcp.json` (10 stdio and 10 hosted tools) and `plugins/spurvik/bin/spurvik-mcp.mjs` move to `1.0.9`.

## 1.0.8 — 2026-11-17

Published as `spurvik-mcp-server@1.0.8`. The local stdio server has ten zero-key tools: the nine on the hosted MCP server at `https://console.spurvik.com/api/mcp` plus `spurvik_vendor_questionnaire_answers`.

### Added

- `spurvik_vendor_questionnaire_answers` `{ plan?, provider?, hasHighRiskActions?, generatesMedia?, domain? }` (all optional; defaults `pro`, `openai`, `true`, `false`): zero-network, deterministic Markdown answers to the five EU AI Act questions in enterprise vendor security questionnaires and DPO RFPs (Q1 Art. 50(1) and 2 Dec 2026 Art. 50(2), Q2 Art. 12 cryptographic event logging, Q3 GDPR Art. 5(1)(c) zero-prompt minimisation and Frankfurt residency, Q4 Art. 14 deterministic approval gates, Q5 retention, DPO evidence and Annex IV). Plan figures follow console `PLAN_LIMITS` and `upgrade-plans.ts` (Free 10,000/30 days, Pro 250,000/90 days, Team 2,000,000/12 months, Done-For-You €199 once with 1 year of Pro). Field and API names are the shipped ones (`inputHash`, `outputHash`, `recordHash`, `prevLogHash`, `requireHumanApproval`, `spurvikInterrupt`, `createSpurvikNeedsApproval`, `createMultiChannelApprovalRouter`, `verifyHitlWebhook`). `domain` must be a public hostname; it prefills `/report?domain=` and `&appUrl=`, and any other value is dropped without being echoed. One legal line at the bottom. Read-only, `openWorldHint: false`.
- `## Next steps` links on tool output, the same lines as the hosted server (H25): `spurvik_setup_snippet` (Free key, Pro, Done-For-You), `spurvik_find_unwrapped_calls` (wrap with `spurvik_setup_snippet`, Free, Pro, Done-For-You), `spurvik_explain_receipt` on success (`inputHash` + `recordHash` streaming, Pro 90-day retention + DPO summary, Team Annex IV), `spurvik_marking_hooks` (C2PA URL check, Free, Pro). `spurvik_classify_ai_act_risk` (vendor questionnaire, Free, Pro; Team and Done-For-You on `high_risk_annex_iii`; none on `prohibited_art5`) and `spurvik_generate_art50_badge` (Label Studio, Done-For-You with `&appUrl=<host>` for a hostname `systemName`) return the block as a second text item, so the first item stays valid JSON.
- `@spurvik/mcp/tools` exports `vendorQuestionnaireAnswers`, `VENDOR_QUESTIONNAIRE_INPUT_JSON_SCHEMA`, `VENDOR_QUESTIONNAIRE_DEFAULTS`, `QUESTIONNAIRE_PLANS`, `QUESTIONNAIRE_PROVIDERS`, `MAX_QUESTIONNAIRE_DOMAIN_CHARS`, `publicHostname`, `SIGNUP_URL`, `LABELS_URL` and `VENDOR_QUESTIONNAIRE_URL`.

### Changed

- User-Agent `spurvik-mcp-server/1.0.8`. Server instructions: seven local tools. `server.json` description mentions the questionnaire answers. Listing manifests, the Claude plugin manifests (`1.0.8`), `spurvik-com-well-known-mcp.json` (10 stdio and 9 hosted tools) and the bundled plugin server move to 1.0.8.

## 1.0.7 — 2026-11-17

Published as `spurvik-mcp-server@1.0.7`. The local stdio server has nine zero-key tools, the same nine as the hosted MCP server at `https://console.spurvik.com/api/mcp`.

### Added

- `spurvik_check_image_c2pa_url` `{ url }`: C2PA JUMBF manifest & CDN-strip checker for one public `https://` PNG, JPEG or WebP image up to 4 MB. Read-only; it never signs. The URL must be `https:` on port 443 with no credentials, and `localhost`, `.local`/`.internal` (and the other internal suffixes) and private or reserved IP literals are refused before any request. Sends `POST https://console.spurvik.com/api/v1/provenance/public-check-url` (`Content-Type: application/json`, `User-Agent: spurvik-mcp-server/1.0.7`, 15-second `AbortSignal.timeout`, `redirect: "error"`). Returns `status`, `mediaType`, `byteLength`, `fileName`, `c2pa` (`manifestFound`, `embedded`, `claimGenerator`, `signatureMatches`, `trustAnchor`, `trustAnchorText`, `validationCodes`), `imageProxy` and `diagnosis` for `/_next/image`, `/cdn-cgi/image/`, Cloudinary and imgix, a visible `notice="generated"` React and `badge.js` snippet, and `/c2pa`, Pro (€19/mo) and Done-For-You (€199 once) links with `&appUrl=<image host>`. `claimGenerator`, `validationCodes` and `fileName` are sanitized with the hosted tool's rules.
- `@spurvik/mcp/tools` exports `checkImageC2paUrl`, `normalizeImageUrl`, `detectImageProxy`, `safeClaimGenerator`, `safeValidationCodes`, `CHECK_IMAGE_C2PA_URL_INPUT_JSON_SCHEMA`, `C2PA_CHECK_ENDPOINT`, `C2PA_CHECK_TIMEOUT_MS`, `C2PA_MAX_IMAGE_BYTES` and `C2PA_PAGE_URL`.

### Changed

- `spurvik_setup_snippet` pins `spurvik@1.0.10` and `spurvik-sdk@1.0.10` (`SNIPPET_SDK_VERSION`), which ship the `spurvik c2pa` CLI.
- Server instructions name all three network tools. Listing manifests (`server.json`, `smithery.yaml`, `glama.json`), the Claude plugin manifests (`1.0.7`), `spurvik-com-well-known-mcp.json` (9 stdio and 9 hosted tools) and the bundled plugin server move to 1.0.7.

## 1.0.6 — 2026-11-17

Published as `spurvik-mcp-server@1.0.6`. The local stdio server has eight zero-key tools. The hosted MCP server at `https://console.spurvik.com/api/mcp` still lists seven; it does not have `spurvik_batch_scan_domains`.

### Added

- `spurvik_batch_scan_domains` `{ domains }`: scans 1 to 10 public domains or http(s) URLs. Every entry goes through `normalizeScanTarget` first. If any entry is refused (localhost, `.local`/`.internal` hosts, private, loopback, link-local and reserved IP literals, credentials, non-default ports, non-http(s) schemes), the whole batch returns `isError: true` with `rejected: [{ position, error }]` and no request is made. Entry values are not echoed. Duplicate hosts are scanned once (`duplicatesRemoved`). Each host is one `GET https://console.spurvik.com/api/v1/sandbox/scan?url=<encoded>` call (8-second timeout, `User-Agent: spurvik-mcp-server/1.0.6`), at most 4 at once. The console's `POST /api/v1/sandbox/batch-scan` refuses requests that are not same-origin (`403`), so the stdio server does not call it. Returns `totalDomains`, `scannedDomains`, `gapsFound` (page read, AI chat widget or AI SDK found, no Art. 50(1) notice; the same rule as the console `/portfolio`), `offlineFallbacks`, one row per host (`host`, `status`, `detectedWidgets`, `detectedSdks`, `art50NoticeDetected`, `gap`, `reportUrl`, `sandboxUrl`, `badgeSnippet`, `statusShieldUrl`, `statusShieldMarkdown`), `portfolioUrl` (`https://console.spurvik.com/portfolio`) and `upgradeUrls` (`teamAgencyPack`: `https://console.spurvik.com/signup?plan=team`, Team €79/mo; `doneForYouPerSite`: `https://console.spurvik.com/signup?plan=concierge`, €199 once; excl. VAT). A failed, timed-out or rate-limited host gets `offlineFallback: true` in its row and the batch still returns. Nothing is logged. Open-world (`openWorldHint: true`).
- `spurvik_scan_live_url` returns `portfolioUrl`, `statusShieldUrl` (`https://console.spurvik.com/api/v1/badge/status.svg?domain=<host>`) and `statusShieldMarkdown` (`[![EU AI Act Art. 50](<statusShieldUrl>)](<reportUrl>)`), so a coding agent can offer to add the live Art. 50 status shield to a project `README.md`.
- `@spurvik/mcp/tools` exports `batchScanDomains`, `BATCH_SCAN_DOMAINS_INPUT_JSON_SCHEMA`, `BATCH_MAX_DOMAINS`, `BATCH_SCAN_CONCURRENCY`, `statusShieldUrlFor`, `statusShieldMarkdownFor`, `proSignupUrlFor`, `conciergeSignupUrlFor` and `PORTFOLIO_URL`.

### Changed

- `spurvik_scan_live_url` `upgradeUrls.proWhiteLabelAndAuditVault` and `upgradeUrls.doneForYou24hSetup` append `&appUrl=<host>`, so the console signup form opens with the scanned domain filled in.
- `spurvik_setup_snippet` pins `spurvik@1.0.9` and `spurvik-sdk@1.0.9` (`SNIPPET_SDK_VERSION`).
- Server instructions name both network tools. Listing manifests (`server.json`, `smithery.yaml`, `glama.json`), the Claude plugin manifests (`1.0.6`), `spurvik-com-well-known-mcp.json` and the bundled plugin server `plugins/spurvik/bin/spurvik-mcp.mjs` pin `spurvik-mcp-server@1.0.6`.

## 1.0.5 — 2026-11-13

Published as `spurvik-mcp-server@1.0.5`. The local stdio server now lists the same seven tool names as the hosted MCP server at `https://console.spurvik.com/api/mcp`.

### Added

- `spurvik_scan_live_url` `{ url }`: scans one public page through `GET https://console.spurvik.com/api/v1/sandbox/scan?url=<encoded>` (8-second `AbortSignal.timeout`, `User-Agent: spurvik-mcp-server/1.0.5`). Bare domains are normalized to `https://<domain>/` and http is upgraded to https. localhost, `.local`/`.internal`/`.lan`/`home.arpa` hosts, single-label names, private, loopback, link-local, CGNAT, documentation and reserved IPv4/IPv6 literals (including IPv4-mapped IPv6), credentials in the URL and non-default ports are refused with `isError: true` before any request. Returns JSON with detected widgets and SDKs, score, status, a one-line badge.js snippet, `reportUrl`, `sandboxUrl` and `upgradeUrls`. A timeout, network error, non-200 answer or unexpected body returns `offlineFallback: true` with the same links and snippet instead of throwing. Nothing is logged. This is the only tool that uses the network (`openWorldHint: true`).
- `spurvik_classify_ai_act_risk` `{ useCase, domain?, interactsWithHumans?, generatesSyntheticMedia?, makesAutomatedDecisionsAboutPeople? }`: deterministic, zero-network mapping to `prohibited_art5`, `high_risk_annex_iii`, `limited_transparency_art50` or `minimal_risk`, with obligations and dates, recommended Spurvik controls, `interactiveClassifierUrl` (`https://console.spurvik.com/risk-check`) and `upgradeUrls` (Pro €19/mo, Team €79/mo with the Annex IV draft, Done-For-You €199 once; excl. VAT). The use-case text is not stored or echoed. `scopeNote`: "Engineering mapping aid; not legal advice."
- `spurvik_generate_art50_badge` `{ locale?, position?, theme?, systemName?, attribution? }`: zero-network Art. 50(1) notice in the 24 official EU languages as a one-line badge.js `<script>`, a Next.js `<Script>`, the WordPress plugin `.zip`, the Framer component and the shadcn/v0 registry item. `attribution` defaults to `true` ("Art. 50 · Spurvik"); `false` is white-label on Pro or Done-For-You. `systemName` is stripped of HTML/JSX attribute characters.
- `@spurvik/mcp/tools` exports `scanLiveUrl`, `normalizeScanTarget`, `classifyAiActRisk`, `generateArt50Badge`, their JSON Schemas, `EU_LANGUAGES`, `buildBadgeScript` and `MCP_VERSION`.

### Changed

- `spurvik_setup_snippet` notes link the shareable report (`https://console.spurvik.com/report`), Pro (`https://console.spurvik.com/signup?plan=pro`) and the €199 Done-For-You 24h setup (`https://console.spurvik.com/signup?plan=concierge`). The snippet code is unchanged.
- Server instructions say which tool uses the network. `serverInfo.version` falls back to a single `MCP_VERSION` constant that a unit test keeps equal to `package.json`.
- Listing manifests (`server.json`, `smithery.yaml`, `glama.json`), the Claude plugin manifests and the bundled plugin server pin `spurvik-mcp-server@1.0.5`.

## 1.0.4 — 2026-11-11

Published as `spurvik-mcp-server@1.0.4`.

### Added

- Direct CLI subcommands on the `spurvik-mcp` / `spurvik-mcp-server` bin: `check` (scan a workspace for unwrapped AI calls; `--ci` exits 1 when findings exist; `--json` prints a machine-readable report), `snippet`, and `marking-hooks`. `--version` prints the package version.

### Changed

- The published zero-dependency bundle is rebuilt from this repository's `spurvik@1.0.8` / `spurvik-sdk@1.0.8` sources (the same build). Setup snippets pin those versions via `SNIPPET_SDK_VERSION`.
- Listing manifests (`server.json`, `smithery.yaml`, `glama.json`) and the Claude plugin manifests pin `spurvik-mcp-server@1.0.4` and `spurvik@1.0.8`.

## 1.0.3 — 2026-11-11

Published as `spurvik-mcp-server@1.0.3`. From spurvik-mcp-server@1.0.3, an `overridden` human decision is treated as not approved, via `spurvik@1.0.7` and `spurvik-sdk@1.0.7` (the same build). The bundled SDK in `spurvik-mcp-server@1.0.2` still treated an overridden decision as approved.

The package.json on the published tarball includes `mcpName` set to `io.github.spurvik/spurvik-mcp-server`, which is the `name` in `server.json`. The MCP Registry uses that field to check npm package ownership.

### Breaking

- From spurvik-mcp-server@1.0.3, the bundled `spurvik-sdk@1.0.7` matches the 1.0.7 SDK: `requireHumanApproval` throws `SpurvikHitlRejectedError` when the decision is overridden, as it does when rejected. Read `error.record.status` (`"overridden"` or `"rejected"`). Continue only when it returns status `approved`.
- `SpurvikHitlRejectedError.message` says `was overridden` for an overridden decision and `was rejected` for a rejected one. For any other status that is not `approved`, the message reads `was not approved (status "<status>")`.
- `spurvik/langgraph` and `spurvik/openai-agents` helpers in the bundle approve only on status `approved`.

### Changed

- Workspace `packages/mcp` depends on `spurvik-sdk@^1.0.7` from the npm registry (it previously used `file:../sdk`).
- MCP listing manifests (`server.json`, `smithery.yaml`, `glama.json`) and the Claude plugin manifests pin `spurvik-mcp-server@1.0.3` and `spurvik@1.0.7`.
- `smithery.yaml` starts the published npm bin (`npm exec --yes --package=spurvik-mcp-server@1.0.3 -- spurvik-mcp-server`) instead of a repo-relative `packages/mcp/dist/index.js` path.
- `server.json` keeps camelCase package fields only (`registryType`, `registryBaseUrl`, `environmentVariables`).
- `spurvik_setup_snippet` imports from the published `spurvik` package and its subpath exports (`spurvik/ai`, `spurvik/mastra`, `spurvik/openai-agents`, `spurvik/langgraph`). The 1.0.3 draft had briefly emitted unpublished `@spurvik/sdk` / `@spurvik/core` specifiers (a regression vs 1.0.2).
- Setup snippets pin `spurvik@1.0.7` and `spurvik-sdk@1.0.7` (same build), derived from one `SNIPPET_SDK_VERSION` constant.
- `server.json` marks `--root` as required. The default remains `.`.
- Staged `dist/index.js` is mode `0755` again (as in 1.0.2).
