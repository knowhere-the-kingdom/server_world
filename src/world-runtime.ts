import { createHash, randomUUID } from "node:crypto";

import type { WorldAdmissionClaims } from "./admission-ticket.js";
import { GARDEN_SCENE_SCHEMA_VERSION, GARDEN_WORLD_ID, UNDERWORLD_WORLD_ID, isWorldId, type WorldId } from "./protocol.js";

export type WorldRuntimeMode = "host" | "local";

export type WorldSunSchedule = Readonly<{
  dayDurationSeconds: number;
  nightDurationSeconds: number;
  cycleEpoch: string;
  cycleOffsetSeconds: number;
  scheduleRevision: number;
}>;

export const DEFAULT_GARDEN_SUN_SCHEDULE: WorldSunSchedule = Object.freeze({
  dayDurationSeconds: 60,
  nightDurationSeconds: 60,
  cycleEpoch: "2026-01-01T00:00:00.000Z",
  cycleOffsetSeconds: 0,
  scheduleRevision: 1,
});

export type GardenSceneProjectionV1 = Readonly<{
  schemaVersion: typeof GARDEN_SCENE_SCHEMA_VERSION;
  sceneId: "garden-alpha-v1";
  voxelLandscape: Readonly<{
    kind: "flat-chunk-grid";
    voxelSizeMeters: 1;
    chunkSize: 16;
    chunkRadius: 14;
    diffuse: "#3f9b45";
    emissive: "#102d13";
    specular: "#17351a";
  }>;
  skybox: Readonly<{
    kind: "solid-color-sphere";
    diameter: 440;
    segments: 24;
    dayColor: "#55a9ed";
    nightColor: "#020718";
  }>;
  sun: Readonly<{
    kind: "orbiting-mythic-sun";
    assetId: "mythic-sun";
    assetVersion: 1;
    diameter: 52;
    quality: "medium";
    seed: 17;
    palette: Readonly<{
      heart: "#ffe29a";
      plasma: "#ff8a3d";
      ember: "#b84a32";
      shadow: "#3a1820";
    }>;
    dayDurationSeconds: number;
    nightDurationSeconds: number;
    cycleEpoch: string;
    cycleOffsetSeconds: number;
    scheduleRevision: number;
    sunlight: "#fff3d0";
    maxIntensity: 1.25;
  }>;
}>;

export function createGardenScene(
  schedule: WorldSunSchedule = DEFAULT_GARDEN_SUN_SCHEDULE,
): GardenSceneProjectionV1 {
  return Object.freeze({
    schemaVersion: GARDEN_SCENE_SCHEMA_VERSION,
    sceneId: "garden-alpha-v1",
    voxelLandscape: Object.freeze({
      kind: "flat-chunk-grid",
      voxelSizeMeters: 1,
      chunkSize: 16,
      chunkRadius: 14,
      diffuse: "#3f9b45",
      emissive: "#102d13",
      specular: "#17351a",
    }),
    skybox: Object.freeze({
      kind: "solid-color-sphere",
      diameter: 440,
      segments: 24,
      dayColor: "#55a9ed",
      nightColor: "#020718",
    }),
    sun: Object.freeze({
      kind: "orbiting-mythic-sun",
      assetId: "mythic-sun",
      assetVersion: 1,
      diameter: 52,
      quality: "medium",
      seed: 17,
      palette: Object.freeze({
        heart: "#ffe29a",
        plasma: "#ff8a3d",
        ember: "#b84a32",
        shadow: "#3a1820",
      }),
      dayDurationSeconds: schedule.dayDurationSeconds,
      nightDurationSeconds: schedule.nightDurationSeconds,
      cycleEpoch: schedule.cycleEpoch,
      cycleOffsetSeconds: schedule.cycleOffsetSeconds,
      scheduleRevision: schedule.scheduleRevision,
      sunlight: "#fff3d0",
      maxIntensity: 1.25,
    }),
  });
}

export const GARDEN_SCENE = createGardenScene();

