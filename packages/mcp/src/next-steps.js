import { C2PA_PAGE_URL, CONCIERGE_SIGNUP_URL, conciergeSignupUrlFor, hmacCockpitUrlFor, LABELS_URL, PRO_ANNUAL_SIGNUP_URL, proAnnualSignupUrlFor, PRO_SIGNUP_URL, proSignupUrlFor, reportUrlFor, SIGNUP_URL, TEAM_SIGNUP_URL, teamSignupUrlFor, VENDOR_QUESTIONNAIRE_URL, } from "./links.js";
import { EU_LANGUAGES, inferLocaleFromDomain } from "./tools/badge-copy.js";
import { publicHostname } from "./tools/public-hostname.js";
const QUESTIONNAIRE_URL_BY_LOCALE = {
    de: "https://spurvik.com/de/ki-verordnung-sicherheitsfragebogen-lieferanten-dsb",
    fr: "https://spurvik.com/fr/questionnaire-securite-reglement-ia-dpo-fournisseur",
    nl: "https://spurvik.com/nl/ai-verordening-leveranciersvragenlijst-fg-beveiliging",
    da: "https://spurvik.com/da/eu-ai-act-leverandoerspoergeskema-dpo-sikkerhed",
    sv: "https://spurvik.com/sv/ai-forordningen-leverantorssakerhetsformular-dso",
    es: "https://spurvik.com/es/cuestionario-seguridad-proveedor-reglamento-ia-dpd",
    it: "https://spurvik.com/it/questionario-sicurezza-fornitori-regolamento-ia-dpo",
};
/**
 * `## Next steps` action links appended to stdio tool output, the same lines as the hosted
 * console.spurvik.com/api/mcp (H25). The links are static; the badge block only adds a sanitized hostname.
 * The pure helpers (setupSnippet, markingHooksText, explainReceipt, …) stay link-free so the hosted
 * console can reuse them without doubling the block.
 */
