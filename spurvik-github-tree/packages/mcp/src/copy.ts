/** User-facing copy. Keep this file free of overclaim. */

export const RISK_TIER_SAMPLE_COMMENT =
  "Sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.";

export const SERVER_INSTRUCTIONS =
  "Local read-only tools for the Spurvik SDK. They do not call the Spurvik API or any other network. The SDK logs AI calls and attaches HMAC receipts. Marking hooks are the caller's. Spurvik does not mark content and does not classify a use case.";

export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const SETUP_TITLE = "Spurvik setup snippet";
export const SETUP_DESCRIPTION =
  "Return a setup snippet for openai, anthropic, google-genai, vercel-ai-sdk, mastra, openai-agents, or langgraph. Provider clients are wrapped with withSpurvik. The Vercel AI SDK snippet passes spurvikMiddleware to wrapLanguageModel. The Mastra snippet calls withSpurvikMastra. The OpenAI Agents snippet calls withSpurvikModelProvider. The LangGraph snippet calls withSpurvikLangGraph and spurvikInterrupt. The snippet is built from the installed @spurvik/sdk exports. `riskTier` is a sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case. The SDK logs the call and attaches an HMAC receipt. It does not mark content.";
export const FRAMEWORK_FIELD =
  "Provider or framework to wrap: openai, anthropic, google-genai, vercel-ai-sdk, mastra, openai-agents, or langgraph.";
export const RUNTIME_FIELD =
  "Where the process runs: node, next, vercel, or supabase-edge. This chooses the flush call.";
export const UNKNOWN_FRAMEWORK =
  "The framework must be openai, anthropic, google-genai, vercel-ai-sdk, mastra, openai-agents, or langgraph.";
export const UNKNOWN_RUNTIME = "The runtime must be node, next, vercel, or supabase-edge.";

export const FIND_TITLE = "Find unwrapped AI calls";
export const ENV_SKIP_SENTENCE =
  "The scanner skips files named .env or .env.* (any case), including through symlinks and hard links.";
export const FIND_DESCRIPTION =
  "Heuristic static scan of one directory inside the workspace root for AI client calls that are not passed through withSpurvik, spurvikMiddleware, withSpurvikMastra, withSpurvikModel, withSpurvikModelProvider, withSpurvikLangGraph, or spurvikInterrupt. A StateGraph constructor is reported when the file does not call withSpurvikLangGraph. A bare interrupt() call is reported when the file does not call spurvikInterrupt or resolveLangGraphInterrupts. The scan reads .ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, and .cts files. It does not read .md or .mdc files. Results are file:line. The line number is 1-based and counts every newline, including comments and strings. This is a heuristic, so it can miss a call or report one that is already wrapped. The scan does not change files and does not use the network. Paths that leave the workspace, including '..', are rejected. " +
  ENV_SKIP_SENTENCE;
export const DIRECTORY_FIELD =
  "Directory inside the workspace root passed with --root or SPURVIK_MCP_ROOT. Relative paths are resolved from that root. '..' is rejected.";
export const PATH_TRAVERSAL =
  "Path traversal is rejected. Pass a directory inside the workspace root.";
export const PATH_EMPTY = "Pass a directory inside the workspace root.";
export const PATH_INVALID = "That directory path is not valid.";
export const PATH_MISSING = "The directory does not exist.";
export const PATH_OUTSIDE = "That path resolves outside the workspace root.";
export const PATH_NOT_DIRECTORY = "That path is not a directory.";
export const PATH_EXCLUDED =
  "That directory resolves inside node_modules, .git, dist, build, or .next.";
export const PATH_SENSITIVE = "That path is not scanned.";
export const MISSING_ROOT = "Missing workspace root. Pass --root or set SPURVIK_MCP_ROOT.";
export const ROOT_NOT_ALLOWED =
  "That workspace root is not allowed. Pass a project directory, not /, a home directory, or a system directory.";
export const ROOT_NOT_PROJECT =
  "The workspace root must contain package.json, .git, or pnpm-workspace.yaml.";
export const ROOT_MISSING_DIR = "That workspace root does not exist.";
export const SCAN_TIME_LIMIT = "The scan stopped at its time limit.";
export const SCAN_COUNT_LIMIT = "The scan stopped at its file or finding limit.";
export const SCAN_DEPTH_LIMIT =
  "The scan stopped at its depth limit (32). Some folders were not scanned.";
export const SIGNING_INPUT_TOO_SHORT = "The signing secret must be at least 16 characters.";

export const RECEIPT_TITLE = "Explain an HMAC receipt";
export const SIGNATURE_CHECK_LIMIT =
  "It does not show that a notice was shown, that output is marked, or that your system meets the Act.";
export const RECEIPT_DESCRIPTION =
  "Explain the fields of an HMAC provenance receipt JSON. If signingSecret is passed, or SPURVIK_SIGNING_SECRET is set, check the HMAC locally with `verifyProvenanceSignature`, which checks that the record's signed fields still match the HMAC-SHA-256 signature. " +
  SIGNATURE_CHECK_LIMIT +
  " The signing secret is not logged. Omit the secret to explain the fields without checking.";
export const RECEIPT_FIELD =
  "HMAC provenance receipt as JSON text. A provenance record, or the AI SDK metadata object with a record field.";
export const SIGNING_INPUT_HELP =
  "Optional client-held signing secret. When set, or when SPURVIK_SIGNING_SECRET is set, the HMAC is checked locally. The value is not logged. Omit it to skip the check.";
export const MISSING_SIGNING_INPUT =
  "Missing signingSecret. Pass a non-empty signing secret or set SPURVIK_SIGNING_SECRET. The value is not logged.";
export const MISSING_SIGNING_SECRET_ENV =
  "Missing SPURVIK_SIGNING_SECRET. Set a non-empty value or pass signingSecret. The value is not logged.";
export const RECEIPT_NOT_JSON = "The receipt is not JSON.";
export const RECEIPT_NOT_OBJECT = "The receipt must be a JSON object.";
export const RECEIPT_TOO_LARGE = "The receipt is too large to explain.";
export const SIGNATURE_NOT_CHECKED =
  "Signature check: not checked. Pass signingSecret or set SPURVIK_SIGNING_SECRET to check it locally. The value is not logged.";
export const SIGNATURE_NOT_A_RECORD =
  "Signature check: not checked. The JSON is not a provenance record (kind must be provenance_record and signatureAlg must be HMAC-SHA-256).";
export const SIGNATURE_MATCHES =
  "Signature check: the record's signed fields still match the HMAC-SHA-256 signature.";
export const SIGNATURE_DIFFERS =
  "Signature check: the record's signed fields do not match the HMAC-SHA-256 signature.";
export const MARK_LIMITATION =
  "This does not show that a mark is robust, detectable, or adequate under Art. 50(2).";
export const DOES_NOT_MARK = "Spurvik does not mark content.";

export const MARKING_TITLE = "Marking hooks";
export const MARKING_DESCRIPTION =
  "Explain how to plug your own Article 50(2) marking into marking.text or marking.media. Spurvik does not mark content. withSpurvik and spurvikMiddleware log the call and attach an HMAC receipt. A hook runs only when you supply one. The signed text trailer is an application-level binding you can opt into. It is not, by itself, an Article 50(2) machine-readable mark.";
export const SURFACE_FIELD = "Which hook to explain: text, media, or both. Defaults to both.";
export const UNKNOWN_SURFACE = "The surface must be text, media, or both.";
