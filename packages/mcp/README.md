# @spurvik/mcp

Local stdio MCP server for Cursor, VS Code, and other MCP clients. Workspace package `@spurvik/mcp` is version **1.0.2** and `"private": true`. Published on npm as `spurvik-mcp-server@1.0.2` (MIT), from https://github.com/spurvik/spurvik.

It depends on `@spurvik/sdk` and `@spurvik/core` with `workspace:*`, and on `@modelcontextprotocol/sdk` 1.32.1. The tools are read-only. They do not call the Spurvik API or any other network.

The SDK logs an AI call and attaches an HMAC receipt. Marking hooks are the caller's. Spurvik does not mark content and does not classify a use case. `riskTier` in a snippet is a sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.

Build from the repo root:

```bash
pnpm --filter @spurvik/mcp build
```

The client starts the built file and passes the project directory with `--root` or `SPURVIK_MCP_ROOT`. The server refuses to start or to scan without that directory. `spurvik_find_unwrapped_calls` reads only inside it.

```bash
node packages/mcp/dist/index.js --root .
```

A missing signing secret throws only when a receipt check needs one. The value is not logged. The scanner skips files named .env or .env.* (any case), including through symlinks and hard links. Windows-only name forms are not handled. Cyrillic and other look-alike letters are not treated as the ASCII names they resemble. The temp directory named by TMPDIR, TEMP, or TMP is refused as a workspace root. On `/mnt/<drive>/Users/<name>`, Public is not another user's home; any other name is refused unless it is the process user or the profile named by USERPROFILE or LOCALAPPDATA.

## Tools

`spurvik_setup_snippet`

Return a setup snippet for openai, anthropic, google-genai, vercel-ai-sdk, mastra, openai-agents, or langgraph. Provider clients are wrapped with withSpurvik. The Vercel AI SDK snippet passes spurvikMiddleware to wrapLanguageModel. The Mastra snippet calls withSpurvikMastra. The OpenAI Agents snippet calls withSpurvikModelProvider. The LangGraph snippet calls withSpurvikLangGraph and spurvikInterrupt. The snippet is built from the installed @spurvik/sdk exports. `riskTier` is a sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case. The SDK logs the call and attaches an HMAC receipt. It does not mark content.

`spurvik_find_unwrapped_calls`

Heuristic static scan of one directory inside the workspace root for AI client calls that are not passed through withSpurvik, spurvikMiddleware, withSpurvikMastra, withSpurvikModel, withSpurvikModelProvider, withSpurvikLangGraph, or spurvikInterrupt. A StateGraph constructor is reported when the file does not call withSpurvikLangGraph. A bare interrupt() call is reported when the file does not call spurvikInterrupt or resolveLangGraphInterrupts. The scan reads .ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, and .cts files. It does not read .md or .mdc files. Results are file:line. The line number is 1-based and counts every newline, including comments and strings. This is a heuristic, so it can miss a call or report one that is already wrapped. The scan does not change files and does not use the network. Paths that leave the workspace, including '..', are rejected. The scanner skips files named .env or .env.* (any case), including through symlinks and hard links.

`spurvik_explain_receipt`

Explain the fields of an HMAC provenance receipt JSON. If signingSecret is passed, or SPURVIK_SIGNING_SECRET is set, check the HMAC locally with `verifyProvenanceSignature`, which checks that the record's signed fields still match the HMAC-SHA-256 signature. It does not show that a notice was shown, that output is marked, or that your system meets the Act. The signing secret is not logged. Omit the secret to explain the fields without checking.

`spurvik_marking_hooks`

Explain how to plug your own Article 50(2) marking into marking.text or marking.media. Spurvik does not mark content. withSpurvik and spurvikMiddleware log the call and attach an HMAC receipt. A hook runs only when you supply one. The signed text trailer is an application-level binding you can opt into. It is not, by itself, an Article 50(2) machine-readable mark.

## Claude Code plugin

`plugins/spurvik/.mcp.json` starts the server bundled inside the plugin. The command is `node`. The arguments are `${CLAUDE_PLUGIN_ROOT}/bin/spurvik-mcp.mjs`, `--root`, and `${CLAUDE_PROJECT_DIR}`. That file is bundled from `@spurvik/mcp` 1.0.2 with `node packages/mcp/scripts/bundle-plugin.mjs`. The same four read-only tools are `spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, and `spurvik_marking_hooks`. This plugin entry is not one of the Cursor or VS Code examples below: it runs `bin/spurvik-mcp.mjs` from the plugin directory, not `packages/mcp/dist/index.js`.

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

- It does not call the Spurvik API or any network.
- It does not mark content.
- It does not classify a use case.
- It does not ship a key.
- It does not publish a package.
