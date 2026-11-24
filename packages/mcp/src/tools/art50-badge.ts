import {
  BADGE_SCRIPT_SRC,
  CLOUDFLARE_WORKER_URL,
  CONCIERGE_PRICE,
  CONCIERGE_SIGNUP_URL,
  FRAMER_COMPONENT_URL,
  LABELS_URL,
  PRESTASHOP_ZIP_URL,
  PRICE_NOTE,
  PRO_ANNUAL_SIGNUP_URL,
  PRO_PRICE,
  PRO_SIGNUP_URL,
  SHADCN_REGISTRY_URL,
  SHOPIFY_LIQUID_URL,
  SHOPWARE_ZIP_URL,
  WORDPRESS_PLUGIN_URL,
} from "../links.js";
import {
  ATTRIBUTION_LABEL,
  BADGE_POSITIONS,
  BADGE_THEMES,
  badgeDataAttributes,
  buildBadgeScript,
  EU_LANGUAGES,
  EU_LOCALE_CODES,
  euLanguage,
  hostFromDomainLike,
  inferLocaleFromDomain,
  sanitizeSystemName,
  type BadgePosition,
  type BadgeTheme,
} from "./badge-copy.js";

export interface Art50BadgeInput {
  locale?: string;
  position?: BadgePosition;
  theme?: BadgeTheme;
  systemName?: string;
  attribution?: boolean;
}

export interface Art50BadgeAccessibility {
  role: "status";
  ariaLive: "polite";
  lang: string;
  screenReaderAnnouncement: string;
  standard: "WCAG 2.1 AA / EN 301 549 (European Accessibility Act)";
}

export interface Art50BadgeResult {
  tool: "spurvik_generate_art50_badge";
  notice: "art50_1_interaction";
  systemName: string;
  locale: string;
  language: string;
  localeSource: "input" | "systemName_domain" | "default";
  position: BadgePosition;
  theme: BadgeTheme;
  attribution: boolean;
  attributionLabel: string | null;
  previewText: string;
  accessibility: Art50BadgeAccessibility;
  script: string;
  nextjs: string;
  shopify: { liquidUrl: string; steps: string };
  wordpress: { pluginZipUrl: string; steps: string };
  prestashop: { moduleZipUrl: string; steps: string };
  shopware: { extensionZipUrl: string; steps: string };
  cloudflare: { workerJsUrl: string; steps: string };
  trustWidget: { scriptUrl: string; tag: string; steps: string };
  framer: { componentUrl: string; steps: string };
  shadcn: { registryUrl: string; command: string; v0: string };
  supportedLocales: string[];
  labelStudioUrl: string;
  plan: { attributionFree: string; whiteLabel: string; proUrl: string; proAnnualUrl: string; doneForYouUrl: string };
  note: string;
}

export type Art50BadgeOutcome = { ok: true; result: Art50BadgeResult } | { ok: false; error: string; message: string };

/** JSON Schema of the tool input, the same shape server.ts registers with zod. */
export const ART50_BADGE_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    locale: {
      type: "string",
      enum: [...EU_LOCALE_CODES],
      description: "One of the 24 official EU language codes. Inferred from a domain-like systemName when omitted, else en.",
    },
    position: { type: "string", enum: [...BADGE_POSITIONS], description: "Badge placement. Defaults to bottom-right." },
    theme: { type: "string", enum: [...BADGE_THEMES], description: "Badge theme. Defaults to dark." },
    systemName: { type: "string", description: "Product or assistant name, or the site domain. Defaults to Support Assistant." },
    attribution: {
      type: "boolean",
      description: 'Show the "Art. 50 · Spurvik" trust link. Defaults to true (Free). false is white-label (Pro or Done-For-You).',
    },
  },
  additionalProperties: false,
} as const;

const MAX_SYSTEM_NAME_INPUT = 200;
const PUBLIC_DOMAIN_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const BLOCKED_DOMAIN_SUFFIXES = ["localhost", "local", "internal", "arpa"] as const;

