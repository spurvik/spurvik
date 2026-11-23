# packages/mcp

Local stdio MCP server for Cursor, VS Code, and other MCP clients. Build this directory from source. It is `"private": true` at version **1.0.11**. The published npm package is `spurvik-mcp-server@1.0.11` (MIT), from https://github.com/spurvik/spurvik.

It depends on `spurvik-sdk@^1.0.7` from the npm registry, on `packages/core` in this repository, and on `@modelcontextprotocol/sdk` 1.32.1. The ten tools are read-only and match the ten zero-key tools on the hosted server at `https://console.spurvik.com/api/mcp`; their pure handlers are exported from `@spurvik/mcp/tools`. Seven run locally and do not use the network. `spurvik_scan_live_url` sends one public URL to `https://console.spurvik.com/api/v1/sandbox/scan` (8-second timeout, `User-Agent: spurvik-mcp-server/1.0.11`), `spurvik_batch_scan_domains` sends up to 10 the same way, and `spurvik_check_image_c2pa_url` POSTs one public https image URL to `https://console.spurvik.com/api/v1/provenance/public-check-url` (15-second timeout, same `User-Agent`); localhost, private or reserved IPs and internal hosts are refused before any request, and nothing is logged.

The SDK logs an AI call and attaches an HMAC receipt. Marking hooks are the caller's. Spurvik does not mark content. `spurvik_classify_ai_act_risk` is a deterministic engineering mapping aid, not legal advice and not a decision under Article 6. `riskTier` in a snippet is a sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.

The lockfile installs `spurvik-sdk@^1.0.7` from the npm registry. Then rebuild the plugin bundle with `node packages/mcp/scripts/bundle-plugin.mjs`. From spurvik-mcp-server@1.0.4, the bundled SDK matches `spurvik@1.0.8`: an `overridden` decision is not approved. `spurvik-mcp-server@1.0.2` on npm still treats an overridden decision as approved.

Build from the repo root:

```bash
pnpm --filter packages/mcp build
```

The client starts the built file and passes the project directory with `--root` or `SPURVIK_MCP_ROOT`. The server refuses to start or to scan without that directory. `spurvik_find_unwrapped_calls` reads only inside it.

```bash
node packages/mcp/dist/index.js --root .
```

A missing signing secret throws only when a receipt check needs one. The value is not logged. The scanner skips files named .env or .env.* (any case), including through symlinks and hard links. Windows-only name forms are not handled. Cyrillic and other look-alike letters are not treated as the ASCII names they resemble. The temp directory named by TMPDIR, TEMP, or TMP is refused as a workspace root. On `/mnt/<drive>/Users/<name>`, Public is not another user's home; any other name is refused unless it is the process user or the profile named by USERPROFILE or LOCALAPPDATA.

## Tools

`spurvik_setup_snippet`

Return a setup snippet for openai, anthropic, google-genai, vercel-ai-sdk, mastra, openai-agents, or langgraph. Provider clients are wrapped with withSpurvik. The Vercel AI SDK snippet passes spurvikMiddleware to wrapLanguageModel. The Mastra snippet calls withSpurvikMastra. The OpenAI Agents snippet calls withSpurvikModelProvider. The LangGraph snippet calls withSpurvikLangGraph and spurvikInterrupt. The snippet is built from the installed spurvik exports. `riskTier` is a sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case. The SDK logs the call and attaches an HMAC receipt. It does not mark content.

`spurvik_find_unwrapped_calls`

Heuristic static scan of one directory inside the workspace root for AI client calls that are not passed through withSpurvik, spurvikMiddleware, withSpurvikMastra, withSpurvikModel, withSpurvikModelProvider, withSpurvikLangGraph, or spurvikInterrupt. A StateGraph constructor is reported when the file does not call withSpurvikLangGraph. A bare interrupt() call is reported when the file does not call spurvikInterrupt or resolveLangGraphInterrupts. The scan reads .ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, and .cts files. It does not read .md or .mdc files. Results are file:line. The line number is 1-based and counts every newline, including comments and strings. This is a heuristic, so it can miss a call or report one that is already wrapped. The scan does not change files and does not use the network. Paths that leave the workspace, including '..', are rejected. The scanner skips files named .env or .env.* (any case), including through symlinks and hard links.

`spurvik_explain_receipt`

Explain the fields of an HMAC provenance receipt JSON. If signingSecret is passed, or SPURVIK_SIGNING_SECRET is set, check the HMAC locally with `verifyProvenanceSignature`, which checks that the record's signed fields still match the HMAC-SHA-256 signature. It does not show that a notice was shown, that output is marked, or that your system meets the Act. The signing secret is not logged. Omit the secret to explain the fields without checking.

`spurvik_marking_hooks`

