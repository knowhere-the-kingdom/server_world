# Knowhere Game Master Server

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
