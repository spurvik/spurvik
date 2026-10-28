# Claude Code submission drafts

## Preconditions, not met yet

Each item must be done before any submission is opened:

1. The MCP server file is inside the plugin directory. A marketplace added from a local clone runs in place. An install from the Claude plugin directory or from a git or GitHub marketplace is copied into Claude's plugin cache, and that copy starts the same file. The server stays local stdio only, private 0.1.0, with no hosted endpoint. No package is published. Other items below are still open before any directory submission.
2. Nathaniel has approved publishing the npm packages himself. The packages are `@spurvik/sdk` and, if used, `@spurvik/mcp`. Both are private at 0.1.0 today.
3. Nathaniel has approved making the repo reachable to installers himself, through a public repo or a public mirror. The public repository is https://github.com/spurvik/spurvik. The plugin tree is https://github.com/spurvik/spurvik/tree/main/plugins/spurvik.
4. The site manifest is served and resolves.
5. QA has passed the plugin.

**Draft, do not submit.**

Nothing in this file was sent to a list, a directory, npm, or another repository. Do not fork, push, or open an issue or pull request outside this repo until the preconditions above are done.

## 4. hesreallyhim/awesome-claude-code

Rules read on 23 October 2026:

- https://github.com/hesreallyhim/awesome-claude-code/blob/main/CONTRIBUTING.md
- Issue form: https://github.com/hesreallyhim/awesome-claude-code/blob/main/.github/ISSUE_TEMPLATE/recommend-resource.yml
- Maintainer note: https://github.com/hesreallyhim/awesome-claude-code/issues/674

The list accepts one recommendation at a time, from a person, through that web form. It rejects a pull request and it rejects `gh`. A resource must be at least 14 days old, with commits after the first day on the default branch, or have at least 100 stars. The link must be public `https`. License detection expects a GitHub repository. A closed repository is a barrier to review. Descriptions are one line, descriptive, and do not address the reader. Issue 674 also says the maintainer will not take a marketplace as a whole, or a repository younger than one week.

**Rules we do not meet yet**

- The plugin is new, so it cannot show 14 days of public history or 100 stars.
- Public repository: https://github.com/spurvik/spurvik. Plugin tree: https://github.com/spurvik/spurvik/tree/main/plugins/spurvik. License detection reads `plugins/spurvik/LICENSE` from that tree.
- The MCP server file is inside the plugin directory. A marketplace added from a local clone runs in place. An install from the Claude plugin directory or from a git or GitHub marketplace is copied into Claude's plugin cache, and that copy starts the same file. Preconditions 2 through 5 are still open before any directory submission. Do not file the issue.

**Category:** Security

**Entry text** (form field Description, one line):

Spurvik is a Claude Code plugin with check, wrap, and engineering-summary commands that help you add withSpurvik for OpenAI, Anthropic, and Google GenAI clients, spurvikMiddleware for the Vercel AI SDK, withSpurvikMastra for Mastra, withSpurvikModelProvider for OpenAI Agents, and withSpurvikLangGraph for LangGraph, designed to support Art. 50 notices and, for high-risk AI systems, Art. 12 record-keeping and Art. 14 human oversight.

**Form fields when the preconditions are met**

- Display Name: Spurvik
- Category: Security
- Link: https://github.com/spurvik/spurvik
- Author Name: EyeTea Solutions ApS
- Author Link: https://spurvik.com
- Description: the entry text above

**Issue title** (the form sets this; do not open it): `[Resource]: Spurvik`

**Pull request title** (do not open; the list rejects pull requests): `Add Spurvik to Awesome Claude Code`

**Pull request body** (do not open):

```text
Do not open this pull request. CONTRIBUTING.md requires the web issue form.

Category: Security
Display name: Spurvik
Description: Spurvik is a Claude Code plugin with check, wrap, and engineering-summary commands that help you add withSpurvik for OpenAI, Anthropic, and Google GenAI clients, spurvikMiddleware for the Vercel AI SDK, withSpurvikMastra for Mastra, withSpurvikModelProvider for OpenAI Agents, and withSpurvikLangGraph for LangGraph, designed to support Art. 50 notices and, for high-risk AI systems, Art. 12 record-keeping and Art. 14 human oversight.
```

## 1. Anthropic Claude Code Plugin Directory web form

Rules read on 23 October 2026:

- Submit page: https://claude.com/docs/plugins/submit
- Portal: https://claude.ai/directory/manage
- Checklist: https://claude.com/docs/plugins/pre-submission-checklist
- Mirror README: https://github.com/anthropics/claude-plugins-community/blob/main/README.md

