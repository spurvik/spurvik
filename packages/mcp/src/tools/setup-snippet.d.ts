export declare const PYTHON_FRAMEWORKS: readonly ["python", "fastapi", "langchain", "pydantic-ai"];
export declare const CMS_FRAMEWORKS: readonly ["shopify", "wordpress", "webflow", "html"];
export declare const WORKFLOW_FRAMEWORKS: readonly ["n8n", "make"];
export declare const FRAMEWORKS: readonly ["openai", "anthropic", "google-genai", "vercel-ai-sdk", "mastra", "openai-agents", "langgraph", "python", "fastapi", "langchain", "pydantic-ai", "shopify", "wordpress", "webflow", "html", "n8n", "make"];
export declare const RUNTIMES: readonly ["node", "next", "vercel", "supabase-edge", "python"];
export type PythonFramework = (typeof PYTHON_FRAMEWORKS)[number];
export type CmsFramework = (typeof CMS_FRAMEWORKS)[number];
export type WorkflowFramework = (typeof WORKFLOW_FRAMEWORKS)[number];
export type Framework = (typeof FRAMEWORKS)[number];
export type Runtime = (typeof RUNTIMES)[number];
export declare function resolveSetupFrameworkAndRuntime(rawFramework: string, rawRuntime?: string): {
    framework: string;
    runtime: string;
    isLovableAlias: boolean;
};
export declare function isPythonFramework(value: string): value is PythonFramework;
export declare function isCmsFramework(value: string): value is CmsFramework;
export declare function isWorkflowFramework(value: string): value is WorkflowFramework;
export declare function isPythonVariant(framework: string, runtime: string): boolean;
/** Published spurvik / spurvik-sdk version interpolated into snippets. Keep in sync with packages/sdk. */
export declare const SNIPPET_SDK_VERSION = "1.0.12";
export interface SetupSnippetOptions {
    domain?: string;
    locale?: string;
}
/** Source of the setup snippet (TypeScript, Python 3.10+ stdlib, or CMS/HTML snippet), with no surrounding prose. */
export declare function setupSnippetSource(frameworkInput: string, runtimeInput?: string, options?: SetupSnippetOptions): string;
/** Tool text: a short note, then the snippet. */
export declare function setupSnippet(frameworkInput: string, runtimeInput?: string, options?: SetupSnippetOptions): string;
