# Knowhere server_world

`server_world` owns the alpha Garden world lifecycle and its authoritative,
renderer-neutral scene projection. Babylon.js remains a web/mobile client
renderer; it does not decide world identity, character binding, clock state, or
scene contents.

The runtime supports two explicit modes:

- `host`: private API-to-`server_world` traffic, suitable for a Railway-hosted
  per-player Garden during web/mobile alpha.
- `local`: the same contract bound to loopback for a future desktop/console
  process. Local mode still requires an injected caller token and never opens a
  browser authority path.

The previous authenticated Tunnel admission relay remains available as a
compatibility lane when its complete configuration is present. Host runtime
does not require that Tunnel.

## Alpha Garden lifecycle

The private lifecycle is:

1. The Gateway/API calls anonymous `POST /v1/world/prewarm` with exactly
   `{ "worldId": "garden" }` while the character screen is still active.
2. After character selection, the existing Gatekeeper ticket path calls
   `POST /v1/admissions`; prewarm does not bind identity.
3. API reads `GET /v1/world/bootstrap` using the opaque `worldSessionId`. The
   response includes the pinned Garden scene, so one read is renderer-ready.
4. Gateway returns only approved browser projections. It never returns private
   caller headers, account ids, tokens, a local origin, or a seed.

This removes a public “Select world” decision without turning prewarm into
admission. Prewarm uses an exact anonymous template request plus private caller
identity, build, environment, protocol, and timing-safe token validation. It is
idempotent and accepts no account, character, session, ticket, or slot fields.

See [GARDEN_RUNTIME_CONTRACT.md](./GARDEN_RUNTIME_CONTRACT.md) for exact request
and projection shapes.

## Configuration

Common:

```text
WORLD_RUNTIME_MODE=host|local
WORLD_HANDLER_HOST=0.0.0.0        # host mode
WORLD_HANDLER_PORT=3012
WORLD_HANDLER_BUILD=<immutable build identity>
WORLD_HANDLER_ENVIRONMENT=<environment>
WORLD_RUNTIME_CALLER_SERVICE_ID=knowhere-api-server
WORLD_RUNTIME_CALLER_TOKEN=<private injected token>
WORLD_RUNTIME_CALLER_BUILD=<expected API/local-client build>
WORLD_RUNTIME_CALLER_ENVIRONMENT=<expected environment>
WORLD_ADMISSION_SIGNING_SECRET=<same private Gatekeeper secret, at least 32 bytes>
WORLD_RUNTIME_LEASE_MS=900000
WORLD_RUNTIME_MAX_INSTANCES=256
WORLD_SUN_DAY_DURATION_SECONDS=60
WORLD_SUN_NIGHT_DURATION_SECONDS=60
WORLD_SUN_CYCLE_EPOCH=2026-01-01T00:00:00.000Z
WORLD_SUN_CYCLE_OFFSET_SECONDS=0
WORLD_SUN_SCHEDULE_REVISION=1
```

Local mode defaults to `127.0.0.1` and rejects a configured non-loopback host.
Host mode is designed for one process/replica in this alpha increment because
prewarm, lease, and consumed-ticket replay state are in memory. Horizontal
replicas require a separately approved durable coordinator; readiness does not
claim that capability. Runtime readiness fails closed if the admission signing
secret is absent or shorter than 32 bytes.

## Validation

```powershell
npm ci
npm test
npm run typecheck
```

Tests cover legacy relay compatibility, strict caller rejection, exact anonymous
prewarm idempotency, host and local modes, scene-enriched ticket-free bootstrap,
the exact three-component Garden scene, and bounded per-world sun schedules.