Explain how to plug your own Article 50(2) marking into marking.text or marking.media. Spurvik does not mark content. withSpurvik and spurvikMiddleware log the call and attach an HMAC receipt. A hook runs only when you supply one. The signed text trailer is an application-level binding you can opt into. It is not, by itself, an Article 50(2) machine-readable mark.

`spurvik_scan_live_url` (new in 1.0.5)

Input `{ url }`: a public http(s) URL or a bare domain such as `stepnetwork.dk` (normalized to `https://stepnetwork.dk/`). Scans one page through the hosted console for AI chat widgets and AI SDKs and checks for a visible Article 50(1) notice. Returns JSON with `host`, `status`, `score`, `detectedWidgets`, `detectedSdks`, `art50NoticeDetected`, a one-line `badgeSnippet`, `reportUrl` (`https://console.spurvik.com/report?domain=<host>`), `sandboxUrl` (`https://console.spurvik.com/sandbox?scan=<host>`), `portfolioUrl` (`https://console.spurvik.com/portfolio`), `upgradeUrls` (`proWhiteLabelAndAuditVault`, `doneForYou24hSetup`; from 1.0.6 both carry `&appUrl=<host>` so the signup form is prefilled), and from 1.0.6 `statusShieldUrl` and `statusShieldMarkdown`. `statusShieldMarkdown` is one line a coding agent can offer to add to the project `README.md`:

```markdown
[![EU AI Act Art. 50](https://console.spurvik.com/api/v1/badge/status.svg?domain=stepnetwork.dk)](https://console.spurvik.com/report?domain=stepnetwork.dk)
```

The console builds the shield SVG from a live check of the host's frontpage. When the console cannot be reached, times out, or answers without a scan, it returns `offlineFallback: true` with the same links and snippet instead of an error. localhost, `.local`/`.internal` hosts, private, loopback, link-local and reserved IPv4/IPv6 literals and non-default ports are refused with `isError: true` before any request. The tool is open-world (`openWorldHint: true`).

`spurvik_batch_scan_domains` (new in 1.0.6)

Input `{ domains }`: 1 to 10 public http(s) URLs or bare domains, for example an agency's client sites. Every entry goes through the same check as `spurvik_scan_live_url` first. If any entry is refused (localhost, private or reserved IP, internal host, credentials, non-default port, not http(s)), the whole batch returns `isError: true` with `rejected` positions and nothing is sent. Duplicate hosts are scanned once. Each host is one `GET https://console.spurvik.com/api/v1/sandbox/scan` call with an 8-second timeout, at most 4 at once. (The console's `POST /api/v1/sandbox/batch-scan` accepts only same-origin browser requests from `/portfolio`, so the stdio server does not use it.) Returns JSON with `totalDomains`, `scannedDomains`, `gapsFound` (page read, AI chat widget or AI SDK found, no Art. 50(1) notice), `offlineFallbacks`, `duplicatesRemoved`, and one row per host with `host`, `status`, `detectedWidgets`, `detectedSdks`, `art50NoticeDetected`, `gap`, `reportUrl`, `sandboxUrl`, `badgeSnippet`, `statusShieldUrl` and `statusShieldMarkdown`. It also returns `portfolioUrl` and `upgradeUrls` (`teamAgencyPack`: Team €79/mo, `doneForYouPerSite`: Done-For-You €199 once per site; excl. VAT). A host that times out, is rate-limited or cannot be reached gets `offlineFallback: true` in its row; the batch still returns. The console rate-limits scans per client address (about 15 per minute), so a second full batch within a minute can come back as fallback rows. The tool is open-world (`openWorldHint: true`).

`spurvik_check_image_c2pa_url` (new in 1.0.7)

C2PA JUMBF manifest & CDN-strip checker, ahead of the EU AI Act Art. 50(2) machine-readable marking duty (2 December 2026). It reads; it never signs or adds a manifest. Input `{ url }`: a public `https://` URL of a PNG, JPEG or WebP image up to 4 MB. Before any network call the URL must be `https:` on port 443 with no user name or password, and the host must not be `localhost`, a `.local`/`.internal` (or other internal-suffix) name, or a private, loopback, link-local, CGNAT, reserved or multicast IPv4/IPv6 literal; a refused URL returns `isError: true` and is never sent. The tool then sends `POST https://console.spurvik.com/api/v1/provenance/public-check-url` with `Content-Type: application/json`, `User-Agent: spurvik-mcp-server/1.0.11` and a 15-second timeout. The console fetches the image once through its own SSRF gate (pinned DNS, re-checked redirects, 8 s, 4 MB) and reads the manifest in memory; the URL and bytes are not stored. Ten checks per minute per address, shared with `https://console.spurvik.com/c2pa`.

