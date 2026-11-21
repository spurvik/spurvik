import { type BadgePosition, type BadgeTheme } from "./badge-copy.js";
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
    wordpress: {
        pluginZipUrl: string;
        steps: string;
    };
    framer: {
        componentUrl: string;
        steps: string;
    };
    shadcn: {
        registryUrl: string;
        command: string;
        v0: string;
    };
    supportedLocales: string[];
    plan: {
        attributionFree: string;
        whiteLabel: string;
        proUrl: string;
        doneForYouUrl: string;
    };
    note: string;
}
export type Art50BadgeOutcome = {
    ok: true;
    result: Art50BadgeResult;
} | {
    ok: false;
    error: string;
    message: string;
};
/** JSON Schema of the tool input, the same shape server.ts registers with zod. */
export declare const ART50_BADGE_INPUT_JSON_SCHEMA: {
    readonly type: "object";
    readonly properties: {
        readonly locale: {
            readonly type: "string";
            readonly enum: readonly string[];
            readonly description: "One of the 24 official EU language codes. Inferred from a domain-like systemName when omitted, else en.";
        };
        readonly position: {
            readonly type: "string";
            readonly enum: readonly ["bottom-right", "bottom-left", "inline"];
            readonly description: "Badge placement. Defaults to bottom-right.";
        };
        readonly theme: {
            readonly type: "string";
            readonly enum: readonly ["dark", "light"];
            readonly description: "Badge theme. Defaults to dark.";
        };
        readonly systemName: {
            readonly type: "string";
            readonly description: "Product or assistant name, or the site domain. Defaults to Support Assistant.";
        };
        readonly attribution: {
            readonly type: "boolean";
            readonly description: "Show the \"Art. 50 · Spurvik\" trust link. Defaults to true (Free). false is white-label (Pro or Done-For-You).";
        };
    };
    readonly additionalProperties: false;
};
/** Zero-network Art. 50(1) notice generator across the 24 official EU languages. */
export declare function generateArt50Badge(input?: Art50BadgeInput): Art50BadgeOutcome;
