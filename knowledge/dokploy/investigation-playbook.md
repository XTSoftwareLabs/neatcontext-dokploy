# Dokploy issue investigation playbook

Last verified: 2026-07-25

## 0. Protect the evidence boundary

- Store user material only under `private/cases/<case>/` or another
  user-controlled personal knowledge folder.
- Never place it under `profiles/` or `knowledge/`; those are shared Team
  Library content.
- Redact secret values before the AI client can read a file. Preserve only the
  nonsecret shape needed for reasoning, for example
  `githubPrivateKey: <redacted: present>`.
- Treat hostnames, IPs, repository names, user identities, URLs, database
  contents, and logs as potentially sensitive.
- Record all investigation times in UTC and preserve original timestamps.

## 1. Define the failure precisely

Write one observed-versus-expected statement:

```text
Observed: <what happened, where, and at what UTC time>
Expected: <documented or last-known-good behavior>
Impact: <who/what is affected and what remains healthy>
```

Then establish:

- exact Dokploy version/tag;
- immutable image digest or source commit when available;
- install mode, host/remote topology, and affected node;
- Docker Engine and Swarm versions/state;
- affected feature, resource, source provider, and build type;
- first-failing and last-known-good times;
- smallest repeatable sequence;
- exact error text and code.

Do not begin from a guessed root cause. Begin from a stable failure signature.

## 2. Capture read-only runtime evidence

The following are examples for a typical installer-managed host. Confirm names
and access policy first. They read state but their output can still disclose
sensitive infrastructure or application data.

```shell
date -u +"%Y-%m-%dT%H:%M:%SZ"
docker version
docker service ls
docker service ps --no-trunc dokploy
docker service inspect dokploy --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
```

For a narrow incident window:

```shell
docker service logs --since 30m --timestamps dokploy
docker service logs --since 30m --timestamps dokploy-postgres
docker logs --since 30m --timestamps dokploy-traefik
```

These default names come from Dokploy’s
[troubleshooting guide](https://docs.dokploy.com/docs/core/troubleshooting).
Replace them only after confirming the actual service/container names. Use the
smallest useful time window and redact before copying output into the case.

Also capture, when relevant:

- the UI/API result and request time;
- provider webhook delivery ID, event/action, response code, and redacted
  payload fields;
- application target branch, preview/auto-deploy flags, labels, and limits;
- deployment/build/runtime log excerpts with timestamps;
- task node placement for local versus remote evidence;
- exact before/after version identities and change time.

Avoid broad environment dumps, full database dumps, raw provider payloads, or
commands that print secret-bearing service configuration.

## 3. Build a timeline

Use the private `timeline.md` template. Put observations and interpretations in
different columns.

At minimum include:

1. last known success;
2. relevant upgrade/configuration/provider/infrastructure change;
3. first known failure;
4. triggering request or webhook;
5. each logged transition until the first missing/failed transition;
6. current state.

Normalize to UTC without discarding source timezone information.

## 4. Trace the mechanism at the deployed revision

1. Resolve the deployed tag or commit. Do not inspect `canary` as a substitute.
2. Search that revision for the exact error string.
3. Identify the throw/return site and its required inputs.
4. Walk backward to the route and data-loading call.
5. Walk forward to determine which side effects did and did not occur.
6. Compare with the last-known-good revision only along the relevant path.
7. Check tests, release notes, linked pull requests, and security intent.
8. Explain unaffected behavior; it is often the best discriminator between
   competing hypotheses.

When referencing code, cite the immutable commit or tag plus path and lines.

## 5. Test hypotheses

For each hypothesis, fill this table:

| Field | Required content |
| --- | --- |
| Mechanism | The complete causal path, not merely a correlated change |
| Supporting evidence | Evidence IDs from the private case and immutable public sources |
| Contradictions | Facts the mechanism does not explain |
| Confidence | Confirmed, strong, plausible, weak, or rejected |
| Next check | One safe observation that would most change confidence |
| Stop condition | What evidence would falsify or confirm the hypothesis |

A public issue is one supporting source. To match it to a private case, require
the issue’s discriminators: version window, feature/provider path, exact
signature, and affected-versus-unaffected behavior.

## 6. Report before changing state

The first useful answer should contain:

- evidence sufficiency and scope;
- confirmed facts with sources;
- a UTC timeline;
- ranked, explicitly labeled hypotheses;
- contradictions and unknowns;
- the smallest safe next evidence;
- only then, possible remediation options.

Restarts, rollbacks, downgrades, upgrades, database changes, secret rotation, or
configuration edits are state changes. Do not execute them or present them as
approved without the instance owner’s confirmation, an impact assessment, a
backup, and a rollback plan. Never weaken authentication, authorization,
webhook verification, author checks, or secret redaction as a workaround.

