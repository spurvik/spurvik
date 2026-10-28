# Spurvik Claude Code Plugin: `/spurvik:check`, `/spurvik:wrap`, `/spurvik:engineering-summary`

> **Spurvik EU AI Act SDK (1.0.1) & MCP control plane (1.0.2, MIT).** Describes `plugins/spurvik` (`1.0.2`, MIT) on `spurvik` `main` (`8e16fad`, including PR #6, PR #8, PR #9, PR #16, PR #19, PR #20, PR #21, PR #22, and PR #23). The commands may change. Not legal advice.
>
> *Source: https://github.com/spurvik/spurvik. npm: `spurvik@1.0.1`, `spurvik-sdk@1.0.1`, `spurvik-mcp-server@1.0.2`.*

The Spurvik plugin in `plugins/spurvik` gives Claude Code three slash commands, one skill (`eu-ai-act-guardrails`), and a bundled local stdio MCP server (`bin/spurvik-mcp.mjs`). They help you find model calls in your code that are not wrapped yet, add `withSpurvik`, `spurvikMiddleware`, `withSpurvikMastra`, `withSpurvikModel`, `withSpurvikModelProvider`, or `withSpurvikLangGraph`, and write a short engineering summary.

The commands are instructions to Claude, not a scanner program. Claude reads your files and proposes edits; you review them. A finding is not a legal conclusion.

Spurvik does not mark content itself. Its provenance record supports, but does not replace, Article 50(2) machine-readable marking.

## Before you install

- The plugin lives in the public repository https://github.com/spurvik/spurvik at https://github.com/spurvik/spurvik/tree/main/plugins/spurvik.
- Public MIT packages are live on npm as `spurvik@1.0.1`, `spurvik-sdk@1.0.1`, and `spurvik-mcp-server@1.0.2` (inside the monorepo, `@spurvik/sdk`, `@spurvik/react`, and `@spurvik/core` use workspace version `1.0.1`; see [5-minute quickstart](5-minute-quickstart.md)).
- The plugin's `.mcp.json` configures one local stdio MCP server (`${CLAUDE_PLUGIN_ROOT}/bin/spurvik-mcp.mjs --root ${CLAUDE_PROJECT_DIR}`, bundled from `@spurvik/mcp` `1.0.2` and published on npm as `spurvik-mcp-server@1.0.2` (MIT)). Its four tools (`spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, `spurvik_marking_hooks`) are read-only and make no network calls. There is no hosted MCP endpoint in this plugin.

## Install

Clone the public repository, then load or install `plugins/spurvik` from your local checkout:

```bash
git clone https://github.com/spurvik/spurvik.git spurvik
```

### Option 1 — Install via the repository's local marketplace manifest (`.claude-plugin/marketplace.json`)

Inside Claude Code, add your local repository checkout as a marketplace catalog and install `spurvik@spurvik-marketplace`:

```text
/plugin marketplace add /path/to/spurvik
/plugin install spurvik@spurvik-marketplace
```

### Option 2 — Load directly for a single session (`--plugin-dir`)

```bash
claude --plugin-dir /path/to/spurvik/plugins/spurvik
```

### Website marketplace catalog (`docs/distribution/spurvik-com-marketplace.json`)

The repository also stages `docs/distribution/spurvik-com-marketplace.json` (`name: "spurvik-marketplace"`, `source: "git-subdir"`, `url: "https://github.com/spurvik/spurvik.git"`, `path: "plugins/spurvik"`, `ref: "main"`, `version: "1.0.2"`) for `https://spurvik.com/.claude-plugin/marketplace.json`. Install from your local clone using Option 1 or Option 2, or from that git-subdir once the website catalog is served.

## Slash commands

| Command | What it does |
| --- | --- |
| `/spurvik:check` | Searches the workspace and writes a report table (`File:Line` \| `Art. 50`, `Art. 12 for high-risk AI systems`, or `Art. 14 for high-risk AI systems` \| what was found \| the change that matches `/spurvik:wrap`). |
| `/spurvik:wrap` | Adds `withSpurvik`, `spurvikMiddleware`, `withSpurvikMastra`, `withSpurvikModel`, `withSpurvikModelProvider`, `withSpurvikLangGraph`, or `AIDisclosureLabel` to the project or to the file you pass as an argument, shows the diff, and runs the project's typecheck if it has one. |
| `/spurvik:engineering-summary` *(renamed from `/spurvik:dpo-pack` in PR #6)* | Scans the repository and writes `SPURVIK-ENGINEERING-SUMMARY.md`, an engineering summary for your DPO or counsel. |

## `/spurvik:check`

Claude searches your workspace and reports:

1. **Model clients that are not wrapped.** For example `new OpenAI`, `new Anthropic`, `new GoogleGenAI`, `generateText`, `streamText`, and `@langchain/langgraph` (`StateGraph`, `interrupt(`). A client counts as wrapped when it goes through `withSpurvik` (`@spurvik/sdk`), or when the model goes through `wrapLanguageModel` with `spurvikMiddleware` (`@spurvik/sdk/ai`). A Mastra agent counts as wrapped when its model comes from `withSpurvikMastra` (`@spurvik/sdk/mastra`); read that receipt with `provenanceFromMetadata`. An OpenAI Agents model counts as wrapped when it comes from `withSpurvikModel` or `withSpurvikModelProvider` (`@spurvik/sdk/openai-agents`); read that receipt with `provenanceFromAgentsResponse`. A LangGraph graph counts as wrapped when it is passed to `withSpurvikLangGraph` (`@spurvik/sdk/langgraph`); read that receipt with `provenanceOf` or `provenanceFromLangGraphState`. Embeddings, image generation, speech, moderations, batches and file uploads are not recorded by `withSpurvik`; the command says so instead of flagging them.
2. **Logs that print prompt or message text.**
3. **AI chat UIs with no visible AI interaction notice** (Art. 50(1)). The React label in the repository is `AIDisclosureLabel` from `@spurvik/react`.
4. **Tools with side effects (refund, delete, send, …) that have no human-oversight call**, for high-risk AI systems. See [Mapping Tool Approvals & Interruptions to Spurvik's Human-Oversight Queue](hitl-approval-mapping.md).

Output: a count by file and a table of `File:Line`, the article it relates to, what was found, and the matching `/spurvik:wrap` change. Claude then offers to apply the changes. The table is a to-do list, not evidence of conformity.

## `/spurvik:wrap`

Claude adds the setup the repository actually exports to your project, or to the file you name (`/spurvik:wrap src/chat.ts`), shows the diff, and runs your typecheck if you have one.

- **OpenAI, Anthropic, Google GenAI:** `withSpurvik(client, config)`, with `apiKey`, `signingSecret` and `contentHash.secret` read from your environment. The SDK does not read them for you; it throws `SpurvikConfigError` if they are missing. `provenanceOf` from `@spurvik/sdk` reads that response.
- **Vercel AI SDK (`ai` 7):** `spurvikMiddleware` passed to `wrapLanguageModel`; read the record with `provenanceFromMetadata`.
- **Mastra:** `withSpurvikMastra` from `@spurvik/sdk/mastra`. Pass the function it returns as the agent's `model`. Read the receipt with `provenanceFromMetadata`.
- **OpenAI Agents:** `withSpurvikModel` wraps one `Model`, and `withSpurvikModelProvider` wraps a `ModelProvider`, both from `@spurvik/sdk/openai-agents`. Read the receipt with `provenanceFromAgentsResponse`. `provenanceOf` reads an Agents stream. `createSpurvikNeedsApproval` is the tool `needsApproval` callback. `resolveAgentInterruptions` sends each unique interruption to the human-oversight queue and calls `state.approve` or `state.reject`.
- **LangGraph:** `withSpurvikLangGraph`, `spurvikInterrupt`, and `resolveLangGraphInterrupts` come from `@spurvik/sdk/langgraph`. A state with `__interrupt__` is recorded with finish reason `"interrupted"`. See [LangGraph Quickstart](langgraph-quickstart.md).
- **Vercel AI SDK finish reason:** `extractFinishReason`, `isInterruptedFinishReason`, and `dedupeToolApprovalResponses` come from `@spurvik/sdk/ai`. A stream that closes without a finish chunk is recorded as `"interrupted"`. Those fields stay off the signed HMAC record.
- **High-risk AI systems** (`riskTier: "high_annex3"`): `requireHumanApproval`, `engageKillSwitch({ reason, actionName })` and `releaseKillSwitch({ reason, actionName })` on `client._spurvik`. The command's examples pass a reason to both calls. In the SDK the reason is optional: if it is missing or blank, the SDK sends `"Halted via SDK (no reason given)"` or `"Released via SDK (no reason given)"` instead. Always pass one. Both calls need `reviewerToken`. These are designed to support Art. 14 human oversight; they are not a complete Art. 14 system.
- **React:** `<AIDisclosureLabel notice="interaction" />`.

`riskTier` is your own classification as provider or deployer; Spurvik does not classify your use case. `article50Disclosure: true` only records that you say a notice is shown. The command leaves `marking` unset unless you supply your own marking hook.

## `/spurvik:engineering-summary` *(formerly `/spurvik:dpo-pack`)*

> **Command rename note:** `/spurvik:dpo-pack` was renamed to **`/spurvik:engineering-summary`** in PR #6 (`commands/engineering-summary.md` replaced `commands/dpo-pack.md`). Run `/spurvik:engineering-summary` to generate the summary file.

Claude writes (or updates) `SPURVIK-ENGINEERING-SUMMARY.md` in your repository: an engineering summary for your DPO or counsel. It lists only what your code and the repository README describe:

1. AI system inventory: providers, model ids, user-facing surfaces (and which were not found).
2. Where people are told they are interacting with an AI system (Art. 50(1)).
3. How wrapped calls are recorded, for high-risk AI systems (Art. 12).
4. Which tools ask for human approval or can be halted, for high-risk AI systems (Art. 14).

The file says that it is not evidence of conformity and not legal advice. It does not assess your system.

## Bundled local MCP server (`.mcp.json`)

`plugins/spurvik/.mcp.json` starts the bundled local stdio MCP server (`@spurvik/mcp`, version `1.0.2`) automatically when the plugin loads:

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

It exposes four read-only local tools (`spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, `spurvik_marking_hooks`) that run locally on your machine and make no network calls. To check a receipt's HMAC signature with `spurvik_explain_receipt`, pass `signingSecret` to the tool call or set `SPURVIK_SIGNING_SECRET` in the MCP server's environment. Third-party licence notices for the bundled server are in `plugins/spurvik/THIRD-PARTY-NOTICES.txt`.

## Skill: `eu-ai-act-guardrails`

Claude loads this skill when you work on model-client or agent-tool code. It carries the same rules as the commands: use the real exports, read secrets from the environment, and do not describe a storage region or a legal outcome.

## Optional hint hook (off by default)

Installing the plugin registers no hook. If you want a hint after Claude edits a file that has an unwrapped model client, copy `hooks/hooks.example.json` to `hooks/hooks.json` in the installed plugin. The hint script reads only the edited file, skips `.env` files, makes no network call and writes nothing.

## What Spurvik records

The telemetry event carries keyed fingerprints, model version, temperature and latency. The control plane rejects prompt or output text. Each wrapped call returns a provenance record with an HMAC-SHA-256 signature made with your signing secret. A match shows the signed fields still match the HMAC-SHA-256 signature made with your signing secret. It does not show that a notice was shown, that output is marked, or that your system meets the Act.
