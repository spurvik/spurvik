import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ATTRIBUTION_FIELD,
  BADGE_DESCRIPTION,
  BADGE_TITLE,
  BATCH_DESCRIPTION,
  BATCH_DOMAINS_FIELD,
  BATCH_TITLE,
  C2PA_DESCRIPTION,
  C2PA_TITLE,
  C2PA_URL_FIELD,
  CLASSIFY_DESCRIPTION,
  CLASSIFY_LOCALE_FIELD,
  CLASSIFY_SITE_DOMAIN_FIELD,
  CLASSIFY_TITLE,
  DECISIONS_FIELD,
  DIRECTORY_FIELD,
  DOMAIN_FIELD,
  FIND_DESCRIPTION,
  FIND_TITLE,
  FRAMEWORK_FIELD,
  INTERACTS_FIELD,
  LOCALE_FIELD,
  MARKING_DESCRIPTION,
  MARKING_TITLE,
  POSITION_FIELD,
  READ_ONLY_ANNOTATIONS,
  READ_ONLY_OPEN_WORLD_ANNOTATIONS,
  RECEIPT_DESCRIPTION,
  RECEIPT_FIELD,
  RECEIPT_TITLE,
  RUNTIME_FIELD,
  SCAN_DESCRIPTION,
  SCAN_TITLE,
  SCAN_URL_FIELD,
  SERVER_INSTRUCTIONS,
  SETUP_DESCRIPTION,
  SETUP_DOMAIN_FIELD,
  SETUP_LOCALE_FIELD,
  SETUP_TITLE,
  SIGNING_INPUT_HELP,
  SURFACE_FIELD,
  SYNTHETIC_FIELD,
  SYSTEM_NAME_FIELD,
  THEME_FIELD,
  USE_CASE_FIELD,
  VQ_DESCRIPTION,
  VQ_DOMAIN_FIELD,
  VQ_GENERATES_MEDIA_FIELD,
  VQ_HIGH_RISK_ACTIONS_FIELD,
  VQ_LOCALE_FIELD,
  VQ_PLAN_FIELD,
  VQ_PROVIDER_FIELD,
  VQ_TITLE,
} from "./copy.js";
import {
  badgeNextSteps,
  classifyNextSteps,
  FIND_NEXT_STEPS,
  MARKING_NEXT_STEPS,
  RECEIPT_NEXT_STEPS,
  setupNextSteps,
} from "./next-steps.js";
import { generateArt50Badge } from "./tools/art50-badge.js";
import { BADGE_POSITIONS, BADGE_THEMES } from "./tools/badge-copy.js";
import { BATCH_MAX_DOMAINS, batchScanDomains } from "./tools/batch-scan-domains.js";
import { checkImageC2paUrl, type CheckImageC2paDeps } from "./tools/check-image-c2pa-url.js";
import { classifyAiActRisk, MAX_USE_CASE_CHARS, RISK_DOMAINS } from "./tools/classify-risk.js";
import { explainReceipt, knownSigningSecrets, resolveSigningSecret, scrubSecrets } from "./tools/explain-receipt.js";
import { scanWorkspace } from "./tools/find-unwrapped.js";
import { markingHooksText } from "./tools/marking-hooks.js";
import { scanLiveUrl, type ScanLiveUrlDeps } from "./tools/scan-live-url.js";
import { FRAMEWORKS, isPythonFramework, RUNTIMES, setupSnippet } from "./tools/setup-snippet.js";
import {
  MAX_QUESTIONNAIRE_DOMAIN_CHARS,
  QUESTIONNAIRE_LOCALES,
  QUESTIONNAIRE_PLANS,
  QUESTIONNAIRE_PROVIDERS,
  vendorQuestionnaireAnswers,
} from "./tools/vendor-questionnaire.js";
import { MCP_VERSION } from "./version.js";

function text(value: string): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: value }] };
}

type TextContent = { type: "text"; text: string };

/** Appends a Markdown block (for example `## Next steps`) as a second text item, so the first item stays valid JSON. */
function withMarkdown(
  result: { content: TextContent[]; isError?: true },
  markdown: string | null,
): { content: TextContent[]; isError?: true } {
  if (result.isError || !markdown) return result;
  return { content: [...result.content, { type: "text", text: markdown }] };
}