The directory reads a plugin from a github.com repository. The submission kind is **Plugin bundle**. The docs do not ask for a topic category. After approval the community mirror lists it, and Claude Code installs it as `spurvik@claude-community`. Pull requests to `anthropics/claude-plugins-community` are closed. The Anthropic-maintained marketplace `claude-plugins-official` does not take submissions through this portal. Do not submit an MCP connector with this plugin. The plugin's MCP entry is local stdio only, private 0.1.0, with no hosted endpoint.

The repository may stay private during validation only when a connected GitHub account can push, the Claude GitHub App is installed, and the submitter agrees to a source upload. Publishing still requires a public GitHub repository.

**Rules we do not meet yet**

- The public github.com repository is https://github.com/spurvik/spurvik. The plugin tree is https://github.com/spurvik/spurvik/tree/main/plugins/spurvik.
- Directory publishing still waits on the remaining preconditions in this file.
- A paid Claude plan and a role that can submit are outside this change.
- Directory terms are not accepted here.
- `claude plugin validate --strict ./plugins/spurvik` and `claude plugin validate --strict .` must be re-run on the final release tag before any submission.
- Preconditions 2 through 5 are open before any directory submission. The MCP server file is inside the plugin directory. A marketplace added from a local clone runs in place. An install from the Claude plugin directory or from a git or GitHub marketplace is copied into Claude's plugin cache, and that copy starts the same file. `@spurvik/mcp` and `@spurvik/sdk` stay private at 0.1.0. There is no hosted endpoint.

**Category:** Plugin bundle (submission kind). No topic category is defined on the submit page.

**Entry text** (listing description, from `plugin.json`):

Commands and a skill covering withSpurvik for OpenAI, Anthropic, and Google GenAI clients, spurvikMiddleware for the Vercel AI SDK, withSpurvikMastra for Mastra, withSpurvikModelProvider for OpenAI Agents, and withSpurvikLangGraph for LangGraph. Designed to support Art. 50 notices and, for high-risk AI systems, Art. 12 record-keeping and Art. 14 human oversight.

**Portal fields when the preconditions are met**

- What would you like to submit: Plugin bundle
- Repository: https://github.com/spurvik/spurvik
- Plugin path: `plugins/spurvik`
- Tracked branch: `main`, and only after this plugin is merged
- Do not submit an MCP connector in the same step

**Pull request title** (do not open; the mirror closes pull requests): `List the Spurvik plugin in the community directory`

**Pull request body** (do not open):

```text
Do not open this pull request. anthropics/claude-plugins-community is a read-only mirror. Submissions go through https://claude.ai/directory/manage as a Plugin bundle.

Plugin path: plugins/spurvik
Description: Commands and a skill covering withSpurvik for OpenAI, Anthropic, and Google GenAI clients, spurvikMiddleware for the Vercel AI SDK, withSpurvikMastra for Mastra, withSpurvikModelProvider for OpenAI Agents, and withSpurvikLangGraph for LangGraph. Designed to support Art. 50 notices and, for high-risk AI systems, Art. 12 record-keeping and Art. 14 human oversight.
```

## Bundled MCP tools and the staged website manifest

The plugin MCP entry is local stdio only, private 0.1.0, with no hosted endpoint. `plugins/spurvik/.mcp.json` starts `node` with `${CLAUDE_PLUGIN_ROOT}/bin/spurvik-mcp.mjs --root ${CLAUDE_PROJECT_DIR}`. `bin/spurvik-mcp.mjs` exposes four read-only tools: `spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, and `spurvik_marking_hooks`. They do not call the Spurvik API or any other network.

`docs/distribution/spurvik-com-marketplace.json` is the staged website manifest for `https://spurvik.com/.claude-plugin/marketplace.json`. It is a pre-release draft. Do not submit it, and do not serve that file from this repository. `site/.claude-plugin/marketplace.json` is absent here on purpose.

## 2. Claude Code Marketplace JSON

`.claude-plugin/marketplace.json` and `docs/distribution/spurvik-com-marketplace.json` are the two marketplace catalogs in this tree. Both name `spurvik@spurvik-marketplace` at `0.1.0` and point at `plugins/spurvik`. The plugin description covers OpenAI, Anthropic, Google GenAI, the Vercel AI SDK, Mastra, OpenAI Agents, and LangGraph. `spurvik_setup_snippet` returns a snippet for those seven frameworks. `spurvik_find_unwrapped_calls` also reports an unwrapped LangGraph `StateGraph` and a bare `interrupt()` when `withSpurvikLangGraph` or `spurvikInterrupt` is missing.

**Draft, do not submit.** The website catalog's git source is https://github.com/spurvik/spurvik.git with path `plugins/spurvik` on `main`. Serve that catalog only after the remaining preconditions are done.

## 3. Cursor Directory / Cursor MCP Directory

