---
description: Write SPURVIK-ENGINEERING-SUMMARY.md, an engineering summary for your DPO or counsel. It is not evidence of conformity and it is not legal advice.
---

# `/spurvik:engineering-summary`

Scan the repository and write `SPURVIK-ENGINEERING-SUMMARY.md`, or update it if it already exists.

Call the file an engineering summary for your DPO or counsel. It is not evidence of conformity. It is not legal advice.

Include only controls that the code and the repository README actually describe.

1. **AI system inventory.** LLM providers, model ids, and user-facing surfaces found in the repository. Say when a surface was not found.

2. **Art. 50(1) notices.** Where a person is told they are interacting with an AI system. The React exports are `AIDisclosureLabel`, `AiDisclosure`, and `AIArticle50Section3Notice` from `@spurvik/react`. `article50Disclosure` on `withSpurvik` / `spurvikMiddleware` is a configuration flag, not a finding that a notice was shown. The repository README states that Art. 50 transparency obligations apply from 2 August 2026. A marking hook runs only when the caller sets `marking`. The SDK does not mark content. Do not describe a hook as machine-readable marking under Art. 50(2).

3. **Art. 12 record-keeping for high-risk AI systems.** How wrapped calls are recorded. The telemetry body carries fingerprints, model version, temperature, and latency. The ingestion route rejects prompt or output text. The default fingerprint mode is keyed HMAC-SHA-256 with a client-held secret. `contentHash.mode` `"off"` stores no fingerprint. Do not name a storage region. The repository states that this tree does not claim that data stays in the EU. The repository README states that Art. 12 applies to Annex III high-risk systems from 2 December 2027.

4. **Art. 14 human oversight for high-risk AI systems.** Which tools call `requireHumanApproval`, and whether `enforceHaltOnInference`, `oversight.cacheMs`, `oversight.pushInvalidation`, `engageKillSwitch({ reason: "stop" })`, or `releaseKillSwitch({ reason: "release the stop" })` appear. A release call passes a reason. These are designed to support Art. 14. They are not a complete Art. 14 system. There is no currency threshold in the SDK config. The repository README states that Art. 14 applies to Annex III high-risk systems from 2 December 2027.

5. **Closing line.** Repeat that the file is an engineering summary for your DPO or counsel, that it is not evidence of conformity, and that it is not legal advice. Spurvik is software designed to support parts of Regulation (EU) 2024/1689. Using it does not assess conformity.
