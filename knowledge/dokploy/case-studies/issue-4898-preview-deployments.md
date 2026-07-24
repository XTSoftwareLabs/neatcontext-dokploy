# Case study: issue #4898 — GitHub preview deployments

Status snapshot: open with `bug` and `needs-triage` labels on 2026-07-25  
Source snapshot: Dokploy `canary` commit
[`73e4fdd757da90fb1fe347a92b92237e6712f98d`](https://github.com/Dokploy/dokploy/commit/73e4fdd757da90fb1fe347a92b92237e6712f98d)  
Primary report: [Dokploy issue #4898](https://github.com/Dokploy/dokploy/issues/4898)

This is a worked public example. Recheck the live issue, releases, and source
before using its status or fix information. It does not prove the cause of a
user’s private incident.

## Reported symptom boundary

The issue reports a self-hosted Docker Swarm installation on v0.29.13 using a
GitHub App provider and application preview deployments. For pull-request
events:

- the webhook reaches Dokploy and the application is matched;
- preview creation stops with `Github Account not configured correctly` and
  code `NOT_FOUND`;
- no new preview deployment or PR bot comment appears;
- ordinary production auto-deploys reportedly continue to work;
- preview deployments reportedly worked before the v0.29.13 upgrade.

Official documentation says an enabled preview deployment should be created for
a pull request targeting the configured branch and should update with later
commits. See
[Preview Deployments](https://docs.dokploy.com/docs/core/applications/preview-deployments).

These are reported observations and documented expectations. They are not yet a
causal conclusion.

## Versioned public code evidence

### E-PUB-4898-1 — provider relation changed shape

In
[`v0.29.12` `findApplicationById`](https://github.com/Dokploy/dokploy/blob/v0.29.12/packages/server/src/services/application.ts#L94-L123),
the eager-loaded `github` relation is requested as a full relation.

In
[`v0.29.13` `findApplicationById`](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/services/application.ts#L94-L137),
the query excludes `githubClientSecret`, `githubPrivateKey`, and
`githubWebhookSecret`. The change is part of the merged security work in
[PR #4859](https://github.com/Dokploy/dokploy/pull/4859), including commit
[`ecbaf606`](https://github.com/Dokploy/dokploy/commit/ecbaf6060bf6d00491ee51086e28258979777226).

Secret redaction is a security boundary and should remain intact.

### E-PUB-4898-2 — preview creation consumes the eager-loaded relation

At v0.29.13,
[`createPreviewDeployment`](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/services/preview-deployment.ts#L129-L166)
loads the application with `findApplicationById`, then passes
`application.github` to `authGithub`.

### E-PUB-4898-3 — auth requires the excluded field

At v0.29.13,
[`haveGithubRequirements`](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/providers/github.ts#L87-L92)
requires the GitHub App ID, private key, and installation ID. The surrounding
[`authGithub`](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/providers/github.ts#L12-L29)
throws the exact reported error when those requirements are not met.

### E-PUB-4898-4 — the failure precedes preview insertion

In `createPreviewDeployment`, authentication and creation of the GitHub
initializing comment occur before the `previewDeployments` insert in the same
[v0.29.13 function](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/services/preview-deployment.ts#L145-L166).
An auth exception at that point explains why neither the comment nor preview
record is created.

### E-PUB-4898-5 — a production clone path reloads the provider

The v0.29.13
[GitHub clone helper](https://github.com/Dokploy/dokploy/blob/v0.29.13/packages/server/src/utils/providers/github.ts#L145-L164)
uses `findGithubById(githubId)` before calling `authGithub`. This difference is
consistent with the report that another GitHub-backed path remains functional.
It does not prove every production deployment path is unaffected.

The same relevant data flow was still present at the pinned `canary` snapshot:

- [`findApplicationById` redaction](https://github.com/Dokploy/dokploy/blob/73e4fdd757da90fb1fe347a92b92237e6712f98d/packages/server/src/services/application.ts#L94-L137)
- [`createPreviewDeployment` call site](https://github.com/Dokploy/dokploy/blob/73e4fdd757da90fb1fe347a92b92237e6712f98d/packages/server/src/services/preview-deployment.ts#L129-L166)

## Bounded inference

For v0.29.13, the combined code evidence supports this strong hypothesis:

> The preview path receives a deliberately redacted GitHub relation, then
> requires the missing private key before it can comment or insert the preview
> record.

This is an inference from the versioned data and control flow, corroborated by
the public issue report. It is not proof that a new private report has the same
cause, that a proposed patch is complete, or that no adjacent path is affected.

## Discriminators for a private case

Raise confidence only when private evidence matches:

- v0.29.13 or another revision with the same relevant code path;
- GitHub App source provider;
- application preview deployments;
- pull-request `opened`, `synchronize`, `reopened`, or relevant label event;
- exact `Github Account not configured correctly` / `NOT_FOUND` signature;
- webhook accepted and application matched;
- no PR comment and no preview record;
- ordinary non-preview behavior still working, if claimed.

Lower or reject confidence when:

- a different provider or feature path is involved;
- the webhook fails signature, installation, repository, branch, label, limit,
  or author-permission checks earlier;
- a preview record exists and failure occurs in build/scheduling/routing;
- the deployed source already reloads the full provider before auth;
- the error differs or predates the relevant upgrade.

## Safest next evidence

1. Capture exact image tag/digest and incident time.
2. Capture the narrow, redacted Dokploy log excerpt from the PR event.
3. Record GitHub delivery event/action and response metadata without secrets.
4. Confirm preview-only versus broader deployment impact.
5. Inspect the exact deployed source or artifact revision at the data-loading and
   auth call sites.
6. Recheck the live issue and releases for a merged fix.

The issue author reports a downgrade as a workaround. A downgrade is a
state-changing operation, may introduce security or migration risk, and must not
be automatically recommended or executed. It requires current upstream review,
an instance-specific backup/rollback plan, and explicit owner approval.

