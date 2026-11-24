/** Public Spurvik URLs and prices used in tool output. Prices are excl. VAT, B2B (console `upgrade-plans.ts`). */
export const CONSOLE_ORIGIN = "https://console.spurvik.com";
export const BADGE_SCRIPT_SRC = "https://spurvik.com/badge.js";
export const REPORT_URL = `${CONSOLE_ORIGIN}/report`;
export const SANDBOX_URL = `${CONSOLE_ORIGIN}/sandbox`;
export const RISK_CHECK_URL = `${CONSOLE_ORIGIN}/risk-check`;
/** Free signup: mints a SPURVIK_API_KEY (work email, no password). */
export const SIGNUP_URL = `${CONSOLE_ORIGIN}/signup`;
export const PRO_SIGNUP_URL = `${CONSOLE_ORIGIN}/signup?plan=pro`;
export const PRO_ANNUAL_SIGNUP_URL = `${CONSOLE_ORIGIN}/signup?plan=pro&interval=annual`;
export const TEAM_SIGNUP_URL = `${CONSOLE_ORIGIN}/signup?plan=team`;
export const TEAM_ANNUAL_SIGNUP_URL = `${CONSOLE_ORIGIN}/signup?plan=team&interval=annual`;
export const CONCIERGE_SIGNUP_URL = `${CONSOLE_ORIGIN}/signup?plan=concierge`;
export const PORTFOLIO_URL = `${CONSOLE_ORIGIN}/portfolio`;
export const STATUS_SHIELD_URL = `${CONSOLE_ORIGIN}/api/v1/badge/status.svg`;
export const C2PA_STATUS_SHIELD_URL = `${CONSOLE_ORIGIN}/api/v1/c2pa/status.svg`;
/** Interactive C2PA JUMBF manifest & CDN-strip checker (upload or URL). */
export const C2PA_PAGE_URL = `${CONSOLE_ORIGIN}/c2pa`;
/** Interactive Label Studio with CMS downloads. */
export const LABELS_URL = `${CONSOLE_ORIGIN}/labels`;
/** Interactive EU AI Act vendor security questionnaire and DPO RFP answers. */
export const VENDOR_QUESTIONNAIRE_URL = "https://spurvik.com/eu-ai-act-vendor-security-questionnaire";
export const SHOPIFY_LIQUID_URL = "https://spurvik.com/r/spurvik-shopify-art50.liquid";
export const WORDPRESS_PLUGIN_URL = "https://spurvik.com/r/spurvik-eu-ai-act-wp.zip";
export const PRESTASHOP_ZIP_URL = "https://spurvik.com/r/spurvik-prestashop-art50.zip";
export const SHOPWARE_ZIP_URL = "https://spurvik.com/r/spurvik-shopware6-art50.zip";
export const CLOUDFLARE_WORKER_URL = "https://spurvik.com/r/cloudflare-worker-art50-c2pa.js";
export const CURSOR_RULES_URL = "https://spurvik.com/r/spurvik-cursor-rules.mdc";
export const AGENTS_MD_URL = "https://spurvik.com/r/AGENTS.md";
export const GTM_CONTAINER_URL = "https://spurvik.com/r/spurvik-gtm-art50-container.json";
export const FRAMER_COMPONENT_URL = "https://spurvik.com/r/spurvik-framer-badge.tsx";
export const SHADCN_REGISTRY_URL = "https://spurvik.com/r/article-50-badge.json";
/** Maps detected CMS / storefront / tag-manager stacks to 1-click zero-code installer download URLs. */
export function platformInstallerUrlsFor(detectedPlatforms, host, locale = "en") {
    const out = {};
    if (!detectedPlatforms || detectedPlatforms.length === 0)
        return out;
    for (const platform of detectedPlatforms) {
        if (platform === "Shopify")
            out.shopifyLiquid = SHOPIFY_LIQUID_URL;
        else if (platform === "WordPress")
            out.wordpressPluginZip = WORDPRESS_PLUGIN_URL;
        else if (platform === "PrestaShop")
            out.prestashopModuleZip = PRESTASHOP_ZIP_URL;
        else if (platform === "Shopware")
            out.shopwareExtensionZip = SHOPWARE_ZIP_URL;
        else if (platform === "Google Tag Manager")
            out.gtmContainerJson = GTM_CONTAINER_URL;
        else if (platform === "Framer")
            out.framerComponentTsx = FRAMER_COMPONENT_URL;
        else if (platform === "Webflow")
            out.webflowGuide = wordpressCockpitUrlFor(host, locale);
        else if (platform === "Next.js")
            out.nextjsShadcnRegistry = SHADCN_REGISTRY_URL;
    }
    return out;
}
export const PRO_PRICE = "€19/mo";
export const TEAM_PRICE = "€79/mo";
export const CONCIERGE_PRICE = "€199 once";
export const PRICE_NOTE = "Prices excl. VAT, B2B.";
/** `?domain=` report link for one host (adds `&locale=` only when an explicit non-English locale overrides a generic TLD). */
export function reportUrlFor(host, extraLocale) {
    const loc = extraLocale && extraLocale !== "en" ? `&locale=${encodeURIComponent(extraLocale)}` : "";
    return `${REPORT_URL}?domain=${encodeURIComponent(host)}${loc}`;
}
/** `?scan=` sandbox link for one host. */
export function sandboxUrlFor(host) {
    return `${SANDBOX_URL}?scan=${encodeURIComponent(host)}`;
}
/** Free signup with the scanned host prefilled as `appUrl` (mints a `SPURVIK_API_KEY` in 10s). */
export function freeSignupUrlFor(host, extraLocale) {
    const loc = extraLocale && extraLocale !== "en" ? `&locale=${encodeURIComponent(extraLocale)}` : "";
    return `${SIGNUP_URL}?appUrl=${encodeURIComponent(host)}${loc}`;
}
/** Pro signup with the scanned host prefilled as `appUrl`. */
export function proSignupUrlFor(host, extraLocale) {
    const loc = extraLocale && extraLocale !== "en" ? `&locale=${encodeURIComponent(extraLocale)}` : "";
    return `${PRO_SIGNUP_URL}&appUrl=${encodeURIComponent(host)}${loc}`;
}
/** Pro Annual (€190/yr, 2 months free) signup with the scanned host prefilled as `appUrl`. */
export function proAnnualSignupUrlFor(host, extraLocale) {
    const loc = extraLocale && extraLocale !== "en" ? `&locale=${encodeURIComponent(extraLocale)}` : "";
    return `${PRO_ANNUAL_SIGNUP_URL}&appUrl=${encodeURIComponent(host)}${loc}`;
}
/** Team (€79/mo) signup with the scanned host prefilled as `appUrl`. */
export function teamSignupUrlFor(host, extraLocale) {
    const loc = extraLocale && extraLocale !== "en" ? `&locale=${encodeURIComponent(extraLocale)}` : "";
    return `${TEAM_SIGNUP_URL}&appUrl=${encodeURIComponent(host)}${loc}`;
}
/** Team Annual (€790/yr, 2 months free) signup with the scanned host prefilled as `appUrl`. */
export function teamAnnualSignupUrlFor(host, extraLocale) {
    const loc = extraLocale && extraLocale !== "en" ? `&locale=${encodeURIComponent(extraLocale)}` : "";
    return `${TEAM_ANNUAL_SIGNUP_URL}&appUrl=${encodeURIComponent(host)}${loc}`;
}
/** Done-For-You signup with the scanned host prefilled as `appUrl`. */
export function conciergeSignupUrlFor(host, extraLocale) {
    const loc = extraLocale && extraLocale !== "en" ? `&locale=${encodeURIComponent(extraLocale)}` : "";
    return `${CONCIERGE_SIGNUP_URL}&appUrl=${encodeURIComponent(host)}${loc}`;
}
/** Interactive C2PA JUMBF checker prefilled with the scanned domain (and optional public hero image URL). */
export function c2paCheckUrlFor(host, heroImageUrl, locale) {
    const parts = [`domain=${encodeURIComponent(host)}`];
    if (locale && locale !== "en")
        parts.push(`locale=${encodeURIComponent(locale)}`);
    if (heroImageUrl)
        parts.push(`url=${encodeURIComponent(heroImageUrl)}`);
    return `${C2PA_PAGE_URL}?${parts.join("&")}`;
}
/** 8-language EU AI Act vendor security questionnaire & DPO RFP cockpit URL prefilled with `?domain=`. */
export function rfpQuestionnaireUrlFor(host, locale = "en") {
    const code = (locale || "en").trim().toLowerCase();
    const slug = code === "de"
        ? "/de/ki-verordnung-sicherheitsfragebogen-lieferanten-dsb"
        : code === "fr"
            ? "/fr/questionnaire-securite-reglement-ia-dpo-fournisseur"
            : code === "nl"
                ? "/nl/ai-verordening-leveranciersvragenlijst-fg-beveiliging"
                : code === "da"
                    ? "/da/eu-ai-act-leverandoerspoergeskema-dpo-sikkerhed"
                    : code === "es"
                        ? "/es/cuestionario-seguridad-proveedor-reglamento-ia-dpd"
                        : code === "it"
                            ? "/it/questionario-sicurezza-fornitori-reglamento-ia-dpo"
                            : code === "sv"
                                ? "/sv/ai-forordningen-leverantorssakerhetsformular-dso"
                                : "/eu-ai-act-vendor-security-questionnaire";
    return `https://spurvik.com${slug}?domain=${encodeURIComponent(host)}`;
}
/** 8-language Python, FastAPI, LangChain, PydanticAI & Django cockpit URL prefilled with `?domain=`. */
export function pythonCockpitUrlFor(host, locale = "en") {
    const code = (locale || "en").trim().toLowerCase();
    const slug = code === "de"
        ? "/de/python-fastapi-langchain-ki-verordnung-logging"
        : code === "fr"
            ? "/fr/python-fastapi-langchain-reglement-ia-journalisation"
            : code === "nl"
                ? "/nl/python-fastapi-langchain-ai-verordening-logging"
                : code === "da"
                    ? "/da/python-fastapi-langchain-eu-ai-act-logning"
                    : code === "sv"
                        ? "/sv/python-fastapi-langchain-ai-forordningen-loggning"
                        : code === "es"
                            ? "/es/python-fastapi-langchain-reglamento-ia-registro"
                            : code === "it"
                                ? "/it/python-fastapi-langchain-regolamento-ia-logging"
                                : "/python-fastapi-langchain-eu-ai-act-logging";
    const cleanHost = (host ?? "").trim();
    return cleanHost ? `https://spurvik.com${slug}?domain=${encodeURIComponent(cleanHost)}` : `https://spurvik.com${slug}`;
}
/** 8-language self-hosted n8n & Make.com workflow guard cockpit URL prefilled with `?domain=`. */
export function workflowCockpitUrlFor(host, locale = "en") {
    const code = (locale || "en").trim().toLowerCase();
    const slug = code === "de"
        ? "/de/n8n-make-ki-verordnung-artikel-50-hmac-freigabe"
        : code === "fr"
            ? "/fr/n8n-make-reglement-ia-article-50-hmac-approbation"
            : code === "nl"
                ? "/nl/n8n-make-ai-verordening-artikel-50-hmac-goedkeuring"
                : code === "da"
                    ? "/da/n8n-make-eu-ai-act-artikel-50-hmac-godkendelse"
                    : code === "sv"
                        ? "/sv/n8n-make-ai-forordningen-artikel-50-hmac-godkannande"
                        : code === "es"
                            ? "/es/n8n-make-reglamento-ia-articulo-50-hmac-aprobacion"
                            : code === "it"
                                ? "/it/n8n-make-regolamento-ia-articolo-50-hmac-approvazione"
                                : "/n8n-eu-ai-act-guard";
    const cleanHost = (host ?? "").trim();
    return cleanHost ? `https://spurvik.com${slug}?domain=${encodeURIComponent(cleanHost)}` : `https://spurvik.com${slug}`;
}
/** 8-language Lovable, Bolt.new, v0 & Replit vibe-coding cockpit URL prefilled with `?domain=`. */
export function lovableCockpitUrlFor(host, locale = "en") {
    const code = (locale || "en").trim().toLowerCase();
    const slug = code === "de"
        ? "/de/lovable-bolt-replit-ki-verordnung-artikel-50"
        : code === "fr"
            ? "/fr/lovable-bolt-replit-reglement-ia-article-50"
            : code === "nl"
                ? "/nl/lovable-bolt-replit-ai-verordening-artikel-50"
                : code === "da"
                    ? "/da/lovable-bolt-replit-eu-ai-act-artikel-50"
                    : code === "sv"
                        ? "/sv/lovable-bolt-replit-ai-forordningen-artikel-50"
                        : code === "es"
                            ? "/es/lovable-bolt-replit-reglamento-ia-articulo-50"
                            : code === "it"
                                ? "/it/lovable-bolt-replit-regolamento-ia-articolo-50"
                                : "/lovable-bolt-replit-eu-ai-act";
    const cleanHost = (host ?? "").trim();
    return cleanHost ? `https://spurvik.com${slug}?domain=${encodeURIComponent(cleanHost)}` : `https://spurvik.com${slug}`;
}
/** 8-language Intercom Fin, Zendesk AI, Tidio Lyro, HubSpot Breeze, Dixa & Trengo support-widget cockpit URL prefilled with `?domain=`. */
export function supportWidgetCockpitUrlFor(host, locale = "en") {
    const code = (locale || "en").trim().toLowerCase();
    const slug = code === "de"
        ? "/de/intercom-fin-zendesk-tidio-hubspot-ki-verordnung-artikel-50"
        : code === "fr"
            ? "/fr/intercom-fin-zendesk-tidio-hubspot-reglement-ia-article-50"
            : code === "nl"
                ? "/nl/intercom-fin-zendesk-trengo-tidio-ai-verordening-artikel-50"
                : code === "da"
                    ? "/da/intercom-fin-zendesk-dixa-tidio-eu-ai-act-artikel-50"
                    : code === "sv"
                        ? "/sv/intercom-fin-zendesk-tidio-hubspot-ai-forordningen-artikel-50"
                        : code === "es"
                            ? "/es/intercom-fin-zendesk-tidio-hubspot-reglamento-ia-articulo-50"
                            : code === "it"
                                ? "/it/intercom-fin-zendesk-tidio-hubspot-regolamento-ia-articolo-50"
                                : "/intercom-zendesk-tidio-hubspot-eu-ai-act-disclosure";
    const cleanHost = (host ?? "").trim();
    return cleanHost ? `https://spurvik.com${slug}?domain=${encodeURIComponent(cleanHost)}` : `https://spurvik.com${slug}`;
}
/** 8-language Shopify, Gorgias, Crisp, WooCommerce, Shopware, PrestaShop, DanDomain & Centra e-commerce cockpit URL prefilled with `?domain=`. */
export function ecommerceCockpitUrlFor(host, locale = "en") {
    const code = (locale || "en").trim().toLowerCase();
    const slug = code === "de"
        ? "/de/shopify-shopware-woocommerce-ki-hinweis-artikel-50"
        : code === "fr"
            ? "/fr/shopify-prestashop-gorgias-crisp-mention-ia-article-50"
            : code === "nl"
                ? "/nl/shopify-woocommerce-trengo-ai-melding-artikel-50"
                : code === "da"
                    ? "/da/shopify-woocommerce-dandomain-ai-oplysning-artikel-50"
                    : code === "sv"
                        ? "/sv/shopify-woocommerce-centra-ai-upplysning-artikel-50"
                        : code === "es"
                            ? "/es/shopify-woocommerce-prestashop-aviso-ia-articulo-50"
                            : code === "it"
                                ? "/it/shopify-woocommerce-prestashop-informativa-ia-articolo-50"
                                : "/shopify-gorgias-crisp-eu-ai-act-disclosure";
    const cleanHost = (host ?? "").trim();
    return cleanHost ? `https://spurvik.com${slug}?domain=${encodeURIComponent(cleanHost)}` : `https://spurvik.com${slug}`;
}
/** 8-language Cursor, Claude Code, VS Code MCP & GitHub Actions PR-Gate cockpit URL prefilled with `?domain=`. */
export function mcpCockpitUrlFor(host, locale = "en") {
    const code = (locale || "en").trim().toLowerCase();
    const slug = code === "de"
        ? "/de/cursor-claude-mcp-github-actions-ki-verordnung"
        : code === "fr"
            ? "/fr/cursor-claude-mcp-github-actions-reglement-ia"
            : code === "nl"
                ? "/nl/cursor-claude-mcp-github-actions-ai-verordening"
                : code === "da"
                    ? "/da/cursor-claude-mcp-github-actions-eu-ai-act"
                    : code === "sv"
                        ? "/sv/cursor-claude-mcp-github-actions-ai-forordningen"
                        : code === "es"
                            ? "/es/cursor-claude-mcp-github-actions-reglamento-ia"
                            : code === "it"
                                ? "/it/cursor-claude-mcp-github-actions-regolamento-ia"
                                : "/cursor-claude-mcp-eu-ai-act";
    const cleanHost = (host ?? "").trim();
    return cleanHost ? `https://spurvik.com${slug}?domain=${encodeURIComponent(cleanHost)}` : `https://spurvik.com${slug}`;
}
/** 8-language WordPress (v1.1.0 .zip + [spurvik_status_shield]), Elementor, Webflow & Framer cockpit URL prefilled with `?domain=`. */
export function wordpressCockpitUrlFor(host, locale = "en") {
    const code = (locale || "en").trim().toLowerCase();
    const slug = code === "de"
        ? "/de/wordpress-elementor-webflow-ki-verordnung-plugin-artikel-50"
        : code === "fr"
            ? "/fr/wordpress-elementor-webflow-plugin-reglement-ia-article-50"
            : code === "nl"
                ? "/nl/wordpress-elementor-webflow-ai-verordening-plugin-artikel-50"
                : code === "da"
                    ? "/da/wordpress-elementor-webflow-eu-ai-act-plugin-artikel-50"
                    : code === "sv"
                        ? "/sv/wordpress-elementor-webflow-ai-forordningen-plugin-artikel-50"
                        : code === "es"
                            ? "/es/wordpress-elementor-webflow-plugin-reglamento-ia-articulo-50"
                            : code === "it"
                                ? "/it/wordpress-elementor-webflow-plugin-regolamento-ia-articolo-50"
                                : "/wordpress-shopify-webflow-eu-ai-act-badge";
    const cleanHost = (host ?? "").trim();
    return cleanHost ? `https://spurvik.com${slug}?domain=${encodeURIComponent(cleanHost)}` : `https://spurvik.com${slug}`;
}
/** 8-language EU AI Act Art. 12 & GDPR Art. 5(1)(c) Zero-Prompt-Text HMAC-SHA256 Receipt + Annex IV cockpit URL prefilled with `?domain=`. */
export function hmacCockpitUrlFor(host, locale = "en") {
    const code = (locale || "en").trim().toLowerCase();
    const slug = code === "de"
        ? "/de/ki-verordnung-artikel-12-protokollierung-dsgvo-hmac"
        : code === "fr"
            ? "/fr/reglement-ia-article-12-journalisation-rgpd-hmac"
            : code === "nl"
                ? "/nl/ai-verordening-artikel-12-logging-avg-hmac"
                : code === "da"
                    ? "/da/eu-ai-act-artikel-12-logning-gdpr-hmac"
                    : code === "sv"
                        ? "/sv/ai-forordningen-artikel-12-loggning-gdpr-hmac"
                        : code === "es"
                            ? "/es/reglamento-ia-articulo-12-registro-rgpd-hmac"
                            : code === "it"
                                ? "/it/regolamento-ia-articolo-12-registrazione-gdpr-hmac"
                                : "/ai-event-logging-hmac-receipts";
    const cleanHost = (host ?? "").trim();
    return cleanHost ? `https://spurvik.com${slug}?domain=${encodeURIComponent(cleanHost)}` : `https://spurvik.com${slug}`;
}
/** 8-language EU AI Act Art. 14 Human-in-the-Loop Pre-Execution Approval Gate (Slack, Teams, LangGraph, OpenAI Agents & Python) cockpit URL prefilled with `?domain=`. */
export function hitlCockpitUrlFor(host, locale = "en") {
    const code = (locale || "en").trim().toLowerCase();
    const slug = code === "de"
        ? "/de/ki-verordnung-artikel-14-menschliche-aufsicht-slack-teams-freigabe"
        : code === "fr"
            ? "/fr/reglement-ia-article-14-controle-humain-validation-slack-teams"
            : code === "nl"
                ? "/nl/ai-verordening-artikel-14-menselijk-toezicht-slack-teams-goedkeuring"
                : code === "da"
                    ? "/da/eu-ai-act-artikel-14-menneskeligt-tilsyn-slack-teams-godkendelse"
                    : code === "sv"
                        ? "/sv/ai-forordningen-artikel-14-mansklig-tillsyn-slack-teams-godkannande"
                        : code === "es"
                            ? "/es/reglamento-ia-articulo-14-supervision-humana-aprobacion-slack-teams"
                            : code === "it"
                                ? "/it/regolamento-ia-articolo-14-sorveglianza-umana-approvazione-slack-teams"
                                : "/langgraph-openai-agents-approval-check";
    const cleanHost = (host ?? "").trim();
    return cleanHost ? `https://spurvik.com${slug}?domain=${encodeURIComponent(cleanHost)}` : `https://spurvik.com${slug}`;
}
/** 8-language Next.js App Router, React `<AIDisclosureLabel />`, `shadcn` / `v0` Registry & Vercel AI SDK (`spurvikMiddleware`) cockpit URL prefilled with `?domain=`. */
export function nextjsCockpitUrlFor(host, locale = "en") {
    const code = (locale || "en").trim().toLowerCase();
    const slug = code === "de"
        ? "/de/nextjs-vercel-ai-sdk-ki-verordnung-artikel-50"
        : code === "fr"
            ? "/fr/nextjs-vercel-ai-sdk-reglement-ia-article-50"
            : code === "nl"
                ? "/nl/nextjs-vercel-ai-sdk-ai-verordening-artikel-50"
                : code === "da"
                    ? "/da/nextjs-vercel-ai-sdk-eu-ai-act-artikel-50"
                    : code === "sv"
                        ? "/sv/nextjs-vercel-ai-sdk-ai-forordningen-artikel-50"
                        : code === "es"
                            ? "/es/nextjs-vercel-ai-sdk-reglamento-ia-articulo-50"
                            : code === "it"
                                ? "/it/nextjs-vercel-ai-sdk-regolamento-ia-articolo-50"
                                : "/nextjs-vercel-ai-sdk-art50-badge";
    const cleanHost = (host ?? "").trim();
    return cleanHost ? `https://spurvik.com${slug}?domain=${encodeURIComponent(cleanHost)}` : `https://spurvik.com${slug}`;
}
/** Live Art. 50 status shield SVG for one host. */
export function statusShieldUrlFor(host) {
    return `${STATUS_SHIELD_URL}?domain=${encodeURIComponent(host)}`;
}
/** README Markdown: the live status shield, linked to the host's report. */
export function statusShieldMarkdownFor(host) {
    return `[![EU AI Act Art. 50](${statusShieldUrlFor(host)})](${reportUrlFor(host)})`;
}