export type UnderworldSceneProjectionV1 = Readonly<{
  schemaVersion: typeof GARDEN_SCENE_SCHEMA_VERSION;
  sceneId: "underworld-alpha-v1";
  voxelLandscape: Readonly<{
    kind: "flat-stone-voxel-plane";
    voxelSizeMeters: 1;
    widthMeters: 1000;
    depthMeters: 1000;
    surfaceY: 0;
    blockMaterial: "stone";
    renderChunkSizeMeters: 100;
    diffuse: "#6f7478";
    emissive: "#111416";
    specular: "#30363b";
  }>;
  topology: Readonly<{
    kind: "inside-out-cube-sphere";
    projection: "spherified-cube";
    radiusMeters: 6371000;
    starterPatchMeters: 1000;
    gravityDirection: "away-from-center";
  }>;
  skybox: GardenSceneProjectionV1["skybox"];
  sun: Readonly<{
    kind: "static-mythic-sun";
    assetId: "mythic-sun";
    assetVersion: 1;
    diameter: 52;
    quality: "medium";
    seed: 17;
    palette: GardenSceneProjectionV1["sun"]["palette"];
    fixedPosition: Readonly<{ x: 0; y: 180; z: 0 }>;
    dayDurationSeconds: number;
    nightDurationSeconds: number;
    cycleEpoch: string;
    cycleOffsetSeconds: number;
    scheduleRevision: number;
    sunlight: "#fff3d0";
    maxIntensity: 1.25;
  }>;
}>;

export type WorldSceneProjectionV1 = GardenSceneProjectionV1 | UnderworldSceneProjectionV1;

export function createUnderworldScene(): UnderworldSceneProjectionV1 {
  const garden = createGardenScene();
  return Object.freeze({
    schemaVersion: GARDEN_SCENE_SCHEMA_VERSION,
    sceneId: "underworld-alpha-v1",
    voxelLandscape: Object.freeze({
      kind: "flat-stone-voxel-plane",
      voxelSizeMeters: 1,
      widthMeters: 1000,
      depthMeters: 1000,
      surfaceY: 0,
      blockMaterial: "stone",
      renderChunkSizeMeters: 100,
      diffuse: "#6f7478",
      emissive: "#111416",
      specular: "#30363b",
    }),
    topology: Object.freeze({
      kind: "inside-out-cube-sphere",
      projection: "spherified-cube",
      radiusMeters: 6371000,
      starterPatchMeters: 1000,
      gravityDirection: "away-from-center",
    }),
    skybox: garden.skybox,
    sun: Object.freeze({
      kind: "static-mythic-sun",
      assetId: garden.sun.assetId,
      assetVersion: garden.sun.assetVersion,
      diameter: garden.sun.diameter,
      quality: garden.sun.quality,
      seed: garden.sun.seed,
      palette: garden.sun.palette,
      fixedPosition: Object.freeze({ x: 0, y: 180, z: 0 }),
      dayDurationSeconds: garden.sun.dayDurationSeconds,
      nightDurationSeconds: garden.sun.nightDurationSeconds,
      cycleEpoch: garden.sun.cycleEpoch,
      cycleOffsetSeconds: garden.sun.cycleOffsetSeconds,
      scheduleRevision: garden.sun.scheduleRevision,
      sunlight: garden.sun.sunlight,
      maxIntensity: garden.sun.maxIntensity,
    }),
  });
}

export const UNDERWORLD_SCENE = createUnderworldScene();

type BootstrapBase = Readonly<{
  schemaVersion: 1;
  worldSessionId: string;
  worldId: WorldId;
  characterId: string;
  leaseExpiresAt: string;
  serverSnapshot: Readonly<{ contentRevision: number; contentHash: string }>;
  hudProjectionRevision: number;
}>;

function opaque(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && /^[\x21-\x7e]+$/.test(value);
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function bootstrapBase(value: unknown): BootstrapBase | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!exactKeys(record, ["schemaVersion", "worldSessionId", "worldId", "characterId", "leaseExpiresAt", "serverSnapshot", "hudProjectionRevision"])) return null;
  if (
    record.schemaVersion !== 1
    || !isWorldId(record.worldId)
    || !opaque(record.worldSessionId)
    || !opaque(record.characterId)
    || typeof record.leaseExpiresAt !== "string"
    || !Number.isFinite(Date.parse(record.leaseExpiresAt))
    || typeof record.hudProjectionRevision !== "number"
    || !Number.isInteger(record.hudProjectionRevision)
    || record.hudProjectionRevision < 1
  ) return null;
  const snapshot = record.serverSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const snapshotRecord = snapshot as Record<string, unknown>;
  if (
    !exactKeys(snapshotRecord, ["contentRevision", "contentHash"])
    || typeof snapshotRecord.contentRevision !== "number"
    || !Number.isInteger(snapshotRecord.contentRevision)
    || snapshotRecord.contentRevision < 1
    || !opaque(snapshotRecord.contentHash)
  ) return null;
  return record as BootstrapBase;
}

