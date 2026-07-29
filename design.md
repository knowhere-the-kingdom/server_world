# Knowhere Game Master Server

## Current hybrid world-host topology

The configured public Game Server handler is `https://world.knowhere.fyi`, with
GitHub source recorded as `server_world` in
`K:\nowhere\RAILWAY_SERVICE_TOPOLOGY.md`. It delegates ticket-authenticated
traffic through the private Cloudflare Tunnel to this user-local authoritative
host-server boundary. The relationship between `server_world` and this local
`server_gamemaster` checkout is a release-reconciliation blocker; do not infer
that either is deployed. Browsers never call the tunnel or local listener.

## Current shape

`server_gamemaster` is one public repository for the Game Master Server. It
contains a reusable `host_server/` and a `local_server/` for local development
and runtime operation. These are folders in one codebase, not independent
repositories or product forks.

There is no separate official-server variant in this repository. Future
third-party dedicated-server interoperability can be designed as versioned
public protocols when it becomes a concrete product requirement.

## Current phase

- The Game Master Server runtime remains local during this phase.
- Railway's Knowhere Game Server service remains offline and is not a migration
  target in this phase.
- The initial code migration lifts only the legacy game-server contracts and
  implementation boundary required for one coherent local runtime.

## Creator world-content handoff

After Gatekeeper authorizes admission, the local Game Master validates the
ticket and resolves one immutable Creator-published content snapshot for the
admitted session. Creator retains draft/review/publish ownership; Game Master
pins and consumes published revisions for local simulation without accepting
client content payloads or mutating live sessions on publication. See
[`CREATOR_WORLD_CONTENT_CONSUMPTION.md`](./CREATOR_WORLD_CONTENT_CONSUMPTION.md)
for the snapshot, failure, audit, and local-phase contract.
