/** User-facing copy. Keep this file free of overclaim. */

export const RISK_TIER_SAMPLE_COMMENT =
  "Sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.";

export const SERVER_INSTRUCTIONS =
  "Read-only tools for the Spurvik SDK and EU AI Act Article 50. Six tools run locally and do not use the network. spurvik_scan_live_url sends one public URL to console.spurvik.com and reads the scan result; localhost, private IPs and internal hosts are refused before any request. The SDK logs AI calls and attaches HMAC receipts. Marking hooks are the caller's. Spurvik does not mark content. spurvik_classify_ai_act_risk is an engineering mapping aid, not legal advice and not a decision under Article 6.";

export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** Reads one public page through console.spurvik.com, so it is open-world. */
export const READ_ONLY_OPEN_WORLD_ANNOTATIONS = { ...READ_ONLY_ANNOTATIONS, openWorldHint: true } as const;

export const SETUP_TITLE = "Spurvik setup snippet";
export const SETUP_DESCRIPTION =
  "Return a setup snippet for openai, anthropic, google-genai, vercel-ai-sdk, mastra, openai-agents, or langgraph. Provider clients are wrapped with withSpurvik. The Vercel AI SDK snippet passes spurvikMiddleware to wrapLanguageModel. The Mastra snippet calls withSpurvikMastra. The OpenAI Agents snippet calls withSpurvikModelProvider. The LangGraph snippet calls withSpurvikLangGraph and spurvikInterrupt. The snippet is built from the installed spurvik exports. `riskTier` is a sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case. The SDK logs the call and attaches an HMAC receipt. It does not mark content.";
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

export const SCAN_TITLE = "Scan a live URL for Art. 50(1)";
export const SCAN_DESCRIPTION =
  "Scan one public page (bare domain or http(s) URL, for example stepnetwork.dk) through console.spurvik.com for AI chat widgets and AI SDKs, and check whether a visible EU AI Act Article 50(1) notice is present. Returns JSON: host, status, score, detected widgets and SDKs, a one-line badge.js fix, reportUrl, sandboxUrl and upgradeUrls. localhost, private or reserved IPs and internal hosts are refused before any request. 8-second timeout; when the scan service cannot be reached it returns offlineFallback: true with the links and the badge snippet. Heuristic: reads the HTML of one page. Not legal advice.";
export const SCAN_URL_FIELD = "Public http(s) URL or bare domain, for example stepnetwork.dk.";

export const CLASSIFY_TITLE = "Map an AI use case to an EU AI Act risk tier";
export const CLASSIFY_DESCRIPTION =
  "Deterministic, zero-network mapping of one AI use case to an EU AI Act tier: prohibited_art5, high_risk_annex_iii, limited_transparency_art50 or minimal_risk. Returns JSON with the matched signals, obligations with dates, recommended Spurvik controls, interactiveClassifierUrl and upgradeUrls. The use-case text is matched against fixed patterns; it is not stored or echoed. Engineering mapping aid; not legal advice and not a decision under Article 6.";
export const USE_CASE_FIELD = "What the AI system does and for whom, in one or two sentences. Max 4000 characters. Not stored or echoed.";
export const DOMAIN_FIELD =
  "Annex III area, or general (default): biometrics, critical_infrastructure, education, employment_hr, essential_services_credit, law_enforcement, migration_border, justice_democracy.";
export const INTERACTS_FIELD = "People talk to or chat with the system (Art. 50(1)). Inferred from useCase when omitted.";
export const SYNTHETIC_FIELD = "The system generates audio, images, video or text (Art. 50(2)). Inferred from useCase when omitted.";
export const DECISIONS_FIELD =
  "The system decides about, ranks or scores natural persons, or materially influences such decisions. Inferred from useCase when omitted.";

export const BADGE_TITLE = "Generate an Art. 50(1) badge";
export const BADGE_DESCRIPTION =
  "Zero-network generator for an EU AI Act Article 50(1) notice in any of the 24 official EU languages: a one-line badge.js <script>, a Next.js <Script>, the WordPress plugin .zip, the Framer component and the shadcn/v0 registry item. Returns JSON. attribution defaults to true (Free) and shows a subtle \"Art. 50 · Spurvik\" link; attribution: false is white-label on Pro (€19/mo) or Done-For-You (€199 once). The language is inferred from a domain-like systemName when locale is omitted. Not legal advice.";
export const LOCALE_FIELD =
  "One of the 24 official EU language codes: en, da, de, fr, es, nl, sv, pl, it, pt, fi, cs, bg, el, et, ga, hr, hu, lt, lv, mt, ro, sk, sl.";
export const POSITION_FIELD = "bottom-right (default), bottom-left or inline.";
export const THEME_FIELD = "dark (default) or light.";
export const SYSTEM_NAME_FIELD = "Product or assistant name, or the site domain. Defaults to Support Assistant.";
export const ATTRIBUTION_FIELD =
  'Show the "Art. 50 · Spurvik" trust link. Defaults to true. false is white-label (Pro or Done-For-You).';
