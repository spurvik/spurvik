# Cursor, Claude Code, VS Code & Windsurf MCP Starter (`spurvik-mcp-server@1.0.2`)

Drop-in Model Context Protocol (`MCP`) configurations and smoke test for [`spurvik-mcp-server@1.0.2`](https://www.npmjs.com/package/spurvik-mcp-server) and [`spurvik@1.0.6`](https://www.npmjs.com/package/spurvik) (MIT).

All four MCP tools run **100% locally over stdio** (`readOnlyHint: true`, zero network calls, `.env` files skipped automatically).

---

## 1. Quick Copy-Paste Setup

### Cursor (`.cursor/mcp.json`)

Copy [`cursor.mcp.json`](./cursor.mcp.json) to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "spurvik": {
      "command": "npx",
      "args": ["-y", "spurvik-mcp-server@1.0.2", "--root", "${workspaceFolder}"]
    }
  }
}
```

### Claude Code (`.mcp.json` or CLI)

Copy [`claude-code.mcp.json`](./claude-code.mcp.json) to `.mcp.json` in your repository root, or register via CLI:

```bash
claude mcp add spurvik -- npx -y spurvik-mcp-server@1.0.2 --root .
```

### VS Code / GitHub Copilot (`.vscode/mcp.json`)

Copy [`vscode.mcp.json`](./vscode.mcp.json) to `.vscode/mcp.json`:

```json
{
  "servers": {
    "spurvik": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "spurvik-mcp-server@1.0.2", "--root", "${workspaceFolder}"]
    }
  }
}
```

---

## 2. Four Read-Only Local MCP Tools

| Tool Name | What It Does | Example Prompt in Cursor / Claude Code |
| --- | --- | --- |
| `spurvik_find_unwrapped_calls` | Static heuristic scan of a workspace directory for unwrapped `openai`, `@anthropic-ai/sdk`, `@google/genai`, `ai`, `@mastra/core`, `@openai/agents`, or `@langchain/langgraph` calls (`file:line`). Skips `.env` and `.env.*`. | *"Run `spurvik_find_unwrapped_calls` on `src/` and wrap every flagged model call with `spurvik`."* |
| `spurvik_setup_snippet` | Generates a copy-paste TypeScript setup snippet for `openai`, `anthropic`, `google-genai`, `vercel-ai-sdk`, `mastra`, `openai-agents`, or `langgraph` targeting `node`, `next`, `vercel`, or `supabase-edge`. | *"Use `spurvik_setup_snippet` for `langgraph` on `next`."* |
| `spurvik_explain_receipt` | Explains the fields of a Spurvik HMAC-SHA256 provenance receipt JSON and optionally verifies its signature locally with `verifyProvenanceSignature`. | *"Explain and verify this provenance receipt with `spurvik_explain_receipt`."* |
| `spurvik_marking_hooks` | Explains how to attach caller-supplied Article 50(2) text or media marking hooks (`marking.text` / `marking.media`). | *"Show me how `marking.text` hooks work using `spurvik_marking_hooks`."* |

---

## 3. Run the End-to-End MCP Tools Smoke Test

From the repository root:

```bash
node --test examples/cursor-claude-code-mcp/smoke.test.mjs
```

---

*Technical format & engineering tooling only — not legal advice; does not by itself establish conformity with Regulation (EU) 2024/1689.*
