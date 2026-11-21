/** User-facing copy. Keep this file free of overclaim. */

export const RISK_TIER_SAMPLE_COMMENT =
  "Sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case.";

export const SERVER_INSTRUCTIONS =
  "Read-only tools for the Spurvik SDK and EU AI Act Article 50. Seven tools run locally and do not use the network. spurvik_scan_live_url sends one public URL to console.spurvik.com and reads the scan result, spurvik_batch_scan_domains does the same for up to 10 public domains, and spurvik_check_image_c2pa_url sends one public https image URL to console.spurvik.com for a read-only C2PA manifest check; localhost, private IPs and internal hosts are refused before any request. The SDK logs AI calls and attaches HMAC receipts. Marking hooks are the caller's. Spurvik does not mark content. spurvik_classify_ai_act_risk is an engineering mapping aid, not legal advice and not a decision under Article 6. spurvik_vendor_questionnaire_answers drafts copy-paste answers to the five EU AI Act questions in enterprise vendor security questionnaires and DPO RFPs.";

export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** Reads one public page or image through console.spurvik.com, so it is open-world. */
export const READ_ONLY_OPEN_WORLD_ANNOTATIONS = { ...READ_ONLY_ANNOTATIONS, openWorldHint: true } as const;

export const SETUP_TITLE = "Spurvik setup snippet";
export const SETUP_DESCRIPTION =
  "Return a setup snippet for openai, anthropic, google-genai, vercel-ai-sdk, mastra, openai-agents, langgraph, python, fastapi, langchain, pydantic-ai, shopify, wordpress, webflow, or html. TypeScript provider clients are wrapped with withSpurvik; the Vercel AI SDK snippet passes spurvikMiddleware to wrapLanguageModel; Mastra calls withSpurvikMastra; OpenAI Agents calls withSpurvikModelProvider; LangGraph calls withSpurvikLangGraph and spurvikInterrupt; Python stacks (python, fastapi, langchain, pydantic-ai) use the zero-dependency Python 3.10+ stdlib helper at https://spurvik.com/r/spurvik_guard.py; CMS and storefront stacks (shopify, wordpress, webflow, html) install the 24-language Shadow DOM Art. 50(1) notice via .liquid, wp_footer / .zip, or badge.js. TypeScript snippets are built from the installed spurvik exports. `riskTier` is a sample value. Set your own classification (as provider or deployer); Spurvik does not classify your use case. The SDK logs the call and attaches an HMAC receipt. It does not mark content.";
export const FRAMEWORK_FIELD =
  "Provider, framework, or storefront to wire: openai, anthropic, google-genai, vercel-ai-sdk, mastra, openai-agents, langgraph, python, fastapi, langchain, pydantic-ai, shopify, wordpress, webflow, or html.";
export const RUNTIME_FIELD =
  "Where the process runs: node, next, vercel, supabase-edge, or python. Optional (defaults to python for Python frameworks and node otherwise).";
export const SETUP_DOMAIN_FIELD =
  "Optional public hostname of the app or store, for example acme.eu. Prefills the report and signup links; non-public values are ignored.";
export const SETUP_LOCALE_FIELD =
  "Optional 2-letter EU locale (for example en, de, fr, nl, da, sv, es, it, pl, pt, fi) to localize badge snippets and signup links.";
export const UNKNOWN_FRAMEWORK =
  "The framework must be openai, anthropic, google-genai, vercel-ai-sdk, mastra, openai-agents, langgraph, python, fastapi, langchain, pydantic-ai, shopify, wordpress, webflow, or html.";
export const UNKNOWN_RUNTIME = "The runtime must be node, next, vercel, supabase-edge, or python.";

export const FIND_TITLE = "Find unwrapped AI calls";
export const ENV_SKIP_SENTENCE =
  "The scanner skips files named .env or .env.* (any case), including through symlinks and hard links.";
export const FIND_DESCRIPTION =
  "Heuristic static scan of one directory inside the workspace root for AI client calls that are not passed through withSpurvik, spurvikMiddleware, withSpurvikMastra, withSpurvikModel, withSpurvikModelProvider, withSpurvikLangGraph, spurvikInterrupt, or spurvik_guard.py (send_telemetry_event / build_telemetry_event). A StateGraph constructor is reported when the file does not call withSpurvikLangGraph. A bare interrupt() call is reported when the file does not call spurvikInterrupt or resolveLangGraphInterrupts. The scan reads .ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, .cts, and .py files. It does not read .md or .mdc files. Results are file:line. The line number is 1-based and counts every newline, including comments and strings. This is a heuristic, so it can miss a call or report one that is already wrapped. The scan does not change files and does not use the network. Paths that leave the workspace, including '..', are rejected. " +
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
  "That directory resolves inside node_modules, .git, dist, build, .next, .venv, venv, or __pycache__.";
export const PATH_SENSITIVE = "That path is not scanned.";
export const MISSING_ROOT = "Missing workspace root. Pass --root or set SPURVIK_MCP_ROOT.";
export const ROOT_NOT_ALLOWED =
  "That workspace root is not allowed. Pass a project directory, not /, a home directory, or a system directory.";
export const ROOT_NOT_PROJECT =
  "The workspace root must contain package.json, pyproject.toml, requirements.txt, .git, or pnpm-workspace.yaml.";
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
  "Scan one public page (bare domain or http(s) URL, for example stepnetwork.dk) through console.spurvik.com for AI chat widgets and AI SDKs, and check whether a visible EU AI Act Article 50(1) notice is present. Returns JSON: host, status, score, detected widgets and SDKs, a one-line badge.js fix, reportUrl, sandboxUrl, portfolioUrl, upgradeUrls, and statusShieldMarkdown (a live Art. 50 status shield you can offer to add to the project README.md). localhost, private or reserved IPs and internal hosts are refused before any request. 8-second timeout; when the scan service cannot be reached it returns offlineFallback: true with the links and the badge snippet. Heuristic: reads the HTML of one page. Not legal advice.";
