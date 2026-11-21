/**
 * `spurvik rfp`: EU AI Act vendor security questionnaire & DPO RFP answers, built locally.
 *
 * Bundled into the CLI only (not a library export). Same module as `n8n-nodes-spurvik/vendor-questionnaire.ts`,
 * and the Markdown matches `packages/mcp/src/tools/vendor-questionnaire.ts` (spurvik-mcp-server@1.0.8 tool #10):
 * the same five questions and plan facts. Pure: no network, no fs, no credential, no logging.
 * Plan figures follow console `PLAN_LIMITS` and `upgrade-plans.ts`. Field names follow `@spurvik/core`
 * (inputHash, outputHash, recordHash, prevLogHash). An invalid or private domain is dropped and never echoed.
 */
const CONSOLE_ORIGIN = "https://console.spurvik.com";
const REPORT_URL = `${CONSOLE_ORIGIN}/report`;
const C2PA_PAGE_URL = `${CONSOLE_ORIGIN}/c2pa`;
const SIGNUP_URL = `${CONSOLE_ORIGIN}/signup`;
const PRO_SIGNUP_URL = `${SIGNUP_URL}?plan=pro`;
const TEAM_SIGNUP_URL = `${SIGNUP_URL}?plan=team`;
const CONCIERGE_SIGNUP_URL = `${SIGNUP_URL}?plan=concierge`;
/** Interactive EU AI Act vendor security questionnaire and DPO RFP auto-responder. */
export const SPURVIK_VENDOR_QUESTIONNAIRE_URL = "https://spurvik.com/eu-ai-act-vendor-security-questionnaire";
export const SPURVIK_QUESTIONNAIRE_PLANS = ["free", "pro", "team", "concierge"];
export const SPURVIK_QUESTIONNAIRE_PROVIDERS = [
    "openai",
    "anthropic",
    "google-genai",
    "vercel-ai-sdk",
    "langgraph",
    "openai-agents",
    "mastra",
    "python",
    "custom",
];
export const SPURVIK_QUESTIONNAIRE_LOCALES = ["en", "de", "fr", "nl", "da", "sv", "es", "it"];
const LOCALIZED_RFP_COCKPIT_URLS = {
    en: SPURVIK_VENDOR_QUESTIONNAIRE_URL,
    de: "https://spurvik.com/de/ki-verordnung-sicherheitsfragebogen-lieferanten-dsb",
    fr: "https://spurvik.com/fr/questionnaire-securite-reglement-ia-dpo-fournisseur",
    nl: "https://spurvik.com/nl/ai-verordening-leveranciersvragenlijst-fg-beveiliging",
    da: "https://spurvik.com/da/eu-ai-act-leverandoerspoergeskema-dpo-sikkerhed",
    sv: "https://spurvik.com/sv/ai-forordningen-leverantorssakerhetsformular-dso",
    es: "https://spurvik.com/es/cuestionario-seguridad-proveedor-reglamento-ia-dpd",
    it: "https://spurvik.com/it/questionario-sicurezza-fornitori-regolamento-ia-dpo",
};
const MAX_DOMAIN_CHARS = 2048;
const MAX_HOSTNAME_CHARS = 253;
const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const BLOCKED_SUFFIXES = [
    "localhost",
    "local",
    "internal",
    "localdomain",
    "lan",
    "home.arpa",
    "intranet",
    "corp",
    "test",
    "invalid",
    "example",
];
/**
 * Bare public hostname (`acme.eu`) from a domain or an http(s) URL, or null.
 * Same rules as spurvik-mcp-server's `publicHostname`: IP literals (the TLD must be alphabetic, and IPv6 keeps
 * its brackets), localhost, internal suffixes, credentials, ports and non-ASCII names are refused, so a value
 * that is returned is safe to print and to put in a query string. Nothing is resolved; no request is made.
 */