const FREE_KEY_STEP = `- Mint a Free SPURVIK_API_KEY in 10s (1-field email, no password, EU Frankfurt fra1): ${SIGNUP_URL}`;
const PRO_STEP = `- White-label Art. 50 badge + 90-day Frankfurt vault + Slack/Teams approval gates (Pro €19/mo): ${PRO_SIGNUP_URL}`;
const PRO_ANNUAL_STEP = `- Pro Annual (2 months free · €190/yr single invoice): ${PRO_ANNUAL_SIGNUP_URL}`;
const TEAM_STEP = `- 12-month retention + Annex IV technical documentation draft (Team €79/mo): ${TEAM_SIGNUP_URL}`;
const CONCIERGE_LABEL = "- Done-For-You 24h setup (€199 once, incl. 1 yr Pro):";
const CONCIERGE_STEP = `${CONCIERGE_LABEL} ${CONCIERGE_SIGNUP_URL}`;
/** A `## Next steps` block for text that already ends with a newline: one blank line, the heading, the links. */
function block(...steps) {
    return `\n## Next steps\n${steps.join("\n")}\n`;
}
function resolveOptionalLocale(rawLocale) {
    const primary = typeof rawLocale === "string" ? rawLocale.trim().split(/[-_,;]/)[0]?.toLowerCase() ?? "" : "";
    return primary && EU_LANGUAGES.some((l) => l.code === primary) && primary !== "en" ? primary : null;
}
export function setupNextSteps(rawDomain, rawLocale) {
    const host = publicHostname(rawDomain);
    const loc = resolveOptionalLocale(rawLocale);
    if (!host && !loc)
        return block(FREE_KEY_STEP, PRO_STEP, PRO_ANNUAL_STEP, TEAM_STEP, CONCIERGE_STEP);
    const freeParams = [];
    if (host)
        freeParams.push(`appUrl=${encodeURIComponent(host)}`);
    if (loc)
        freeParams.push(`locale=${loc}`);
    const freeUrl = freeParams.length > 0 ? `${SIGNUP_URL}?${freeParams.join("&")}` : SIGNUP_URL;
    const locSuffix = loc ? `&locale=${loc}` : "";
    const proUrl = `${host ? proSignupUrlFor(host) : PRO_SIGNUP_URL}${locSuffix}`;
    const proAnnualUrl = `${host ? proAnnualSignupUrlFor(host) : PRO_ANNUAL_SIGNUP_URL}${locSuffix}`;
    const teamUrl = `${host ? teamSignupUrlFor(host) : TEAM_SIGNUP_URL}${locSuffix}`;
    const conciergeUrl = `${host ? conciergeSignupUrlFor(host) : CONCIERGE_SIGNUP_URL}${locSuffix}`;
    const steps = [];
    if (host)
        steps.push(`- Live Art. 50(1) report for ${host}: ${reportUrlFor(host)}${loc ? `&locale=${loc}` : ""}`);
    steps.push(`- Mint a Free SPURVIK_API_KEY in 10s (1-field email, no password, EU Frankfurt fra1): ${freeUrl}`, `- White-label Art. 50 badge + 90-day Frankfurt vault + Slack/Teams approval gates (Pro €19/mo): ${proUrl}`, `- Pro Annual (2 months free · €190/yr single invoice): ${proAnnualUrl}`, `- 12-month retention + Annex IV technical documentation draft (Team €79/mo): ${teamUrl}`, `${CONCIERGE_LABEL} ${conciergeUrl}`);
    return block(...steps);
}
export const SETUP_NEXT_STEPS = setupNextSteps();
export function findNextSteps(rawDomain, rawLocale) {
    const host = publicHostname(rawDomain);
    const loc = resolveOptionalLocale(rawLocale);
    const wrapLead = "- Wrap detected calls: call `spurvik_setup_snippet` for your SDK/runtime (`npm install spurvik`).";
    if (!host && !loc) {
        return block(wrapLead, FREE_KEY_STEP, PRO_STEP, PRO_ANNUAL_STEP, TEAM_STEP, CONCIERGE_STEP);
    }
    const freeParams = [];
    if (host)
        freeParams.push(`appUrl=${encodeURIComponent(host)}`);
    if (loc)
        freeParams.push(`locale=${loc}`);
    const freeUrl = freeParams.length > 0 ? `${SIGNUP_URL}?${freeParams.join("&")}` : SIGNUP_URL;
    const locSuffix = loc ? `&locale=${loc}` : "";
    const proUrl = `${host ? proSignupUrlFor(host) : PRO_SIGNUP_URL}${locSuffix}`;
    const proAnnualUrl = `${host ? proAnnualSignupUrlFor(host) : PRO_ANNUAL_SIGNUP_URL}${locSuffix}`;
    const teamUrl = `${host ? teamSignupUrlFor(host) : TEAM_SIGNUP_URL}${locSuffix}`;
    const conciergeUrl = `${host ? conciergeSignupUrlFor(host) : CONCIERGE_SIGNUP_URL}${locSuffix}`;
    return block(wrapLead, `- Mint a Free SPURVIK_API_KEY in 10s (1-field email, no password, EU Frankfurt fra1): ${freeUrl}`, `- White-label Art. 50 badge + 90-day Frankfurt vault + Slack/Teams approval gates (Pro €19/mo): ${proUrl}`, `- Pro Annual (2 months free · €190/yr single invoice): ${proAnnualUrl}`, `- 12-month retention + Annex IV technical documentation draft (Team €79/mo): ${teamUrl}`, `${CONCIERGE_LABEL} ${conciergeUrl}`);
}
export const FIND_NEXT_STEPS = findNextSteps();
export function receiptNextSteps(rawDomain, rawLocale) {
    const host = publicHostname(rawDomain);
    const primaryLocale = typeof rawLocale === "string" ? rawLocale.trim().split(/[-_,;]/)[0]?.toLowerCase() ?? "" : "";
    const explicitLoc = primaryLocale && EU_LANGUAGES.some((l) => l.code === primaryLocale) && primaryLocale !== "en" ? primaryLocale : null;
    const effectiveLocale = explicitLoc ?? (host ? inferLocaleFromDomain(host) : "en");
    const needLocParam = effectiveLocale !== "en" && (explicitLoc !== null || (host !== null && inferLocaleFromDomain(host) === "en"));
    const freeParams = [];
    if (host)
        freeParams.push(`appUrl=${encodeURIComponent(host)}`);
    if (needLocParam)
        freeParams.push(`locale=${effectiveLocale}`);
    const freeUrl = freeParams.length > 0 ? `${SIGNUP_URL}?${freeParams.join("&")}` : SIGNUP_URL;
    const locSuffix = needLocParam ? `&locale=${effectiveLocale}` : "";
    const proUrl = `${host ? proSignupUrlFor(host) : PRO_SIGNUP_URL}${locSuffix}`;
    const teamUrl = `${host ? teamSignupUrlFor(host) : TEAM_SIGNUP_URL}${locSuffix}`;
    return block(`- Interactive Art. 12 & GDPR Art. 5(1)(c) HMAC-SHA256 receipt cockpit (0 bytes of prompt text): ${hmacCockpitUrlFor(host, effectiveLocale)}`, `- Stream signed HMAC-SHA256 receipts (\`inputHash\` + \`recordHash\`) to EU Frankfurt (\`fra1\`) — Free SPURVIK_API_KEY in 10s: ${freeUrl}`, `- 90-day audit retention + DPO engineering summary download (Pro €19/mo): ${proUrl}`, `- 12-month retention + Annex IV technical documentation draft (Team €79/mo): ${teamUrl}`);
}
export const RECEIPT_NEXT_STEPS = receiptNextSteps();
export function markingNextSteps(rawDomain, rawLocale) {
    const host = publicHostname(rawDomain);
    const loc = resolveOptionalLocale(rawLocale);
    if (!host && !loc) {
        return block(`- Check live image URLs for C2PA JUMBF manifests & CDN stripping (2 Dec 2026 Art. 50(2)): call \`spurvik_check_image_c2pa_url\` or open ${C2PA_PAGE_URL}`, `- Mint a Free SPURVIK_API_KEY in 10s (1-field email, no password): ${SIGNUP_URL}`, `- White-label Art. 50 badge + 90-day Frankfurt provenance vault (Pro €19/mo): ${PRO_SIGNUP_URL}`, PRO_ANNUAL_STEP);
    }
    const c2paParams = [];
    if (host)
        c2paParams.push(`domain=${encodeURIComponent(host)}`);
    if (loc)
        c2paParams.push(`locale=${loc}`);
    const c2paUrl = `${C2PA_PAGE_URL}?${c2paParams.join("&")}`;
    const freeParams = [];
    if (host)
        freeParams.push(`appUrl=${encodeURIComponent(host)}`);
    if (loc)
        freeParams.push(`locale=${loc}`);
    const freeUrl = `${SIGNUP_URL}?${freeParams.join("&")}`;
    const locSuffix = loc ? `&locale=${loc}` : "";
    const proUrl = `${host ? proSignupUrlFor(host) : PRO_SIGNUP_URL}${locSuffix}`;
    const proAnnualUrl = `${host ? proAnnualSignupUrlFor(host) : PRO_ANNUAL_SIGNUP_URL}${locSuffix}`;
    return block(`- Check live image URLs for C2PA JUMBF manifests & CDN stripping (2 Dec 2026 Art. 50(2)): call \`spurvik_check_image_c2pa_url\` or open ${c2paUrl}`, `- Mint a Free SPURVIK_API_KEY in 10s (1-field email, no password): ${freeUrl}`, `- White-label Art. 50 badge + 90-day Frankfurt provenance vault (Pro €19/mo): ${proUrl}`, `- Pro Annual (2 months free · €190/yr single invoice): ${proAnnualUrl}`);
}
export const MARKING_NEXT_STEPS = markingNextSteps();
/** Risk-tier links. None for a prohibited practice: Spurvik offers no setup for it. */
export function classifyNextSteps(tier, rawSiteDomain, rawLocale) {
    if (tier === "prohibited_art5")
        return null;
    const host = publicHostname(rawSiteDomain);
    const primaryLocale = typeof rawLocale === "string" ? rawLocale.trim().split(/[-_,;]/)[0]?.toLowerCase() ?? "" : "";
    const explicitLoc = primaryLocale && EU_LANGUAGES.some((l) => l.code === primaryLocale) && primaryLocale !== "en" ? primaryLocale : null;
    const hostLoc = host ? inferLocaleFromDomain(host) : "en";
    const loc = explicitLoc ?? (hostLoc !== "en" ? hostLoc : null);
    if (!host && !loc) {
        const steps = [
            `- Enterprise Security Questionnaire & DPO RFP Auto-Responder: ${VENDOR_QUESTIONNAIRE_URL} (or call \`spurvik_vendor_questionnaire_answers\`)`,
            FREE_KEY_STEP,
            PRO_STEP,
        ];
        if (tier === "high_risk_annex_iii")
            steps.push(TEAM_STEP, CONCIERGE_STEP);
        return block(...steps).trimStart();
    }
    const rfpBase = (loc && QUESTIONNAIRE_URL_BY_LOCALE[loc]) || VENDOR_QUESTIONNAIRE_URL;
    const rfpUrl = host ? `${rfpBase}?domain=${encodeURIComponent(host)}` : rfpBase;
    const freeParams = [];
    if (host)
        freeParams.push(`appUrl=${encodeURIComponent(host)}`);
    if (loc)
        freeParams.push(`locale=${loc}`);
    const freeUrl = freeParams.length > 0 ? `${SIGNUP_URL}?${freeParams.join("&")}` : SIGNUP_URL;
    const paidSuffix = `${host ? `&appUrl=${encodeURIComponent(host)}` : ""}${loc ? `&locale=${loc}` : ""}`;
    const steps = [
        ...(host ? [`- Live Art. 50(1) report for ${host}: ${reportUrlFor(host)}${loc ? `&locale=${loc}` : ""}`] : []),
        `- Enterprise Security Questionnaire & DPO RFP Auto-Responder: ${rfpUrl} (or call \`spurvik_vendor_questionnaire_answers\`)`,
        `- Mint a Free SPURVIK_API_KEY in 10s (1-field email, no password, EU Frankfurt fra1): ${freeUrl}`,
        `- White-label Art. 50 badge + 90-day Frankfurt vault + Slack/Teams approval gates (Pro €19/mo): ${PRO_SIGNUP_URL}${paidSuffix}`,
    ];
    if (tier === "high_risk_annex_iii") {
        steps.push(`- 12-month retention + Annex IV technical documentation draft (Team €79/mo): ${TEAM_SIGNUP_URL}${paidSuffix}`, `${CONCIERGE_LABEL} ${CONCIERGE_SIGNUP_URL}${paidSuffix}`);
    }
    return block(...steps).trimStart();
}
/** Badge links. Done-For-You gets `&appUrl=` only when systemName is a public hostname. */
export function badgeNextSteps(systemName) {
    const host = publicHostname(systemName);
    return block(`- Interactive Label Studio & CMS downloads (Shopify, WordPress, Framer): ${LABELS_URL}`, `${CONCIERGE_LABEL} ${host ? conciergeSignupUrlFor(host) : CONCIERGE_SIGNUP_URL}`).trimStart();
}