type ToolOutcome<T> =
  | { ok: true; result: T }
  | { ok: false; error: string; message: string; rejected?: ReadonlyArray<{ position: number; error: string }> };

/** JSON tool result. A rejected input is returned as `isError: true` with `{ error, message }` (and `rejected` positions for a batch). */
function json<T>(outcome: ToolOutcome<T>): { content: [{ type: "text"; text: string }]; isError?: true } {
  if (!outcome.ok) {
    const body = outcome.rejected
      ? { error: outcome.error, message: outcome.message, rejected: outcome.rejected }
      : { error: outcome.error, message: outcome.message };
    return { ...text(JSON.stringify(body, null, 2)), isError: true };
  }
  return text(JSON.stringify(outcome.result, null, 2));
}

/** Version advertised on initialize. Reads the package next to the built entry, otherwise MCP_VERSION. */
export function serverVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "..", "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.length > 0) return parsed.version;
  } catch {
    return MCP_VERSION;
  }
  return MCP_VERSION;
}

export interface ServerOptions {
  /** Test hook for spurvik_scan_live_url and spurvik_batch_scan_domains. Defaults to globalThis.fetch with an 8 s timeout. */
  scan?: ScanLiveUrlDeps;
  /** Test hook for spurvik_check_image_c2pa_url. Defaults to globalThis.fetch with a 15 s timeout. */
  c2pa?: CheckImageC2paDeps;
}

/**
 * Stdio MCP server with 10 tools. Tools are read-only; only spurvik_scan_live_url, spurvik_batch_scan_domains and
 * spurvik_check_image_c2pa_url call the network (console.spurvik.com).
 */
