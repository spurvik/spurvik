import { BADGE_SCRIPT_SRC } from "../links.js";

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
export const EU_LANGUAGES: readonly EuLanguage[] = [
  { code: "en", label: "English (en)", interaction: "You are interacting with an AI system." },
  { code: "da", label: "Dansk (da)", interaction: "Du interagerer med et AI-system." },
  { code: "de", label: "Deutsch (de)", interaction: "Sie interagieren mit einem KI-System." },
  { code: "fr", label: "Français (fr)", interaction: "Vous interagissez avec un système d’IA." },
  { code: "es", label: "Español (es)", interaction: "Está interactuando con un sistema de IA." },
  { code: "nl", label: "Nederlands (nl)", interaction: "U communiceert met een AI-systeem." },
  { code: "sv", label: "Svenska (sv)", interaction: "Du interagerar med ett AI-system." },
  { code: "pl", label: "Polski (pl)", interaction: "Korzystasz z systemu AI." },
  { code: "it", label: "Italiano (it)", interaction: "Stai interagendo con un sistema di IA." },
  { code: "pt", label: "Português (pt)", interaction: "Está a interagir com um sistema de IA." },
  { code: "fi", label: "Suomi (fi)", interaction: "Käytät tekoälyjärjestelmää." },
  { code: "cs", label: "Čeština (cs)", interaction: "Komunikujete se systémem umělé inteligence." },
  { code: "bg", label: "Български (bg)", interaction: "Взаимодействате със система с изкуствен интелект." },
  { code: "el", label: "Ελληνικά (el)", interaction: "Αλληλεπιδράτε με σύστημα τεχνητής νοημοσύνης." },
  { code: "et", label: "Eesti (et)", interaction: "Suhtlete tehisintellektisüsteemiga." },
  { code: "ga", label: "Gaeilge (ga)", interaction: "Tá tú ag idirghníomhú le córas intleachta saorga." },
  { code: "hr", label: "Hrvatski (hr)", interaction: "Komunicirate sa sustavom umjetne inteligencije." },
  { code: "hu", label: "Magyar (hu)", interaction: "Ön egy mesterségesintelligencia-rendszerrel lép kapcsolatba." },
  { code: "lt", label: "Lietuvių (lt)", interaction: "Jūs sąveikaujate su dirbtinio intelekto sistema." },
  { code: "lv", label: "Latviešu (lv)", interaction: "Jūs mijiedarbojaties ar mākslīgā intelekta sistēmu." },
  { code: "mt", label: "Malti (mt)", interaction: "Qed tinteraġixxi ma’ sistema tal-IA." },
  { code: "ro", label: "Română (ro)", interaction: "Interacționați cu un sistem de IA." },
  { code: "sk", label: "Slovenčina (sk)", interaction: "Komunikujete so systémom umelej inteligencie." },
  { code: "sl", label: "Slovenščina (sl)", interaction: "Sodelujete s sistemom umetne inteligence." },
];

export const EU_LOCALE_CODES: readonly string[] = EU_LANGUAGES.map((language) => language.code);

export const BADGE_POSITIONS = ["bottom-right", "bottom-left", "inline"] as const;
export const BADGE_THEMES = ["dark", "light"] as const;
export type BadgePosition = (typeof BADGE_POSITIONS)[number];
export type BadgeTheme = (typeof BADGE_THEMES)[number];

export const DEFAULT_SYSTEM_NAME = "Support Assistant";
export const ATTRIBUTION_LABEL = "Art. 50 · Spurvik";

/** Language entry for a code, English for an unknown code. */
export function euLanguage(code: string): EuLanguage {
  return EU_LANGUAGES.find((language) => language.code === code) ?? EU_LANGUAGES[0]!;
}

/** ccTLD to official EU language code. Anything else (.com, .eu, .io, .ie, ...) reads as English. */
const CCTLD_LOCALES: Readonly<Record<string, string>> = {
  dk: "da",
  de: "de",
  at: "de",
  se: "sv",
  nl: "nl",
  fr: "fr",
  be: "fr",
  es: "es",
  it: "it",
  pl: "pl",
  pt: "pt",
  fi: "fi",
  gr: "el",
  cz: "cs",
  ro: "ro",
  hu: "hu",
  bg: "bg",
  hr: "hr",
  sk: "sk",
  si: "sl",
  lt: "lt",
  lv: "lv",
  ee: "et",
};

/** Bare lower-case host from a domain or URL, or "" when there is none. */
export function hostFromDomainLike(raw: string | undefined): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || /\s/.test(trimmed)) return "";
  try {
    const withScheme = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    const host = new URL(withScheme).hostname.replace(/\.$/, "");
    return host.includes(".") ? host : "";
  } catch {
    return "";
  }
}

/** Best-guess notice language from a domain's country-code TLD (`www.stepnetwork.dk` -> `da`). */
export function inferLocaleFromDomain(raw: string | undefined): string {
  const host = hostFromDomainLike(raw);
  if (!host) return "en";
  const tld = host.slice(host.lastIndexOf(".") + 1);
  return Object.hasOwn(CCTLD_LOCALES, tld) ? CCTLD_LOCALES[tld]! : "en";
}

/**
 * Strips HTML/JSX attribute injection characters (`< > " ' & \ { }` and backtick), C0/C1 control characters,
 * line separators, and Unicode bidi overrides, and caps the name at 64 characters.
 */
export function sanitizeSystemName(raw: string | undefined): string {
  const cleaned = (raw ?? "")
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069<>"'`&\\{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64)
    .trim();
  return cleaned || DEFAULT_SYSTEM_NAME;
}

export interface BadgeAttributes {
  systemName: string;
  locale: string;
  theme: BadgeTheme;
  position: BadgePosition;
  attribution: boolean;
}

/** `data-*` pairs for badge.js, in tag order. Values are already sanitized or allow-listed. */
export function badgeDataAttributes(input: BadgeAttributes): Array<[string, string]> {
  const pairs: Array<[string, string]> = [
    ["data-system", sanitizeSystemName(input.systemName)],
    ["data-locale", EU_LOCALE_CODES.includes(input.locale) ? input.locale : "en"],
    ["data-theme", input.theme === "light" ? "light" : "dark"],
  ];
  if (input.position === "bottom-left") pairs.push(["data-position", "bottom-left"]);
  // Always explicit: hosted badge.js 1.0.5 shows the link only with "true", 1.0.6 hides it only with "false".
  pairs.push(["data-attribution", input.attribution ? "true" : "false"]);
  return pairs;
}

/** One-line badge.js tag. `inline` adds the mount point the badge renders into. */
export function buildBadgeScript(input: BadgeAttributes): string {
  const attrs = badgeDataAttributes(input)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join("");
  const tag = `<script src="${BADGE_SCRIPT_SRC}"${attrs} defer></script>`;
  return input.position === "inline" ? `<div data-spurvik-badge></div>\n${tag}` : tag;
}
