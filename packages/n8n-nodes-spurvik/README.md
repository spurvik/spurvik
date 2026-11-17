# n8n-nodes-spurvik

n8n community node for self-hosted n8n, designed to support six separate workflow steps:

1. Add an AI interaction notice to one text field.
2. Record the call as an HMAC-SHA256 digest instead of the raw prompt text. The digest is `spurvik:workflow:input:v1|` plus the input field. This is designed to support Article 12 record-keeping for high-risk AI systems. The notice operation reads outputField (default outputText) and inputField (default promptText). inputField is shown for the notice and the digest. It throws if outputField is missing or is not a string, if outputField equals inputField in any letter case, or if outputField matches promptText, prompt, chatInput, query, or input in any letter case. It does not read the prompt field. Output is { spurvik: result } plus explicitly named fields other than those prompt names. Those prompt names and the configured inputField are never copied (name check only, any letter case). The field value is not returned, including when that name is listed in passThroughFields. The digest is HMAC-SHA256 of the prefix spurvik:workflow:input:v1| plus the input field.
3. Send an `ask_human()` approval request. This is designed to support Article 14 human oversight for high-risk AI systems.
4. Scan a live client site for AI chat widgets and an Art. 50 notice, with no API key. See [Scan Live Domain](#scan-live-domain-art-50--client-brief).
5. Scan an agency roster of up to 10 client sites in one step, with no API key. See [Batch Scan](#batch-scan-up-to-10-domains-agency-roster).
6. Check one public image URL for a C2PA manifest and CDN stripping, with no API key. See [Check Image C2PA & CDN Strip](#check-image-c2pa--cdn-strip-art-502).

The node does not mark or sign content.

n8n keeps each node's input and output on the execution. The Spurvik node output does not copy prompt text, but the incoming item is still that node's input. Set the instance's execution data retention yourself: `EXECUTIONS_DATA_SAVE_ON_SUCCESS`, `EXECUTIONS_DATA_SAVE_ON_ERROR`, `EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS`, `EXECUTIONS_DATA_PRUNE`, `EXECUTIONS_DATA_MAX_AGE`, and `EXECUTIONS_DATA_PRUNE_MAX_COUNT`. n8n's execution history keeps those inputs and outputs until you change those retention settings.

## Channels

Slack, Telegram, Email (Resend), Discord, Microsoft Teams, Linear, Jira, Monday.com, and Asana.

Monday.com only creates a board item. It does not send Approve or Block links.

Slack, Discord, and Teams use a webhook credential. The other channels use an approver target (chat id, email recipient, team id, project key, board id, or project gid) plus the matching token on the `spurvikApi` credential.

`callbackBaseUrl` is required for an approval request. Pass a URL that accepts GET clicks. By default (when `consoleApiKey` is left empty), the notice, digest, and approval operations run locally without calling the Spurvik HTTP API; setting `consoleApiKey` on the `spurvikApi` credential enables optional sync to `consoleBaseUrl` (`https://console.spurvik.com` by default). Scan Live Domain and Batch Scan always call `consoleBaseUrl` and send only hostnames. Check Image C2PA always calls `consoleBaseUrl` and sends only the image URL.

## Scan Live Domain (Art. 50 & Client Brief)

Operation value `scanDomain`. It needs **no credential and no API key**: n8n hides the `spurvikApi` credential for this operation, the node does not read it, and the request carries no `Authorization` header. Drop the node into a workflow, set **Domain or URL**, and run it.

- **Domain or URL** (`domainOrUrl`, required): a bare domain (`stepnetwork.dk`) or an http(s) URL (`https://Www.StepNetwork.dk/path?x=1` becomes `www.stepnetwork.dk`). Only the lower-case hostname is used. The node refuses localhost and `*.localhost`, IPv4 and IPv6 literals (including decimal, hex, and octal forms such as `2130706433` or `0x7f000001`), `.local`, `.internal`, `.lan`, `.home.arpa`, single-label hosts, `user@host`, non-default ports, and labels outside `a-z`, `0-9`, and `-`. Those inputs stop the node with an error before any request is made. Punycode (`xn--`) hosts are fine.
- **Console Base URL** (`consoleBaseUrl`, default `https://console.spurvik.com`): the node calls `GET {consoleBaseUrl}/api/v1/sandbox/scan?url=<host>` with an 8 second timeout and refuses redirects. It must use `https://` (`http://` is allowed only for localhost testing).

If the console cannot be reached, times out, answers with a non-2xx status or invalid JSON, or returns `ok: false`, the node does not fail the workflow. It returns `reachable: false`, empty lists, `art50NoticeDetected: false`, `scanStatus: "offline"`, and a short `reason` code (`timeout`, `network_error`, `upstream_http_503`, ...), with every link still filled in. The error text and the response body are never copied to the output.

The output item holds only the scan. Nothing from the incoming item is copied, and `passThroughFields` does not apply. Example for `stepnetwork.dk`:

```json
{
  "domain": "stepnetwork.dk",
  "reachable": true,
  "detectedWidgets": [],
  "detectedSdks": [],
  "art50NoticeDetected": false,
  "badgeSnippet": "<script src=\"https://spurvik.com/badge.js\" data-system=\"stepnetwork.dk\" data-locale=\"da\" data-theme=\"dark\" data-attribution=\"true\" defer></script>",
  "reportUrl": "https://console.spurvik.com/report?domain=stepnetwork.dk",
  "sandboxUrl": "https://console.spurvik.com/sandbox?scan=stepnetwork.dk",
  "portfolioUrl": "https://console.spurvik.com/portfolio",
  "statusShieldUrl": "https://console.spurvik.com/api/v1/badge/status.svg?domain=stepnetwork.dk",
  "statusShieldMarkdown": "[![EU AI Act Art. 50](https://console.spurvik.com/api/v1/badge/status.svg?domain=stepnetwork.dk)](https://console.spurvik.com/report?domain=stepnetwork.dk)",
  "agencyCalculatorUrl": "https://spurvik.com/eu-ai-act-for-agencies",
  "upgradeUrls": {
    "proWhiteLabelEur19": "https://console.spurvik.com/signup?plan=pro&appUrl=stepnetwork.dk",
    "teamAgencyEur79": "https://console.spurvik.com/signup?plan=team&appUrl=stepnetwork.dk",
    "doneForYou24hEur199": "https://console.spurvik.com/signup?plan=concierge&appUrl=stepnetwork.dk"
  },
  "scanStatus": "not_measured",
  "reason": "no_ai_surface",
  "markers": {
    "art50_1_disclosure": false,
    "art50_2_provenance": false,
    "art50_4_synthetic": false,
    "art12_telemetry": false
  }
}
```

- `art50NoticeDetected` is `markers.art50_1_disclosure` from the console scan. It is `false` when the page could not be read.
- `detectedWidgets` and `detectedSdks` are strings only, at most 20 each.
- `badgeSnippet` is the same `badge.js` tag the MCP server's scan tool returns: the host as `data-system`, a locale from the country-code TLD (`.dk` gives `da`, otherwise `en`), dark theme, and the free "Art. 50 · Spurvik" attribution link. Paste it before `</body>`.
- `reportUrl` and `sandboxUrl` are shareable client-brief links. `upgradeUrls` open console signup with the domain prefilled (`appUrl`): Pro €19/mo (white-label badge), Team €79/mo (for agencies), and Done-For-You €199 once (24h setup). Prices excl. VAT, B2B only.
- `portfolioUrl` opens the console's multi-domain agency cockpit. `statusShieldUrl` is a live SVG status shield for the host, and `statusShieldMarkdown` is that shield linked to `reportUrl`, ready to paste into a client README.
- `agencyCalculatorUrl` links the EU AI Act calculator for agencies.

The scan is a heuristic check of one public page. It can miss a widget or a notice that loads later.

## Batch Scan up to 10 Domains (Agency Roster)

Operation value `batchScanDomains`. Like Scan Live Domain it needs **no credential and no API key**, reads nothing from the incoming item, and sends only hostnames.

- **Domains** (`domainsList`, required): 1 to 10 public domains or http(s) URLs separated by commas, spaces, or new lines (`folk.app, stepnetwork.dk`). An expression may also return an array of strings. Hosts that normalize to the same name are scanned once.
- Every entry and `consoleBaseUrl` are checked **before any request**. An empty list, more than 10 entries, or a single entry that Scan Live Domain would refuse (localhost, an IP address, an internal name, `user@`, a non-default port) stops the node with an error that names the entry position only, and nothing is sent.
- Hosts are scanned through the same `GET {consoleBaseUrl}/api/v1/sandbox/scan` call, at most 4 at a time, 8 seconds each. A host that times out or fails comes back as its own `scanStatus: "offline"` row; the batch keeps going.

Output (one item per incoming item):

```json
{
  "totalDomains": 2,
  "gapsFound": 1,
  "results": [{ "domain": "folk.app", "reachable": true, "detectedWidgets": ["Intercom"], "art50NoticeDetected": false, "...": "same fields as Scan Live Domain" }],
  "portfolioUrl": "https://console.spurvik.com/portfolio",
  "agencyCalculatorUrl": "https://spurvik.com/eu-ai-act-for-agencies",
  "upgradeUrls": {
    "proWhiteLabelEur19": "https://console.spurvik.com/signup?plan=pro",
    "teamAgencyEur79": "https://console.spurvik.com/signup?plan=team",
    "doneForYou24hEur199": "https://console.spurvik.com/signup?plan=concierge"
  }
}
```

- `totalDomains` counts distinct hosts scanned. `gapsFound` counts reachable hosts with at least one detected widget and no Art. 50 notice detected. Offline and unreachable hosts are never counted as gaps.
- Each row in `results` is a full Scan Live Domain result, including its own `badgeSnippet`, `statusShieldMarkdown`, and `upgradeUrls` with `appUrl` prefilled. The batch-level `upgradeUrls` are plan links: Pro €19/mo, Team €79/mo (for agencies), and Done-For-You €199 once. Prices excl. VAT, B2B only.

## Check Image C2PA & CDN Strip (Art. 50(2))

Operation value `checkImageC2paUrl`. A read-only **C2PA JUMBF manifest & CDN-strip checker** for one public image, ahead of EU AI Act Art. 50(2) machine-readable marking (applies from 2 December 2026). It reads the manifest; it **never signs or adds one**. Like the scans it needs **no credential and no API key**, reads nothing from the incoming item, and sends no `Authorization` header.

- **Image URL** (`imageUrl`, required): the public https URL of a PNG, JPEG, or WebP image up to 4 MB, for example `https://example.com/hero.png`. It is checked **before any request**: `http` and other schemes, ports other than 443, `user:password@`, localhost, `.local`, `.internal`, `.lan`, `.home.arpa`, single-label hosts, and every IP address literal are refused with an error, and nothing is sent. The `#fragment` is dropped.
- The node calls `POST {consoleBaseUrl}/api/v1/provenance/public-check-url` with `{ "url": "<imageUrl>" }` and `User-Agent: n8n-nodes-spurvik/1.0.7` (15 second timeout, redirects refused). The console fetches the image once through its own SSRF gate and reads the manifest in memory. The console allows 10 checks per minute per address, shared with https://console.spurvik.com/c2pa.

If the check cannot run (timeout, network error, `rate_limited`, `image_too_large`, `unsupported_media`, an unreadable answer, ...), the node does not fail the workflow. It returns `checkStatus: "not_checked"`, a short `reason` code, and `null` for every C2PA field, so a failed check never reads as "no manifest". The console's error text is never copied.

Example for a signed image behind the Next.js image optimizer:

```json
{
  "imageUrl": "https://shop.example.de/_next/image?url=%2Fhero.png&w=1080&q=75",
  "imageHost": "shop.example.de",
  "checkStatus": "no_manifest",
  "reason": null,
  "fileName": "hero.png",
  "mediaType": "image/png",
  "byteLength": 33270,
  "manifestFound": false,
  "embedded": false,
  "signatureMatches": false,
  "trustAnchor": "not_checked",
  "claimGenerator": null,
  "validationCodes": [],
  "cdnRewriteSuspected": true,
  "cdnProvider": "Next.js image optimizer (/_next/image)",
  "diagnosis": "This URL goes through Next.js image optimizer (/_next/image). Image optimizers decode and re-encode the image, which drops the C2PA JUMBF boxes, so a signed original arrives unsigned. Set `unoptimized` on that next/image <Image> (or `images.unoptimized` in next.config) so the original signed bytes are served.",
  "art50GeneratedBadgeSnippet": "<script src=\"https://spurvik.com/badge.js\" data-notice=\"generated\" data-locale=\"de\" data-theme=\"auto\" data-attribution=\"true\" defer></script>",
  "c2paCheckerUrl": "https://console.spurvik.com/c2pa",
  "upgradeUrls": {
    "proWhiteLabelEur19": "https://console.spurvik.com/signup?plan=pro&appUrl=shop.example.de",
    "teamAgencyEur79": "https://console.spurvik.com/signup?plan=team&appUrl=shop.example.de",
    "doneForYou24hEur199": "https://console.spurvik.com/signup?plan=concierge&appUrl=shop.example.de"
  }
}
```

- `checkStatus` is `manifest_valid` (a manifest whose signature matches), `signature_mismatch` (a manifest whose bytes or claim changed after signing), `no_manifest`, or `not_checked`.
- `claimGenerator` is unverified text from the manifest, reduced to letters, digits, spaces, and `._()/+:@-` (at most 100 characters). `validationCodes` keeps dotted identifiers only (at most 20). `fileName` keeps `A-Z a-z 0-9 . _ -` only.
- `cdnRewriteSuspected` is `true` when the URL goes through an optimizer that re-encodes images and strips C2PA: `/_next/image`, Cloudflare `/cdn-cgi/image/`, Cloudinary, or imgix. `diagnosis` explains the result and the fix.
- `art50GeneratedBadgeSnippet` is a visible "AI-generated" notice (`badge.js` with `data-notice="generated"`), with the locale from the image host's country-code TLD.
- `upgradeUrls` open console signup with the image host prefilled (`appUrl`): Pro €19/mo, Team €79/mo, and Done-For-You €199 once. Prices excl. VAT, B2B only. On a shared image CDN host (Cloudinary, imgix) `appUrl` is left out, because that host is not your site.

A matching signature is a check of that manifest. It does not mean the image or a site meets the AI Act.

## Credential

`spurvikApi` stores the HMAC signing secret, optional `consoleApiKey`, and channel tokens as password fields. Scan Live Domain, Batch Scan, and Check Image C2PA do not use it. The node reads the secret only from that credential. It throws if the secret is missing, shorter than 16 characters, or padded with whitespace. It does not read `SPURVIK_HMAC_SECRET`.

## Layout

n8n loads:

- `dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js` (`class SpurvikEuAiActGuard`)
- `dist/credentials/SpurvikApi.credentials.js` (`class SpurvikApi`, credential name `spurvikApi`)

The node type id stays `spurvikEuAiActGuard`, the same id as 1.0.1.

`dist/index.js` still exports `executeSpurvikWorkflowStep`, `SpurvikN8nNodeDescription`, and `SpurvikEuAiActGuard`.

## Make.com

`make-com-blueprint.json` in this repository posts `actionName` and `payloadSummary` to the hosted HITL create route. The bearer token in the file is `{{var.organization.spurvikApiKey}}`. Make organization variables and scenario inputs are plain text, not secret storage. [Make's custom-variables page](https://help.make.com/custom-variables) states that organization variables need Make Pro, Teams, or Enterprise, and that the values are stored in plain text and are not for secrets. The [Make API organizations reference](https://developers.make.com/api-documentation/api-reference/organizations) states that creating an organization variable returns 404 when the organization license does not include `customVariables`. This blueprint has not been test-imported in Make. The `{{var.input.spurvikApiKey}}` option needs scenario inputs (Pro+ and on-demand scheduling). A webhook-triggered blueprint is not started with scenario inputs, so that mapping likely won't work there. [Make's scenario-input page](https://help.make.com/use-scenario-inputs) shows the scenario editor inserts `{{var.input.<name>}}` for a scenario input. Enabling inputs requires on-demand scheduling; the [scenario update API](https://developers.make.com/api-documentation/api-reference/scenarios) returns 422 (IM016) otherwise, and an older sentence on that page still says Pro or higher, while [a later Make release note](https://help.make.com/scenario-inputs-now-available-for-all-users) says scenario inputs were opened to all plans. For production, use a Make keychain or connection. Do not map the API key from the webhook payload. Free workspaces sign up at https://console.spurvik.com/signup; paid plans (`Pro €19/mo · Team €79/mo`, excl. VAT · B2B only) upgrade through Stripe Checkout.

## Scope

Designed to support EU AI Act Art. 50 notices and Art. 12 and Art. 14 workflows for high-risk AI systems. Using this node does not by itself mean anyone meets the AI Act, and nothing here is legal advice.
