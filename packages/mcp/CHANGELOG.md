# spurvik-mcp-server

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
