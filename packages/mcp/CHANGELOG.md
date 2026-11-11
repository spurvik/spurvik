# spurvik-mcp-server

## 1.0.3 — unreleased

Published as `spurvik-mcp-server@1.0.3` once released. From spurvik-mcp-server@1.0.3, an `overridden` human decision is treated as not approved, via `spurvik@1.0.7` and `spurvik-sdk@1.0.7` (the same build). The bundled SDK in `spurvik-mcp-server@1.0.2` still treated an overridden decision as approved.

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
