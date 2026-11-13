# packages/mcp

Local stdio MCP server for Cursor, VS Code, and other MCP clients. Build this directory from source. It is `"private": true` at version **1.0.5**. The published npm package is `spurvik-mcp-server@1.0.5` (MIT), from https://github.com/spurvik/spurvik.

It depends on `spurvik-sdk@^1.0.7` from the npm registry, on `packages/core` in this repository, and on `@modelcontextprotocol/sdk` 1.32.1. The seven tools are read-only. Six run locally and do not use the network. `spurvik_scan_live_url` sends one public URL to `https://console.spurvik.com/api/v1/sandbox/scan` (8-second timeout, `User-Agent: spurvik-mcp-server/1.0.5`); localhost, private or reserved IPs and internal hosts are refused before any request, and nothing is logged.

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

Input `{ url }`: a public http(s) URL or a bare domain such as `stepnetwork.dk` (normalized to `https://stepnetwork.dk/`). Scans one page through the hosted console for AI chat widgets and AI SDKs and checks for a visible Article 50(1) notice. Returns JSON with `host`, `status`, `score`, `detectedWidgets`, `detectedSdks`, `art50NoticeDetected`, a one-line `badgeSnippet`, `reportUrl` (`https://console.spurvik.com/report?domain=<host>`), `sandboxUrl` (`https://console.spurvik.com/sandbox?scan=<host>`) and `upgradeUrls` (`proWhiteLabelAndAuditVault`, `doneForYou24hSetup`). When the console cannot be reached, times out, or answers without a scan, it returns `offlineFallback: true` with the same links and snippet instead of an error. localhost, `.local`/`.internal` hosts, private, loopback, link-local and reserved IPv4/IPv6 literals and non-default ports are refused with `isError: true` before any request. The tool is open-world (`openWorldHint: true`).

`spurvik_classify_ai_act_risk` (new in 1.0.5)

Input `{ useCase, domain?, interactsWithHumans?, generatesSyntheticMedia?, makesAutomatedDecisionsAboutPeople? }`. `domain` is `general` or an Annex III area (`biometrics`, `critical_infrastructure`, `education`, `employment_hr`, `essential_services_credit`, `law_enforcement`, `migration_border`, `justice_democracy`). Deterministic, zero-network mapping to `prohibited_art5`, `high_risk_annex_iii`, `limited_transparency_art50` or `minimal_risk`, with the signals used, obligations and dates, recommended Spurvik controls, `interactiveClassifierUrl` (`https://console.spurvik.com/risk-check`) and `upgradeUrls` (Pro €19/mo, Team €79/mo with the Annex IV draft, Done-For-You €199 once; excl. VAT). Omitted flags are inferred from fixed keywords in `useCase`. The use-case text is not stored or echoed. `scopeNote`: "Engineering mapping aid; not legal advice."

`spurvik_generate_art50_badge` (new in 1.0.5)

Input `{ locale?, position?, theme?, systemName?, attribution? }`. Zero-network Article 50(1) notice in any of the 24 official EU languages: a one-line `<script src="https://spurvik.com/badge.js" ...>`, a Next.js `<Script>`, the WordPress plugin (`https://spurvik.com/r/spurvik-eu-ai-act-wp.zip`), the Framer component (`https://spurvik.com/r/spurvik-framer-badge.tsx`) and the shadcn/v0 registry item (`https://spurvik.com/r/article-50-badge.json`). `attribution` defaults to `true` (Free) and shows a subtle "Art. 50 · Spurvik" link; `attribution: false` writes `data-attribution="false"`, which is white-label on Pro (€19/mo) or Done-For-You (€199 once). The language is inferred from a domain-like `systemName` when `locale` is omitted. `systemName` is stripped of HTML/JSX attribute characters.

`spurvik_setup_snippet` notes also link the shareable report (`https://console.spurvik.com/report`), Pro (`https://console.spurvik.com/signup?plan=pro`) and the €199 Done-For-You 24h setup (`https://console.spurvik.com/signup?plan=concierge`).

The handlers and their JSON Schemas are exported from `@spurvik/mcp/tools` (`scanLiveUrl`, `classifyAiActRisk`, `generateArt50Badge`, `SCAN_LIVE_URL_INPUT_JSON_SCHEMA`, `CLASSIFY_RISK_INPUT_JSON_SCHEMA`, `ART50_BADGE_INPUT_JSON_SCHEMA`).

## Claude Code plugin

`plugins/spurvik/.mcp.json` starts the server bundled inside the plugin. The command is `node`. The arguments are `${CLAUDE_PLUGIN_ROOT}/bin/spurvik-mcp.mjs`, `--root`, and `${CLAUDE_PROJECT_DIR}`. That file is bundled from `packages/mcp` 1.0.5 with `node packages/mcp/scripts/bundle-plugin.mjs`. The same seven read-only tools are `spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, `spurvik_marking_hooks`, `spurvik_scan_live_url`, `spurvik_classify_ai_act_risk`, and `spurvik_generate_art50_badge`. This plugin entry is not one of the Cursor or VS Code examples below: it runs `bin/spurvik-mcp.mjs` from the plugin directory, not `packages/mcp/dist/index.js`.

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

- It does not call the network, except `spurvik_scan_live_url`, which sends one public URL to console.spurvik.com.
- It does not mark content.
- It does not make a legal classification. `spurvik_classify_ai_act_risk` is an engineering mapping aid.
- It does not ship a key.
- It does not publish a package.
