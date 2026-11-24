import { describe, expect, it, vi } from "vitest";
import { generateArt50Badge, type Art50BadgeInput, type Art50BadgeResult } from "./art50-badge.js";
import { EU_LANGUAGES, EU_LOCALE_CODES, inferLocaleFromDomain, sanitizeSystemName } from "./badge-copy.js";

function badge(input: Art50BadgeInput = {}): Art50BadgeResult {
  const outcome = generateArt50Badge(input);
  if (!outcome.ok) throw new Error(`expected ok, got ${outcome.error}: ${outcome.message}`);
  return outcome.result;
}

describe("generateArt50Badge", () => {
  it("defaults to a Free, dark, bottom-right English badge with attribution", () => {
    const result = badge();
    expect(result).toMatchObject({
      tool: "spurvik_generate_art50_badge",
      systemName: "Support Assistant",
      locale: "en",
      localeSource: "default",
      position: "bottom-right",
      theme: "dark",
      attribution: true,
      attributionLabel: "Art. 50 · Spurvik",
      previewText: "Support Assistant. You are interacting with an AI system.",
    });
    expect(result.script).toBe(
      '<script src="https://spurvik.com/badge.js" data-system="Support Assistant" data-locale="en" data-theme="dark" data-attribution="true" defer></script>',
    );
    expect(result.script.includes("\n")).toBe(false);
  });

  it("covers all 24 official EU languages", () => {
    expect(EU_LOCALE_CODES).toHaveLength(24);
    expect(new Set(EU_LOCALE_CODES).size).toBe(24);
    expect(badge().supportedLocales).toEqual([...EU_LOCALE_CODES]);
    for (const language of EU_LANGUAGES) {
      const result = badge({ locale: language.code, systemName: "Helper" });
      expect(result.locale).toBe(language.code);
      expect(result.script).toContain(`data-locale="${language.code}"`);
      expect(result.previewText).toBe(`Helper. ${language.interaction}`);
      expect(language.interaction.length).toBeGreaterThan(10);
    }
  });

  it("normalizes locale case and rejects unknown locales", () => {
    expect(badge({ locale: " DA " }).locale).toBe("da");
    const outcome = generateArt50Badge({ locale: "no" });
    expect(outcome).toMatchObject({ ok: false, error: "invalid_locale" });
  });

  it("infers the language from a domain-like systemName and prefills appUrl + WCAG/EAA accessibility metadata", () => {
    const dk = badge({ systemName: "stepnetwork.dk" });
    expect(dk).toMatchObject({
      locale: "da",
      localeSource: "systemName_domain",
      language: "Dansk (da)",
      accessibility: {
        role: "status",
        ariaLive: "polite",
        lang: "da",
        screenReaderAnnouncement: "stepnetwork.dk. Du interagerer med et AI-system.",
        standard: "WCAG 2.1 AA / EN 301 549 (European Accessibility Act)",
      },
    });
    expect(dk.plan.proUrl).toBe("https://console.spurvik.com/signup?plan=pro&appUrl=stepnetwork.dk");
    expect(dk.plan.proAnnualUrl).toBe("https://console.spurvik.com/signup?plan=pro&interval=annual&appUrl=stepnetwork.dk");
    expect(dk.plan.doneForYouUrl).toBe("https://console.spurvik.com/signup?plan=concierge&appUrl=stepnetwork.dk");
    expect(dk.labelStudioUrl).toBe("https://console.spurvik.com/labels?domain=stepnetwork.dk");
    const comFr = badge({ systemName: "charlie-paris.com", locale: "fr", position: "inline", theme: "light" });
    expect(comFr.plan.proUrl).toBe("https://console.spurvik.com/signup?plan=pro&appUrl=charlie-paris.com&locale=fr");
    expect(comFr.plan.proAnnualUrl).toBe("https://console.spurvik.com/signup?plan=pro&interval=annual&appUrl=charlie-paris.com&locale=fr");
    expect(comFr.plan.doneForYouUrl).toBe("https://console.spurvik.com/signup?plan=concierge&appUrl=charlie-paris.com&locale=fr");
    expect(comFr.labelStudioUrl).toBe("https://console.spurvik.com/labels?domain=charlie-paris.com&locale=fr&pos=inline&theme=light");
    expect(badge({ systemName: "https://shop.example.de/path" }).locale).toBe("de");
    expect(badge({ systemName: "example.com" }).localeSource).toBe("default");
    expect(badge({ systemName: "example.dk", locale: "fr" })).toMatchObject({ locale: "fr", localeSource: "input" });
    expect(inferLocaleFromDomain("www.firma.ee")).toBe("et");
    expect(inferLocaleFromDomain("not a domain")).toBe("en");
  });

  it("writes data-attribution=false for white-label and explains the plan", () => {
    const result = badge({ attribution: false });
    expect(result.script).toContain('data-attribution="false"');
    expect(result.attributionLabel).toBeNull();
    expect(result.plan.whiteLabel).toMatch(/Pro \(€19\/mo\)/);
    expect(result.plan.whiteLabel).toMatch(/€199 once/);
    expect(result.plan.proUrl).toBe("https://console.spurvik.com/signup?plan=pro");
    expect(result.plan.doneForYouUrl).toBe("https://console.spurvik.com/signup?plan=concierge");
  });

  it("supports bottom-left, inline and light", () => {
    expect(badge({ position: "bottom-left" }).script).toContain('data-position="bottom-left"');
    const inline = badge({ position: "inline", theme: "light" });
    expect(inline.script.startsWith("<div data-spurvik-badge></div>\n<script ")).toBe(true);
    expect(inline.script).toContain('data-theme="light"');
    expect(inline.script).not.toContain("data-position");
    expect(inline.nextjs).toContain("<div data-spurvik-badge />");
  });

  it("emits Next.js, Shopify, WordPress, PrestaShop, Shopware, Cloudflare, Framer and shadcn/v0 variants", () => {
    const result = badge({ systemName: "Acme Helper", locale: "de", attribution: false });
    expect(result.shopify.liquidUrl).toBe("https://spurvik.com/r/spurvik-shopify-art50.liquid");
    expect(result.prestashop.moduleZipUrl).toBe("https://spurvik.com/r/spurvik-prestashop-art50.zip");
    expect(result.shopware.extensionZipUrl).toBe("https://spurvik.com/r/spurvik-shopware6-art50.zip");
    expect(result.cloudflare.workerJsUrl).toBe("https://spurvik.com/r/cloudflare-worker-art50-c2pa.js");
    expect(result.nextjs).toContain('import Script from "next/script";');
    expect(result.nextjs).toContain('src="https://spurvik.com/badge.js"');
    expect(result.nextjs).toContain('data-system="Acme Helper"');
    expect(result.nextjs).toContain('data-locale="de"');
    expect(result.nextjs).toContain('data-attribution="false"');
    expect(result.nextjs).toContain('strategy="afterInteractive"');
    expect(result.wordpress.pluginZipUrl).toBe("https://spurvik.com/r/spurvik-eu-ai-act-wp.zip");
    expect(result.framer.componentUrl).toBe("https://spurvik.com/r/spurvik-framer-badge.tsx");
    expect(result.shadcn.registryUrl).toBe("https://spurvik.com/r/article-50-badge.json");
    expect(result.shadcn.command).toBe("npx shadcn@latest add https://spurvik.com/r/article-50-badge.json");
    expect(result.shadcn.v0).toContain("https://spurvik.com/r/article-50-badge.json");
  });

  it("strips attribute-breaking characters from systemName", () => {
    const hostile = 'Bot"><script>alert(1)</script>{x}`&\\\u202Eevil\u2028';
    const result = badge({ systemName: hostile });
    const nextSystem = /data-system="([^"]*)"/.exec(result.nextjs)?.[1];
    const scriptSystem = /data-system="([^"]*)"/.exec(result.script)?.[1];
    expect(nextSystem).toBe(result.systemName);
    expect(scriptSystem).toBe(result.systemName);
    expect(result.script).not.toMatch(/<script>alert/);
    expect(result.nextjs).not.toMatch(/<script>alert/);
    expect(result.systemName).not.toMatch(/[\u202E\u2028{}`\\]/);
    expect(result.systemName).not.toMatch(/["<>&']/);
    expect(result.script.match(/"/g)?.length).toBe(10);
    expect(sanitizeSystemName("x".repeat(100))).toHaveLength(64);
    expect(sanitizeSystemName("   ")).toBe("Support Assistant");
  });

  it.each([
    [{ position: "top" }, "invalid_position"],
    [{ theme: "auto" }, "invalid_theme"],
    [{ attribution: "no" }, "invalid_attribution"],
    [{ systemName: "x".repeat(201) }, "invalid_system_name"],
    [{ locale: 5 }, "invalid_locale"],
  ])("rejects invalid input %j", (input, error) => {
    const outcome = generateArt50Badge(input as unknown as Art50BadgeInput);
    expect(outcome).toMatchObject({ ok: false, error });
  });

  it("makes no network call", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    badge({ systemName: "stepnetwork.dk" });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