Cursor can load the same local stdio server from `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "spurvik": {
      "command": "node",
      "args": ["packages/mcp/dist/index.js", "--root", "${workspaceFolder}"]
    }
  }
}
```

The Claude plugin copy starts `bin/spurvik-mcp.mjs`. A Cursor directory listing for https://github.com/spurvik/spurvik should describe the same four tools and the seven frameworks: OpenAI, Anthropic, Google GenAI, Vercel AI SDK, Mastra, OpenAI Agents, and LangGraph. There is no hosted endpoint in the plugin. The console Streamable HTTP route is a separate product surface at `https://console.spurvik.com/api/mcp`.

**Draft, do not submit.**

## 5. punkpeye/awesome-mcp-servers

Rules for that list ask for a public repository, a short description, and a link that resolves. The public repository is https://github.com/spurvik/spurvik and the plugin tree is https://github.com/spurvik/spurvik/tree/main/plugins/spurvik. This draft is not an open pull request.

**Entry text**

Spurvik local stdio MCP server (`bin/spurvik-mcp.mjs`) with `spurvik_setup_snippet`, `spurvik_find_unwrapped_calls`, `spurvik_explain_receipt`, and `spurvik_marking_hooks`. Setup snippets cover OpenAI, Anthropic, Google GenAI, the Vercel AI SDK, Mastra, OpenAI Agents, and LangGraph. The unwrapped-call scan reports LangGraph `StateGraph` and `interrupt()` when they are not passed through `withSpurvikLangGraph` or `spurvikInterrupt`.

**Pull request title** (do not open): `Add Spurvik local stdio MCP server`

**Draft, do not submit.**

## 6. MCP Registry (`registry.modelcontextprotocol.io` `server.json` draft), Smithery, and Glama MCP Directory

**Draft, do not submit.**

Two transports exist in the product plan. Only the first is live today, and it is the console route, not the Claude plugin:

1. Streamable HTTP at `https://console.spurvik.com/api/mcp`, discovered from `https://spurvik.com/.well-known/mcp.json`.
2. Local stdio from the private `@spurvik/mcp` package at `0.1.0`, started with `node packages/mcp/dist/index.js --root <workspace>` or, inside the Claude plugin, `node` and `bin/spurvik-mcp.mjs`. The plugin stays local stdio only, with no hosted endpoint.

`server.json` draft for the registry (do not publish):

```json
{
  "name": "com.spurvik/mcp",
  "description": "Spurvik setup snippets, unwrapped-call scan, HMAC receipt explanation, and marking-hook notes. Supports OpenAI, Anthropic, Google GenAI, Vercel AI SDK, Mastra, OpenAI Agents, and LangGraph.",
  "version": "0.1.0",
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://console.spurvik.com/api/mcp"
    }
  ]
}
```

Smithery and Glama drafts should name the same HTTP URL and, after `@spurvik/mcp` is published, the local stdio package. Until then, write "private 0.1.0, not published" and do not submit either listing. The scan tool reports unwrapped LangGraph `StateGraph` and `interrupt()` calls.

## 7. Nathaniel's Release-Day Submission Runbook

Do this in order, and only when Nathaniel decides to publish `0.1.0` and open the directory submissions. The public repository is https://github.com/spurvik/spurvik.

1. Keep every workspace package at `"version": "0.1.0"` until the publish commit. Leave `"private": true` until that commit removes it for the packages Nathaniel chooses to publish.
2. Run `pnpm build`, `pnpm typecheck`, `pnpm lint`, and `pnpm turbo test --force`.
3. Run `node scripts/ci/no-default-keys.mjs`, `bash scripts/ci/no-default-keys.sh`, and `node --test scripts/ci/plugin-manifest.test.mjs`.
4. Run `node packages/mcp/scripts/bundle-plugin.mjs --check` and `npm pack --dry-run` in `packages/core`, `packages/sdk`, `packages/react`, `packages/mcp`, and `packages/c2pa`.
5. Confirm https://github.com/spurvik/spurvik/tree/main/plugins/spurvik shows `plugins/spurvik/LICENSE`.
6. Publish the packages Nathaniel approves with `npm publish` from each package directory. Do not publish from a one-shot installer command.
7. Serve `https://spurvik.com/.claude-plugin/marketplace.json` from `docs/distribution/spurvik-com-marketplace.json`, and `https://spurvik.com/.well-known/mcp.json` for the console route.
8. Submit, in this order: the Claude Code plugin directory web form, the Cursor directory, `hesreallyhim/awesome-claude-code` through its web form, `punkpeye/awesome-mcp-servers`, then the MCP Registry, Smithery, and Glama drafts in section 6.
9. Stop if any precondition in the list at the top of this file is still open. **Draft, do not submit** until then.

