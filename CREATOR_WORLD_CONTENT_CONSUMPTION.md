# Creator World Content Consumption Contract

**Status:** local-runtime design contract. This document does not authorize a
Railway action, production deployment, database migration, public routing
change, or client/server implementation.

## Purpose

Creator owns the authored content and world-configuration lifecycle. Game
Master owns admission, sessions, simulation, and world state. After a player
has been authorized for a world, Game Master consumes one immutable,
Creator-published world-content snapshot for that admitted session. The local
Game Master runtime remains the only runtime target in this phase.

## Admission to content flow

```text
Client -> Gateway -> API -> Gatekeeper -> signed WorldAdmissionTicketV1
                                      -> local Game Master
local Game Master -> validate ticket -> resolve published WorldContentSnapshotV1
                  -> admit session with pinned snapshot -> local simulation
```

1. Gatekeeper authorizes the account, character, world, and session revision,
   then issues a short-lived signed `WorldAdmissionTicketV1`.
2. Local Game Master validates the ticket locally. It does not ask a client to
   supply a world recipe, material, biome graph, content revision, or seed.
3. Only after ticket validation, Game Master invokes the local,
   read-only `CreatorContentResolver` seam for the ticket's `worldId`.
4. The resolver returns one published `WorldContentSnapshotV1`; Game Master
   pins that snapshot to the new game session before simulation begins.
5. The client receives only the content projection Game Master chooses to send
   for that session. It never becomes a content authority or direct content
   store client.

## Published snapshot contract

```ts
type WorldContentSnapshotV1 = {
  protocolVersion: "1.0.0";
  worldId: string;
  contentRevision: string;
  contentHash: string;
  worldRecipe: { id: string; revision: string; seed: number };
  biomeGraphRevisions: readonly { id: string; revision: string }[];
  materialRevisions: readonly { id: string; revision: string }[];
  worldConfiguration: Record<string, unknown>;
  publishedAt: string;
};
```

The snapshot is assembled from published immutable revisions only. Its world
recipe pins material and biome revisions, provides the deterministic seed, and
has a reproducible content hash. `worldConfiguration` is typed by the specific
published recipe/configuration contract; Game Master must reject unknown or
incompatible protocol-major versions rather than infer defaults.

## Ownership and lifecycle

| Concern | Owner | Rule |
| --- | --- | --- |
| Draft, review, publish, archive, and revision metadata | Creator | Draft and review content are never resolved for a player session. |
| Snapshot resolution and publication eligibility | Creator content registry through the approved resolver | Returns only one published snapshot for an eligible `worldId`. |
| Ticket validation, session admission, simulation, membership, and world state | Local Game Master | Validates identity before resolving content and owns all gameplay decisions. |
| Browser/API request mediation | Gateway/API | Forwards only approved versioned operations; it does not pass mutable content payloads or access a content database directly. |
| Renderer/client asset use | Client/renderer | Consumes Game Master’s session projection only; it cannot change content revisions or world configuration. |

An already admitted session continues with its pinned snapshot. A later
Creator publication does not mutate a live session, restart the local runtime,
or cause an automatic world reload. Applying a newer snapshot requires a
separately designed session transition or re-admission flow.

## Failure, audit, and art boundaries

- If no eligible published snapshot resolves, new admission fails closed with
  `world_content_unavailable`; Game Master does not substitute a draft,
  browser fixture, legacy payload, or arbitrary default.
- If a snapshot hash/revision is invalid or incompatible, admission fails with
  `world_content_incompatible` before session creation.
- Admission records retain the ticket ID, correlation ID, world ID, content
  revision, and content hash for audit and diagnosis. They do not retain
  signing material or client-provided content claims.
- A material/model/texture reference is usable only after its own Creator
  publication requirements are satisfied. Candidate visual assets remain in
  the art-preview workflow and are never treated as a runtime snapshot asset
  merely because they exist locally.

## Local-phase boundary

`CreatorContentResolver` is a contract seam, not a deployed service or direct
database connection. Its initial implementation may be a local read-only
published-snapshot source colocated with local Game Master development. Any
networked content service, Railway attachment, production database access, or
public routing requires a separate approved migration and Server Guy’s
operations ownership.