export class GardenWorldRuntime {
  readonly #warmed = new Set<WorldId>();
  readonly #sceneProjections: Readonly<Record<WorldId, WorldSceneProjectionV1>>;
  readonly #contentHashes: Readonly<Record<WorldId, string>>;
  readonly #sessions = new Map<string, Readonly<{
    worldSessionId: string;
    accountId: string;
    characterId: string;
    worldId: WorldId;
    leaseExpiresAtMs: number;
  }>>();

  constructor(
    readonly mode: WorldRuntimeMode,
    readonly leaseMs = 900_000,
    readonly maxInstances = 256,
    readonly now: () => Date = () => new Date(),
    readonly id: () => string = randomUUID,
    readonly sunSchedule: WorldSunSchedule = DEFAULT_GARDEN_SUN_SCHEDULE,
  ) {
    this.#sceneProjections = Object.freeze({
      garden: createGardenScene(sunSchedule),
      underworld: createUnderworldScene(),
    });
    this.#contentHashes = Object.freeze({
      garden: createHash("sha256").update(JSON.stringify(this.#sceneProjections.garden)).digest("hex"),
      underworld: createHash("sha256").update(JSON.stringify(this.#sceneProjections.underworld)).digest("hex"),
    });
  }

  prewarm(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (!exactKeys(record, ["worldId"]) || !isWorldId(record.worldId)) return null;
    this.#warmed.add(record.worldId);
    return Object.freeze({ worldId: record.worldId, status: "ready" as const, sceneRevision: 1 as const });
  }

  scene(worldSessionId?: string): WorldSceneProjectionV1 | null {
    if (!worldSessionId) return this.#warmed.has(GARDEN_WORLD_ID) ? this.#sceneProjections.garden : null;
    const bootstrap = this.bootstrap(worldSessionId);
    return bootstrap?.scene ?? null;
  }

  admit(verified: WorldAdmissionClaims) {
    const nowMs = this.now().getTime();
    if (!this.#warmed.has(verified.worldId) || Date.parse(verified.expiresAt) <= nowMs) return null;
    for (const [worldSessionId, session] of this.#sessions) {
      if (session.leaseExpiresAtMs <= nowMs) this.#sessions.delete(worldSessionId);
    }
    if (this.#sessions.size >= this.maxInstances) return null;
    const worldSessionId = this.id();
    const session = Object.freeze({
      worldSessionId,
      accountId: verified.accountId,
      characterId: verified.characterId,
      worldId: verified.worldId,
      leaseExpiresAtMs: nowMs + this.leaseMs,
    });
    this.#sessions.set(worldSessionId, session);
    return Object.freeze({
      protocolVersion: "1.0.0" as const,
      sessionId: worldSessionId,
      characterId: session.characterId,
      worldId: session.worldId,
      expiresAt: new Date(session.leaseExpiresAtMs).toISOString(),
    });
  }

  bootstrap(worldSessionId: string) {
    const session = this.#sessions.get(worldSessionId);
    if (!session) return null;
    if (session.leaseExpiresAtMs <= this.now().getTime()) {
      this.#sessions.delete(worldSessionId);
      return null;
    }
    return Object.freeze({
      schemaVersion: 1 as const,
      worldSessionId: session.worldSessionId,
      worldId: session.worldId,
      characterId: session.characterId,
      leaseExpiresAt: new Date(session.leaseExpiresAtMs).toISOString(),
      serverSnapshot: Object.freeze({ contentRevision: 1, contentHash: this.#contentHashes[session.worldId] }),
      hudProjectionRevision: 1,
      scene: this.#sceneProjections[session.worldId],
    });
  }

  attachScene(value: unknown) {
    const bootstrap = bootstrapBase(value);
    if (!bootstrap || !this.#warmed.has(bootstrap.worldId)) return null;
    return Object.freeze({
      schemaVersion: bootstrap.schemaVersion,
      worldSessionId: bootstrap.worldSessionId,
      worldId: bootstrap.worldId,
      characterId: bootstrap.characterId,
      leaseExpiresAt: bootstrap.leaseExpiresAt,
      serverSnapshot: Object.freeze({ ...bootstrap.serverSnapshot }),
      hudProjectionRevision: bootstrap.hudProjectionRevision,
      scene: this.#sceneProjections[bootstrap.worldId],
    });
  }
}
