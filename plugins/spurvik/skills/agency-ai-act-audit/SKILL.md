---
name: agency-ai-act-audit
description: Batch-audit 1 to 10 client websites (Shopify, WordPress, Webflow, Framer, custom SaaS) for live AI chat widgets such as Intercom Fin, Zendesk AI, Tidio Lyro, HubSpot Breeze, Gorgias, Crisp, Drift and Dixa that show no visible EU AI Act Art. 50(1) notice, then write a client-ready Markdown table with a shareable readiness brief, a live status shield and the right one-step install for each site.
license: MIT
---

# Agency EU AI Act Art. 50(1) audit for 1 to 10 client sites

Use this skill when an agency, freelancer or multi-brand owner wants to know which of their client sites run an AI chat widget without a visible "you are interacting with an AI system" notice, and wants a result they can send to each client.

The scan reads one public page per domain over HTTPS. It is a heuristic: a widget or a notice that loads later, or only after login, can be missed. Say so in the results.

## Step 1: Collect the domains

Ask for 1 to 10 public domains or `https://` URLs, one per client. Remove duplicates. Drop anything that is localhost, an IP address or an internal host. For more than 10 sites, run several batches of 10.

## Step 2: Scan them

**Preferred: the `spurvik_batch_scan_domains` MCP tool** (no API key). It scans up to 10 domains in parallel and returns one row per host, each host's report link and status shield Markdown, and a one-line `badge.js` fix in the site's language for each gap.

- Remote: `https://console.spurvik.com/api/mcp` (in Claude Code: `claude mcp add --transport http spurvik https://console.spurvik.com/api/mcp`).
- Local: `npx -y spurvik-mcp-server@1.0.15`.

Both servers expose the same 10 zero-key tools, including `spurvik_batch_scan_domains`.

```json
{ "domains": ["client-one.example", "client-two.example", "client-three.example"] }
```

If one entry is not a public host, the whole batch is refused and nothing is fetched. Remove that entry and run it again.

**Fallback A: zero-key OpenAPI 3.1 REST endpoint** (no Node.js needed — `curl`, Custom GPT Actions, Copilot Studio, Zapier or Make; `Cache-Control: no-store`, 0 cookies):

```bash
curl -fsSL "https://console.spurvik.com/api/v1/portfolio/scan?domains=client1.eu,client2.fr,client3.se&locale=en"
# Or export a ready-to-paste 1-page client Markdown brief (with live Art. 50 + C2PA SVG shields):
curl -fsSL "https://console.spurvik.com/api/v1/report/markdown?domain=client1.eu&format=raw"
# Or POST JSON:
curl -fsSL -X POST https://console.spurvik.com/api/v1/portfolio/scan \
  -H "content-type: application/json" \
  -d '{"domains":["client1.eu","client2.fr"],"locale":"fr"}'
```

Returns `summary`, `results` (per-domain `detectedWidgets`, `detectedPlatforms`, `heroImageC2paProxy`, `statusShieldMarkdown`, `reportUrl`, `doneForYouSetupEur199Url`), and a copy-paste `markdownTable`.

**Fallback B: the zero-install CLI** (2 to 10 public domains in one command, or a loop for larger rosters):

```bash
# Single-command multi-domain batch scan (2–10 public domains at once, 4 in flight):
npx -y spurvik@1.0.18 scan client1.eu client2.fr client3.se --json

# Or loop through a clients.txt file (one lowercase domain per line):
while IFS= read -r d; do
  case "$d" in (""|*[!a-z0-9.-]*) echo "skipped: $d"; continue;; esac
  npx -y spurvik@1.0.18 scan "$d" --json > "scan-$d.json"
done < clients.txt
```

