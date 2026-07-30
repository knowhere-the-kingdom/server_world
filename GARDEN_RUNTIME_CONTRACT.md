# Garden Runtime Contract V1

Status: alpha source contract. It does not create a public route, deploy a
service, authorize a Railway change, or permit browser-to-world traffic.

## Private caller envelope

Every runtime request carries these injected headers:

```text
x-knowhere-service-id: knowhere-api-server
x-knowhere-service-token
x-knowhere-protocol-version: 1.0.0
x-knowhere-build
x-knowhere-environment
```

For a future machine-local process the configured service id is
`knowhere-local-client`. Unknown or mismatched values return a generic 403.
Missing runtime configuration returns 503 and performs no prewarm.

## Anonymous Garden prewarm

`POST /v1/world/prewarm`

The body is exactly:

```json
{ "worldId": "garden" }
```

Success is 200 with exactly:

```json
{ "worldId": "garden", "status": "ready", "sceneRevision": 1 }
```

The operation is idempotent and warms only the Garden renderer template. It
accepts no account, character, session, ticket, slot, prewarm id, seed, recipe,
or client-selected revision. This allows the Designer-key presentation to start
warming the default scene without creating world authority or binding a player.

## Character binding remains admission

After the player selects a character, the existing private
`POST /v1/admissions` path remains the only binding operation. It carries the
opaque Gatekeeper ticket through the existing authenticated admission contract.
In host mode, `server_world` verifies the existing Gatekeeper HMAC wire format
with the injected `WORLD_ADMISSION_SIGNING_SECRET`, requires version `1.0`,
issuer `knowhere-gatekeeper`, audience `local-gamemaster`, and world `garden`,
checks issued/expiry bounds, atomically consumes the ticket id in the alpha
process replay store, and only then creates a distinct world-session id. There
is no `/worlds/bind` route and no browser-visible prewarm id.

The admitted world session is read with `GET /v1/world/bootstrap` and private
`x-world-session-id`. `server_world` reconstructs the validated bootstrap and
adds the pinned `scene` projection. The response therefore contains the
existing schema/world-session/world/character/lease/server-snapshot/HUD fields
plus the exact Garden scene in one renderer-ready read. Account ids, tickets,
Tunnel details, and service credentials are never returned.

## Scene projection

The pinned `GardenSceneProjectionV1` has exact keys
`schemaVersion`, `sceneId`, `voxelLandscape`, `skybox`, and `sun`:

1. `voxelLandscape`: `flat-chunk-grid`, one-meter voxels, 16×16 chunks,
   radius 14, and the prototype diffuse/emissive/specular Garden palette.
2. `skybox`: `solid-color-sphere`, diameter 440, 24 segments, with the
   prototype day/night palette.
3. `sun`: `orbiting-mythic-sun`, 60-second day, 60-second night, prototype
   sunlight color, and maximum intensity 1.25.

Babylon.js consumes this projection on web/mobile. It must not invent another
scene, world, seed, or clock contract. `GET /v1/world/scene` is a private
diagnostic/adapter read only; normal client bootstrap does not require it.

## Integration required outside this repository

- Gatekeeper owns account, session, character selection, eligibility, and the
  admission ticket.
- API (`knowhere-api-server`) owns the private prewarm and admission calls.
- Gateway is the only browser origin and strips every private header.
- Web and Android render Babylon only after the validated bootstrap scene agrees
  with the admitted Garden world session.
- A failed prewarm or admission never falls back to a client-created Garden. The
  UI remains fail-closed with a bounded retry.

The host runtime is intentionally an alpha scene-template coordinator. Durable
multi-replica ticket replay/session coordination, official-world transitions,
other player-hosted worlds, and desktop/console launchers are follow-up
contracts. Until durable replay exists, host mode must remain a single replica.
