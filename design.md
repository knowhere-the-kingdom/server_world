# Knowhere Game Master Server

## Current shape

`server_gamemaster` is one private repository and one authoritative Game
Master Server runtime. It runs locally in the current phase and owns the
Knowhere world/game-session boundary.

There is no Host Server, Local Server, or official-server split in the source
tree. Future third-party dedicated-server interoperability can be designed as
versioned public protocols when it becomes a concrete product requirement; it
does not require maintaining three server variants today.

## Current phase

- The Game Master Server runtime remains local.
- Railway's Knowhere Game Server service remains offline and is not a migration
  target in this phase.
- The initial code migration lifts only the legacy game-server contracts and
  implementation boundary required for one coherent local runtime.