Each JSON row from `spurvik_batch_scan_domains`, `spurvik_scan_live_url` and `npx -y spurvik@1.0.18 scan --json` includes `detectedWidgets`, `detectedPlatforms` (15 CMS/commerce stacks: `Shopify`, `WordPress`, `PrestaShop`, `Shopware`, `Google Tag Manager`, `Webflow`, `Framer`, `Next.js`, `Wix`, `Squarespace`, `Drupal`, `Ghost`, `HubSpot CMS`, `Magento`, `BigCommerce`), `platformInstallerUrls` (`shopifyLiquid`, `wordpressPluginZip`, `prestashopModuleZip`, `shopwareExtensionZip`, `gtmContainerJson`, `framerComponentTsx`, `webflowGuide`, `nextjsShadcnRegistry`, `wixGuide`, `squarespaceGuide`, `drupalGuide`, `ghostGuide`, `hubspotCmsGuide`, `magentoGuide`, `bigcommerceGuide`), optional `heroImageProxy` (`{ name, fix, c2paCheckUrl }` when the frontpage hero image runs through a C2PA-stripping CDN ahead of 2 December 2026 Art. 50(2)), `badgeSnippet` and `reportUrl`; `spurvik_scan_live_url` and `npx -y spurvik@1.0.18 scan --json` also include `reportMarkdownUrl`, `trustCenterCardUrl`, `aiActManifestUrl` (`/.well-known/ai-act.json` generator) and `trustWidgetScript` (`trust-widget.js` tag). The status shield Markdown for any domain is:

```md
[![EU AI Act Art. 50](https://console.spurvik.com/api/v1/badge/status.svg?domain=<domain>)](https://console.spurvik.com/report?domain=<domain>)
[![EU AI Act Art. 50(2) C2PA](https://console.spurvik.com/api/v1/c2pa/status.svg?domain=<domain>)](https://console.spurvik.com/c2pa?domain=<domain>)
```

## Step 3: Match each client's detected platform

Use `detectedPlatforms` and `platformInstallerUrls` from Step 2 first (`spurvik-prestashop-art50.zip` for PrestaShop 1.7/8/9, `spurvik-shopware6-art50.zip` for Shopware 6.5/6.6+, `spurvik-eu-ai-act-wp.zip` for WordPress, `spurvik-shopify-art50.liquid` for Shopify, and `cloudflare-worker-art50-c2pa.js` behind Cloudflare). Only if a site runs DanDomain or Centra, check the homepage source:

```bash
curl -sSfL --proto '=https' --max-filesize 5000000 "https://$d/" | grep -oiE "cdn\.shopify\.com|/wp-content/|googletagmanager\.com|data-wf-site|framerusercontent\.com|prestashop|shopware|dandomain|centra" | sort -u
```

`cdn.shopify.com` is Shopify, `/wp-content/` is WordPress, `googletagmanager.com` is Google Tag Manager, `data-wf-site` is Webflow, `framerusercontent.com` is Framer, `prestashop` is PrestaShop, `shopware` is Shopware 6, `dandomain` is DanDomain and `centra` is Centra. No match means custom code.

| Platform | Install for a gap |
| --- | --- |
| Shopify | Online Store 2.0 section https://spurvik.com/r/spurvik-shopify-art50.liquid saved as `sections/spurvik-art50-notice.liquid` (footer notice) + https://spurvik.com/r/spurvik-shopify-trust-card.liquid (`sections/spurvik-trust-card.liquid` for `/pages/trust`). Language follows `request.locale.iso_code`; position defaults to `bottom-left`. |
| WordPress | Plugin v1.2.0 https://spurvik.com/r/spurvik-eu-ai-act-wp.zip (Plugins, Add New, Upload Plugin). Includes `[spurvik_trust_card]`, `[spurvik_status_shield]`, `[spurvik_c2pa_shield]` and 1-click `/.well-known/ai-act.json`. |
| Google Tag Manager | Container recipe https://spurvik.com/r/spurvik-gtm-art50-container.json (GTM Admin, Import Container, Merge; fires on `DOM Ready` with 4 editable variables). |
| Framer | https://spurvik.com/r/spurvik-framer-badge.tsx pasted into Assets, Code, New Code File, then `SpurvikArticle50Badge` dragged onto the page. |
| Webflow, PrestaShop, Shopware 6, DanDomain, Centra, custom SaaS | One line before `</body>` (Webflow: Site settings, Custom code, Footer code; PrestaShop: `themes/<theme>/templates/_partials/footer.tpl`; Shopware 6: `Resources/views/storefront/base.html.twig`): `<script src="https://spurvik.com/badge.js" data-system="<client>" data-locale="<lang>" data-position="bottom-left" defer></script>` |

