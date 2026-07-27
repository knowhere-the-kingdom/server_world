# Knowhere Gamemaster Server

Public scaffold for the authoritative Game Master Server.

## Status

Planning only. No runtime, deployment, or public release is present yet.

## Intended scope

- One public Game Master Server repository for the shared hosting foundation.
- `host_server/` contains the reusable dedicated-server host surface.
- `local_server/` contains the local development/runtime launcher and tooling.
- World and game-session authority.
- Versioned public protocols only when future dedicated-server interoperability
  is explicitly designed.
- Any later integration with private platform services must remain optional and
  behind explicit service contracts.

See `design.md` and `..\SERVER_SPLIT_ARCHITECTURE.md` for the evolving design.
