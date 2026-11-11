# spurvik-mcp-server

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