`bottom-left` keeps the notice clear of chat launchers on the bottom right. Use the `data-locale` from the scan's suggested fix when there is one.

## Step 4: Write the client-ready table

Output one table, gaps first, then a short block per client with the copy-paste shield and install. Use this layout:

```md
| Client | AI chat widget found | Art. 50(1) notice | Gap | Readiness brief | Live status | Install |
| --- | --- | --- | --- | --- | --- | --- |
| client-one.example | Intercom Fin | Not detected | **Yes** | [Brief](https://console.spurvik.com/report?domain=client-one.example) | [![EU AI Act Art. 50](https://console.spurvik.com/api/v1/badge/status.svg?domain=client-one.example)](https://console.spurvik.com/report?domain=client-one.example) | Shopify section |
| client-two.example | None detected | Not detected | No | [Brief](https://console.spurvik.com/report?domain=client-two.example) | [![EU AI Act Art. 50](https://console.spurvik.com/api/v1/badge/status.svg?domain=client-two.example)](https://console.spurvik.com/report?domain=client-two.example) | Not needed |
```

Each readiness brief at `https://console.spurvik.com/report?domain=<domain>` is a shareable page the client or their DPO can open and save as a PDF. Never call a site "compliant": report what the scan found.

## Step 5: Explain the options

Tell the agency, in plain words:

- **Free (€0):** the scan, the reports, the status shields, `badge.js` and the plugins. The free cockpit at https://console.spurvik.com/portfolio scans up to 10 domains in the browser and exports CSV or Markdown.
- **White-label on Pro (€19/mo, €190/yr):** `data-attribution="false"` hides the small "Art. 50 · Spurvik" link, so the notice carries only the client's brand.
- **Team (€79/mo, €790/yr):** everything in Pro plus 2,000,000 events a month, 12-month Frankfurt log retention, webhook export and Annex IV technical documentation drafts: https://console.spurvik.com/signup?plan=team (interactive agency retainer & margin simulator in EN: https://spurvik.com/eu-ai-act-for-agencies, DE: https://spurvik.com/de/ki-verordnung-fuer-agenturen-artikel-50-white-label, FR: https://spurvik.com/fr/reglement-ia-pour-agences-audit-clients-article-50, NL: https://spurvik.com/nl/ai-verordening-voor-bureaus-klantenaudit-artikel-50-white-label, DA: https://spurvik.com/da/eu-ai-act-for-bureauer-kundetjek-artikel-50-white-label, SV: https://spurvik.com/sv/ai-forordningen-for-byraer-kundrevision-artikel-50-white-label, ES: https://spurvik.com/es/reglamento-ia-para-agencias-auditoria-clientes-articulo-50-marca-blanca, IT: https://spurvik.com/it/regolamento-ia-per-agenzie-audit-clienti-articolo-50-white-label)
- **Done-For-You 24h Setup (€199 once per site):** a Spurvik engineer installs the notice within 24 hours; 1 full year of Pro is included. Prefill the client's domain: `https://console.spurvik.com/signup?plan=concierge&appUrl=<domain>`

Prices are excl. VAT, B2B.

## Step 6: Check your work

1. Every client has a row with a report link and a status shield.
2. Every gap row has one install that matches its platform.
3. After an install goes live, scan that domain again: the gap is "No". In CI, `npx -y spurvik@1.0.18 scan <domain> --fail-on-gap` exits 0.

<sub>Scope: heuristic check of one public page per domain; it does not classify a client's use case or make a site meet the EU AI Act. Not legal advice.</sub>
