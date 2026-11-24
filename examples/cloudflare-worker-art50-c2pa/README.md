# Cloudflare Edge Worker — EU AI Act Art. 50(1) Notice & 2 Dec 2026 C2PA Passthrough

Deploy a single zero-dependency Cloudflare Worker (`worker.js`, MIT) across any domain or subdomain to:

1. **Stream-inject the 24-language Art. 50(1) notice (`badge.js`)** before `</body>` via Cloudflare's `HTMLRewriter` (`0` origin code edits, `0` cookies, skips `/api/*` and `/admin/*`, skips pages that already carry `badge.js` or `[data-spurvik-badge]`).
2. **Preserve embedded C2PA JUMBF signatures (`Art. 50(2)` — applies 2 December 2026 under Art. 111(4))** on `/ai-media/*`, `/c2pa/*`, `/generated/*`, and `*.c2pa.*` assets by fetching from origin with `cf: { polish: "off", mirage: false }` (`X-Spurvik-Provenance: c2pa-passthrough`).

## Quickstart

```bash
curl -fsSLO https://spurvik.com/r/cloudflare-worker-art50-c2pa.js
npx wrangler deploy cloudflare-worker-art50-c2pa.js --name spurvik-art50-c2pa
```

## Example `wrangler.toml`

```toml
name = "spurvik-art50-c2pa"
main = "worker.js"
compatibility_date = "2026-11-01"

[vars]
SPURVIK_SYSTEM_NAME = "Support AI"
SPURVIK_LOCALE = "auto"         # follows <html lang> across all 24 official EU languages
SPURVIK_POSITION = "bottom-left"
SPURVIK_THEME = "auto"
SPURVIK_ATTRIBUTION = "true"    # set "false" on Pro (€19/mo or €190/yr), Team (€79/mo or €790/yr), or Done-For-You (€199 once)
SPURVIK_C2PA_PREFIXES = "/ai-media/,/c2pa/,/generated/"
```

Check delivered image C2PA manifests with `npx spurvik@1.0.14 c2pa https://yourdomain.com/ai-media/hero.png --fail-on-missing` or at https://console.spurvik.com/c2pa. Hosted EU Frankfurt (`fra1`) plans: https://console.spurvik.com/signup (`excl. VAT · B2B`).

<sub>Software supporting your EU AI Act work; responsibility stays with you. Not legal advice.</sub>
