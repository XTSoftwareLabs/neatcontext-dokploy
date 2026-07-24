# Dokploy system and source map

Last verified: 2026-07-25

## Product boundary

Dokploy describes itself as a self-hostable platform for deploying and managing
applications and databases. Its public feature set includes application and
database management, Docker Compose, multi-node Docker Swarm, Traefik routing,
monitoring, notifications, and source-provider-driven deployments. See the
[project README](https://github.com/Dokploy/dokploy#readme).

An observed failure may sit in several different layers:

| Layer | Examples of evidence | Questions it can answer |
| --- | --- | --- |
| Browser/UI | page state, request result, screenshot, selected project/application | What did the user ask Dokploy to do? What was visible? |
| Dokploy API/control plane | timestamped `dokploy` service logs, route and error code | Did the request/webhook arrive, match a resource, and enter the intended service path? |
| Persistence/queue | deployment records, queue state, narrowly scoped read-only checks | Was work recorded or enqueued, and at which boundary did it stop? |
| Provider integration | GitHub/GitLab/Gitea/Bitbucket delivery metadata and redacted configuration shape | Was the external event accepted and could Dokploy authenticate for the next operation? |
| Build/deploy runtime | build logs, Docker service/task state, image identity | Did a job start, build, pull, schedule, or fail at runtime? |
| Routing | Traefik logs/config shape, DNS/TLS observations | Was a healthy workload reachable through the expected domain? |
| Host/cluster | Docker Engine/Swarm version, node/task state, disk/network facts | Is the control plane healthy and able to schedule work? |
| Database | database service health and owner-approved read-only evidence | Was state unavailable, inconsistent, or never written? |

Do not collapse these layers. “No deployment in the UI” can mean no record was
created, a queue was not populated, a job failed, or only the UI query failed.
Collect evidence at the transition between layers.

## Typical self-hosted runtime names

The official troubleshooting guide uses these default runtime names:

- Swarm service `dokploy` for the Dokploy application;
- Swarm service `dokploy-postgres` for PostgreSQL;
- container `dokploy-traefik` for Traefik.

They are starting points, not universal facts. Confirm names with read-only
Docker listing commands before using them. A customized install, a remote
deployment server, or changed placement can have different evidence locations.
The [troubleshooting guide](https://docs.dokploy.com/docs/core/troubleshooting)
also notes that application logs/monitoring are not available in the UI when
the application runs on a different worker node, so record node placement.

## Version-matched repository map

The upstream repository’s default branch is `canary`, which moves. Resolve the
deployed tag or commit first, then inspect that revision. At the
[2026-07-22 canary snapshot](https://github.com/Dokploy/dokploy/tree/73e4fdd757da90fb1fe347a92b92237e6712f98d),
use these areas as search entry points:

- `apps/dokploy/pages/api/` — HTTP/webhook entry points, including provider
  deployment webhooks;
- `apps/dokploy/server/api/routers/` — tRPC/API boundaries;
- `apps/dokploy/server/queues/` — deployment queue integration;
- `packages/server/src/services/` — application, deployment, provider, domain,
  and persistence orchestration;
- `packages/server/src/utils/providers/` — provider authentication and clone
  helpers;
- `packages/server/src/utils/docker/` — Docker/Swarm operations;
- database schema/query packages — persistence shape and relationships.

Paths can change between versions. Search by exact error or exported function if
the path does not exist at the target revision.

## Evidence routing by symptom

### Webhook arrives, but no deployment appears

Trace:

1. provider delivery and signature acceptance;
2. repository/owner/branch/provider matching;
3. feature flags, labels, limits, permissions, and event action;
4. preview/deployment record creation;
5. queue insertion;
6. worker/build execution.

### Deployment record exists, but build never starts

Focus on queue state, control-plane logs, task placement, build server
selection, Docker availability, registry access shape, and resource limits.

### Build succeeds, but service is unavailable

Focus on container/service health, port selection, health checks, domain and
Traefik configuration, DNS/TLS, node placement, and network state. The
[Applications documentation](https://docs.dokploy.com/docs/core/applications)
separates deployment logs, runtime logs, domains, and advanced Swarm settings;
collect evidence from the relevant stage.

### Behavior changes after an upgrade

Record the exact last-known-good and first-failing versions. Compare only the
relevant paths first, including changed query shapes and call sites. A nearby
commit is correlation until its changed data/control flow explains the symptom
and unaffected paths.