function publicDomainFromSystemName(raw: string | undefined): string {
  const host = hostFromDomainLike(raw);
  if (!host || !PUBLIC_DOMAIN_RE.test(host)) return "";
  if (BLOCKED_DOMAIN_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return "";
  return host;
}

function nextJsSnippet(attrs: Array<[string, string]>, position: BadgePosition): string {
  const lines = [
    'import Script from "next/script";',
    "",
    "// app/layout.tsx: render inside <body>.",
    "export function SpurvikArt50Badge() {",
    "  return (",
    "    <>",
  ];
  if (position === "inline") lines.push("      <div data-spurvik-badge />");
  lines.push("      <Script", `        src="${BADGE_SCRIPT_SRC}"`);
  for (const [name, value] of attrs) lines.push(`        ${name}="${value}"`);
  lines.push('        strategy="afterInteractive"', "      />", "    </>", "  );", "}");
  return lines.join("\n");
}

function resolveLocale(input: Art50BadgeInput): { locale: string; source: Art50BadgeResult["localeSource"] } | null {
  if (input.locale !== undefined && input.locale.trim() !== "") {
    const requested = input.locale.trim().toLowerCase();
    return EU_LOCALE_CODES.includes(requested) ? { locale: requested, source: "input" } : null;
  }
  const inferred = inferLocaleFromDomain(input.systemName);
  if (inferred !== "en") return { locale: inferred, source: "systemName_domain" };
  return { locale: "en", source: "default" };
}

/** Zero-network Art. 50(1) notice generator across the 24 official EU languages. */
export function generateArt50Badge(input: Art50BadgeInput = {}): Art50BadgeOutcome {
  if (input.systemName !== undefined && typeof input.systemName !== "string") {
    return { ok: false, error: "invalid_system_name", message: "systemName must be a string." };
  }
  if (typeof input.systemName === "string" && input.systemName.length > MAX_SYSTEM_NAME_INPUT) {
    return { ok: false, error: "invalid_system_name", message: `systemName is longer than ${MAX_SYSTEM_NAME_INPUT} characters.` };
  }
  if (input.locale !== undefined && typeof input.locale !== "string") {
    return { ok: false, error: "invalid_locale", message: `locale must be one of: ${EU_LOCALE_CODES.join(", ")}.` };
  }
  const position = input.position ?? "bottom-right";
  if (!(BADGE_POSITIONS as readonly string[]).includes(position)) {
    return { ok: false, error: "invalid_position", message: `position must be one of: ${BADGE_POSITIONS.join(", ")}.` };
  }
  const theme = input.theme ?? "dark";
  if (!(BADGE_THEMES as readonly string[]).includes(theme)) {
    return { ok: false, error: "invalid_theme", message: `theme must be one of: ${BADGE_THEMES.join(", ")}.` };
  }
  if (input.attribution !== undefined && typeof input.attribution !== "boolean") {
    return { ok: false, error: "invalid_attribution", message: "attribution must be true or false." };
  }
  const resolved = resolveLocale(input);
  if (!resolved) {
    return { ok: false, error: "invalid_locale", message: `locale must be one of: ${EU_LOCALE_CODES.join(", ")}.` };
  }
  const attribution = input.attribution !== false;
  const systemName = sanitizeSystemName(input.systemName);
  const language = euLanguage(resolved.locale);
  const previewText = `${systemName}. ${language.interaction}`;
  const domain = publicDomainFromSystemName(input.systemName);
  const localeSuffix =
    domain && resolved.source === "input" && inferLocaleFromDomain(domain) === "en" && resolved.locale !== "en"
      ? `&locale=${encodeURIComponent(resolved.locale)}`
      : "";
  const appUrlSuffix = domain ? `&appUrl=${encodeURIComponent(domain)}${localeSuffix}` : "";
  const studioParams = new URLSearchParams();
  if (domain) studioParams.set("domain", domain);
  if (resolved.locale !== "en" && (!domain || inferLocaleFromDomain(domain) === "en")) {
    studioParams.set("locale", resolved.locale);
  }
  if (input.position !== undefined && position !== "bottom-left") {
    studioParams.set("pos", position);
  }
  if (theme === "light") {
    studioParams.set("theme", "light");
  }
  const studioQs = studioParams.toString();
  const labelStudioUrl = studioQs ? `${LABELS_URL}?${studioQs}` : LABELS_URL;
  const badge = { systemName, locale: resolved.locale, theme, position, attribution };
  const attrs = badgeDataAttributes(badge);
  const whiteLabelNote = `White-label (data-attribution="false") is unlocked on Pro (${PRO_PRICE}) or Done-For-You 24h setup (${CONCIERGE_PRICE}, includes 1 year of Pro). ${PRICE_NOTE}`;
  return {
    ok: true,
    result: {
      tool: "spurvik_generate_art50_badge",
      notice: "art50_1_interaction",
      systemName,
      locale: resolved.locale,
      language: language.label,
      localeSource: resolved.source,
      position,
      theme,
      attribution,
      attributionLabel: attribution ? ATTRIBUTION_LABEL : null,
      previewText,
      accessibility: {
        role: "status",
        ariaLive: "polite",
        lang: resolved.locale,
        screenReaderAnnouncement: previewText,
        standard: "WCAG 2.1 AA / EN 301 549 (European Accessibility Act)",
      },
      script: buildBadgeScript(badge),
      nextjs: nextJsSnippet(attrs, position),
      shopify: {
        liquidUrl: SHOPIFY_LIQUID_URL,
        steps: "Save as sections/spurvik-art50-notice.liquid in Online Store 2.0 (24 EU locales via request.locale.iso_code).",
      },
      wordpress: {
        pluginZipUrl: WORDPRESS_PLUGIN_URL,
        steps: "WordPress admin: Plugins > Add New > Upload Plugin, choose the .zip, then activate it.",
      },
      prestashop: {
        moduleZipUrl: PRESTASHOP_ZIP_URL,
        steps: "PrestaShop 1.7 / 8 / 9: Modules > Module Manager > Upload a module, drop spurvik-prestashop-art50.zip.",
      },
      shopware: {
        extensionZipUrl: SHOPWARE_ZIP_URL,
        steps: "Shopware 6.5 / 6.6+: Extensions > My extensions > Upload extension, upload spurvik-shopware6-art50.zip.",
      },
      cloudflare: {
        workerJsUrl: CLOUDFLARE_WORKER_URL,
        steps: "Cloudflare Workers: streaming HTMLRewriter Art. 50(1) notice injection + C2PA polish:'off' passthrough.",
      },
      trustWidget: {
        scriptUrl: "https://spurvik.com/trust-widget.js",
        tag: `<script src="https://spurvik.com/trust-widget.js" data-domain="${domain || "yourdomain.com"}" defer></script>`,
        steps: "Drop into /trust, /security, WordPress, Webflow, Shopify, Wix, or Squarespace for an interactive 10-language Art. 50 & C2PA card.",
      },
      framer: {
        componentUrl: FRAMER_COMPONENT_URL,
        steps: "Add the .tsx file as a Framer code component, then place it on the page.",
      },
      shadcn: {
        registryUrl: SHADCN_REGISTRY_URL,
        command: `npx shadcn@latest add ${SHADCN_REGISTRY_URL}`,
        v0: `In v0, ask it to add the shadcn registry item ${SHADCN_REGISTRY_URL}.`,
      },
      supportedLocales: EU_LANGUAGES.map((entry) => entry.code),
      labelStudioUrl,
      plan: {
        attributionFree: `Free: the badge shows a subtle "${ATTRIBUTION_LABEL}" trust link.`,
        whiteLabel: attribution
          ? whiteLabelNote
          : `${whiteLabelNote} On Free, badge.js keeps the "${ATTRIBUTION_LABEL}" link even with data-attribution="false".`,
        proUrl: `${PRO_SIGNUP_URL}${appUrlSuffix}`,
        proAnnualUrl: `${PRO_ANNUAL_SIGNUP_URL}${appUrlSuffix}`,
        doneForYouUrl: `${CONCIERGE_SIGNUP_URL}${appUrlSuffix}`,
      },
      note: "Paste the script before </body>. Zero cookies, no network telemetry. Supports Article 50(1) transparency; not legal advice.",
    },
  };
}
