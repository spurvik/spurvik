/**
 * Spurvik Zero-Code Cloudflare Edge Worker — Art. 50(1) AI Notice + 2 Dec 2026 Art. 50(2) C2PA Passthrough
 * Download: curl -fsSLO https://spurvik.com/r/cloudflare-worker-art50-c2pa.js
 * License: MIT · EyeTea Solutions ApS (CVR 37093378) · https://spurvik.com
 *
 * What this single edge file does across your entire Cloudflare domain (0 origin code edits, 0 cookies):
 *   1. Injects the 24-language Shadow DOM Art. 50(1) notice (`https://spurvik.com/badge.js`) before `</body>`
 *      using Cloudflare's streaming `HTMLRewriter` (0 ms full-page buffering, skips `/api/*` and `/admin/*`).
 *   2. Preserves embedded C2PA JUMBF signatures (`Art. 50(2)` — applies 2 December 2026 under Art. 111(4))
 *      on AI-generated media paths (`/ai-media/*`, `/c2pa/*`, `/generated/*`, `*.c2pa.*`) by disabling
 *      Cloudflare Polish & Mirage image re-encoding (`cf: { polish: "off", mirage: false }`).
 *
 * Optional Worker variables (`wrangler.toml` [vars]):
 *   SPURVIK_SYSTEM_NAME   = "Support AI"        # Displayed AI system name
 *   SPURVIK_LOCALE        = "auto"              # "auto" follows <html lang> across all 24 official EU languages
 *   SPURVIK_POSITION      = "bottom-left"       # Clears bottom-right Intercom / Zendesk / Gorgias launchers
 *   SPURVIK_THEME         = "auto"              # "dark" | "light" | "auto"
 *   SPURVIK_ATTRIBUTION   = "true"              # Set "false" on Pro (€19/mo or €190/yr), Team (€79/mo or €790/yr), or Done-For-You (€199 once)
 *   SPURVIK_C2PA_PREFIXES = "/ai-media/,/c2pa/,/generated/"
 *
 * Plans & Frankfurt (fra1) workspace: https://console.spurvik.com/signup
 * Software supporting your EU AI Act work; responsibility stays with you. Not legal advice.
 */

const DEFAULT_C2PA_PREFIXES = ["/ai-media/", "/c2pa/", "/generated/"];
const SKIP_HTML_PREFIXES = ["/api/", "/cdn-cgi/", "/wp-admin/", "/wp-json/", "/admin/", "/_next/"];
const ALLOWED_POSITIONS = new Set(["bottom-left", "bottom-right"]);
const ALLOWED_THEMES = new Set(["dark", "light", "auto"]);
const ALLOWED_NOTICES = new Set([
  "interaction",
  "generated",
  "deepfake",
  "public-interest",
  "emotion-biometric",
]);

export function escapeHtmlAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function parseC2paPrefixes(raw) {
  if (!raw || typeof raw !== "string") return DEFAULT_C2PA_PREFIXES;
  const parsed = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.startsWith("/"));
  return parsed.length > 0 ? parsed : DEFAULT_C2PA_PREFIXES;
}

export function shouldBypassC2paTransform(pathname, prefixes = DEFAULT_C2PA_PREFIXES) {
  const clean = String(pathname || "").toLowerCase();
  if (!clean) return false;
  if (/\.c2pa\.(?:png|jpe?g|webp|avif|mp4)$/i.test(clean)) return true;
  return prefixes.some((prefix) => clean.startsWith(prefix.toLowerCase()));
}

export function shouldInjectHtmlNotice(pathname) {
  const clean = String(pathname || "").toLowerCase();
  return !SKIP_HTML_PREFIXES.some((prefix) => clean.startsWith(prefix));
}

export function buildBadgeScriptTag(env = {}) {
  const systemName = escapeHtmlAttr((env.SPURVIK_SYSTEM_NAME || "AI Assistant").slice(0, 120));
  const position = ALLOWED_POSITIONS.has(env.SPURVIK_POSITION) ? env.SPURVIK_POSITION : "bottom-left";
  const theme = ALLOWED_THEMES.has(env.SPURVIK_THEME) ? env.SPURVIK_THEME : "auto";
  const notice = ALLOWED_NOTICES.has(env.SPURVIK_NOTICE) ? env.SPURVIK_NOTICE : "interaction";
  const localeRaw = String(env.SPURVIK_LOCALE || "auto").trim().toLowerCase();
  const localeAttr =
    localeRaw && localeRaw !== "auto" && /^[a-z]{2}$/.test(localeRaw)
      ? ` data-locale="${localeRaw}"`
      : "";
  const attribution = String(env.SPURVIK_ATTRIBUTION || "true").trim().toLowerCase() === "false" ? "false" : "true";
  return `<script src="https://spurvik.com/badge.js" data-system="${systemName}" data-notice="${notice}" data-position="${position}" data-theme="${theme}"${localeAttr} data-attribution="${attribution}" defer></script>`;
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const prefixes = parseC2paPrefixes(env.SPURVIK_C2PA_PREFIXES);

    // 1. Preserve C2PA JUMBF signatures byte-for-byte on signed AI media paths (Art. 50(2) — 2 Dec 2026)
    if (shouldBypassC2paTransform(url.pathname, prefixes)) {
      const originRes = await fetch(request, {
        cf: { polish: "off", mirage: false },
      });
      const headers = new Headers(originRes.headers);
      headers.set("x-spurvik-provenance", "c2pa-passthrough");
      return new Response(originRes.body, {
        status: originRes.status,
        statusText: originRes.statusText,
        headers,
      });
    }

    const response = await fetch(request);
    if ((method !== "GET" && method !== "HEAD") || !shouldInjectHtmlNotice(url.pathname)) {
      return response;
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html") || typeof HTMLRewriter === "undefined") {
      return response;
    }

    // 2. Stream-inject 24-language zero-cookie Art. 50(1) notice before </body> unless already present
    const tag = buildBadgeScriptTag(env);
    let alreadyPresent = false;
    return new HTMLRewriter()
      .on('script[src*="spurvik.com/badge.js"], [data-spurvik-badge], [data-spurvik-art50]', {
        element() {
          alreadyPresent = true;
        },
      })
      .on("body", {
        element(body) {
          body.onEndTag((endTag) => {
            if (!alreadyPresent) {
              endTag.before(tag, { html: true });
            }
          });
        },
      })
      .transform(response);
  },
};
