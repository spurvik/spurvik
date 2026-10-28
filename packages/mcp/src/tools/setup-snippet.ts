import {
  DOES_NOT_MARK,
  RISK_TIER_SAMPLE_COMMENT,
  UNKNOWN_FRAMEWORK,
  UNKNOWN_RUNTIME,
} from "../copy.js";
import { sdkExportNames } from "../sdk-exports.js";

export const FRAMEWORKS = [
  "openai",
  "anthropic",
  "google-genai",
  "vercel-ai-sdk",
  "mastra",
  "openai-agents",
  "langgraph",
] as const;
export const RUNTIMES = ["node", "next", "vercel", "supabase-edge"] as const;
export type Framework = (typeof FRAMEWORKS)[number];
export type Runtime = (typeof RUNTIMES)[number];

const REQUIRE_ENV = `function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(\`Missing \${name}. Set it in the environment.\`);
  return value;
}`;

const BOUNDED_FLUSH = `function boundedFlush(task: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limited = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, 3_000);
  });
  const settled = task.then(
    () => undefined,
    () => undefined,
  );
  return Promise.race([settled, limited]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}`;

function isFramework(value: string): value is Framework {
  return (FRAMEWORKS as readonly string[]).includes(value);
}

function isRuntime(value: string): value is Runtime {
  return (RUNTIMES as readonly string[]).includes(value);
}

function configLiteral(serverless: boolean): string {
  const lines = [
    "{",
    '    apiKey: requireEnv("SPURVIK_API_KEY"),',
    '    signingSecret: requireEnv("SPURVIK_SIGNING_SECRET"),',
    '    contentHash: { mode: "keyed", secret: requireEnv("SPURVIK_CONTENT_HASH_SECRET") },',
    '    baseUrl: requireEnv("SPURVIK_BASE_URL"),',
    `    riskTier: "limited_art50", // ${RISK_TIER_SAMPLE_COMMENT}`,
    "    article50Disclosure: false, // Set true only when the app shows an interaction notice.",
  ];
  if (serverless) lines.push("    registerProcessHooks: false,");
  lines.push("    telemetry: { flushTimeoutMs: 3_000 },");
  lines.push("  }");
  return lines.join("\n");
}

function runtimeImport(runtime: Runtime): string {
  if (runtime === "next") return 'import { after } from "next/server";';
  if (runtime === "vercel") return 'import { waitUntil } from "@vercel/functions";';
  return "";
}

function runtimeDeclare(runtime: Runtime): string {
  if (runtime !== "supabase-edge") return "";
  return `declare const EdgeRuntime: {
  waitUntil(task: Promise<void>): void;
};`;
}

function providerFlush(runtime: Runtime): string {
  if (runtime === "node") return "";
  if (runtime === "next") return "  after(() => client._spurvik.flush());";
  if (runtime === "vercel") return "  waitUntil(client._spurvik.flush());";
  return "  EdgeRuntime.waitUntil(client._spurvik.flush());";
}

function middlewareFlush(runtime: Runtime): string {
  if (runtime === "node") return "";
  if (runtime === "next") return "  after(() => spurvik().flush());";
  if (runtime === "vercel") return "  waitUntil(spurvik().flush());";
  return "  EdgeRuntime.waitUntil(spurvik().flush());";
}

function nodeShutdown(expr: string): string {
  return `process.once("SIGTERM", () => {
  void boundedFlush(${expr}).finally(() => process.exit(0));
});`;
}

function header(): string {
  return [
    "// The SDK logs the call and attaches an HMAC receipt. It does not mark content.",
    "// @spurvik/sdk is version 0.1.0, private, and not on npm. Inside this monorepo the dependency is workspace:*.",
  ].join("\n");
}

function holderFlush(runtime: Runtime, call: string): string {
  if (runtime === "node") return "";
  if (runtime === "next") return `  after(() => ${call});`;
  if (runtime === "vercel") return `  waitUntil(${call});`;
  return `  EdgeRuntime.waitUntil(${call});`;
}

