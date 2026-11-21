/** Public Spurvik URLs and prices used in tool output. Prices are excl. VAT, B2B (console `upgrade-plans.ts`). */

export const CONSOLE_ORIGIN = "https://console.spurvik.com";
export const BADGE_SCRIPT_SRC = "https://spurvik.com/badge.js";

export const REPORT_URL = `${CONSOLE_ORIGIN}/report`;
export const SANDBOX_URL = `${CONSOLE_ORIGIN}/sandbox`;
export const RISK_CHECK_URL = `${CONSOLE_ORIGIN}/risk-check`;
/** Free signup: mints a SPURVIK_API_KEY (work email, no password). */
export const SIGNUP_URL = `${CONSOLE_ORIGIN}/signup`;
export const PRO_SIGNUP_URL = `${CONSOLE_ORIGIN}/signup?plan=pro`;
export const TEAM_SIGNUP_URL = `${CONSOLE_ORIGIN}/signup?plan=team`;
export const CONCIERGE_SIGNUP_URL = `${CONSOLE_ORIGIN}/signup?plan=concierge`;
export const PORTFOLIO_URL = `${CONSOLE_ORIGIN}/portfolio`;
export const STATUS_SHIELD_URL = `${CONSOLE_ORIGIN}/api/v1/badge/status.svg`;
/** Interactive C2PA JUMBF manifest & CDN-strip checker (upload or URL). */
export const C2PA_PAGE_URL = `${CONSOLE_ORIGIN}/c2pa`;
/** Interactive Label Studio with CMS downloads. */
export const LABELS_URL = `${CONSOLE_ORIGIN}/labels`;
/** Interactive EU AI Act vendor security questionnaire and DPO RFP answers. */
export const VENDOR_QUESTIONNAIRE_URL = "https://spurvik.com/eu-ai-act-vendor-security-questionnaire";

export const WORDPRESS_PLUGIN_URL = "https://spurvik.com/r/spurvik-eu-ai-act-wp.zip";
export const FRAMER_COMPONENT_URL = "https://spurvik.com/r/spurvik-framer-badge.tsx";
export const SHADCN_REGISTRY_URL = "https://spurvik.com/r/article-50-badge.json";

export const PRO_PRICE = "€19/mo";
export const TEAM_PRICE = "€79/mo";
export const CONCIERGE_PRICE = "€199 once";
export const PRICE_NOTE = "Prices excl. VAT, B2B.";

/** `?domain=` report link for one host (adds `&locale=` only when an explicit non-English locale overrides a generic TLD). */
export function reportUrlFor(host: string, extraLocale?: string): string {
  const loc = extraLocale && extraLocale !== "en" ? `&locale=${encodeURIComponent(extraLocale)}` : "";
  return `${REPORT_URL}?domain=${encodeURIComponent(host)}${loc}`;
}

/** `?scan=` sandbox link for one host. */
export function sandboxUrlFor(host: string): string {
  return `${SANDBOX_URL}?scan=${encodeURIComponent(host)}`;
}

/** Pro signup with the scanned host prefilled as `appUrl`. */
export function proSignupUrlFor(host: string, extraLocale?: string): string {
  const loc = extraLocale && extraLocale !== "en" ? `&locale=${encodeURIComponent(extraLocale)}` : "";
  return `${PRO_SIGNUP_URL}&appUrl=${encodeURIComponent(host)}${loc}`;
}

/** Team (€79/mo) signup with the scanned host prefilled as `appUrl`. */
export function teamSignupUrlFor(host: string, extraLocale?: string): string {
  const loc = extraLocale && extraLocale !== "en" ? `&locale=${encodeURIComponent(extraLocale)}` : "";
  return `${TEAM_SIGNUP_URL}&appUrl=${encodeURIComponent(host)}${loc}`;
}

/** Done-For-You signup with the scanned host prefilled as `appUrl`. */
export function conciergeSignupUrlFor(host: string, extraLocale?: string): string {
  const loc = extraLocale && extraLocale !== "en" ? `&locale=${encodeURIComponent(extraLocale)}` : "";
  return `${CONCIERGE_SIGNUP_URL}&appUrl=${encodeURIComponent(host)}${loc}`;
}

/** Interactive C2PA JUMBF checker prefilled with the scanned domain (and optional public hero image URL). */
export function c2paCheckUrlFor(host: string, heroImageUrl?: string | null, locale?: string): string {
  const parts = [`domain=${encodeURIComponent(host)}`];
  if (locale && locale !== "en") parts.push(`locale=${encodeURIComponent(locale)}`);
  if (heroImageUrl) parts.push(`url=${encodeURIComponent(heroImageUrl)}`);
  return `${C2PA_PAGE_URL}?${parts.join("&")}`;
}

/** 8-language EU AI Act vendor security questionnaire & DPO RFP cockpit URL prefilled with `?domain=`. */
export function rfpQuestionnaireUrlFor(host: string, locale = "en"): string {
  const code = (locale || "en").trim().toLowerCase();
  const slug =
    code === "de"
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
export function pythonCockpitUrlFor(host?: string | null, locale = "en"): string {
  const code = (locale || "en").trim().toLowerCase();
  const slug =
    code === "de"
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
export function workflowCockpitUrlFor(host?: string | null, locale = "en"): string {
  const code = (locale || "en").trim().toLowerCase();
  const slug =
    code === "de"
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
export function lovableCockpitUrlFor(host?: string | null, locale = "en"): string {
  const code = (locale || "en").trim().toLowerCase();
  const slug =
    code === "de"
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
export function supportWidgetCockpitUrlFor(host?: string | null, locale = "en"): string {
  const code = (locale || "en").trim().toLowerCase();
  const slug =
    code === "de"
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
export function ecommerceCockpitUrlFor(host?: string | null, locale = "en"): string {
  const code = (locale || "en").trim().toLowerCase();
  const slug =
    code === "de"
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

/** Live Art. 50 status shield SVG for one host. */
export function statusShieldUrlFor(host: string): string {
  return `${STATUS_SHIELD_URL}?domain=${encodeURIComponent(host)}`;
}

/** README Markdown: the live status shield, linked to the host's report. */
export function statusShieldMarkdownFor(host: string): string {
  return `[![EU AI Act Art. 50](${statusShieldUrlFor(host)})](${reportUrlFor(host)})`;
}