export const SCAN_URL_FIELD = "Public http(s) URL or bare domain, for example stepnetwork.dk.";

export const BATCH_TITLE = "Batch-scan up to 10 domains for Art. 50(1)";
export const BATCH_DESCRIPTION =
  "Scan 1 to 10 public domains or http(s) URLs (for example an agency's client sites) through console.spurvik.com for AI chat widgets and AI SDKs, and check each frontpage for a visible EU AI Act Article 50(1) notice. Every entry is checked first: if any entry is localhost, a private or reserved IP or an internal host, the whole batch is refused and nothing is sent. Returns JSON: totalDomains, gapsFound and one row per host with detectedWidgets, art50NoticeDetected, gap, reportUrl, a one-line badgeSnippet and statusShieldMarkdown, plus portfolioUrl and upgradeUrls (Team €79/mo, Done-For-You €199 once per site). At most 4 scans run at once, each with an 8-second timeout; a host the service cannot reach returns offlineFallback: true in its row. Heuristic: reads the HTML of one page per domain. Not legal advice.";
export const BATCH_DOMAINS_FIELD =
  "1 to 10 public http(s) URLs or bare domains, for example [\"stepnetwork.dk\", \"folk.app\"]. Duplicate hosts are scanned once.";

export const C2PA_TITLE = "Check an image URL for a C2PA manifest (CDN-strip check)";
export const C2PA_DESCRIPTION =
  "C2PA JUMBF manifest & CDN-strip checker for one public https image URL (PNG, JPEG or WebP, up to 4 MB) — or a bare public domain / https store page URL, which auto-discovers the frontpage og:image / hero image in 1 hop — ahead of EU AI Act Art. 50(2) machine-readable marking (applies from 2 December 2026). console.spurvik.com fetches the image once through its SSRF gate and reads the manifest in memory; nothing is stored. Returns JSON: status, mediaType, byteLength, fileName, c2pa { manifestFound, embedded, claimGenerator, signatureMatches, trustAnchor, validationCodes }, whether the URL goes through an image optimizer that strips C2PA (/_next/image, Cloudinary, imgix, Cloudflare /cdn-cgi/image/, Shopify CDN, Jetpack Photon, Webflow CDN) with a fix, a visible \"AI-generated\" notice (<AIDisclosureLabel notice=\"generated\" /> and badge.js data-notice=\"generated\"), and links: the interactive checker, Pro (€19/mo) and Done-For-You (€199 once) with appUrl prefilled. Read-only: it never signs or adds a manifest. Only https on port 443, no credentials; localhost, .local, .internal and private or reserved IPs are refused before any request. 15-second timeout; 10 checks per minute per address, shared with console.spurvik.com/c2pa. Not legal advice.";
export const C2PA_URL_FIELD =
  "Public https URL of a PNG, JPEG or WebP image up to 4 MB (e.g. https://example.com/hero.png), or a bare public store domain / https page URL (e.g. charlie-paris.com) to auto-discover its hero image.";

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

export const VQ_TITLE = "Answer an EU AI Act vendor security questionnaire";
export const VQ_DESCRIPTION =
  "Zero-network, deterministic Markdown answers to the five EU AI Act questions enterprise buyers ask in vendor security questionnaires and DPO RFPs: Q1 Art. 50(1) notice and 2 Dec 2026 Art. 50(2) provenance, Q2 Art. 12 cryptographic event logging (keyed HMAC-SHA256 inputHash/outputHash, SHA-256 recordHash chained by prevLogHash), Q3 GDPR Art. 5(1)(c) zero-prompt minimisation and EU Frankfurt residency, Q4 Art. 14 deterministic human approval gates, Q5 audit retention, DPO evidence and Annex IV documentation. Answers match the chosen Spurvik plan: Free €0 (10,000 events/mo, 30 days), Pro €19/mo (250,000, 90 days, white-label badge, hosted approval queue, DPO engineering summary), Team €79/mo (2,000,000, 12 months, Annex IV draft, webhook export) or Done-For-You €199 once (24h install, signed DPO readiness report, 1 year of Pro). Every field is optional. Ends with links to the interactive questionnaire and signup. Review the wording against your own setup before you send it.";
export const VQ_PLAN_FIELD = "Spurvik plan the answers describe: free, pro (default), team or concierge (Done-For-You).";
export const VQ_PROVIDER_FIELD =
  "Model provider or agent framework: openai (default), anthropic, google-genai, vercel-ai-sdk, langgraph, openai-agents, mastra, python or custom.";
export const VQ_HIGH_RISK_ACTIONS_FIELD =
  "Agents or tools can trigger refunds, emails, permission changes or deletions. Defaults to true.";
export const VQ_GENERATES_MEDIA_FIELD =
  "The product generates synthetic images, audio or video (Art. 50(2)). Defaults to false.";
export const VQ_DOMAIN_FIELD =
  "Optional public hostname of the product, for example acme.eu. Prefills the report and signup links; a value that is not a public hostname is ignored and not echoed.";
export const VQ_LOCALE_FIELD =
  "Optional answer language: en (default), de (German DSB), fr (French DPO), nl (Dutch FG), da (Danish DPO), sv (Swedish DSO), es (Spanish DPD) or it (Italian RPD/DPO).";