function mastraSource(runtime: Runtime): string {
  const { provenanceFromMetadata, withSpurvikMastra } = sdkExportNames;
  const serverless = runtime !== "node";
  const imports = [
    'import type { LanguageModelV4 } from "@ai-sdk/provider";',
    'import { Agent } from "@mastra/core/agent";',
    'import { verifyProvenanceSignature } from "@spurvik/core";',
    `import { ${provenanceFromMetadata}, ${withSpurvikMastra} } from "@spurvik/sdk/mastra";`,
    runtimeImport(runtime),
  ].filter((line) => line.length > 0);
  const parts = [
    header(),
    "",
    imports.join("\n"),
    "",
    runtimeDeclare(runtime),
    REQUIRE_ENV,
    "",
    runtime === "node" ? `${BOUNDED_FLUSH}\n` : "",
    `let active: ReturnType<typeof ${withSpurvikMastra}> | undefined;`,
    "",
    "function bind(model: LanguageModelV4) {",
    `  active ??= ${withSpurvikMastra}(model, ${configLiteral(serverless)});`,
    "  return active;",
    "}",
    "",
    "export async function run(model: LanguageModelV4) {",
    "  const wrapped = bind(model);",
    "  const agent = new Agent({",
    '    id: "support",',
    '    name: "support",',
    '    instructions: "Answer briefly.",',
    "    model: wrapped.model,",
    "  });",
    '  const generated = await agent.generate("Hello");',
    `  const record = ${provenanceFromMetadata}(generated.providerMetadata as Parameters<typeof ${provenanceFromMetadata}>[0]);`,
    "  if (record) await verifyProvenanceSignature(record, requireEnv(\"SPURVIK_SIGNING_SECRET\"));",
    holderFlush(runtime, "active?.flush() ?? Promise.resolve()"),
    "  return record;",
    "}",
    "",
    runtime === "node" ? nodeShutdown("active?.flush() ?? Promise.resolve()") : "",
  ];
  return parts.filter((part) => part !== "").join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

function agentsSource(runtime: Runtime): string {
  const { provenanceFromAgentsResponse, withSpurvikModelProvider } = sdkExportNames;
  const serverless = runtime !== "node";
  const imports = [
    'import { Agent, Runner, type ModelProvider } from "@openai/agents";',
    'import { verifyProvenanceSignature } from "@spurvik/core";',
    `import { ${provenanceFromAgentsResponse}, ${withSpurvikModelProvider} } from "@spurvik/sdk/openai-agents";`,
    runtimeImport(runtime),
  ].filter((line) => line.length > 0);
  const parts = [
    header(),
    "",
    imports.join("\n"),
    "",
    runtimeDeclare(runtime),
    REQUIRE_ENV,
    "",
    runtime === "node" ? `${BOUNDED_FLUSH}\n` : "",
    `let active: ReturnType<typeof ${withSpurvikModelProvider}> | undefined;`,
    "",
    "function bind(inner: ModelProvider) {",
    `  active ??= ${withSpurvikModelProvider}(inner, ${configLiteral(serverless)});`,
    "  return active;",
    "}",
    "",
    "export async function run(inner: ModelProvider) {",
    "  const provider = bind(inner);",
    "  const runner = new Runner({ modelProvider: provider });",
    "  const agent = new Agent({",
    '    name: "support",',
    '    instructions: "Answer briefly.",',
    "  });",
    '  const result = await runner.run(agent, "Hello");',
    "  const response = result.rawResponses[0];",
    `  const record = ${provenanceFromAgentsResponse}(response);`,
    "  if (record) await verifyProvenanceSignature(record, requireEnv(\"SPURVIK_SIGNING_SECRET\"));",
    holderFlush(runtime, "active?.flush() ?? Promise.resolve()"),
    "  return record;",
    "}",
    "",
    runtime === "node" ? nodeShutdown("active?.flush() ?? Promise.resolve()") : "",
  ];
  return parts.filter((part) => part !== "").join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

function langgraphSource(runtime: Runtime): string {
  const {
    provenanceFromLangGraphState,
    resolveLangGraphInterrupts,
    spurvikInterrupt,
    withSpurvikLangGraph,
  } = sdkExportNames;
  const serverless = runtime !== "node";
  const imports = [
    'import { Command, type CompiledStateGraph } from "@langchain/langgraph";',
    'import { verifyProvenanceSignature } from "@spurvik/core";',
    `import { ${provenanceFromLangGraphState}, ${resolveLangGraphInterrupts}, ${spurvikInterrupt}, ${withSpurvikLangGraph} } from "@spurvik/sdk/langgraph";`,
    runtimeImport(runtime),
  ].filter((line) => line.length > 0);
  const parts = [
    header(),
    "",
    imports.join("\n"),
    "",
    runtimeDeclare(runtime),
    REQUIRE_ENV,
    "",
    runtime === "node" ? `${BOUNDED_FLUSH}\n` : "",
    "type RunnableGraph = CompiledStateGraph<Record<string, unknown>, Record<string, unknown>>;",
    `let active: ReturnType<typeof ${withSpurvikLangGraph}> | undefined;`,
    `let spurvikConfig: Parameters<typeof ${withSpurvikLangGraph}>[1] | undefined;`,
    "",
    "function bind(compiled: RunnableGraph) {",
    `  spurvikConfig ??= ${configLiteral(serverless)};`,
    `  active ??= ${withSpurvikLangGraph}(compiled, spurvikConfig);`,
    "  return active;",
    "}",
    "",
    "export async function run(compiled: RunnableGraph) {",
    "  const wrapped = bind(compiled);",
    "  const config = spurvikConfig;",
    "  if (!config) throw new Error(\"Missing Spurvik config.\");",
    "  const state = await wrapped.invoke({});",
    `  const record = ${provenanceFromLangGraphState}(state);`,
    `  const decision = await ${spurvikInterrupt}(`,
    '    { actionName: "send_message", callId: "call_1", payload: { id: "m_1" } },',
    "    config,",
    "  );",
    "  const command = new Command(decision.command);",
    `  const batch = await ${resolveLangGraphInterrupts}([], config);`,
    "  const resumed = new Command(batch.command);",
    "  void command;",
    "  void resumed;",
    "  if (record) await verifyProvenanceSignature(record, requireEnv(\"SPURVIK_SIGNING_SECRET\"));",
    holderFlush(runtime, "active?.flush() ?? Promise.resolve()"),
    "  return record;",
    "}",
    "",
    runtime === "node" ? nodeShutdown("active?.flush() ?? Promise.resolve()") : "",
  ];
  return parts.filter((part) => part !== "").join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

function providerSource(framework: "openai" | "anthropic" | "google-genai", runtime: Runtime): string {
  const { provenanceOf, withSpurvik } = sdkExportNames;
  const serverless = runtime !== "node";
  const clients = {
    openai: {
      importLine: 'import OpenAI from "openai";',
      typeName: "OpenAI",
      construct: 'new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") })',
      call: `const completion = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hello" }],
  });
  const record = ${provenanceOf}(completion);`,
    },
    anthropic: {
      importLine: 'import Anthropic from "@anthropic-ai/sdk";',
      typeName: "Anthropic",
      construct: 'new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") })',
      call: `const message = await client.messages.create({
    model: "claude-3-5-sonnet-latest",
    max_tokens: 16,
    messages: [{ role: "user", content: "Hello" }],
  });
  const record = ${provenanceOf}(message);`,
    },
    "google-genai": {
      importLine: 'import { GoogleGenAI } from "@google/genai";',
      typeName: "GoogleGenAI",
      construct: 'new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") })',
      call: `const generated = await client.models.generateContent({
    model: "gemini-2.0-flash",
    contents: "Hello",
  });
  const record = ${provenanceOf}(generated);`,
    },
  } as const;
  const client = clients[framework];
  const imports = [
    client.importLine,
    `import { ${provenanceOf}, ${withSpurvik} } from "@spurvik/sdk";`,
    runtimeImport(runtime),
  ].filter((line) => line.length > 0);
  const parts = [
    header(),
    "",
    imports.join("\n"),
    "",
    runtimeDeclare(runtime),
    REQUIRE_ENV,
    "",
    runtime === "node" ? `${BOUNDED_FLUSH}\n` : "",
    `let provider: ${client.typeName} | undefined;`,
    `let wrapped: ReturnType<typeof ${withSpurvik}<${client.typeName}>> | undefined;`,
    "",
    "function aiClient() {",
    `  provider ??= ${client.construct};`,
    `  wrapped ??= ${withSpurvik}(provider, ${configLiteral(serverless)});`,
    "  return wrapped;",
    "}",
    "",
    "export async function run() {",
    "  const client = aiClient();",
    client.call,
    providerFlush(runtime),
    "  return record;",
    "}",
    "",
    runtime === "node" ? nodeShutdown("wrapped?._spurvik.flush() ?? Promise.resolve()") : "",
  ];
  return parts.filter((part) => part !== "").join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

function middlewareSource(runtime: Runtime): string {
  const { provenanceFromMetadata, spurvikMiddleware } = sdkExportNames;
  const serverless = runtime !== "node";
  const imports = [
    `import { ${provenanceFromMetadata}, ${spurvikMiddleware} } from "@spurvik/sdk/ai";`,
    'import { gateway, generateText, wrapLanguageModel } from "ai";',
    runtimeImport(runtime),
  ].filter((line) => line.length > 0);
  const parts = [
    header(),
    "",
    imports.join("\n"),
    "",
    runtimeDeclare(runtime),
    REQUIRE_ENV,
    "",
    runtime === "node" ? `${BOUNDED_FLUSH}\n` : "",
    `let middleware: ReturnType<typeof ${spurvikMiddleware}> | undefined;`,
    "",
    "function spurvik() {",
    `  middleware ??= ${spurvikMiddleware}(${configLiteral(serverless)});`,
    "  return middleware;",
    "}",
    "",
    "export async function run() {",
    "  const model = wrapLanguageModel({",
    '    model: gateway(process.env.AI_MODEL?.trim() || "openai/gpt-4o"),',
    "    middleware: spurvik(),",
    "  });",
    '  const generated = await generateText({ model, prompt: "Hello" });',
    `  const record = ${provenanceFromMetadata}(generated.providerMetadata);`,
    middlewareFlush(runtime),
    "  return record;",
    "}",
    "",
    runtime === "node" ? nodeShutdown("middleware?.flush() ?? Promise.resolve()") : "",
  ];
  return parts.filter((part) => part !== "").join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

/** TypeScript source of the setup snippet, with no surrounding prose. */
export function setupSnippetSource(framework: string, runtime: string): string {
  if (!isFramework(framework)) throw new Error(UNKNOWN_FRAMEWORK);
  if (!isRuntime(runtime)) throw new Error(UNKNOWN_RUNTIME);
  if (framework === "vercel-ai-sdk") return middlewareSource(runtime);
  if (framework === "mastra") return mastraSource(runtime);
  if (framework === "openai-agents") return agentsSource(runtime);
  if (framework === "langgraph") return langgraphSource(runtime);
  return providerSource(framework, runtime);
}

/** Tool text: a short note, then the snippet. */
export function setupSnippet(framework: string, runtime: string): string {
  const source = setupSnippetSource(framework, runtime);
  const lines = [
    `Framework: ${framework}. Runtime: ${runtime}.`,
    "Paste the snippet into the app that calls the model. Keys are read from the environment when the function runs. A missing key throws. The value is not logged.",
    `\`riskTier\`: ${RISK_TIER_SAMPLE_COMMENT}`,
    `The SDK logs the call and attaches an HMAC receipt. ${DOES_NOT_MARK}`,
  ];
  if (framework === "vercel-ai-sdk") {
    lines.push(
      "This framework uses spurvikMiddleware with wrapLanguageModel. The snippet does not call withSpurvik.",
    );
  } else if (framework === "mastra") {
    lines.push("This snippet calls withSpurvikMastra.");
  } else if (framework === "openai-agents") {
    lines.push("This snippet calls withSpurvikModelProvider.");
  } else if (framework === "langgraph") {
    lines.push("This snippet calls withSpurvikLangGraph and spurvikInterrupt.");
  } else {
    lines.push("This snippet calls withSpurvik on the provider client.");
  }
  if (runtime === "vercel") {
    lines.push(
      "Install @vercel/functions in the app that calls waitUntil. This monorepo does not depend on that package.",
    );
  }
  if (runtime !== "node") {
    lines.push(
      "registerProcessHooks is off. Flush once with the helper for this runtime. The isolate may stop before the process exit hook.",
    );
  }
  return `${lines.join("\n")}\n\n\`\`\`ts\n${source}\`\`\`\n`;
}