export function questionnaireHostname(raw) {
    if (typeof raw !== "string")
        return null;
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed || trimmed.length > MAX_DOMAIN_CHARS || /[\u0000- \u007f-￿<>"'`\\{}|^]/.test(trimmed))
        return null;
    const scheme = /^([a-z][a-z0-9+.-]*):\/\//.exec(trimmed)?.[1];
    if (scheme !== undefined && scheme !== "http" && scheme !== "https")
        return null;
    let url;
    try {
        url = new URL(scheme === undefined ? `https://${trimmed}` : trimmed);
    }
    catch {
        return null;
    }
    if (url.username || url.password || url.port)
        return null;
    const host = url.hostname.replace(/\.$/, "");
    if (!host || host.length > MAX_HOSTNAME_CHARS || host.startsWith("["))
        return null;
    const labels = host.split(".");
    if (labels.length < 2 || !labels.every((label) => LABEL_RE.test(label)))
        return null;
    if (!TLD_RE.test(labels[labels.length - 1]))
        return null;
    if (BLOCKED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)))
        return null;
    return host;
}
const PRO_FACTS = {
    name: "Pro",
    price: "€19/mo or €190/yr",
    events: "250,000",
    retention: "90 days",
    whiteLabel: true,
    hostedQueue: true,
    dpoSummary: true,
    annexIv: false,
    webhookExport: false,
};
const PLAN_FACTS = {
    free: {
        name: "Free",
        price: "€0",
        events: "10,000",
        retention: "30 days",
        whiteLabel: false,
        hostedQueue: false,
        dpoSummary: false,
        annexIv: false,
        webhookExport: false,
    },
    pro: PRO_FACTS,
    team: {
        name: "Team",
        price: "€79/mo or €790/yr",
        events: "2,000,000",
        retention: "12 months",
        whiteLabel: true,
        hostedQueue: true,
        dpoSummary: true,
        annexIv: true,
        webhookExport: true,
    },
    // Done-For-You includes one full year of Pro, so the running controls are Pro's.
    concierge: { ...PRO_FACTS, name: "Done-For-You 24h Setup", price: "€199 once, includes 1 full year of Pro (€190 value)" },
};
const CLIENT_APPROVAL = "`requireHumanApproval(actionName, payload)` on the Spurvik client";
const PROVIDER_FACTS = {
    openai: { label: "OpenAI", inference: "OpenAI", wrapper: "`withSpurvik(new OpenAI())`", approval: CLIENT_APPROVAL },
    anthropic: { label: "Anthropic", inference: "Anthropic", wrapper: "`withSpurvik(new Anthropic())`", approval: CLIENT_APPROVAL },
    "google-genai": {
        label: "Google Gemini (Google Gen AI SDK)",
        inference: "Google",
        wrapper: "`withSpurvik(new GoogleGenAI())`",
        approval: CLIENT_APPROVAL,
    },
    "vercel-ai-sdk": {
        label: "Vercel AI SDK",
        inference: "our model provider",
        wrapper: "`spurvikMiddleware` with `wrapLanguageModel`, from `spurvik/ai`",
        approval: CLIENT_APPROVAL,
    },
    langgraph: {
        label: "LangGraph",
        inference: "our model provider",
        wrapper: "`withSpurvikLangGraph`, from `spurvik/langgraph`",
        approval: "`spurvikInterrupt` in the graph node, from `spurvik/langgraph`",
    },
    "openai-agents": {
        label: "OpenAI Agents SDK",
        inference: "our model provider",
        wrapper: "`withSpurvikModelProvider`, from `spurvik/openai-agents`",
        approval: "`createSpurvikNeedsApproval` on each tool and `resolveInterruptions`, from `spurvik/openai-agents`",
    },
    mastra: { label: "Mastra", inference: "our model provider", wrapper: "`withSpurvikMastra`, from `spurvik/mastra`", approval: CLIENT_APPROVAL },
    python: {
        label: "Python (FastAPI / LangChain / PydanticAI)",
        inference: "our model provider",
        wrapper: "`send_telemetry_event` from `spurvik_guard.py` (Python 3.10+ stdlib)",
        approval: "`request_human_approval(action_type, payload)` from `spurvik_guard.py`",
    },
    custom: { label: "our model provider", inference: "our model provider", wrapper: "`withSpurvik` on the provider client", approval: CLIENT_APPROVAL },
};
function reportUrlFor(host) {
    return `${REPORT_URL}?domain=${encodeURIComponent(host)}`;
}
function upgradeUrlsFor(host, locale = "en") {
    if (locale === "en") {
        return {
            freeApiKey10sEur0: SIGNUP_URL,
            proWhiteLabelEur19: host ? `${PRO_SIGNUP_URL}&appUrl=${encodeURIComponent(host)}` : PRO_SIGNUP_URL,
            teamAgencyEur79: TEAM_SIGNUP_URL,
            doneForYou24hEur199: host ? `${CONCIERGE_SIGNUP_URL}&appUrl=${encodeURIComponent(host)}` : CONCIERGE_SIGNUP_URL,
        };
    }
    const appParam = host ? `&appUrl=${encodeURIComponent(host)}` : "";
    const locParam = `&locale=${locale}`;
    return {
        freeApiKey10sEur0: `${SIGNUP_URL}?locale=${locale}${appParam}`,
        proWhiteLabelEur19: `${PRO_SIGNUP_URL}${appParam}${locParam}`,
        teamAgencyEur79: `${TEAM_SIGNUP_URL}${appParam}${locParam}`,
        doneForYou24hEur199: `${CONCIERGE_SIGNUP_URL}${appParam}${locParam}`,
    };
}
/** One question block: heading, the buyer's question, then the answer paragraphs, each followed by a blank line. */
function question(heading, asks, answer) {
    const lines = [`## ${heading}`, "", `**Customer asks:** ${asks}`, ""];
    answer.forEach((paragraph, index) => lines.push(index === 0 ? `**Answer:** ${paragraph}` : paragraph, ""));
    return lines;
}
function q1(product, plan, generatesMedia, isConcierge) {
    const notice = plan.whiteLabel
        ? `The notice is white-labelled (\`data-attribution="false"\`): users see only ${product}'s own AI notice, with no third-party branding.`
        : 'The `badge.js` notice carries a small "Art. 50 · Spurvik" attribution link.';
    const media = generatesMedia
        ? [
            `Art. 50(2), from 2 December 2026: where ${product} generates synthetic images, audio or video, our own marking step (for example a C2PA signer) is plugged into the Spurvik SDK marking hook (\`marking.media\`), and each receipt records whether marking was applied (\`markingApplied\`). Spurvik checks marking; it does not sign or mark content itself.`,
            `We check that published media still carries its C2PA (JUMBF) manifest after CDN and CMS processing with ${C2PA_PAGE_URL}, and CI runs \`npx spurvik c2pa <image-url> --fail-on-missing\`, which fails the build when a manifest is missing or stripped.${isConcierge ? " Our Done-For-You setup includes a signed DPO Readiness & C2PA Art. 50(2) provenance report." : ""}`,
        ]
        : [
            `Art. 50(2), from 2 December 2026: ${product} does not generate synthetic images, audio or video today. If it starts to, our own C2PA marking plugs into the Spurvik SDK marking hook (\`marking.media\`), and CI checks published images with \`npx spurvik c2pa <image-url> --fail-on-missing\`.`,
        ];
    return question("Q1: Art. 50(1) & 2 Dec 2026 Art. 50(2) Transparency & Provenance", "Do users know they are interacting with an AI system, and is AI-generated content marked in a machine-readable way?", [
        `Every AI feature in ${product} shows a visible notice, in the user's language (all 24 official EU languages), that they are interacting with an AI system (Art. 50(1)). It is rendered by Spurvik's \`badge.js\` script or the \`<AIDisclosureLabel />\` React component. ${notice}`,
        ...media,
    ]);
}
function q2(product, plan, provider) {
    return question("Q2: Art. 12 Cryptographic Event Logging", "What do you log about AI interactions, and can the log be tampered with?", [
        `Every ${provider.label} model call made by ${product} is wrapped with the MIT-licensed Spurvik SDK (${provider.wrapper}), which records one event per call. Prompt and output text are replaced by keyed HMAC-SHA256 fingerprints (\`inputHash\`, \`outputHash\`), computed in our own infrastructure with a key that is never sent to Spurvik, and each call carries an HMAC-SHA256-signed provenance receipt.`,
        `Stored events form a hash chain: each event's SHA-256 \`recordHash\` is linked to the previous event by \`prevLogHash\`, so an edited, inserted or deleted event breaks verification. When events age out, a signed checkpoint keeps the remaining chain verifiable. Our Spurvik ${plan.name} plan covers ${plan.events} events per month.`,
    ]);
}
function q3(plan, provider) {
    return question("Q3: GDPR Art. 5(1)(c) Zero-Prompt Minimisation & EU Frankfurt Residency", "Is customer prompt or output text stored, and where is AI-related data kept?", [
        `Data minimisation (GDPR Art. 5(1)(c)): 0 bytes of raw prompt or completion text are persisted by Spurvik. Only the keyed fingerprints and call metadata leave our systems. Keyed fingerprints are pseudonymised data (GDPR Art. 4(5)) while our key exists, not anonymised data.`,
        `Residency: event records are stored in Frankfurt, Germany (Vercel \`fra1\` for the API, Neon Postgres on AWS \`eu-central-1\`) and kept for ${plan.retention}. Spurvik is operated by EyeTea Solutions ApS, Denmark; its sub-processors are listed at https://spurvik.com/privacy. Model inference runs with ${provider.inference} under our own agreement; Spurvik is not in that data path.`,
    ]);
}
function q4(product, plan, provider, hasHighRiskActions) {
    const gate = plan.hostedQueue
        ? [
            `The action is held in Spurvik's hosted approval queue (${provider.approval}) until a named reviewer decides. Our code continues only on an \`approved\` decision; a rejected, overridden or timed-out request does not run. The request carries a field-names-only payload summary, so reviewers see which fields an action touches, not their values.`,
            `Decision webhooks to our backend are verified with \`verifyHitlWebhook\` (HMAC-SHA-256 over the raw body), and each decision is recorded on the signed event, kept ${plan.retention} in Frankfurt. The same requests can reach reviewers in Slack or Microsoft Teams through signed approval links (\`spurvik/channels\`).`,
        ]
        : [
            "The action waits for a named reviewer to approve it through signed Slack or Microsoft Teams approval links, routed by `createMultiChannelApprovalRouter` (`spurvik/channels`) in our own stack. Only an explicit approval lets it run; a rejected or expired request does not.",
        ];
    const intro = hasHighRiskActions
        ? `AI agents and tools in ${product} that can issue refunds, send emails, change permissions or delete data are gated deterministically in code before they run, not by a model prompt.`
        : `AI features in ${product} do not trigger refunds, outbound emails, permission changes or deletions on their own today; they return output to a person who decides. Any such action we add is gated deterministically in code before it runs.`;
    return question("Q4: Art. 14 Deterministic Human Oversight Gates", "How does a human oversee consequential actions taken by your AI features?", [intro, ...gate]);
}
function q5(product, plan, isConcierge) {
    const evidence = [];
    if (plan.dpoSummary)
        evidence.push("a DPO engineering summary (`.md`) downloaded from the signed event log");
    if (plan.annexIv)
        evidence.push("an Annex IV technical documentation draft (Art. 11), exported as PDF or Markdown");
    if (plan.webhookExport)
        evidence.push("a webhook export of signed events into our own systems");
    const answer = [
        `Signed AI events for ${product} are kept for ${plan.retention} in Frankfurt (Spurvik ${plan.name}, ${plan.events} events per month), and the hash chain can be re-verified at any point in that window.`,
    ];
    if (evidence.length > 0)
        answer.push(`Evidence we can share with your DPO: ${evidence.join("; ")}.`);
    else
        answer.push("Evidence we can share with your DPO: the event record and receipt fields described in Q2, on request.");
    if (isConcierge) {
        answer.push("Our setup was installed by a Spurvik engineer within 24 hours (pull request or CMS snippet), and we hold a signed DPO Readiness & C2PA Art. 50(2) provenance report.");
    }
    return question("Q5: Audit Retention, DPO Evidence & Annex IV Documentation", "How long do you keep AI audit records, and what evidence can you share with our DPO?", answer);
}
function planTable() {
    return [
        "## What each Spurvik plan puts on the questionnaire",
        "",
        "| Control | Free €0 | Pro €19/mo | Team €79/mo | Done-For-You €199 once |",
        "| --- | --- | --- | --- | --- |",
        "| AI events per month | 10,000 | 250,000 | 2,000,000 | 250,000 (1 yr Pro) |",
        "| Retention in Frankfurt (`fra1`) | 30 days | 90 days | 12 months | 90 days |",
        '| Art. 50(1) notice | `badge.js` with "Art. 50 · Spurvik" link | White-label (`data-attribution="false"`) | White-label | White-label |',
        "| Keyed HMAC receipts (`inputHash` + `recordHash`) | Yes | Yes | Yes | Yes |",
        "| Human approval gates | Slack / Teams links (`spurvik/channels`) | Hosted queue + `verifyHitlWebhook` | Hosted queue + `verifyHitlWebhook` | Hosted queue, gate set up for you |",
        "| DPO engineering summary (`.md`) | No | Yes | Yes | Yes + signed DPO readiness report |",
        "| Annex IV draft (Art. 11, PDF/Markdown) | No | No | Yes | No |",
        "| Webhook export of signed events | No | No | Yes | No |",
        "",
        "Annual: Pro €190/yr, Team €790/yr. Prices excl. VAT, B2B.",
        "",
    ];
}
function nextSteps(host, upgradeUrls) {
    const lines = ["## Next steps", `- Interactive questionnaire & DPO RFP auto-responder: ${SPURVIK_VENDOR_QUESTIONNAIRE_URL}`];
    if (host)
        lines.push(`- Live Art. 50(1) report for ${host}: ${reportUrlFor(host)}`);
    lines.push(`- Mint a Free SPURVIK_API_KEY in 10s (work email only, no password, EU Frankfurt fra1): ${upgradeUrls.freeApiKey10sEur0}`, `- White-label badge + 90-day Frankfurt vault + DPO engineering summary (Pro €19/mo): ${upgradeUrls.proWhiteLabelEur19}`, `- 12-month retention + Annex IV technical documentation draft (Team €79/mo): ${upgradeUrls.teamAgencyEur79}`, `- Done-For-You 24h setup (€199 once, incl. 1 yr Pro): ${upgradeUrls.doneForYou24hEur199}`, "");
    return lines;
}
function oneOf(value, allowed, fallback, label) {
    if (value === undefined || value === null || value === "")
        return fallback;
    if (typeof value === "string" && allowed.includes(value))
        return value;
    // The rejected value is not repeated.
    throw new Error(`Vendor questionnaire ${label} must be one of: ${allowed.join(", ")}.`);
}
function flag(value, fallback, label) {
    if (value === undefined || value === null)
        return fallback;
    if (typeof value === "boolean")
        return value;
    throw new Error(`Vendor questionnaire ${label} must be true or false.`);
}
function renderLocalizedMarkdown(input) {
    const { locale, host, domainIgnored, plan, provider, hasHighRiskActions, generatesMedia, isConcierge, interactiveUrl, upgradeUrls } = input;
    if (locale === "de") {
        const product = host ?? "unser Produkt";
        return `${[
            `# EU-KI-Verordnung Sicherheitsfragebogen für Lieferanten: Antworten für ${product}`,
            "",
            `Spurvik-Tarif: ${plan.name} (${plan.price}) · Modellanbieter: ${provider.label} · Konsequenzreiche Agent-Aktionen: ${hasHighRiskActions ? "ja" : "nein"} · Synthetische Medien: ${generatesMedia ? "ja" : "nein"}`,
            "",
            ...(domainIgnored ? ["Die angegebene Domain ist kein öffentlicher Hostname und wurde ausgelassen.", ""] : []),
            "## F1: Art. 50 Abs. 1 & 2. Dez. 2026 Art. 50 Abs. 2 Transparenz & Herkunftsnachweis",
            "",
            `**Antwort:** Jede KI-Funktion in ${product} zeigt einen sichtbaren KI-Hinweis in allen 24 EU-Amtssprachen (\`badge.js\` oder \`<AIDisclosureLabel />\`). ${plan.whiteLabel ? `Der Hinweis läuft im White-Label-Modus (\`data-attribution="false"\`) ohne Drittanbieter-Branding.` : 'Der Hinweis enthält den Link "Art. 50 · Spurvik".'} ${generatesMedia ? `Für synthetische Medien (Art. 50 Abs. 2 ab 2. Dezember 2026) prüft CI veröffentlichte Assets via \`npx spurvik c2pa <image-url> --fail-on-missing\` und ${C2PA_PAGE_URL} auf intakte C2PA-JUMBF-Manifeste (Spurvik prüft nur und signiert keine Medien selbst).` : `${product} erzeugt derzeit keine synthetischen Bilder, Audio- oder Videodateien; bei künftiger Einführung prüft \`npx spurvik c2pa <image-url> --fail-on-missing\` C2PA-Manifeste.`}`,
            "",
            "## F2: Art. 12 Kryptografische Ereignisprotokollierung",
            "",
            `**Antwort:** Jeder ${provider.label}-Aufruf in ${product} wird über das MIT-lizenzierte Spurvik-SDK (${provider.wrapper}) protokolliert. Prompt- und Ausgabetexte werden durch schlüsselbasierte HMAC-SHA256-Prüfsummen (\`inputHash\`, \`outputHash\`) ersetzt; jeder Eintrag bildet über SHA-256 \`recordHash\` und \`prevLogHash\` eine manipulationssichere Hash-Kette (${plan.events} Events/Monat).`,
            "",
            "## F3: DSGVO Art. 5 Abs. 1 lit. c Datenminimierung & EU-Speicherung Frankfurt",
            "",
            `**Antwort:** 0 Bytes Klartext-Prompts oder Ausgaben werden bei Spurvik gespeichert (pseudonymisierte HMAC-Digests gemäß DSGVO Art. 4 Nr. 5). Ereignisprotokolle liegen ausschließlich in Frankfurt am Main (Vercel \`fra1\`, Neon Postgres AWS \`eu-central-1\`) für ${plan.retention}; Betreiber ist EyeTea Solutions ApS, Dänemark (https://spurvik.com/privacy).`,
            "",
            "## F4: Art. 14 Deterministische menschliche Aufsicht",
            "",
            `**Antwort:** ${hasHighRiskActions ? `Aktionen mit Außenwirkung (Erstattungen, E-Mails, Berechtigungen, Löschungen) werden deterministisch im Code vor Ausführung angehalten` : `KI-Funktionen in ${product} lösen derzeit keine selbstständigen Erstattungen, E-Mails oder Löschungen aus; künftige Aktionen werden deterministisch vor Ausführung angehalten`} (${plan.hostedQueue ? `gehostete Freigabe-Warteschlange mit \`verifyHitlWebhook\` & ${provider.approval}` : "signierte Slack-/Teams-Freigabelinks über `spurvik/channels`"}).`,
            "",
            "## F5: Aufbewahrung, DSB-Nachweise & Anhang-IV-Dokumentation",
            "",
            `**Antwort:** Signierte Ereignisse für ${product} werden ${plan.retention} in Frankfurt aufbewahrt.${plan.dpoSummary ? " Ein DSB-Engineering-Bericht (`.md`) ist jederzeit exportierbar." : ""}${plan.annexIv ? " Ein technischer Dokumentationsentwurf nach Anhang IV (Art. 11, PDF/Markdown) und Webhook-Export sind enthalten." : ""}${isConcierge ? " Die Einrichtung erfolgte durch einen Spurvik-Ingenieur innerhalb von 24 Stunden inklusive DSB- & C2PA-Art.-50(2)-Bericht." : ""}`,
            "",
            "## Nächste Schritte",
            `- Interaktiver DSB- & Lieferanten-Fragebogen: ${interactiveUrl}`,
            ...(host ? [`- Live-Art.-50(1)-Kurzbericht für ${host}: ${reportUrlFor(host)}`] : []),
            `- Kostenloser SPURVIK_API_KEY in 10 Sek. (Frankfurt fra1): ${upgradeUrls.freeApiKey10sEur0}`,
            `- Pro (19 €/Monat — White-Label, 90 Tage Frankfurt, DSB-Bericht): ${upgradeUrls.proWhiteLabelEur19}`,
            `- Team (79 €/Monat — 12 Monate, Anhang-IV-Entwurf, Webhook): ${upgradeUrls.teamAgencyEur79}`,
            `- Done-For-You 24h-Setup (199 € einmalig, inkl. 1 Jahr Pro): ${upgradeUrls.doneForYou24hEur199}`,
            "",
            "_Technische Antworten auf Basis der ausgelieferten Spurvik-Kontrollen. Keine Rechtsberatung._",
        ].join("\n")}\n`;
    }
    if (locale === "fr") {
        const product = host ?? "notre produit";
        return `${[
            `# Questionnaire sécurité fournisseur Règlement IA (UE) : réponses pour ${product}`,
            "",
            `Offre Spurvik : ${plan.name} (${plan.price}) · Fournisseur : ${provider.label} · Actions conséquentes : ${hasHighRiskActions ? "oui" : "non"} · Médias synthétiques : ${generatesMedia ? "oui" : "non"}`,
            "",
            ...(domainIgnored ? ["Le domaine fourni n'étant pas un nom d'hôte public, il a été omis.", ""] : []),
            "## Q1 : Art. 50(1) & 2 déc. 2026 Art. 50(2) Transparence & provenance",
            "",
            `**Réponse :** Chaque fonctionnalité IA de ${product} affiche une mention visible dans les 24 langues officielles de l'UE (\`badge.js\` ou \`<AIDisclosureLabel />\`). ${plan.whiteLabel ? `La mention fonctionne en marque blanche (\`data-attribution="false"\`).` : 'La mention inclut le lien "Art. 50 · Spurvik".'} ${generatesMedia ? `Pour les médias synthétiques (art. 50(2) dès le 2 décembre 2026), la CI vérifie les manifestes C2PA JUMBF via \`npx spurvik c2pa <image-url> --fail-on-missing\` et ${C2PA_PAGE_URL} (vérification en lecture seule, sans signature par Spurvik).` : `${product} ne génère pas de médias synthétiques aujourd'hui ; en cas d'ajout, \`npx spurvik c2pa <image-url> --fail-on-missing\` vérifie les manifestes C2PA.`}`,
            "",
            "## Q2 : Art. 12 Journalisation cryptographique des événements",
            "",
            `**Réponse :** Chaque appel ${provider.label} de ${product} est encapsulé avec le SDK MIT Spurvik (${provider.wrapper}). Les prompts et réponses sont remplacés par des empreintes HMAC-SHA256 à clé secrète (\`inputHash\`, \`outputHash\`), chaînées par SHA-256 \`recordHash\` et \`prevLogHash\` (${plan.events} événements/mois).`,
            "",
            "## Q3 : RGPD art. 5(1)(c) Zéro texte de prompt & hébergement UE Francfort",
            "",
            `**Réponse :** 0 octet de prompt ou de complétion brut n'est stocké par Spurvik (empreintes pseudonymisées au sens du RGPD art. 4(5)). Les journaux sont hébergés à Francfort (Vercel \`fra1\`, Neon Postgres AWS \`eu-central-1\`) pendant ${plan.retention} ; opéré par EyeTea Solutions ApS, Danemark (https://spurvik.com/privacy).`,
            "",
            "## Q4 : Art. 14 Portes de validation humaine déterministes",
            "",
            `**Réponse :** ${hasHighRiskActions ? `Les actions d'agents à impact (remboursements, e-mails, permissions, suppressions) sont bloquées de façon déterministe dans le code avant exécution` : `Les fonctions IA de ${product} ne déclenchent pas d'actions autonomes aujourd'hui ; toute action sensible est bloquée dans le code avant exécution`} (${plan.hostedQueue ? `file d'approbation hébergée avec \`verifyHitlWebhook\` et ${provider.approval}` : "liens d'approbation signés Slack / Teams via `spurvik/channels`"}).`,
            "",
            "## Q5 : Rétention d'audit, preuves DPO & documentation Annexe IV",
            "",
            `**Réponse :** Les événements signés pour ${product} sont conservés ${plan.retention} à Francfort.${plan.dpoSummary ? " Une synthèse technique DPO (`.md`) est téléchargeable." : ""}${plan.annexIv ? " Un brouillon de documentation technique Annexe IV (art. 11, PDF/Markdown) et l'export webhook sont inclus." : ""}${isConcierge ? " L'installation a été réalisée en 24h par un ingénieur Spurvik avec rapport DPO & C2PA art. 50(2) signé." : ""}`,
            "",
            "## Prochaines étapes",
            `- Questionnaire interactif DPO / RSSI : ${interactiveUrl}`,
            ...(host ? [`- Rapport Art. 50(1) en direct pour ${host} : ${reportUrlFor(host)}`] : []),
            `- Clé SPURVIK_API_KEY gratuite en 10 s (Francfort fra1) : ${upgradeUrls.freeApiKey10sEur0}`,
            `- Pro (19 €/mois — marque blanche, 90 j Francfort, synthèse DPO) : ${upgradeUrls.proWhiteLabelEur19}`,
            `- Team (79 €/mois — 12 mois, brouillon Annexe IV, webhook) : ${upgradeUrls.teamAgencyEur79}`,
            `- Installation clé en main 24h (199 € une fois, 1 an Pro inclus) : ${upgradeUrls.doneForYou24hEur199}`,
            "",
            "_Réponses techniques fondées sur les contrôles Spurvik déployés. Ceci ne constitue pas un conseil juridique._",
        ].join("\n")}\n`;
    }
    if (locale === "nl") {
        const product = host ?? "ons product";
        return `${[
            `# EU AI-verordening leveranciersvragenlijst (FG / CISO): antwoorden voor ${product}`,
            "",
            `Spurvik-pakket: ${plan.name} (${plan.price}) · Provider: ${provider.label} · Ingrijpende agent-acties: ${hasHighRiskActions ? "ja" : "nee"} · Synthetische media: ${generatesMedia ? "ja" : "nee"}`,
            "",
            ...(domainIgnored ? ["Het opgegeven domein is geen publieke hostnaam en is weggelaten.", ""] : []),
            "## V1: Art. 50 lid 1 & 2 dec. 2026 Art. 50 lid 2 Transparantie & herkomst",
            "",
            `**Antwoord:** Elke AI-functie in ${product} toont een zichtbare AI-melding in alle 24 officiële EU-talen (\`badge.js\` of \`<AIDisclosureLabel />\`). ${plan.whiteLabel ? `De melding draait white-label (\`data-attribution="false"\`).` : 'De melding bevat de "Art. 50 · Spurvik"-link.'} ${generatesMedia ? `Voor synthetische media (art. 50 lid 2 vanaf 2 december 2026) controleert CI gepubliceerde beelden met \`npx spurvik c2pa <image-url> --fail-on-missing\` en ${C2PA_PAGE_URL} op C2PA-JUMBF-manifesten (alleen-lezen controle; Spurvik ondertekent zelf geen media).` : `${product} genereert momenteel geen synthetische media; bij toekomstige uitrol controleert \`npx spurvik c2pa <image-url> --fail-on-missing\` C2PA-manifesten.`}`,
            "",
            "## V2: Art. 12 Cryptografische gebeurtenislogging",
            "",
            `**Antwoord:** Elke ${provider.label}-aanroep door ${product} wordt gewrapt met de MIT-gelicentieerde Spurvik SDK (${provider.wrapper}). Prompts en outputs worden vervangen door sleutelgebaseerde HMAC-SHA256-vingerafdrukken (\`inputHash\`, \`outputHash\`), gekoppeld via SHA-256 \`recordHash\` en \`prevLogHash\` (${plan.events} events/mnd).`,
            "",
            "## V3: AVG art. 5 lid 1 sub c Dataminimalisatie & EU-opslag Frankfurt",
            "",
            `**Antwoord:** 0 bytes ruwe prompt- of outputtekst worden door Spurvik opgeslagen (gepseudonimiseerde vingerafdrukken conform AVG art. 4 punt 5). Logrecords staan in Frankfurt, Duitsland (Vercel \`fra1\`, Neon Postgres AWS \`eu-central-1\`) gedurende ${plan.retention}; beheerd door EyeTea Solutions ApS, Denemarken (https://spurvik.com/privacy).`,
            "",
            "## V4: Art. 14 Deterministische menselijke goedkeuringspoorten",
            "",
            `**Antwoord:** ${hasHighRiskActions ? `Agent-acties zoals terugbetalingen, e-mails, rechtenwijzigingen of verwijderingen worden deterministisch in code tegengehouden vóór uitvoering` : `AI-functies in ${product} voeren momenteel geen zelfstandige terugbetalingen, e-mails of verwijderingen uit; toekomstige acties worden deterministisch in code tegengehouden`} (${plan.hostedQueue ? `gehoste goedkeuringswachtrij met \`verifyHitlWebhook\` en ${provider.approval}` : "ondertekende Slack-/Teams-goedkeuringslinks via `spurvik/channels`"}).`,
            "",
            "## V5: Bewaartermijn, FG-bewijsstukken & Bijlage-IV-documentatie",
            "",
            `**Antwoord:** Ondertekende AI-events voor ${product} worden ${plan.retention} bewaard in Frankfurt.${plan.dpoSummary ? " Een FG/DPO-samenvatting (`.md`) is direct te downloaden." : ""}${plan.annexIv ? " Een concept technische documentatie conform Bijlage IV (art. 11, PDF/Markdown) en webhook-export zijn inbegrepen." : ""}${isConcierge ? " De installatie is binnen 24 uur door een Spurvik-engineer uitgevoerd inclusief ondertekend FG/DPO- & C2PA-rapport." : ""}`,
            "",
            "## Volgende stappen",
            `- Interactieve FG / CISO leveranciersvragenlijst: ${interactiveUrl}`,
            ...(host ? [`- Live Art. 50(1)-rapport voor ${host}: ${reportUrlFor(host)}`] : []),
            `- Gratis SPURVIK_API_KEY in 10 sec. (Frankfurt fra1): ${upgradeUrls.freeApiKey10sEur0}`,
            `- Pro (€19/mnd — white-label, 90 dagen Frankfurt, FG-samenvatting): ${upgradeUrls.proWhiteLabelEur19}`,
            `- Team (€79/mnd — 12 maanden, Bijlage-IV-concept, webhook): ${upgradeUrls.teamAgencyEur79}`,
            `- Done-For-You 24u-setup (€199 eenmalig, incl. 1 jaar Pro): ${upgradeUrls.doneForYou24hEur199}`,
            "",
            "_Technische antwoorden op basis van geleverde Spurvik-controles. Geen juridisch advies._",
        ].join("\n")}\n`;
    }
    if (locale === "sv") {
        const product = host ?? "vår produkt";
        return `${[
            `# EU AI-förordningen säkerhetsformulär för leverantörer (DSO / DPO): svar för ${product}`,
            "",
            `Spurvik-plan: ${plan.name} (${plan.price}) · Modellleverantör: ${provider.label} · Konsekventa agentåtgärder: ${hasHighRiskActions ? "ja" : "nej"} · Syntetiska medier: ${generatesMedia ? "ja" : "nej"}`,
            "",
            ...(domainIgnored ? ["Den angivna domänen är inte ett publikt värdnamn och utelämnades.", ""] : []),
            "## F1: Art. 50.1 & 2 dec. 2026 Art. 50.2 Transparens & ursprung",
            "",
            `**Svar:** Varje AI-funktion i ${product} visar en tydlig AI-upplysning på alla 24 officiella EU-språk (\`badge.js\` eller \`<AIDisclosureLabel />\`). ${plan.whiteLabel ? `Märkningen körs som white-label (\`data-attribution="false"\`).` : 'Märkningen innehåller länken "Art. 50 · Spurvik".'} ${generatesMedia ? `För syntetiska medier (art. 50.2 från 2 december 2026) kontrollerar CI publicerade bilder med \`npx spurvik c2pa <image-url> --fail-on-missing\` och ${C2PA_PAGE_URL} avseende C2PA-JUMBF-manifest (skrivskyddad kontroll; Spurvik signerar inte medier).` : `${product} genererar inte syntetiska medier idag; vid framtida lansering kontrollerar \`npx spurvik c2pa <image-url> --fail-on-missing\` C2PA-manifest.`}`,
            "",
            "## F2: Art. 12 Kryptografisk händelseloggning",
            "",
            `**Svar:** Varje ${provider.label}-anrop från ${product} kapslas in med MIT-licensierade Spurvik SDK (${provider.wrapper}). Promptar och svar ersätts av nyckelbaserade HMAC-SHA256-fingeravtryck (\`inputHash\`, \`outputHash\`), kedjade med SHA-256 \`recordHash\` och \`prevLogHash\` (${plan.events} händelser/mån).`,
            "",
            "## F3: GDPR art. 5.1 c Uppgiftsminimering & EU-lagring i Frankfurt",
            "",
            `**Svar:** 0 byte rå prompt- eller svarstext lagras hos Spurvik (pseudonymiserade fingeravtryck enligt GDPR art. 4.5). Loggposter lagras i Frankfurt, Tyskland (Vercel \`fra1\`, Neon Postgres AWS \`eu-central-1\`) i ${plan.retention}; drivs av EyeTea Solutions ApS, Danmark (https://spurvik.com/privacy).`,
            "",
            "## F4: Art. 14 Deterministiska mänskliga godkännandegrindar",
            "",
            `**Svar:** ${hasHighRiskActions ? `Agentåtgärder såsom återbetalningar, mejl, behörighetsändringar och raderingar stoppas deterministiskt i kod före körning` : `AI-funktioner i ${product} utför inte självständiga återbetalningar, mejl eller raderingar idag; framtida åtgärder stoppas deterministiskt i kod`} (${plan.hostedQueue ? `hostad godkännandekö med \`verifyHitlWebhook\` och ${provider.approval}` : "signerade Slack-/Teams-länkar via `spurvik/channels`"}).`,
            "",
            "## F5: Lagringstid, DSO-underlag & Bilaga IV-dokumentation",
            "",
            `**Svar:** Signerade AI-händelser för ${product} lagras i ${plan.retention} i Frankfurt.${plan.dpoSummary ? " En teknisk DSO/DPO-sammanfattning (`.md`) kan laddas ner direkt." : ""}${plan.annexIv ? " Utkast till teknisk dokumentation enligt Bilaga IV (art. 11, PDF/Markdown) samt webhook-export ingår." : ""}${isConcierge ? " Installationen utfördes inom 24 timmar av en Spurvik-ingenjör inklusive signerad DSO/DPO- & C2PA-rapport." : ""}`,
            "",
            "## Nästa steg",
            `- Interaktivt svenskt DSO- & leverantörsformulär: ${interactiveUrl}`,
            ...(host ? [`- Live Art. 50(1)-rapport för ${host}: ${reportUrlFor(host)}`] : []),
            `- Gratis SPURVIK_API_KEY på 10 sek. (Frankfurt fra1): ${upgradeUrls.freeApiKey10sEur0}`,
            `- Pro (19 €/mån — white-label, 90 dagar Frankfurt, DSO-rapport): ${upgradeUrls.proWhiteLabelEur19}`,
            `- Team (79 €/mån — 12 månader, Bilaga IV-utkast, webhook): ${upgradeUrls.teamAgencyEur79}`,
            `- Done-For-You 24h-installation (199 € engångsbelopp, inkl. 1 år Pro): ${upgradeUrls.doneForYou24hEur199}`,
            "",
            "_Tekniska svar baserade på levererade Spurvik-kontroller. Inte juridisk rådgivning._",
        ].join("\n")}\n`;
    }
    if (locale === "es") {
        const product = host ?? "nuestro producto";
        return `${[
            `# Cuestionario de seguridad para proveedores Reglamento de IA UE (DPD / DPO): respuestas para ${product}`,
            "",
            `Plan Spurvik: ${plan.name} (${plan.price}) · Proveedor: ${provider.label} · Acciones sensibles de agentes: ${hasHighRiskActions ? "sí" : "no"} · Medios sintéticos: ${generatesMedia ? "sí" : "no"}`,
            "",
            ...(domainIgnored ? ["El dominio indicado no es un nombre de host público y se omitió.", ""] : []),
            "## P1: Art. 50(1) y 2 dic. 2026 Art. 50(2) Transparencia y procedencia",
            "",
            `**Respuesta:** Cada función de IA en ${product} muestra un aviso de IA visible en los 24 idiomas oficiales de la UE (\`badge.js\` o \`<AIDisclosureLabel />\`). ${plan.whiteLabel ? `El aviso opera en marca blanca (\`data-attribution="false"\`).` : 'El aviso incluye el enlace "Art. 50 · Spurvik".'} ${generatesMedia ? `Para medios sintéticos (art. 50(2) desde el 2 de diciembre de 2026), CI comprueba las imágenes publicadas con \`npx spurvik c2pa <image-url> --fail-on-missing\` y ${C2PA_PAGE_URL} para manifiestos C2PA JUMBF (control de solo lectura; Spurvik no firma medios).` : `${product} no genera medios sintéticos actualmente; en caso de activarse, \`npx spurvik c2pa <image-url> --fail-on-missing\` comprueba los manifiestos C2PA.`}`,
            "",
            "## P2: Art. 12 Registro criptográfico de eventos",
            "",
            `**Respuesta:** Cada llamada a ${provider.label} desde ${product} se envuelve con el SDK MIT de Spurvik (${provider.wrapper}). Los prompts y respuestas se sustituyen por huellas HMAC-SHA256 con clave secreta (\`inputHash\`, \`outputHash\`), encadenadas mediante SHA-256 \`recordHash\` y \`prevLogHash\` (${plan.events} eventos/mes).`,
            "",
            "## P3: RGPD art. 5(1)(c) Minimización de datos y alojamiento UE en Fráncfort",
            "",
            `**Respuesta:** 0 bytes de texto bruto de prompts o respuestas se almacenan en Spurvik (huellas seudonimizadas según RGPD art. 4(5)). Los registros residen en Fráncfort, Alemania (Vercel \`fra1\`, Neon Postgres AWS \`eu-central-1\`) durante ${plan.retention}; operado por EyeTea Solutions ApS, Dinamarca (https://spurvik.com/privacy).`,
            "",
            "## P4: Art. 14 Compuertas deterministas de supervisión humana",
            "",
            `**Respuesta:** ${hasHighRiskActions ? `Las acciones de agentes como reembolsos, correos, cambios de permisos o borrados se detienen de forma determinista en código antes de ejecutarse` : `Las funciones de IA en ${product} no ejecutan reembolsos, correos ni borrados autónomos hoy; cualquier acción futura se detiene de forma determinista en código`} (${plan.hostedQueue ? `cola de aprobación alojada con \`verifyHitlWebhook\` y ${provider.approval}` : "enlaces firmados de Slack / Teams vía `spurvik/channels`"}).`,
            "",
            "## P5: Retención, evidencias DPD y documentación Anexo IV",
            "",
            `**Respuesta:** Los eventos firmados de ${product} se conservan durante ${plan.retention} en Fráncfort.${plan.dpoSummary ? " Un informe técnico DPD/DPO (`.md`) puede descargarse directamente." : ""}${plan.annexIv ? " Incluye borrador de documentación técnica del Anexo IV (art. 11, PDF/Markdown) y exportación por webhook." : ""}${isConcierge ? " La instalación fue realizada en 24 horas por un ingeniero de Spurvik incluyendo informe DPD y C2PA Art. 50(2)." : ""}`,
            "",
            "## Próximos pasos",
            `- Cuestionario interactivo DPD / compras: ${interactiveUrl}`,
            ...(host ? [`- Informe Art. 50(1) en vivo para ${host}: ${reportUrlFor(host)}`] : []),
            `- SPURVIK_API_KEY gratuita en 10 s (Fráncfort fra1): ${upgradeUrls.freeApiKey10sEur0}`,
            `- Pro (19 €/mes — marca blanca, 90 días Fráncfort, resumen DPD): ${upgradeUrls.proWhiteLabelEur19}`,
            `- Team (79 €/mes — 12 meses, borrador Anexo IV, webhook): ${upgradeUrls.teamAgencyEur79}`,
            `- Instalación 24h llave en mano (199 € pago único, 1 año Pro incluido): ${upgradeUrls.doneForYou24hEur199}`,
            "",
            "_Respuestas técnicas basadas en los controles implementados de Spurvik. No constituye asesoramiento jurídico._",
        ].join("\n")}\n`;
    }
    if (locale === "it") {
        const product = host ?? "il nostro prodotto";
        return `${[
            `# Questionario sicurezza fornitori Regolamento IA UE (RPD / DPO): risposte per ${product}`,
            "",
            `Piano Spurvik: ${plan.name} (${plan.price}) · Provider: ${provider.label} · Azioni sensibili degli agenti: ${hasHighRiskActions ? "sì" : "no"} · Media sintetici: ${generatesMedia ? "sì" : "no"}`,
            "",
            ...(domainIgnored ? ["Il dominio indicato non è un nome host pubblico ed è stato omesso.", ""] : []),
            "## D1: Art. 50(1) e 2 dic. 2026 Art. 50(2) Trasparenza e provenienza",
            "",
            `**Risposta:** Ogni funzione IA in ${product} mostra un’informativa IA visibile in tutte le 24 lingue ufficiali dell’UE (\`badge.js\` o \`<AIDisclosureLabel />\`). ${plan.whiteLabel ? `L’informativa opera in modalità white-label (\`data-attribution="false"\`).` : 'L’informativa include il link "Art. 50 · Spurvik".'} ${generatesMedia ? `Per i media sintetici (art. 50(2) dal 2 dicembre 2026), la CI controlla le immagini pubblicate con \`npx spurvik c2pa <image-url> --fail-on-missing\` e ${C2PA_PAGE_URL} per i manifesti C2PA JUMBF (controllo in sola lettura; Spurvik non firma i media).` : `${product} non genera media sintetici oggi; in caso di attivazione futura, \`npx spurvik c2pa <image-url> --fail-on-missing\` controlla i manifesti C2PA.`}`,
            "",
            "## D2: Art. 12 Registrazione crittografica degli eventi",
            "",
            `**Risposta:** Ogni chiamata ${provider.label} da ${product} è incapsulata con lo Spurvik SDK con licenza MIT (${provider.wrapper}). Prompt e risposte sono sostituiti da impronte HMAC-SHA256 con chiave segreta (\`inputHash\`, \`outputHash\`), concatenate tramite SHA-256 \`recordHash\` e \`prevLogHash\` (${plan.events} eventi/mese).`,
            "",
            "## D3: GDPR art. 5(1)(c) Minimizzazione dei dati e residenza UE a Francoforte",
            "",
            `**Risposta:** 0 byte di testo grezzo di prompt o risposte sono memorizzati da Spurvik (impronte pseudonimizzate ai sensi del GDPR art. 4(5)). I log risiedono a Francoforte, Germania (Vercel \`fra1\`, Neon Postgres AWS \`eu-central-1\`) per ${plan.retention}; gestito da EyeTea Solutions ApS, Danimarca (https://spurvik.com/privacy).`,
            "",
            "## D4: Art. 14 Varchi deterministici di sorveglianza umana",
            "",
            `**Risposta:** ${hasHighRiskActions ? `Le azioni degli agenti come rimborsi, email, modifiche di permessi o cancellazioni vengono bloccate in modo deterministico nel codice prima dell’esecuzione` : `Le funzioni IA in ${product} non eseguono rimborsi, email o cancellazioni autonome oggi; eventuali azioni future sono bloccate in modo deterministico nel codice`} (${plan.hostedQueue ? `coda di approvazione ospitata con \`verifyHitlWebhook\` e ${provider.approval}` : "link firmati Slack / Teams tramite `spurvik/channels`"}).`,
            "",
            "## D5: Conservazione, prove RPD/DPO e documentazione Allegato IV",
            "",
            `**Risposta:** Gli eventi firmati di ${product} sono conservati per ${plan.retention} a Francoforte.${plan.dpoSummary ? " Un riepilogo tecnico RPD/DPO (`.md`) è scaricabile direttamente." : ""}${plan.annexIv ? " Include bozza di documentazione tecnica Allegato IV (art. 11, PDF/Markdown) ed esportazione webhook." : ""}${isConcierge ? " L’installazione è stata completata in 24 ore da un ingegnere Spurvik con report RPD/DPO e C2PA Art. 50(2)." : ""}`,
            "",
            "## Prossimi passi",
            `- Questionario interattivo RPD / DPO fornitori: ${interactiveUrl}`,
            ...(host ? [`- Report Art. 50(1) live per ${host}: ${reportUrlFor(host)}`] : []),
            `- SPURVIK_API_KEY gratuita in 10 s (Francoforte fra1): ${upgradeUrls.freeApiKey10sEur0}`,
            `- Pro (19 €/mese — white-label, 90 gg Francoforte, riepilogo RPD): ${upgradeUrls.proWhiteLabelEur19}`,
            `- Team (79 €/mese — 12 mesi, bozza Allegato IV, webhook): ${upgradeUrls.teamAgencyEur79}`,
            `- Setup 24h chiavi in mano (199 € una tantum, 1 anno Pro incluso): ${upgradeUrls.doneForYou24hEur199}`,
            "",
            "_Risposte tecniche basate sui controlli Spurvik distribuiti. Non costituisce consulenza legale._",
        ].join("\n")}\n`;
    }
    const product = host ?? "vores produkt";
    return `${[
        `# EU AI Act leverandørspørgeskema (DPO / IT-sikkerhed): svar for ${product}`,
        "",
        `Spurvik-plan: ${plan.name} (${plan.price}) · Udbyder: ${provider.label} · Konsekvensfyldte agent-handlinger: ${hasHighRiskActions ? "ja" : "nej"} · Syntetiske medier: ${generatesMedia ? "ja" : "nej"}`,
        "",
        ...(domainIgnored ? ["Det angivne domæne er ikke et offentligt værtsnavn og blev udeladt.", ""] : []),
        "## S1: Art. 50, stk. 1 & 2. dec. 2026 Art. 50, stk. 2 Gennemsigtighed & oprindelse",
        "",
        `**Svar:** Hver AI-funktion i ${product} viser en synlig AI-oplysning på alle 24 officielle EU-sprog (\`badge.js\` eller \`<AIDisclosureLabel />\`). ${plan.whiteLabel ? `Mærkningen kører white-label (\`data-attribution="false"\`).` : 'Mærkningen indeholder linket "Art. 50 · Spurvik".'} ${generatesMedia ? `For syntetiske medier (art. 50, stk. 2 fra 2. december 2026) kontrollerer CI publicerede billeder med \`npx spurvik c2pa <image-url> --fail-on-missing\` og ${C2PA_PAGE_URL} for C2PA-JUMBF-manifester (skrivebeskyttet kontrol; Spurvik signerer ikke selv medier).` : `${product} genererer ikke syntetiske medier i dag; ved fremtidig brug tjekker \`npx spurvik c2pa <image-url> --fail-on-missing\` C2PA-manifester.`}`,
        "",
        "## S2: Art. 12 Kryptografisk hændelseslogning",
        "",
        `**Svar:** Hvert ${provider.label}-kald fra ${product} indkapsles med MIT-licenseret Spurvik SDK (${provider.wrapper}). Prompts og svar erstattes af nøglebaserede HMAC-SHA256-fingeraftryk (\`inputHash\`, \`outputHash\`), kædet via SHA-256 \`recordHash\` og \`prevLogHash\` (${plan.events} hændelser/md.).`,
        "",
        "## S3: GDPR art. 5, stk. 1, litra c Dataminimering & EU-lagring i Frankfurt",
        "",
        `**Svar:** 0 bytes rå prompt- eller svartekst gemmes hos Spurvik (pseudonymiserede fingeraftryk jf. GDPR art. 4, nr. 5). Hændelseslogfiler opbevares i Frankfurt, Tyskland (Vercel \`fra1\`, Neon Postgres AWS \`eu-central-1\`) i ${plan.retention}; drevet af danske EyeTea Solutions ApS, CVR 37093378 (https://spurvik.com/privacy).`,
        "",
        "## S4: Art. 14 Deterministisk menneskeligt tilsyn",
        "",
        `**Svar:** ${hasHighRiskActions ? `Agent-handlinger såsom refunderinger, e-mails, rettighedsændringer og sletninger bremses deterministisk i kode før udførelse` : `AI-funktioner i ${product} udløser ikke selvstændige refunderinger, e-mails eller sletninger i dag; fremtidige handlinger bremses deterministisk i kode`} (${plan.hostedQueue ? `hostet godkendelseskø med \`verifyHitlWebhook\` og ${provider.approval}` : "signerede Slack-/Teams-godkendelseslinks via `spurvik/channels`"}).`,
        "",
        "## S5: Opbevaring, DPO-dokumentation & Bilag IV-udkast",
        "",
        `**Svar:** Signerede AI-hændelser for ${product} opbevares i ${plan.retention} i Frankfurt.${plan.dpoSummary ? " Et teknisk DPO-resumé (`.md`) kan eksporteres direkte." : ""}${plan.annexIv ? " Udkast til teknisk dokumentation efter Bilag IV (art. 11, PDF/Markdown) og webhook-eksport er inkluderet." : ""}${isConcierge ? " Opsætningen blev udført inden for 24 timer af en Spurvik-ingeniør inkl. underskrevet DPO- & C2PA-rapport." : ""}`,
        "",
        "## Næste skridt",
        `- Interaktivt dansk DPO- & leverandørspørgeskema: ${interactiveUrl}`,
        ...(host ? [`- Live Art. 50(1)-rapport for ${host}: ${reportUrlFor(host)}`] : []),
        `- Gratis SPURVIK_API_KEY på 10 sek. (Frankfurt fra1): ${upgradeUrls.freeApiKey10sEur0}`,
        `- Pro (19 €/md. — white-label, 90 dage Frankfurt, DPO-resumé): ${upgradeUrls.proWhiteLabelEur19}`,
        `- Team (79 €/md. — 12 måneder, Bilag IV-udkast, webhook): ${upgradeUrls.teamAgencyEur79}`,
        `- Done-For-You 24t-setup (199 € én gang, inkl. 1 års Pro): ${upgradeUrls.doneForYou24hEur199}`,
        "",
        "_Tekniske svar baseret på leverede Spurvik-kontroller. Ikke juridisk rådgivning._",
    ].join("\n")}\n`;
}
/**
 * Copy-paste answers to the five EU AI Act questions enterprise buyers put in vendor security questionnaires
 * and DPO RFPs. Pure and deterministic: no network call, no credential. Throws only for a plan, provider or flag
 * outside the allowed values (the value is not repeated). A domain that is not a public hostname is dropped.
 */
