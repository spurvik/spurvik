/** Public Spurvik URLs and prices used in tool output. Prices are excl. VAT, B2B (console `upgrade-plans.ts`). */

export const CONSOLE_ORIGIN = "https://console.spurvik.com";
export const BADGE_SCRIPT_SRC = "https://spurvik.com/badge.js";

export const REPORT_URL = `${CONSOLE_ORIGIN}/report`;
export const SANDBOX_URL = `${CONSOLE_ORIGIN}/sandbox`;
export const RISK_CHECK_URL = `${CONSOLE_ORIGIN}/risk-check`;
export const PRO_SIGNUP_URL = `${CONSOLE_ORIGIN}/signup?plan=pro`;
export const TEAM_SIGNUP_URL = `${CONSOLE_ORIGIN}/signup?plan=team`;
export const CONCIERGE_SIGNUP_URL = `${CONSOLE_ORIGIN}/signup?plan=concierge`;

export const WORDPRESS_PLUGIN_URL = "https://spurvik.com/r/spurvik-eu-ai-act-wp.zip";
export const FRAMER_COMPONENT_URL = "https://spurvik.com/r/spurvik-framer-badge.tsx";
export const SHADCN_REGISTRY_URL = "https://spurvik.com/r/article-50-badge.json";

export const PRO_PRICE = "€19/mo";
export const TEAM_PRICE = "€79/mo";
export const CONCIERGE_PRICE = "€199 once";
export const PRICE_NOTE = "Prices excl. VAT, B2B.";

/** `?domain=` report link for one host. */
export function reportUrlFor(host: string): string {
  return `${REPORT_URL}?domain=${encodeURIComponent(host)}`;
}

/** `?scan=` sandbox link for one host. */
export function sandboxUrlFor(host: string): string {
  return `${SANDBOX_URL}?scan=${encodeURIComponent(host)}`;
}
