# Cyber Resilience Act Article 14 reporting runbook

**Draft for EyeTea Solutions ApS approval.** Not legal advice. Not an operational procedure that has been used. EyeTea Solutions ApS is treated here as a manufacturer of the Spurvik packages, because it develops them and intends to monetise them through the control plane. It is not an open-source steward. The hosted control plane, standing alone, is a service. This runbook covers the packages and any control-plane function the packages need in order to perform a function.

Article 14 reporting applies from 11 September 2026, so it applies at the 10 November 2026 launch. The other CRA obligations in this note apply from 11 December 2027 and are listed only so they are not forgotten. The single reporting platform's address is **not filled in**. Confirm it before relying on this draft.

## Tell users about a fix

1. Publish a note in `SECURITY.md` under "Fixed issues" with the affected package, the versions, and what users should do.
2. Until packages are public, send the same note to every organisation owner who has an account, using the email already stored for that account. Do not open a public issue for an unfixed bug.
3. A fix is not a claim that the product meets the CRA.

## When this runbook starts

Use it for an actively exploited vulnerability in a Spurvik package, or a severe incident affecting a Spurvik product with digital elements. A micro or small enterprise is not fined for missing the 24-hour early warning. Send it anyway.

## 24-hour early warning

Within 24 hours of becoming aware:

- Record the time awareness started, who reported it, and the affected package or service.
- Send an early warning through the single reporting platform. Include that an actively exploited vulnerability or a severe incident is suspected, and whether it has a cross-border effect if that is already known.
- Do not wait for a full analysis.

## 72-hour notification

Within 72 hours of becoming aware, send a notification through the same platform:

- What is affected
- What is known about the cause
- The measures taken or proposed
- Whether the impact is severe, and any cross-border effect

Update the notification if a later fact changes it.

## Final report

Send the final report through the same platform:

- Within 14 days after a corrective measure is available for an actively exploited vulnerability, or
- Within one month of the 72-hour notification for a severe incident

The report states the nature of the threat, the measures taken, and the user's recommended action. If the incident is still open at that point, send a progress report and the final report once it is closed.

## After 11 December 2027

Still to do, and not done by this draft: Annex I essential requirements, an SBOM, conformity assessment by internal control, technical documentation, an EU declaration of conformity, CE marking, and a defined support period. Do not state that any of those exist.