export function spurvikVendorQuestionnaireAnswers(input = {}) {
    const planKey = oneOf(input.plan, SPURVIK_QUESTIONNAIRE_PLANS, "pro", "plan");
    const providerKey = oneOf(input.provider, SPURVIK_QUESTIONNAIRE_PROVIDERS, "openai", "provider");
    const locale = oneOf(input.locale, SPURVIK_QUESTIONNAIRE_LOCALES, "en", "locale");
    const hasHighRiskActions = flag(input.hasHighRiskActions, true, "hasHighRiskActions");
    const generatesMedia = flag(input.generatesMedia, false, "generatesMedia");
    const rawDomain = typeof input.domain === "string" ? input.domain : "";
    const host = rawDomain.trim() ? questionnaireHostname(rawDomain) : null;
    const domainIgnored = rawDomain.trim() !== "" && host === null;
    const plan = PLAN_FACTS[planKey];
    const provider = PROVIDER_FACTS[providerKey];
    const isConcierge = planKey === "concierge";
    const upgradeUrls = upgradeUrlsFor(host, locale);
    if (locale !== "en") {
        const base = LOCALIZED_RFP_COCKPIT_URLS[locale];
        const interactiveUrl = host ? `${base}?domain=${encodeURIComponent(host)}` : base;
        return {
            plan: planKey,
            provider: providerKey,
            hasHighRiskActions,
            generatesMedia,
            domain: host,
            markdown: renderLocalizedMarkdown({
                locale,
                host,
                domainIgnored,
                plan,
                provider,
                hasHighRiskActions,
                generatesMedia,
                isConcierge,
                interactiveUrl,
                upgradeUrls,
            }),
            interactiveUrl,
            reportUrl: host ? reportUrlFor(host) : null,
            upgradeUrls,
        };
    }
    const product = host ?? "our product";
    const header = [
        `# EU AI Act vendor security questionnaire: answers for ${product}`,
        "",
        `Spurvik plan: ${plan.name} (${plan.price}) · Provider: ${provider.label} · Consequential agent actions: ${hasHighRiskActions ? "yes" : "no"} · Synthetic media: ${generatesMedia ? "yes" : "no"}`,
        "",
        "Paste each answer into the buyer's questionnaire, then check it against your own setup before you send it.",
        "",
    ];
    if (domainIgnored) {
        header.push("The domain was not a public hostname, so it was left out of these answers.", "");
    }
    const lines = [
        ...header,
        ...q1(product, plan, generatesMedia, isConcierge),
        ...q2(product, plan, provider),
        ...q3(plan, provider),
        ...q4(product, plan, provider, hasHighRiskActions),
        ...q5(product, plan, isConcierge),
        ...planTable(),
        ...nextSteps(host, upgradeUrls),
        "_Engineering answers based on Spurvik's shipped controls. Articles 12 and 14 bind high-risk systems (Art. 6, Annex III); that classification stays with you. Not legal advice._",
    ];
    return {
        plan: planKey,
        provider: providerKey,
        hasHighRiskActions,
        generatesMedia,
        domain: host,
        markdown: `${lines.join("\n")}\n`,
        interactiveUrl: SPURVIK_VENDOR_QUESTIONNAIRE_URL,
        reportUrl: host ? reportUrlFor(host) : null,
        upgradeUrls,
    };
}