export function createServer(workspaceRoot: string, options: ServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: "spurvik", version: serverVersion() },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "spurvik_setup_snippet",
    {
      title: SETUP_TITLE,
      description: SETUP_DESCRIPTION,
      inputSchema: {
        framework: z.enum(FRAMEWORKS).describe(FRAMEWORK_FIELD),
        runtime: z.enum(RUNTIMES).optional().describe(RUNTIME_FIELD),
        domain: z.string().max(MAX_QUESTIONNAIRE_DOMAIN_CHARS).optional().describe(SETUP_DOMAIN_FIELD),
        locale: z.string().max(16).optional().describe(SETUP_LOCALE_FIELD),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ framework, runtime, domain, locale }) =>
      text(
        `${setupSnippet(framework, runtime ?? (isPythonFramework(framework) ? "python" : "node"), { domain, locale })}${setupNextSteps(domain, locale)}`,
      ),
  );

  server.registerTool(
    "spurvik_find_unwrapped_calls",
    {
      title: FIND_TITLE,
      description: FIND_DESCRIPTION,
      inputSchema: {
        directory: z.string().min(1).describe(DIRECTORY_FIELD),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ directory }) => text(`${scanWorkspace(workspaceRoot, directory)}${FIND_NEXT_STEPS}`),
  );

  server.registerTool(
    "spurvik_explain_receipt",
    {
      title: RECEIPT_TITLE,
      description: RECEIPT_DESCRIPTION,
      inputSchema: {
        receipt: z.string().min(1).describe(RECEIPT_FIELD),
        signingSecret: z.string().optional().describe(SIGNING_INPUT_HELP),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ receipt, signingSecret }) => {
      let secret: string | undefined;
      try {
        secret = resolveSigningSecret(signingSecret);
        // The links are static, so they cannot carry a secret; they are added on success only.
        return text(`${await explainReceipt(receipt, secret)}${RECEIPT_NEXT_STEPS}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "The receipt could not be explained.";
        throw new Error(scrubSecrets(message, knownSigningSecrets(secret ?? signingSecret)));
      }
    },
  );

  server.registerTool(
    "spurvik_marking_hooks",
    {
      title: MARKING_TITLE,
      description: MARKING_DESCRIPTION,
      inputSchema: {
        surface: z.enum(["text", "media", "both"]).optional().describe(SURFACE_FIELD),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ surface }) => text(`${markingHooksText(surface ?? "both")}${MARKING_NEXT_STEPS}`),
  );

  server.registerTool(
    "spurvik_scan_live_url",
    {
      title: SCAN_TITLE,
      description: SCAN_DESCRIPTION,
      inputSchema: {
        url: z.string().min(1).max(2048).describe(SCAN_URL_FIELD),
      },
      annotations: READ_ONLY_OPEN_WORLD_ANNOTATIONS,
    },
    async ({ url }) => json(await scanLiveUrl(url, options.scan)),
  );

  server.registerTool(
    "spurvik_batch_scan_domains",
    {
      title: BATCH_TITLE,
      description: BATCH_DESCRIPTION,
      inputSchema: {
        domains: z.array(z.string().min(1).max(2048)).min(1).max(BATCH_MAX_DOMAINS).describe(BATCH_DOMAINS_FIELD),
      },
      annotations: READ_ONLY_OPEN_WORLD_ANNOTATIONS,
    },
    async ({ domains }) => json(await batchScanDomains(domains, options.scan)),
  );

  server.registerTool(
    "spurvik_check_image_c2pa_url",
    {
      title: C2PA_TITLE,
      description: C2PA_DESCRIPTION,
      inputSchema: {
        url: z.string().min(1).max(2048).describe(C2PA_URL_FIELD),
      },
      annotations: READ_ONLY_OPEN_WORLD_ANNOTATIONS,
    },
    async ({ url }) => json(await checkImageC2paUrl(url, options.c2pa)),
  );

  server.registerTool(
    "spurvik_classify_ai_act_risk",
    {
      title: CLASSIFY_TITLE,
      description: CLASSIFY_DESCRIPTION,
      inputSchema: {
        useCase: z.string().min(1).max(MAX_USE_CASE_CHARS).describe(USE_CASE_FIELD),
        domain: z.enum(RISK_DOMAINS).optional().describe(DOMAIN_FIELD),
        interactsWithHumans: z.boolean().optional().describe(INTERACTS_FIELD),
        generatesSyntheticMedia: z.boolean().optional().describe(SYNTHETIC_FIELD),
        makesAutomatedDecisionsAboutPeople: z.boolean().optional().describe(DECISIONS_FIELD),
        siteDomain: z.string().max(MAX_QUESTIONNAIRE_DOMAIN_CHARS).optional().describe(CLASSIFY_SITE_DOMAIN_FIELD),
        locale: z.string().max(16).optional().describe(CLASSIFY_LOCALE_FIELD),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => {
      const outcome = classifyAiActRisk(args);
      return withMarkdown(json(outcome), outcome.ok ? classifyNextSteps(outcome.result.tier, args.siteDomain, args.locale) : null);
    },
  );

  server.registerTool(
    "spurvik_generate_art50_badge",
    {
      title: BADGE_TITLE,
      description: BADGE_DESCRIPTION,
      inputSchema: {
        locale: z.string().max(16).optional().describe(LOCALE_FIELD),
        position: z.enum(BADGE_POSITIONS).optional().describe(POSITION_FIELD),
        theme: z.enum(BADGE_THEMES).optional().describe(THEME_FIELD),
        systemName: z.string().max(200).optional().describe(SYSTEM_NAME_FIELD),
        attribution: z.boolean().optional().describe(ATTRIBUTION_FIELD),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => withMarkdown(json(generateArt50Badge(args)), badgeNextSteps(args.systemName)),
  );

  server.registerTool(
    "spurvik_vendor_questionnaire_answers",
    {
      title: VQ_TITLE,
      description: VQ_DESCRIPTION,
      inputSchema: {
        plan: z.enum(QUESTIONNAIRE_PLANS).optional().describe(VQ_PLAN_FIELD),
        provider: z.enum(QUESTIONNAIRE_PROVIDERS).optional().describe(VQ_PROVIDER_FIELD),
        hasHighRiskActions: z.boolean().optional().describe(VQ_HIGH_RISK_ACTIONS_FIELD),
        generatesMedia: z.boolean().optional().describe(VQ_GENERATES_MEDIA_FIELD),
        domain: z.string().max(MAX_QUESTIONNAIRE_DOMAIN_CHARS).optional().describe(VQ_DOMAIN_FIELD),
        locale: z.enum(QUESTIONNAIRE_LOCALES).optional().describe(VQ_LOCALE_FIELD),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => {
      const outcome = vendorQuestionnaireAnswers(args);
      if (!outcome.ok) return json(outcome);
      return text(outcome.text);
    },
  );

  return server;
}
