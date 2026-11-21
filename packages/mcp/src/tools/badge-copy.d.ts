/**
 * Art. 50(1) badge helpers shared by spurvik_generate_art50_badge and spurvik_scan_live_url.
 * Mirrors the hosted console (`label-studio.ts`, `badge-preview-copy.ts`) so both MCP servers emit the same tag.
 */
export interface EuLanguage {
    code: string;
    label: string;
    /** Art. 50(1) interaction notice shown by badge.js in this language. */
    interaction: string;
}
/** The 24 official EU languages, in the console's order. */
export declare const EU_LANGUAGES: readonly EuLanguage[];
export declare const EU_LOCALE_CODES: readonly string[];
export declare const BADGE_POSITIONS: readonly ["bottom-right", "bottom-left", "inline"];
export declare const BADGE_THEMES: readonly ["dark", "light"];
export type BadgePosition = (typeof BADGE_POSITIONS)[number];
export type BadgeTheme = (typeof BADGE_THEMES)[number];
export declare const DEFAULT_SYSTEM_NAME = "Support Assistant";
export declare const ATTRIBUTION_LABEL = "Art. 50 \u00B7 Spurvik";
/** Language entry for a code, English for an unknown code. */
export declare function euLanguage(code: string): EuLanguage;
/** Bare lower-case host from a domain or URL, or "" when there is none. */
export declare function hostFromDomainLike(raw: string | undefined): string;
/** Best-guess notice language from a domain's country-code TLD (`www.stepnetwork.dk` -> `da`). */
export declare function inferLocaleFromDomain(raw: string | undefined): string;
/**
 * Strips HTML/JSX attribute injection characters (`< > " ' & \ { }` and backtick), C0/C1 control characters,
 * line separators, and Unicode bidi overrides, and caps the name at 64 characters.
 */
export declare function sanitizeSystemName(raw: string | undefined): string;
export interface BadgeAttributes {
    systemName: string;
    locale: string;
    theme: BadgeTheme;
    position: BadgePosition;
    attribution: boolean;
}
/** `data-*` pairs for badge.js, in tag order. Values are already sanitized or allow-listed. */
export declare function badgeDataAttributes(input: BadgeAttributes): Array<[string, string]>;
/** One-line badge.js tag. `inline` adds the mount point the badge renders into. */
export declare function buildBadgeScript(input: BadgeAttributes): string;
