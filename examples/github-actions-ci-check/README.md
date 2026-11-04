# GitHub Actions CI Check (`spurvik_find_unwrapped_calls`)

> Source: https://github.com/spurvik/spurvik (`spurvik@1.0.6`, `spurvik-sdk@1.0.6`, `spurvik-mcp-server@1.0.2`, MIT).

Run the local stdio MCP scanner (`spurvik_find_unwrapped_calls`) inside GitHub Actions on every Pull Request to flag unwrapped OpenAI, Anthropic, Google GenAI, Vercel AI SDK (`generateText` / `streamText`), Mastra, OpenAI Agents, or LangGraph (`StateGraph` / `interrupt()`) calls before merge.

The scanner runs offline in process, skips `.env` / `.env.*` files, makes zero network requests, and emits inline GitHub Actions PR annotations (`::error file=...,line=...::`) when `GITHUB_ACTIONS=true`.

## 1. Copy the workflow into `.github/workflows/spurvik-ai-act-check.yml`

See [`spurvik-ai-act-check.workflow.yml`](./spurvik-ai-act-check.workflow.yml) and [`run-mcp-scan.mjs`](./run-mcp-scan.mjs).

```bash
# Run locally against your project directory:
node examples/github-actions-ci-check/run-mcp-scan.mjs --root . --dir .

# Pass --warn-only to emit GitHub Actions warnings without failing the build:
node examples/github-actions-ci-check/run-mcp-scan.mjs --root . --dir . --warn-only
```

## 2. Verify with the smoke test

```bash
node --test examples/github-actions-ci-check/smoke.test.mjs
```

Spurvik logs AI calls with HMAC receipts and offers disclosure, marking and human-oversight hooks. It is designed to support that work and not legal advice.