Returns JSON with `status` (`manifest_valid`, `signature_mismatch` or `no_manifest`), `host`, `fileName`, `mediaType`, `byteLength`, `c2pa` (`manifestFound`, `embedded`, `claimGenerator`, `signatureMatches`, `trustAnchor`, `trustAnchorText`, `validationCodes`), `imageProxy` (`detected`, `name`, `fix`), `diagnosis`, `disclosure` (`locale`, `language`, and the visible notice as `<AIDisclosureLabel notice="generated" />` and a `badge.js` tag with `data-notice="generated"`), `links` (`c2pa`, `pro`, `concierge`; Pro €19/mo and Done-For-You €199 once carry `&appUrl=<image host>` unless the host is a shared CDN such as Cloudinary, imgix, Shopify CDN, Jetpack Photon or Webflow CDN) and one `note`. `claimGenerator` and `validationCodes` come from an attacker-controllable manifest, so they are reduced exactly as the hosted tool does: `claimGenerator` to letters, digits and ` ._()/+:@-` (at most 100 characters), `validationCodes` to dotted identifiers (at most 20). When `manifestFound` is `false`, `diagnosis` names the image optimizer in the URL that re-encodes the image and drops the C2PA JUMBF boxes (`/_next/image`, `/cdn-cgi/image/`, `*.cloudinary.com`, `*.imgix.net`, Shopify CDN, Jetpack Photon, Webflow CDN) and how to serve the signed original. A console refusal (`image_too_large`, `unsupported_media`, `upstream_status`, `upstream_timeout`, `blocked_target`, `rate_limited`), a timeout or an unreachable console returns `isError: true` with the code and a link to the interactive checker. The tool is open-world (`openWorldHint: true`) and idempotent.

`spurvik_classify_ai_act_risk` (new in 1.0.5)

Input `{ useCase, domain?, interactsWithHumans?, generatesSyntheticMedia?, makesAutomatedDecisionsAboutPeople? }`. `domain` is `general` or an Annex III area (`biometrics`, `critical_infrastructure`, `education`, `employment_hr`, `essential_services_credit`, `law_enforcement`, `migration_border`, `justice_democracy`). Deterministic, zero-network mapping to `prohibited_art5`, `high_risk_annex_iii`, `limited_transparency_art50` or `minimal_risk`, with the signals used, obligations and dates, recommended Spurvik controls, `interactiveClassifierUrl` (`https://console.spurvik.com/risk-check`) and `upgradeUrls` (Pro €19/mo, Team €79/mo with the Annex IV draft, Done-For-You €199 once; excl. VAT). Omitted flags are inferred from fixed keywords in `useCase`. The use-case text is not stored or echoed. `scopeNote`: "Engineering mapping aid; not legal advice."

`spurvik_generate_art50_badge` (new in 1.0.5)

Input `{ locale?, position?, theme?, systemName?, attribution? }`. Zero-network Article 50(1) notice in any of the 24 official EU languages: a one-line `<script src="https://spurvik.com/badge.js" ...>`, a Next.js `<Script>`, the WordPress plugin (`https://spurvik.com/r/spurvik-eu-ai-act-wp.zip`), the Framer component (`https://spurvik.com/r/spurvik-framer-badge.tsx`) and the shadcn/v0 registry item (`https://spurvik.com/r/article-50-badge.json`). `attribution` defaults to `true` (Free) and shows a subtle "Art. 50 · Spurvik" link; `attribution: false` writes `data-attribution="false"`, which is white-label on Pro (€19/mo) or Done-For-You (€199 once). The language is inferred from a domain-like `systemName` when `locale` is omitted. `systemName` is stripped of HTML/JSX attribute characters.

`spurvik_vendor_questionnaire_answers` (new in 1.0.8)

Input `{ plan?, provider?, hasHighRiskActions?, generatesMedia?, domain? }`, every field optional: `plan` is `free`, `pro` (default), `team` or `concierge` (Done-For-You); `provider` is `openai` (default), `anthropic`, `google-genai`, `vercel-ai-sdk`, `langgraph`, `openai-agents`, `mastra` or `custom`; `hasHighRiskActions` defaults to `true` (agents can trigger refunds, emails, permission changes or deletions); `generatesMedia` defaults to `false`. Zero-network and deterministic. Returns copy-paste Markdown answers to the five EU AI Act questions in enterprise vendor security questionnaires and DPO RFPs: Q1 Art. 50(1) notice and 2 Dec 2026 Art. 50(2) provenance, Q2 Art. 12 cryptographic event logging (keyed HMAC-SHA256 `inputHash` / `outputHash`, HMAC-signed receipt, SHA-256 `recordHash` chained by `prevLogHash`), Q3 GDPR Art. 5(1)(c) zero-prompt minimisation and Frankfurt residency (`fra1`, `eu-central-1`), Q4 Art. 14 deterministic approval gates (`requireHumanApproval`, `spurvikInterrupt` or `createSpurvikNeedsApproval` on the hosted queue with `verifyHitlWebhook`; signed Slack/Teams links from `spurvik/channels` on Free), and Q5 retention, DPO evidence and the Annex IV draft. Plan figures: Free €0 (10,000 events/mo, 30 days, `badge.js` with attribution), Pro €19/mo or €190/yr (250,000, 90 days, white-label `data-attribution="false"`, hosted approval queue, DPO engineering summary `.md`), Team €79/mo or €790/yr (2,000,000, 12 months, Annex IV draft as PDF or Markdown, webhook export), Done-For-You €199 once (24h install by PR or CMS snippet, signed DPO Readiness & C2PA Art. 50(2) report, 1 year of Pro). `domain` must be a public hostname such as `acme.eu`; it prefills `/report?domain=` and `&appUrl=` on the Pro and Done-For-You links, and any other value is dropped, not echoed. The output ends with a plan table, a `## Next steps` block and one legal line.

