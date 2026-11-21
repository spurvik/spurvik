import { BADGE_SCRIPT_SRC, CONCIERGE_PRICE, CONCIERGE_SIGNUP_URL, FRAMER_COMPONENT_URL, PRICE_NOTE, PRO_PRICE, PRO_SIGNUP_URL, SHADCN_REGISTRY_URL, WORDPRESS_PLUGIN_URL, } from "../links.js";
import { ATTRIBUTION_LABEL, BADGE_POSITIONS, BADGE_THEMES, badgeDataAttributes, buildBadgeScript, EU_LANGUAGES, EU_LOCALE_CODES, euLanguage, hostFromDomainLike, inferLocaleFromDomain, sanitizeSystemName, } from "./badge-copy.js";
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
};
const MAX_SYSTEM_NAME_INPUT = 200;
const PUBLIC_DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const BLOCKED_DOMAIN_SUFFIXES = ["localhost", "local", "internal", "arpa"];
function publicDomainFromSystemName(raw) {
    const host = hostFromDomainLike(raw);
    if (!host || !PUBLIC_DOMAIN_RE.test(host))
        return "";
    if (BLOCKED_DOMAIN_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)))
        return "";
    return host;
}
function nextJsSnippet(attrs, position) {
    const lines = [
        'import Script from "next/script";',
        "",
        "// app/layout.tsx: render inside <body>.",
        "export function SpurvikArt50Badge() {",
        "  return (",
        "    <>",
    ];
    if (position === "inline")
        lines.push("      <div data-spurvik-badge />");
    lines.push("      <Script", `        src="${BADGE_SCRIPT_SRC}"`);
    for (const [name, value] of attrs)
        lines.push(`        ${name}="${value}"`);
    lines.push('        strategy="afterInteractive"', "      />", "    </>", "  );", "}");
    return lines.join("\n");
}
function resolveLocale(input) {
    if (input.locale !== undefined && input.locale.trim() !== "") {
        const requested = input.locale.trim().toLowerCase();
        return EU_LOCALE_CODES.includes(requested) ? { locale: requested, source: "input" } : null;
    }
    const inferred = inferLocaleFromDomain(input.systemName);
    if (inferred !== "en")
        return { locale: inferred, source: "systemName_domain" };
    return { locale: "en", source: "default" };
}
/** Zero-network Art. 50(1) notice generator across the 24 official EU languages. */
export function generateArt50Badge(input = {}) {
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
    if (!BADGE_POSITIONS.includes(position)) {
        return { ok: false, error: "invalid_position", message: `position must be one of: ${BADGE_POSITIONS.join(", ")}.` };
    }
    const theme = input.theme ?? "dark";
    if (!BADGE_THEMES.includes(theme)) {
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
    const localeSuffix = domain && resolved.source === "input" && inferLocaleFromDomain(domain) === "en" && resolved.locale !== "en"
        ? `&locale=${encodeURIComponent(resolved.locale)}`
        : "";
    const appUrlSuffix = domain ? `&appUrl=${encodeURIComponent(domain)}${localeSuffix}` : "";
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
            wordpress: {
                pluginZipUrl: WORDPRESS_PLUGIN_URL,
                steps: "WordPress admin: Plugins > Add New > Upload Plugin, choose the .zip, then activate it.",
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
            plan: {
                attributionFree: `Free: the badge shows a subtle "${ATTRIBUTION_LABEL}" trust link.`,
                whiteLabel: attribution
                    ? whiteLabelNote
                    : `${whiteLabelNote} On Free, badge.js keeps the "${ATTRIBUTION_LABEL}" link even with data-attribution="false".`,
                proUrl: `${PRO_SIGNUP_URL}${appUrlSuffix}`,
                doneForYouUrl: `${CONCIERGE_SIGNUP_URL}${appUrlSuffix}`,
            },
            note: "Paste the script before </body>. Zero cookies, no network telemetry. Supports Article 50(1) transparency; not legal advice.",
        },
    };
}
