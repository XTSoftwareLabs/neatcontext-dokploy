# Environment

Captured at (UTC): [YYYY-MM-DDTHH:MM:SSZ]

## Version identity

- Dokploy version/tag:
- Immutable container image digest:
- Source commit, if custom-built:
- Previous known-good version:
- Upgrade/change time (UTC):

For a typical installer-managed service, this read-only format returns only the
configured image reference. Confirm the service name first:

```shell
docker service inspect dokploy --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
```

## Installation and topology

- Self-hosted or Dokploy Cloud:
- Install method:
- Host OS/version:
- Docker Engine client/server versions:
- Swarm state:
- Manager/worker count:
- Dokploy control-plane node:
- Application deployment node:
- Build server:
- Same host or remote:
- Reverse proxy/routing:
- Database placement:

## Affected resource

- Project/environment/application nonsecret labels:
- Resource type: [application / compose / database / control plane / other]
- Source type/provider:
- Repository owner/name: [redact if unnecessary]
- Target branch/tag:
- Build type:
- Auto-deploy enabled:
- Preview deployments enabled:
- Relevant labels/limits:
- Relevant health check/port/domain shape:

## Provider/configuration shape

Record whether required fields are present without copying their values:

```text
providerId: <redacted: present/absent/unknown>
appId: <redacted: present/absent/unknown>
privateKey: <redacted: present/absent/unknown>
installationId: <redacted: present/absent/unknown>
webhookSecret: <redacted: present/absent/unknown>
```

Do not use a full environment dump or `docker service inspect` output that
includes secret-bearing environment values.

## Known deviations from defaults

- Custom service/container names:
- Custom networks/volumes:
- Custom image:
- Custom proxy:
- Custom database:
- Other:

