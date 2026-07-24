# Evidence guide

Last verified: 2026-07-25

## Match authority to the claim

No single source is authoritative for every question.

| Claim | Best available authority | Common mistake |
| --- | --- | --- |
| What this instance observed | Timestamped, redacted capture from the affected instance/provider | Treating an upstream issue report as local evidence |
| What version is deployed | Immutable image digest, package/version output, or owner-verified deployment record | Inferring version from when the problem began |
| What that version implements | Source at the exact tag/commit matching the deployed artifact | Reading current `canary` for an older release |
| What should happen | Official version-relevant Dokploy documentation | Treating documented behavior as proof it occurred |
| Current issue/fix status | Live upstream issue, pull request, release, or commit | Repeating a stale status from this library |
| Root cause | A causal chain supported by instance evidence and version-matched implementation | Promoting timing or error-string similarity to causation |

User recollection is valuable for finding a time window, but turn it into a
timestamped artifact before relying on it as a fact.

## Evidence ledger

Assign stable IDs so facts and hypotheses can cite artifacts without copying
their contents:

| ID | Captured UTC | Source | Scope | Observation | File/URL | Sensitivity | Integrity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E-001 |  |  |  |  |  |  | original / redacted / transcribed |

An observation says what the artifact contains. Interpretation belongs in the
hypothesis table. For example:

- Observation: `E-004 contains NOT_FOUND and the exact GitHub account error at
  10:12:41Z`.
- Interpretation: `The provider object may lack a required field at the auth
  call`.

## Keep the private case in one file

Use the evidence section of the private `case.md`. Paste only the smallest
useful redacted excerpt and give it an evidence ID, capture time, and source.
Summarize a screenshot or binary artifact as text in the same file. Text is
more reliably searchable and citable by connected AI clients.

## Redaction rules

Remove or replace:

- passwords, tokens, cookies, authorization headers, session data;
- private keys, client secrets, webhook secrets, SSH keys;
- full environment-variable values;
- personal data and customer payloads;
- irrelevant private repository, domain, hostname, and IP details.

Preserve diagnostic shape:

```text
Authorization: <redacted: bearer token present>
githubPrivateKey: <redacted: present>
githubInstallationId: <redacted: non-empty integer>
DATABASE_URL: <redacted: present>
```

Do not invent “present” when the source did not establish presence. Keep an
untouched original outside the AI-readable folder when organizational policy
requires it; place only the redacted derivative in the case.

## Freshness and provenance

Every artifact should answer:

- Who or what produced it?
- When was it captured?
- Which instance, node, application, and environment did it concern?
- Which version was active?
- Is it original, redacted, summarized, or transcribed?
- Could the state have changed since capture?

For web sources, record the access date. For source, use an immutable commit or
release tag. Recheck moving facts such as issue status before the final answer.

