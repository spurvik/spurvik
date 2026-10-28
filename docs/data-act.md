# Data Act switching information

Draft for EyeTea Solutions ApS approval before the first production customer, free or paid. This is pre-contract information for a hosted control plane. It is not a contract and it is not legal advice.

EyeTea Solutions ApS, CVR 37093378, charges **no switching fee**. There is no early-termination charge for taking data out.

## What you can export

An organisation owner downloads one JSON file from the Data inventory page. The file is the exhaustive portable set:

- Organisation name and plan
- Project fields the customer entered, including the self-assessment notes and retention settings
- Audit-log rows: identifiers, model metadata, keyed fingerprints, latency, and marking flags
- Human-decision rows, including the reason text, stored outside the record hash
- Oversight stop state and reason, stored outside the record hash
- Disclosure events
- Upstream marking evidence payloads
- Purge checkpoints
- Project monthly event quota and telemetry export setting
- Project invites: email, invited name, inviting user id, and expiry time
- Member audit rows: subject email, actor user id, and subject user id
- Member name, email, and role
- API key label and last four characters
- Reviewer-token last four characters and revocation time
- Per-project HMAC key last four characters
- Session expiry time, without the session secret

The format is JSON, UTF-8. The same rows are available to the customer's own database if the customer runs the control plane. No separate export fee applies.

## What is withheld

These values are withheld because they are secrets. Withholding them does not block retrieval of the portable set:

- Password hashes
- Session token hashes
- API key hashes
- Reviewer-token hashes
- Invite token hashes
- Webhook signing secrets
- Client-held provenance secrets and content-fingerprint secrets, which are never sent to the control plane
- Per-project HMAC key hashes

## Switching periods

The customer may end the service on the notice in the contract. A monthly notice is within the two-month maximum. After notice, the customer has at least 30 days to retrieve the export, and the service keeps the data available during that retrieval period. EyeTea then deletes the customer rows. This software does not add a charge for that retrieval.

## Infrastructure and access from outside the EU

As of 17 October 2026 this repository configures no production host. See `docs/legal/subprocessors.md`. Customer data is written only to the operator's `DATABASE_URL`. This document does not state a country of storage, and it does not describe a safeguard against governmental access, because no production infrastructure is engaged. Fill both before the first production customer. Do not describe the service as EU-resident until primary storage, backups, and processing are documented.
