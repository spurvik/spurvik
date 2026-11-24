/** Public Spurvik URLs and prices used in tool output. Prices are excl. VAT, B2B (console `upgrade-plans.ts`). */
export declare const CONSOLE_ORIGIN = "https://console.spurvik.com";
export declare const BADGE_SCRIPT_SRC = "https://spurvik.com/badge.js";
export declare const REPORT_URL = "https://console.spurvik.com/report";
export declare const SANDBOX_URL = "https://console.spurvik.com/sandbox";
export declare const RISK_CHECK_URL = "https://console.spurvik.com/risk-check";
/** Free signup: mints a SPURVIK_API_KEY (work email, no password). */
export declare const SIGNUP_URL = "https://console.spurvik.com/signup";
export declare const PRO_SIGNUP_URL = "https://console.spurvik.com/signup?plan=pro";
export declare const PRO_ANNUAL_SIGNUP_URL = "https://console.spurvik.com/signup?plan=pro&interval=annual";
export declare const TEAM_SIGNUP_URL = "https://console.spurvik.com/signup?plan=team";
export declare const TEAM_ANNUAL_SIGNUP_URL = "https://console.spurvik.com/signup?plan=team&interval=annual";
export declare const CONCIERGE_SIGNUP_URL = "https://console.spurvik.com/signup?plan=concierge";
export declare const PORTFOLIO_URL = "https://console.spurvik.com/portfolio";
export declare const STATUS_SHIELD_URL = "https://console.spurvik.com/api/v1/badge/status.svg";
export declare const C2PA_STATUS_SHIELD_URL = "https://console.spurvik.com/api/v1/c2pa/status.svg";
/** Interactive C2PA JUMBF manifest & CDN-strip checker (upload or URL). */
export declare const C2PA_PAGE_URL = "https://console.spurvik.com/c2pa";
/** Interactive Label Studio with CMS downloads. */
export declare const LABELS_URL = "https://console.spurvik.com/labels";
/** Interactive EU AI Act vendor security questionnaire and DPO RFP answers. */
export declare const VENDOR_QUESTIONNAIRE_URL = "https://spurvik.com/eu-ai-act-vendor-security-questionnaire";
export declare const SHOPIFY_LIQUID_URL = "https://spurvik.com/r/spurvik-shopify-art50.liquid";
export declare const WORDPRESS_PLUGIN_URL = "https://spurvik.com/r/spurvik-eu-ai-act-wp.zip";
export declare const PRESTASHOP_ZIP_URL = "https://spurvik.com/r/spurvik-prestashop-art50.zip";
export declare const SHOPWARE_ZIP_URL = "https://spurvik.com/r/spurvik-shopware6-art50.zip";
export declare const CLOUDFLARE_WORKER_URL = "https://spurvik.com/r/cloudflare-worker-art50-c2pa.js";
export declare const CURSOR_RULES_URL = "https://spurvik.com/r/spurvik-cursor-rules.mdc";
export declare const AGENTS_MD_URL = "https://spurvik.com/r/AGENTS.md";
export declare const GTM_CONTAINER_URL = "https://spurvik.com/r/spurvik-gtm-art50-container.json";
export declare const FRAMER_COMPONENT_URL = "https://spurvik.com/r/spurvik-framer-badge.tsx";
export declare const SHADCN_REGISTRY_URL = "https://spurvik.com/r/article-50-badge.json";
/** Maps detected CMS / storefront / tag-manager stacks to 1-click zero-code installer download URLs. */
export declare function platformInstallerUrlsFor(detectedPlatforms: readonly string[] | undefined, host?: string | null, locale?: string): Record<string, string>;
export declare const PRO_PRICE = "\u20AC19/mo";
export declare const TEAM_PRICE = "\u20AC79/mo";
export declare const CONCIERGE_PRICE = "\u20AC199 once";
export declare const PRICE_NOTE = "Prices excl. VAT, B2B.";
/** `?domain=` report link for one host (adds `&locale=` only when an explicit non-English locale overrides a generic TLD). */
export declare function reportUrlFor(host: string, extraLocale?: string): string;
/** `?scan=` sandbox link for one host. */
export declare function sandboxUrlFor(host: string): string;
/** Free signup with the scanned host prefilled as `appUrl` (mints a `SPURVIK_API_KEY` in 10s). */
export declare function freeSignupUrlFor(host: string, extraLocale?: string): string;
/** Pro signup with the scanned host prefilled as `appUrl`. */
export declare function proSignupUrlFor(host: string, extraLocale?: string): string;
/** Pro Annual (€190/yr, 2 months free) signup with the scanned host prefilled as `appUrl`. */
export declare function proAnnualSignupUrlFor(host: string, extraLocale?: string): string;
/** Team (€79/mo) signup with the scanned host prefilled as `appUrl`. */
export declare function teamSignupUrlFor(host: string, extraLocale?: string): string;
/** Team Annual (€790/yr, 2 months free) signup with the scanned host prefilled as `appUrl`. */
export declare function teamAnnualSignupUrlFor(host: string, extraLocale?: string): string;
/** Done-For-You signup with the scanned host prefilled as `appUrl`. */
export declare function conciergeSignupUrlFor(host: string, extraLocale?: string): string;
/** Interactive C2PA JUMBF checker prefilled with the scanned domain (and optional public hero image URL). */
export declare function c2paCheckUrlFor(host: string, heroImageUrl?: string | null, locale?: string): string;
/** 8-language EU AI Act vendor security questionnaire & DPO RFP cockpit URL prefilled with `?domain=`. */
export declare function rfpQuestionnaireUrlFor(host: string, locale?: string): string;
/** 8-language Python, FastAPI, LangChain, PydanticAI & Django cockpit URL prefilled with `?domain=`. */
export declare function pythonCockpitUrlFor(host?: string | null, locale?: string): string;
/** 8-language self-hosted n8n & Make.com workflow guard cockpit URL prefilled with `?domain=`. */
export declare function workflowCockpitUrlFor(host?: string | null, locale?: string): string;
/** 8-language Lovable, Bolt.new, v0 & Replit vibe-coding cockpit URL prefilled with `?domain=`. */
export declare function lovableCockpitUrlFor(host?: string | null, locale?: string): string;
/** 8-language Intercom Fin, Zendesk AI, Tidio Lyro, HubSpot Breeze, Dixa & Trengo support-widget cockpit URL prefilled with `?domain=`. */
export declare function supportWidgetCockpitUrlFor(host?: string | null, locale?: string): string;
/** 8-language Shopify, Gorgias, Crisp, WooCommerce, Shopware, PrestaShop, DanDomain & Centra e-commerce cockpit URL prefilled with `?domain=`. */
export declare function ecommerceCockpitUrlFor(host?: string | null, locale?: string): string;
/** 8-language Cursor, Claude Code, VS Code MCP & GitHub Actions PR-Gate cockpit URL prefilled with `?domain=`. */
export declare function mcpCockpitUrlFor(host?: string | null, locale?: string): string;
/** 8-language WordPress (v1.1.0 .zip + [spurvik_status_shield]), Elementor, Webflow & Framer cockpit URL prefilled with `?domain=`. */
export declare function wordpressCockpitUrlFor(host?: string | null, locale?: string): string;
/** 8-language EU AI Act Art. 12 & GDPR Art. 5(1)(c) Zero-Prompt-Text HMAC-SHA256 Receipt + Annex IV cockpit URL prefilled with `?domain=`. */
export declare function hmacCockpitUrlFor(host?: string | null, locale?: string): string;
/** 8-language EU AI Act Art. 14 Human-in-the-Loop Pre-Execution Approval Gate (Slack, Teams, LangGraph, OpenAI Agents & Python) cockpit URL prefilled with `?domain=`. */
export declare function hitlCockpitUrlFor(host?: string | null, locale?: string): string;
/** 8-language Next.js App Router, React `<AIDisclosureLabel />`, `shadcn` / `v0` Registry & Vercel AI SDK (`spurvikMiddleware`) cockpit URL prefilled with `?domain=`. */
export declare function nextjsCockpitUrlFor(host?: string | null, locale?: string): string;
/** Live Art. 50 status shield SVG for one host. */
export declare function statusShieldUrlFor(host: string): string;
/** README Markdown: the live status shield, linked to the host's report. */
export declare function statusShieldMarkdownFor(host: string): string;