## Next steps links (from 1.0.8)

Like the hosted server, tool output ends with a `## Next steps` block. `spurvik_setup_snippet`, `spurvik_find_unwrapped_calls` and `spurvik_marking_hooks` append it to their text; `spurvik_explain_receipt` appends it on success only. `spurvik_classify_ai_act_risk` and `spurvik_generate_art50_badge` return it as a second text item after the JSON, so the first item stays valid JSON; a `prohibited_art5` result gets none, and `high_risk_annex_iii` adds Team and Done-For-You. The badge's Done-For-You link carries `&appUrl=<host>` when `systemName` is a public hostname. The pure helpers exported from `@spurvik/mcp/tools` (`setupSnippet`, `markingHooksText`, `explainReceipt`, …) do not add the block.

`spurvik_setup_snippet` notes also link the shareable report (`https://console.spurvik.com/report`), Pro (`https://console.spurvik.com/signup?plan=pro`) and the €199 Done-For-You 24h setup (`https://console.spurvik.com/signup?plan=concierge`).

The handlers and their JSON Schemas are exported from `@spurvik/mcp/tools` (`scanLiveUrl`, `batchScanDomains`, `checkImageC2paUrl`, `classifyAiActRisk`, `generateArt50Badge`, `vendorQuestionnaireAnswers`, `SCAN_LIVE_URL_INPUT_JSON_SCHEMA`, `BATCH_SCAN_DOMAINS_INPUT_JSON_SCHEMA`, `CHECK_IMAGE_C2PA_URL_INPUT_JSON_SCHEMA`, `CLASSIFY_RISK_INPUT_JSON_SCHEMA`, `ART50_BADGE_INPUT_JSON_SCHEMA`, `VENDOR_QUESTIONNAIRE_INPUT_JSON_SCHEMA`).

## Claude Code plugin

`plugins/spurvik/.mcp.json` starts the server bundled inside the plugin. The command is `node`. The arguments are `${CLAUDE_PLUGIN_ROOT}/bin/spurvik-mcp.mjs`, `--root`, and `${CLAUDE_PROJECT_DIR}`. That file is bundled from `packages/mcp` 1.0.11 with `node packages/mcp/scripts/bundle-plugin.mjs`. The same ten read-only tools are `spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, `spurvik_marking_hooks`, `spurvik_scan_live_url`, `spurvik_batch_scan_domains`, `spurvik_check_image_c2pa_url`, `spurvik_classify_ai_act_risk`, `spurvik_generate_art50_badge`, and `spurvik_vendor_questionnaire_answers`. This plugin entry is not one of the Cursor or VS Code examples below: it runs `bin/spurvik-mcp.mjs` from the plugin directory, not `packages/mcp/dist/index.js`.

## Cursor

`.cursor/mcp.json` at the workspace root:

```json
{
  "mcpServers": {
    "spurvik": {
      "command": "node",
      "args": ["${workspaceFolder}/packages/mcp/dist/index.js", "--root", "${workspaceFolder}"]
    }
  }
}
```

Use an absolute path when the workspace root is not this repo:

```json
{
  "mcpServers": {
    "spurvik": {
      "command": "node",
      "args": ["/absolute/path/to/the/repo/packages/mcp/dist/index.js", "--root", "/absolute/path/to/the/repo"]
    }
  }
}
```

## VS Code

`.vscode/mcp.json`:

```json
{
  "servers": {
    "spurvik": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/packages/mcp/dist/index.js", "--root", "${workspaceFolder}"]
    }
  }
}
```

## What it does not do

- It does not call the network, except `spurvik_scan_live_url` (one public URL) and `spurvik_batch_scan_domains` (up to 10 public domains), which send them to console.spurvik.com.
- It does not mark content.
- It does not make a legal classification. `spurvik_classify_ai_act_risk` is an engineering mapping aid.
- It does not ship a key.
- It does not publish a package.
