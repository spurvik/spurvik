import { DOES_NOT_MARK, RISK_TIER_SAMPLE_COMMENT, UNKNOWN_FRAMEWORK, UNKNOWN_RUNTIME, } from "../copy.js";
import { CONCIERGE_PRICE, CONCIERGE_SIGNUP_URL, conciergeSignupUrlFor, ecommerceCockpitUrlFor, hitlCockpitUrlFor, hmacCockpitUrlFor, lovableCockpitUrlFor, mcpCockpitUrlFor, nextjsCockpitUrlFor, PRICE_NOTE, PRO_PRICE, PRO_SIGNUP_URL, proSignupUrlFor, pythonCockpitUrlFor, REPORT_URL, reportUrlFor, supportWidgetCockpitUrlFor, TEAM_PRICE, TEAM_SIGNUP_URL, teamSignupUrlFor, wordpressCockpitUrlFor, workflowCockpitUrlFor, } from "../links.js";
import { sdkExportNames } from "../sdk-exports.js";
import { EU_LANGUAGES, inferLocaleFromDomain } from "./badge-copy.js";
import { publicHostname } from "./public-hostname.js";
export const PYTHON_FRAMEWORKS = ["python", "fastapi", "langchain", "pydantic-ai"];
export const CMS_FRAMEWORKS = ["shopify", "wordpress", "prestashop", "shopware", "cloudflare", "webflow", "framer", "gtm", "html"];
export const WORKFLOW_FRAMEWORKS = ["n8n", "make"];
export const IDE_CI_FRAMEWORKS = ["cursor", "cursor-rules", "claude-code", "vscode", "windsurf", "mcp", "github-actions", "ci"];
export const FRAMEWORKS = [
    "openai",
    "anthropic",
    "google-genai",
    "vercel-ai-sdk",
    "mastra",
    "openai-agents",
    "langgraph",
    ...PYTHON_FRAMEWORKS,
    ...CMS_FRAMEWORKS,
    ...WORKFLOW_FRAMEWORKS,
    ...IDE_CI_FRAMEWORKS,
];
export const RUNTIMES = ["node", "next", "vercel", "supabase-edge", "python"];
const SETUP_FRAMEWORK_ALIASES = {
    gemini: "google-genai",
    google: "google-genai",
    google_genai: "google-genai",
    claude: "anthropic",
    "ai-sdk": "vercel-ai-sdk",
    ai_sdk: "vercel-ai-sdk",
    vercel: "vercel-ai-sdk",
    next: "vercel-ai-sdk",
    nextjs: "vercel-ai-sdk",
    "next.js": "vercel-ai-sdk",
    bolt: "vercel-ai-sdk",
    "bolt.new": "vercel-ai-sdk",
    v0: "vercel-ai-sdk",
    replit: "vercel-ai-sdk",
    lovable: "openai",
    supabase: "openai",
    "supabase-edge": "openai",
    django: "python",
    flask: "python",
    woocommerce: "wordpress",
    elementor: "wordpress",
    divi: "wordpress",
    wp: "wordpress",
    "google-tag-manager": "gtm",
    "tag-manager": "gtm",
    googletagmanager: "gtm",
    shopware6: "shopware",
    "cloudflare-worker": "cloudflare",
    "cf-worker": "cloudflare",
    "c2pa-cdn": "cloudflare",
    copilot: "cursor-rules",
    codex: "cursor-rules",
    "agents-md": "cursor-rules",
    centra: "html",
    dandomain: "html",
    lightspeed: "html",
    intercom: "html",
    "intercom-fin": "html",
    zendesk: "html",
    "zendesk-ai": "html",
    tidio: "html",
    lyro: "html",
    hubspot: "html",
    dixa: "html",
    trengo: "html",
    gorgias: "html",
    crisp: "html",
    freshchat: "html",
    drift: "html",
    livechat: "html",
    helpscout: "html",
    tawk: "html",
    "make.com": "make",
    "github-action": "github-actions",
    hitl: "langgraph",
    slack: "langgraph",
    teams: "langgraph",
    "microsoft-teams": "langgraph",
    approval: "langgraph",
    "human-in-the-loop": "langgraph",
};
const SUPPORT_WIDGET_ALIASES = new Set([
    "intercom",
    "intercom-fin",
    "zendesk",
    "zendesk-ai",
    "tidio",
    "lyro",
    "hubspot",
    "dixa",
    "trengo",
    "gorgias",
    "crisp",
    "freshchat",
    "drift",
    "livechat",
    "helpscout",
    "tawk",
]);
const ECOMMERCE_WIDGET_ALIASES = new Set(["gorgias", "crisp"]);
const SETUP_DEFAULT_RUNTIME_BY_ALIAS = {
    next: "next",
    nextjs: "next",
    "next.js": "next",
    vercel: "vercel",
    lovable: "supabase-edge",
    supabase: "supabase-edge",
    "supabase-edge": "supabase-edge",
};
export function resolveSetupFrameworkAndRuntime(rawFramework, rawRuntime) {
    const lower = rawFramework.trim().toLowerCase();
    const framework = lower === "" ? "openai" : (SETUP_FRAMEWORK_ALIASES[lower] ?? lower);
    const aliasRuntime = SETUP_DEFAULT_RUNTIME_BY_ALIAS[lower];
    const runtime = rawRuntime && rawRuntime.trim()
        ? rawRuntime.trim()
        : (aliasRuntime ?? (isPythonFramework(framework) ? "python" : "node"));
    return { framework, runtime, isLovableAlias: lower === "lovable" };
}
export function isPythonFramework(value) {
    return PYTHON_FRAMEWORKS.includes(value);
}
export function isCmsFramework(value) {
    return CMS_FRAMEWORKS.includes(value);
}
export function isWorkflowFramework(value) {
    return WORKFLOW_FRAMEWORKS.includes(value);
}
export function isIdeCiFramework(value) {
    return IDE_CI_FRAMEWORKS.includes(value);
}
export function isPythonVariant(framework, runtime) {
    return isPythonFramework(framework) || runtime === "python";
}
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
function isFramework(value) {
    return FRAMEWORKS.includes(value);
}
function isRuntime(value) {
    return RUNTIMES.includes(value);
}
function configLiteral(serverless) {
    const lines = [
        "{",
        '    apiKey: requireEnv("SPURVIK_API_KEY"),',
        '    signingSecret: requireEnv("SPURVIK_SIGNING_SECRET"),',
        '    contentHash: { mode: "keyed", secret: requireEnv("SPURVIK_CONTENT_HASH_SECRET") },',
        '    baseUrl: requireEnv("SPURVIK_BASE_URL"), // https://console.spurvik.com (EU Frankfurt fra1)',
        `    riskTier: "limited_art50", // ${RISK_TIER_SAMPLE_COMMENT}`,
        "    article50Disclosure: false, // Set true only when the app shows an interaction notice.",
    ];
    if (serverless)
        lines.push("    registerProcessHooks: false,");
    lines.push("    telemetry: { flushTimeoutMs: 3_000 },");
    lines.push("  }");
    return lines.join("\n");
}
function runtimeImport(runtime) {
    if (runtime === "next")
        return 'import { after } from "next/server";';
    if (runtime === "vercel")
        return 'import { waitUntil } from "@vercel/functions";';
    return "";
}
function runtimeDeclare(runtime) {
    if (runtime !== "supabase-edge")
        return "";
    return `declare const EdgeRuntime: {
  waitUntil(task: Promise<void>): void;
};`;
}
function providerFlush(runtime) {
    if (runtime === "node")
        return "";
    if (runtime === "next")
        return "  after(() => client._spurvik.flush());";
    if (runtime === "vercel")
        return "  waitUntil(client._spurvik.flush());";
    return "  EdgeRuntime.waitUntil(client._spurvik.flush());";
}
function middlewareFlush(runtime) {
    if (runtime === "node")
        return "";
    if (runtime === "next")
        return "  after(() => spurvik().flush());";
    if (runtime === "vercel")
        return "  waitUntil(spurvik().flush());";
    return "  EdgeRuntime.waitUntil(spurvik().flush());";
}
function nodeShutdown(expr) {
    return `process.once("SIGTERM", () => {
  void boundedFlush(${expr}).finally(() => process.exit(0));
});`;
}
/** Published spurvik / spurvik-sdk version interpolated into snippets. Keep in sync with packages/sdk. */
export const SNIPPET_SDK_VERSION = "1.0.14";
function header() {
    return [
        "// The SDK logs the call and attaches an HMAC receipt. It does not mark content.",
        `// Unscoped npm packages: spurvik@${SNIPPET_SDK_VERSION} and spurvik-sdk@${SNIPPET_SDK_VERSION} (MIT, same build).`,
    ].join("\n");
}
function holderFlush(runtime, call) {
    if (runtime === "node")
        return "";
    if (runtime === "next")
        return `  after(() => ${call});`;
    if (runtime === "vercel")
        return `  waitUntil(${call});`;
    return `  EdgeRuntime.waitUntil(${call});`;
}
function mastraSource(runtime) {
    const { provenanceFromMetadata, withSpurvikMastra } = sdkExportNames;
    const serverless = runtime !== "node";
    const imports = [
        'import type { LanguageModelV4 } from "@ai-sdk/provider";',
        'import { Agent } from "@mastra/core/agent";',
        'import { verifyProvenanceSignature } from "spurvik";',
        `import { ${provenanceFromMetadata}, ${withSpurvikMastra} } from "spurvik/mastra";`,
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
function agentsSource(runtime) {
    const { provenanceFromAgentsResponse, withSpurvikModelProvider } = sdkExportNames;
    const serverless = runtime !== "node";
    const imports = [
        'import { Agent, Runner, type ModelProvider } from "@openai/agents";',
        'import { verifyProvenanceSignature } from "spurvik";',
        `import { ${provenanceFromAgentsResponse}, ${withSpurvikModelProvider} } from "spurvik/openai-agents";`,
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
function langgraphSource(runtime) {
    const { provenanceFromLangGraphState, resolveLangGraphInterrupts, spurvikInterrupt, withSpurvikLangGraph, } = sdkExportNames;
    const serverless = runtime !== "node";
    const imports = [
        'import { Command, type CompiledStateGraph } from "@langchain/langgraph";',
        'import { verifyProvenanceSignature } from "spurvik";',
        `import { ${provenanceFromLangGraphState}, ${resolveLangGraphInterrupts}, ${spurvikInterrupt}, ${withSpurvikLangGraph} } from "spurvik/langgraph";`,
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
function providerSource(framework, runtime) {
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
    };
    const client = clients[framework];
    const imports = [
        client.importLine,
        `import { ${provenanceOf}, ${withSpurvik} } from "spurvik";`,
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
function middlewareSource(runtime) {
    const { provenanceFromMetadata, spurvikMiddleware } = sdkExportNames;
    const serverless = runtime !== "node";
    const imports = [
        `import { ${provenanceFromMetadata}, ${spurvikMiddleware} } from "spurvik/ai";`,
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
const PYTHON_GUARD_URL = "https://spurvik.com/r/spurvik_guard.py";
function pythonSource(framework) {
    const provider = framework === "anthropic" ? "anthropic" : framework === "google-genai" ? "google" : "openai";
    const headerLines = [
        `# curl -fsSLO ${PYTHON_GUARD_URL}`,
        "# Python 3.10+ zero-dependency stdlib helper (MIT) — 0 bytes of raw prompt text sent.",
        `# Companion TypeScript/React npm packages: spurvik@${SNIPPET_SDK_VERSION} and spurvik-sdk@${SNIPPET_SDK_VERSION}.`,
        "import time",
    ];
    const body = framework === "fastapi"
        ? [
            "from fastapi import BackgroundTasks, FastAPI",
            "from openai import AsyncOpenAI",
            "from pydantic import BaseModel",
            "from spurvik_guard import art50_badge_html, request_human_approval, send_telemetry_event, verify_signed_callback",
            "",
            "app = FastAPI()",
            "client = AsyncOpenAI()",
            "",
            "class ChatRequest(BaseModel):",
            "    prompt: str",
            "",
            '@app.post("/api/chat")',
            "async def chat_endpoint(req: ChatRequest, background_tasks: BackgroundTasks) -> dict[str, str]:",
            "    t0 = time.perf_counter()",
            '    res = await client.chat.completions.create(model="gpt-4o", messages=[{"role": "user", "content": req.prompt}])',
            '    output = res.choices[0].message.content or ""',
            "    background_tasks.add_task(",
            "        send_telemetry_event,",
            "        req.prompt,",
            "        output,",
            '        model_provider="openai",',
            '        model_version="gpt-4o",',
            "        latency_ms=int((time.perf_counter() - t0) * 1000),",
            "    )",
            '    return {"reply": output, "art50Badge": art50_badge_html(system_name="Support AI", locale="en")}',
        ]
        : framework === "langchain" || framework === "langgraph"
            ? [
                "from langchain_openai import ChatOpenAI",
                "from spurvik_guard import art50_badge_html, request_human_approval, send_telemetry_event, verify_signed_callback",
                "",
                'llm = ChatOpenAI(model="gpt-4o")',
                "",
                "def run_chain(prompt: str) -> str:",
                "    t0 = time.perf_counter()",
                "    reply = llm.invoke(prompt)",
                "    output = str(reply.content)",
                "    send_telemetry_event(",
                "        prompt,",
                "        output,",
                '        model_provider="openai",',
                '        model_version="gpt-4o",',
                "        latency_ms=int((time.perf_counter() - t0) * 1000),",
                "    )",
                "    return output",
            ]
            : framework === "pydantic-ai"
                ? [
                    "from pydantic_ai import Agent",
                    "from spurvik_guard import art50_badge_html, request_human_approval, send_telemetry_event, verify_signed_callback",
                    "",
                    'agent = Agent("openai:gpt-4o")',
                    "",
                    "async def run_agent(prompt: str) -> str:",
                    "    t0 = time.perf_counter()",
                    "    result = await agent.run(prompt)",
                    "    output = str(result.output)",
                    "    send_telemetry_event(",
                    "        prompt,",
                    "        output,",
                    '        model_provider="openai",',
                    '        model_version="gpt-4o",',
                    "        latency_ms=int((time.perf_counter() - t0) * 1000),",
                    "    )",
                    "    return output",
                ]
                : [
                    "from openai import OpenAI",
                    "from spurvik_guard import art50_badge_html, request_human_approval, send_telemetry_event, verify_signed_callback",
                    "",
                    "client = OpenAI()",
                    "",
                    "def ask_assistant(prompt: str) -> str:",
                    "    t0 = time.perf_counter()",
                    '    res = client.chat.completions.create(model="gpt-4o", messages=[{"role": "user", "content": prompt}])',
                    '    output = res.choices[0].message.content or ""',
                    "    send_telemetry_event(",
                    "        prompt,",
                    "        output,",
                    `        model_provider="${provider}",`,
                    '        model_version="gpt-4o",',
                    "        latency_ms=int((time.perf_counter() - t0) * 1000),",
                    "    )",
                    "    return output",
                ];
    return [
        ...headerLines,
        ...body,
        "",
        "# Pre-execution human approval gate & signed callback verification (Pro €19/mo & Team €79/mo):",
        '# approval = request_human_approval("issue_refund", {"order_id": 4821, "amount_eur": 120})',
        "# verified = verify_signed_callback(callback_url, expected_action_hmac=expected_hmac)  # self-test: python3 spurvik_guard.py",
        "",
        "# Visible 24-language Art. 50(1) HTML notice for Jinja2 / FastAPI / Django templates:",
        '# badge_tag = art50_badge_html(system_name="Support AI", locale="en", white_label=False)',
    ].join("\n") + "\n";
}
function cmsSource(framework, host = null, locale = "en") {
    if (framework === "shopify") {
        return [
            "{%- comment -%} Option A (recommended): curl -fsSLO https://spurvik.com/r/spurvik-shopify-art50.liquid -> sections/spurvik-art50-notice.liquid {%- endcomment -%}",
            "{%- comment -%} Option B: 1-line tag before </body> in layout/theme.liquid {%- endcomment -%}",
            "<script",
            '  src="https://spurvik.com/badge.js"',
            '  data-system="{{ shop.name | escape }}"',
            '  data-locale="{{ request.locale.iso_code | slice: 0, 2 | downcase }}"',
            '  data-position="bottom-left"',
            '  data-attribution="true"',
            "  defer",
            "></script>",
        ].join("\n") + "\n";
    }
    if (framework === "wordpress") {
        return [
            "<?php",
            "// WordPress / WooCommerce Art. 50(1) AI notice (or upload https://spurvik.com/r/spurvik-eu-ai-act-wp.zip):",
            "add_action('wp_footer', function (): void {",
            "    $lang = strtolower(substr(determine_locale(), 0, 2));",
            "    $site = esc_attr(get_bloginfo('name') ?: 'Support AI');",
            "    printf(",
            "        '<script src=\"https://spurvik.com/badge.js\" data-system=\"%s\" data-locale=\"%s\" data-position=\"bottom-left\" data-attribution=\"true\" defer></script>',",
            "        $site,",
            "        esc_attr($lang ?: 'en')",
            "    );",
            "});",
        ].join("\n") + "\n";
    }
    if (framework === "prestashop") {
        return [
            "# PrestaShop 1.7 / 8 / 9 zero-code module (Modules -> Module Manager -> Upload a module):",
            "curl -fsSLO https://spurvik.com/r/spurvik-prestashop-art50.zip",
        ].join("\n") + "\n";
    }
    if (framework === "shopware") {
        return [
            "# Shopware 6.5 / 6.6+ zero-code extension (Extensions -> My extensions -> Upload extension):",
            "curl -fsSLO https://spurvik.com/r/spurvik-shopware6-art50.zip",
        ].join("\n") + "\n";
    }
    if (framework === "cloudflare") {
        return [
            "# Cloudflare Edge Worker: streaming HTMLRewriter Art. 50(1) notice + 2 Dec 2026 C2PA polish:'off' passthrough:",
            "curl -fsSLO https://spurvik.com/r/cloudflare-worker-art50-c2pa.js",
        ].join("\n") + "\n";
    }
    const sys = host ?? "Support Assistant";
    return `<script src="https://spurvik.com/badge.js" data-system="${sys}" data-locale="${locale}" data-position="bottom-left" data-attribution="true" defer></script>\n`;
}
/** Source of the setup snippet (TypeScript, Python 3.10+ stdlib, or CMS/HTML snippet), with no surrounding prose. */
export function setupSnippetSource(frameworkInput, runtimeInput, options = {}) {
    const resolved = resolveSetupFrameworkAndRuntime(frameworkInput, runtimeInput);
    const framework = resolved.framework;
    const runtime = resolved.runtime;
    if (!isFramework(framework))
        throw new Error(UNKNOWN_FRAMEWORK);
    if (!isRuntime(runtime))
        throw new Error(UNKNOWN_RUNTIME);
    const host = publicHostname(options.domain);
    const locale = typeof options.locale === "string" && EU_LANGUAGES.some((l) => l.code === options.locale) ? options.locale : "en";
    if (isIdeCiFramework(framework)) {
        return [
            "# Claude Code (hosted HTTP MCP, all 10 zero-key tools + 4 agent skills):",
            "claude mcp add --transport http spurvik https://console.spurvik.com/api/mcp",
            "npx skills add spurvik/skills",
            "",
            "# Drop-in Cursor (.mdc) & universal AGENTS.md EU AI Act guardrails:",
            "mkdir -p .cursor/rules && curl -fsSL https://spurvik.com/r/spurvik-cursor-rules.mdc -o .cursor/rules/spurvik-eu-ai-act.mdc",
            "curl -fsSL https://spurvik.com/r/AGENTS.md -o AGENTS.md",
            "",
            "# GitHub Actions PR-Gate (blocks unwrapped TS/JS & Python AI calls on pull requests):",
            "mkdir -p .github/workflows && curl -fsSL https://spurvik.com/r/github-action-spurvik-check.yml -o .github/workflows/spurvik-check.yml",
            "",
        ].join("\n");
    }
    if (isWorkflowFramework(framework)) {
        return [
            "# Self-hosted n8n community node (7 operations) & Make.com HTTP blueprint:",
            "npm install n8n-nodes-spurvik@1.0.11",
            "curl -fsSLO https://spurvik.com/r/n8n-art50-starter.json",
            "curl -fsSLO https://spurvik.com/r/make-com-spurvik-blueprint.json",
            "",
        ].join("\n");
    }
    if (isCmsFramework(framework))
        return cmsSource(framework, host, locale);
    if (isPythonVariant(framework, runtime))
        return pythonSource(framework);
    const tsRuntime = runtime;
    if (framework === "vercel-ai-sdk")
        return middlewareSource(tsRuntime);
    if (framework === "mastra")
        return mastraSource(tsRuntime);
    if (framework === "openai-agents")
        return agentsSource(tsRuntime);
    if (framework === "langgraph")
        return langgraphSource(tsRuntime);
    const base = providerSource(framework, tsRuntime);
    if (resolved.isLovableAlias) {
        return `${base}\n// Frontend (React): render <AIDisclosureLabel notice="interaction" locale="${locale}" /> from "spurvik/react" above chat messages.\n`;
    }
    return base;
}
/** Tool text: a short note, then the snippet. */
export function setupSnippet(frameworkInput, runtimeInput, options = {}) {
    const resolved = resolveSetupFrameworkAndRuntime(frameworkInput, runtimeInput);
    const framework = resolved.framework;
    const runtime = resolved.runtime;
    const source = setupSnippetSource(frameworkInput, runtimeInput, options);
    const host = publicHostname(options.domain);
    const explicitLoc = typeof options.locale === "string" && EU_LANGUAGES.some((l) => l.code === options.locale)
        ? options.locale
        : null;
    const effectiveLocale = explicitLoc ?? (host ? inferLocaleFromDomain(host) : "en");
    const loc = explicitLoc && explicitLoc !== "en" ? explicitLoc : null;
    const locSuffix = loc ? `&locale=${loc}` : "";
    const reportLink = host ? `${reportUrlFor(host)}${locSuffix}` : REPORT_URL;
    const proLink = `${host ? proSignupUrlFor(host) : PRO_SIGNUP_URL}${locSuffix}`;
    const teamLink = `${host ? teamSignupUrlFor(host) : TEAM_SIGNUP_URL}${locSuffix}`;
    const conciergeLink = `${host ? conciergeSignupUrlFor(host) : CONCIERGE_SIGNUP_URL}${locSuffix}`;
    if (isIdeCiFramework(framework)) {
        const guideHref = mcpCockpitUrlFor(host, effectiveLocale);
        const ideLines = [
            `Framework: ${framework}. Runtime: Cursor, Claude Code, VS Code MCP & GitHub Actions PR-Gate (10 zero-key tools, MIT).`,
            `Connect the hosted 10-tool MCP server (\`https://console.spurvik.com/api/mcp\`) or local stdio (\`spurvik-mcp-server@1.0.11\`), and drop the PR-gate workflow into \`.github/workflows/spurvik-check.yml\` so unwrapped TypeScript/JS & Python (\`.py\`) AI calls fail CI before merge. ${DOES_NOT_MARK}`,
            `Interactive MCP & GitHub Actions cockpit: ${guideHref}`,
            `Shareable readiness report for your domain: ${reportLink}`,
            `Pro (${PRO_PRICE}): white-label badge and hosted Slack/Teams approval gates: ${proLink}`,
            `Team (${TEAM_PRICE}): 2M events/mo, 12-month Frankfurt retention, webhook export & Annex IV draft: ${teamLink}`,
            `Done-For-You 24h setup (${CONCIERGE_PRICE}, includes 1 year of Pro): ${conciergeLink}`,
            PRICE_NOTE,
        ];
        return `${ideLines.join("\n")}\n\n\`\`\`bash\n${source}\`\`\`\n`;
    }
    if (isWorkflowFramework(framework)) {
        const guideHref = workflowCockpitUrlFor(host, effectiveLocale);
        const wfLines = [
            `Framework: ${framework}. Runtime: self-hosted n8n & Make.com HTTP workflow guard (MIT, 0 bytes of prompt text stored).`,
            `Install \`n8n-nodes-spurvik\` in n8n Community Nodes or import https://spurvik.com/r/n8n-art50-starter.json / https://spurvik.com/r/make-com-spurvik-blueprint.json. ${DOES_NOT_MARK}`,
            `Interactive workflow cockpit: ${guideHref}`,
            `Shareable readiness report for your domain: ${reportLink}`,
            `Pro (${PRO_PRICE}): white-label badge and hosted Slack/Teams approval gates: ${proLink}`,
            `Team (${TEAM_PRICE}): 2M events/mo, 12-month Frankfurt retention, webhook export & Annex IV draft: ${teamLink}`,
            `Done-For-You 24h setup (${CONCIERGE_PRICE}, includes 1 year of Pro): ${conciergeLink}`,
            PRICE_NOTE,
        ];
        return `${wfLines.join("\n")}\n\n\`\`\`bash\n${source}\`\`\`\n`;
    }
    if (isCmsFramework(framework)) {
        const rawLowerCms = frameworkInput.trim().toLowerCase();
        if (SUPPORT_WIDGET_ALIASES.has(rawLowerCms)) {
            const cockpitHref = ECOMMERCE_WIDGET_ALIASES.has(rawLowerCms)
                ? ecommerceCockpitUrlFor(host, effectiveLocale)
                : supportWidgetCockpitUrlFor(host, effectiveLocale);
            const swLines = [
                `Framework: ${rawLowerCms}. Runtime: browser Shadow DOM alongside your support widget (0 cookies, 24 EU languages).`,
                `EU AI Act Art. 50(1) applies as soon as AI replies or AI routing interact with visitors — human-only live chat needs no AI notice. Paste one \`<script>\` tag before \`</body>\` (\`data-position="bottom-left"\` keeps your bottom-right launcher clear). Interactive cockpit: ${cockpitHref}. ${DOES_NOT_MARK}`,
                `Shareable readiness report for your domain: ${reportLink}`,
                `Pro (${PRO_PRICE}): white-label badge (data-attribution="false") and hosted Slack/Teams approval gates: ${proLink}`,
                `Team (${TEAM_PRICE}): 2M events/mo, 12-month Frankfurt retention, webhook export & Annex IV draft: ${teamLink}`,
                `Done-For-You 24h setup (${CONCIERGE_PRICE}, includes 1 year of Pro): ${conciergeLink}`,
                PRICE_NOTE,
            ];
            return `${swLines.join("\n")}\n\n\`\`\`html\n${source}\`\`\`\n`;
        }
        const langFence = framework === "shopify"
            ? "liquid"
            : framework === "wordpress"
                ? "php"
                : framework === "prestashop" || framework === "shopware" || framework === "cloudflare"
                    ? "bash"
                    : "html";
        const wpCockpitHref = wordpressCockpitUrlFor(host, effectiveLocale);
        const guideLine = framework === "shopify"
            ? `Save https://spurvik.com/r/spurvik-shopify-art50.liquid as \`sections/spurvik-art50-notice.liquid\` (auto-maps \`request.locale.iso_code\` across all 24 official EU languages and defaults to \`bottom-left\`), or paste the 1-line tag before \`</body>\` in \`layout/theme.liquid\`. Interactive cockpit: ${ecommerceCockpitUrlFor(host, effectiveLocale)}`
            : framework === "wordpress"
                ? `Upload https://spurvik.com/r/spurvik-eu-ai-act-wp.zip (Plugins -> Add New -> Upload Plugin; includes \`[spurvik_status_shield]\`), or add this \`wp_footer\` hook in \`functions.php\`. Interactive cockpit: ${wpCockpitHref}`
                : framework === "prestashop"
                    ? `Upload https://spurvik.com/r/spurvik-prestashop-art50.zip in PrestaShop 1.7 / 8 / 9 (Modules -> Module Manager -> Upload a module). Interactive cockpit: ${ecommerceCockpitUrlFor(host, effectiveLocale)}`
                    : framework === "shopware"
                        ? `Upload https://spurvik.com/r/spurvik-shopware6-art50.zip in Shopware 6.5 / 6.6+ (Extensions -> My extensions -> Upload extension). Interactive cockpit: ${ecommerceCockpitUrlFor(host, effectiveLocale)}`
                        : framework === "cloudflare"
                            ? `Deploy https://spurvik.com/r/cloudflare-worker-art50-c2pa.js on Cloudflare Workers for streaming HTMLRewriter Art. 50(1) notice injection + C2PA \`polish: "off"\` passthrough.`
                            : framework === "gtm"
                                ? `Import https://spurvik.com/r/spurvik-gtm-art50-container.json in Google Tag Manager (Admin -> Import Container -> Merge; fires on \`DOM Ready\` with 4 editable variables), or add this Custom HTML tag. Interactive cockpit: ${wpCockpitHref}`
                                : framework === "framer"
                                    ? `Import https://spurvik.com/r/spurvik-framer-badge.tsx as a Framer Code Component, or paste one \`<script>\` tag under Site Settings -> General -> Custom Code -> End of \`<body>\`. Interactive cockpit: ${wpCockpitHref}`
                                    : `Paste one \`<script>\` tag before \`</body>\` (Webflow: Site settings -> Custom code -> Footer code; PrestaShop: \`footer.tpl\`; Shopware 6: \`base.html.twig\`). Interactive cockpit: ${wpCockpitHref} · Label Studio: https://console.spurvik.com/labels`;
        const cmsLines = [
            `Framework: ${framework}. Runtime: browser Shadow DOM (0 cookies, 24 EU languages).`,
            `${guideLine} ${DOES_NOT_MARK}`,
            `Shareable readiness report for your domain: ${reportLink}`,
            `Pro (${PRO_PRICE}): white-label badge (data-attribution="false") and hosted Slack/Teams approval gates: ${proLink}`,
            `Team (${TEAM_PRICE}): 2M events/mo, 12-month Frankfurt retention, webhook export & Annex IV draft: ${teamLink}`,
            `Done-For-You 24h setup (${CONCIERGE_PRICE}, includes 1 year of Pro): ${conciergeLink}`,
            PRICE_NOTE,
        ];
        return `${cmsLines.join("\n")}\n\n\`\`\`${langFence}\n${source}\`\`\`\n`;
    }
    if (isPythonVariant(framework, runtime)) {
        const pyGuideHref = pythonCockpitUrlFor(host, effectiveLocale);
        const pyLines = [
            `Framework: ${framework}. Runtime: python (Python 3.10+, zero pip dependencies).`,
            `Download the 1-file MIT stdlib helper (\`curl -fsSLO ${PYTHON_GUARD_URL}\`) and set \`SPURVIK_API_KEY\` + \`SPURVIK_CONTENT_HASH_SECRET\` (>= 16 UTF-8 bytes; kept on your server). Sends keyed HMAC-SHA256 \`inputHash\` and \`outputHash\` receipts (chained into \`recordHash\` / \`prevLogHash\` in EU Frankfurt \`fra1\`) with 0 bytes of raw prompt text. ${DOES_NOT_MARK}`,
            `Interactive Python & FastAPI guide: ${pyGuideHref}`,
            `Interactive Art. 12 & GDPR HMAC receipt cockpit: ${hmacCockpitUrlFor(host, effectiveLocale)}`,
            `Interactive Art. 14 Slack & Teams approval gate cockpit: ${hitlCockpitUrlFor(host, effectiveLocale)}`,
            `Shareable readiness report for your domain: ${reportLink}`,
            `Pro (${PRO_PRICE}): white-label badge and hosted Slack/Teams approval gates: ${proLink}`,
            `Team (${TEAM_PRICE}): 2M events/mo, 12-month Frankfurt retention, webhook export & Annex IV draft: ${teamLink}`,
            `Done-For-You 24h setup (${CONCIERGE_PRICE}, includes 1 year of Pro): ${conciergeLink}`,
            PRICE_NOTE,
        ];
        return `${pyLines.join("\n")}\n\n\`\`\`python\n${source}\`\`\`\n`;
    }
    const rawLower = frameworkInput.trim().toLowerCase();
    const isVibeAlias = rawLower === "lovable" || rawLower === "bolt" || rawLower === "bolt.new" || rawLower === "v0" || rawLower === "replit";
    const lines = [
        `Framework: ${framework}. Runtime: ${runtime}.`,
        "Paste the snippet into the app that calls the model. Keys are read from the environment when the function runs. A missing key throws. The value is not logged.",
        `\`riskTier\`: ${RISK_TIER_SAMPLE_COMMENT}`,
        `The SDK logs the call and attaches an HMAC receipt. ${DOES_NOT_MARK}`,
    ];
    if (isVibeAlias) {
        lines.push(`Interactive ${rawLower} prompt & 24h setup cockpit: ${lovableCockpitUrlFor(host, effectiveLocale)}`);
    }
    if (framework === "vercel-ai-sdk") {
        lines.push("This framework uses spurvikMiddleware with wrapLanguageModel. The snippet does not call withSpurvik.", `Interactive Next.js, React & Vercel AI SDK cockpit: ${nextjsCockpitUrlFor(host, effectiveLocale)}`);
    }
    else if (framework === "mastra") {
        lines.push("This snippet calls withSpurvikMastra.");
    }
    else if (framework === "openai-agents") {
        lines.push("This snippet calls withSpurvikModelProvider.");
    }
    else if (framework === "langgraph") {
        lines.push("This snippet calls withSpurvikLangGraph and spurvikInterrupt.");
    }
    else {
        lines.push("This snippet calls withSpurvik on the provider client.");
    }
    if (runtime === "vercel") {
        lines.push("Install @vercel/functions in the app that calls waitUntil. This monorepo does not depend on that package.");
    }
    if (runtime !== "node") {
        lines.push("registerProcessHooks is off. Flush once with the helper for this runtime. The isolate may stop before the process exit hook.");
    }
    if (framework === "mastra" || framework === "openai-agents" || framework === "langgraph") {
        lines.push(`Interactive Art. 14 Slack & Teams approval gate cockpit: ${hitlCockpitUrlFor(host, effectiveLocale)}`);
    }
    lines.push(`Interactive Art. 12 & GDPR HMAC receipt cockpit: ${hmacCockpitUrlFor(host, effectiveLocale)}`, `Shareable readiness report for your domain: ${reportLink}`, `Pro (${PRO_PRICE}): white-label badge and hosted Slack/Teams approval gates: ${proLink}`, `Team (${TEAM_PRICE}): 2M events/mo, 12-month Frankfurt retention, webhook export & Annex IV draft: ${teamLink}`, `Done-For-You 24h setup (${CONCIERGE_PRICE}, includes 1 year of Pro): ${conciergeLink}`, PRICE_NOTE);
    return `${lines.join("\n")}\n\n\`\`\`ts\n${source}\`\`\`\n`;
}
