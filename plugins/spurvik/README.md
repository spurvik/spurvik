# Spurvik plugin for Claude Code

This plugin does not register a hook when it is installed. Claude Code loads `hooks/hooks.json` on its own when that file is present, and the plugin manifest has no switch that ships that file turned off ([plugins reference](https://code.claude.com/docs/en/plugins-reference)). The hint script is `hooks/unwrapped-llm-hint.mjs`. It does not run until you copy `hooks/hooks.example.json` to `hooks/hooks.json` in the installed plugin. The example uses `${CLAUDE_PLUGIN_ROOT}` in exec form and `"async": true`, so the edit is not held. The script exits 0, reads only the edited file, skips `.env` files, makes no network call, and writes nothing.

Runtime controls for engineers, built by EyeTea Solutions ApS ([spurvik.com](https://spurvik.com)). They are designed to support EU AI Act Art. 50 transparency notices. For high-risk AI systems they are designed to support Art. 12 record-keeping and Art. 14 human oversight. The repository README states that Art. 50 transparency obligations apply from 2 August 2026, and that Art. 12 and Art. 14 apply to Annex III high-risk systems from 2 December 2027. This is not legal advice.

`@spurvik/sdk`, `@spurvik/react`, `@spurvik/core`, and `@spurvik/mcp` are private, version 1.0.1, and not published. The MIT License applies to those packages. This plugin uses that same licence. See `LICENSE`.

## Install from a clone

The marketplace file in this repository is `.claude-plugin/marketplace.json`. Its plugin source is the relative path `./plugins/spurvik`, which resolves only when the installer has the repository files ([marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference)). A marketplace added from a local clone runs in place. An install from the Claude plugin directory or from a git or GitHub marketplace is copied into Claude's plugin cache. The server file is inside the plugin directory, so both the in-place install and the cache copy can start it.

```text
/plugin marketplace add /path/to/this/repo
/plugin install spurvik@spurvik-marketplace
```

A website copy of the marketplace file is not served from this repository. Do not point an installer at a hosted URL until that file exists and the repository is reachable.

## Commands and skill

| Piece | Name | What it does |
| --- | --- | --- |
| Command | `/spurvik:check` | Looks for model clients that are not passed to `withSpurvik` or `spurvikMiddleware`. |
| Command | `/spurvik:wrap` | Shows the `withSpurvik` and `spurvikMiddleware` setup that exists in this repository, and the `@spurvik/react` disclosure label. |
| Command | `/spurvik:engineering-summary` | Writes `SPURVIK-ENGINEERING-SUMMARY.md`, an engineering summary for your DPO or counsel. It is not evidence of conformity. |
| Skill | `eu-ai-act-guardrails` | Loaded when the task is model-client or agent-tool code. It carries the same rules as `rules/AGENTS.md`. |

Claude Code does not load `rules/AGENTS.md` as session context. The skill is the copy that can be invoked.

## What the SDK actually exports

`withSpurvik` from `@spurvik/sdk` wraps OpenAI, Anthropic, and Google GenAI (`@google/genai`) clients. `spurvikMiddleware` and `flush()` come from `@spurvik/sdk/ai`. Pass the middleware to `wrapLanguageModel` from the Vercel AI SDK (`ai` 7). The same `SpurvikConfig` object is used for both. Pass `apiKey`, `signingSecret`, and the keyed `contentHash.secret` yourself, read from the environment. The SDK throws `SpurvikConfigError` when those values are missing or invalid. It does not read them from the environment for you. `baseUrl` is required when `NODE_ENV` is production.

The middleware records the call and stores an HMAC receipt on `providerMetadata.spurvik`. Read it with `provenanceFromMetadata`. `provenanceOf` reads a `withSpurvik` response. Neither call marks content. A marking hook runs only when you set `marking`. That hook is where you plug in your own Art. 50(2) marking. A match from `verifyProvenanceSignature` shows the signed fields still match. It does not show that a mark is robust, detectable, or adequate under Art. 50(2).

`@spurvik/sdk/mastra` exports `withSpurvikMastra` and `provenanceFromMetadata`. Pass the function it returns as a Mastra agent's `model`. `@spurvik/sdk/openai-agents` exports `withSpurvikModel`, `withSpurvikModelProvider`, `provenanceFromAgentsResponse`, `createSpurvikNeedsApproval`, and `resolveAgentInterruptions`. `withSpurvikModel` wraps one Agents SDK `Model`. `withSpurvikModelProvider` wraps a `ModelProvider` so each `getModel` result is wrapped. Read an Agents receipt with `provenanceFromAgentsResponse`. `provenanceOf` from `@spurvik/sdk` also reads an Agents stream. `createSpurvikNeedsApproval` is a `needsApproval` callback. `resolveAgentInterruptions` sends each unique tool call to the human-oversight queue. `@spurvik/sdk/langgraph` exports `withSpurvikLangGraph`, `spurvikInterrupt`, `resolveLangGraphInterrupts`, and `provenanceFromLangGraphState`. `@spurvik/sdk/ai` also exports `extractFinishReason`, `isInterruptedFinishReason`, and `dedupeToolApprovalResponses`. A stream that closes without a finish chunk is recorded as `"interrupted"`. Those fields stay off the signed HMAC record. Those exports sit with `withSpurvik` and `provenanceOf` from `@spurvik/sdk`, and with `spurvikMiddleware` and `provenanceFromMetadata` from `@spurvik/sdk/ai`.

The telemetry body carries fingerprints, model version, temperature, and latency. The ingestion route rejects prompt or output text. Keyed fingerprints are the default (`contentHash.mode` `"keyed"`). The repository states that this tree does not claim that data stays in the EU.

For `high_annex3`, `enforceHaltOnInference` defaults to on. `oversight.cacheMs` and `oversight.pushInvalidation` control the halt cache. `requireHumanApproval`, `engageKillSwitch`, and `releaseKillSwitch` are methods on `client._spurvik`. Decision and oversight calls need `reviewerToken`. Pass a reason: `releaseKillSwitch({ reason: "release the stop" })`. If the reason is missing or blank, the SDK sends "Released via SDK (no reason given)" before the request. A blank halt reason is sent as "Halted via SDK (no reason given)". The control plane does not fill in a reason. This is designed to support Art. 14 for high-risk AI systems. It is not a complete Art. 14 system.

## Disclosure label

This repository does not ship a disclosure script and does not document a script URL. Use the React label:

```tsx
import { AIDisclosureLabel } from "@spurvik/react";

<AIDisclosureLabel notice="interaction" />
```

`AIDisclosureLabel` renders without storing anything unless you set `beacon.consent` to true. The site operator obtains that consent.

## MCP server

This plugin configures one MCP server, and that server is local stdio only. There is no hosted endpoint. The package is `@spurvik/mcp` from this repository, version 1.0.2, private, and not published. Claude Code loads `.mcp.json` at the plugin root ([plugin components](https://code.claude.com/docs/en/plugins/components)). Do not install the server from a package registry.

The command is `node`. The first argument is `bin/spurvik-mcp.mjs`, written as `${CLAUDE_PLUGIN_ROOT}/bin/spurvik-mcp.mjs`. That file is the local stdio server in one file, including the `@spurvik/core` and `@spurvik/sdk` code it runs. It does not load `../../packages`. The next arguments are `--root` and `${CLAUDE_PROJECT_DIR}`, the project Claude Code has open. If you start the same file without `--root`, set `SPURVIK_MCP_ROOT` to that directory. `--root` wins when both are set.

The directory passed with `--root` or `SPURVIK_MCP_ROOT` needs a `package.json`, a `.git` directory, or `pnpm-workspace.yaml`. The server refuses `/`, `/tmp`, a home directory, and system directories. `/etc`, `/usr/lib`, `/opt`, `/home`, and `/mnt` are refused.

```json
{
  "mcpServers": {
    "spurvik": {
      "command": "node",
      "args": [
        "${CLAUDE_PLUGIN_ROOT}/bin/spurvik-mcp.mjs",
        "--root",
        "${CLAUDE_PROJECT_DIR}"
      ]
    }
  }
}
```

If `bin/spurvik-mcp.mjs` is missing, Claude Code shows `plugin:spurvik:spurvik ✘ Failed to connect`. The file committed in this plugin is the one `.mcp.json` runs. A maintainer regenerates it from this repository with:

```bash
node packages/mcp/scripts/bundle-plugin.mjs
```

The tools are read-only. They do not call the Spurvik API or any other network. `bin/spurvik-mcp.mjs` exposes these four read-only tools:

- `spurvik_setup_snippet`
- `spurvik_find_unwrapped_calls`
- `spurvik_explain_receipt`
- `spurvik_marking_hooks`

## Scope

Spurvik provides software designed to support parts of Regulation (EU) 2024/1689 and record-keeping choices that relate to Regulation (EU) 2016/679. It is not legal advice. It is not evidence of conformity.
