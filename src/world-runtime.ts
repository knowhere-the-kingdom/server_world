import { createHash, randomUUID } from "node:crypto";

import type { WorldAdmissionClaims } from "./admission-ticket.js";
import { GARDEN_SCENE_SCHEMA_VERSION, GARDEN_WORLD_ID } from "./protocol.js";

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

type BootstrapBase = Readonly<{
  schemaVersion: 1;
  worldSessionId: string;
  worldId: typeof GARDEN_WORLD_ID;
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
    || record.worldId !== GARDEN_WORLD_ID
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
  #warmed = false;
  readonly #sceneProjection: GardenSceneProjectionV1;
  readonly #contentHash: string;
  readonly #sessions = new Map<string, Readonly<{
    worldSessionId: string;
    accountId: string;
    characterId: string;
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
    this.#sceneProjection = createGardenScene(sunSchedule);
    this.#contentHash = createHash("sha256")
      .update(JSON.stringify(this.#sceneProjection))
      .digest("hex");
  }

  prewarm(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (!exactKeys(record, ["worldId"]) || record.worldId !== GARDEN_WORLD_ID) return null;
    this.#warmed = true;
    return Object.freeze({ worldId: GARDEN_WORLD_ID, status: "ready" as const, sceneRevision: 1 as const });
  }

  scene(worldSessionId?: string): GardenSceneProjectionV1 | null {
    if (!this.#warmed) return null;
    if (worldSessionId && !this.bootstrap(worldSessionId)) return null;
    return this.#sceneProjection;
  }

  admit(verified: WorldAdmissionClaims) {
    const nowMs = this.now().getTime();
    if (!this.#warmed || verified.worldId !== GARDEN_WORLD_ID || Date.parse(verified.expiresAt) <= nowMs) return null;
    for (const [worldSessionId, session] of this.#sessions) {
      if (session.leaseExpiresAtMs <= nowMs) this.#sessions.delete(worldSessionId);
    }
    if (this.#sessions.size >= this.maxInstances) return null;
    const worldSessionId = this.id();
    const session = Object.freeze({
      worldSessionId,
      accountId: verified.accountId,
      characterId: verified.characterId,
      leaseExpiresAtMs: nowMs + this.leaseMs,
    });
    this.#sessions.set(worldSessionId, session);
    return Object.freeze({
      protocolVersion: "1.0.0" as const,
      sessionId: worldSessionId,
      characterId: session.characterId,
      worldId: GARDEN_WORLD_ID,
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
      worldId: GARDEN_WORLD_ID,
      characterId: session.characterId,
      leaseExpiresAt: new Date(session.leaseExpiresAtMs).toISOString(),
      serverSnapshot: Object.freeze({ contentRevision: 1, contentHash: this.#contentHash }),
      hudProjectionRevision: 1,
      scene: this.#sceneProjection,
    });
  }

  attachScene(value: unknown) {
    if (!this.#warmed) return null;
    const bootstrap = bootstrapBase(value);
    if (!bootstrap) return null;
    return Object.freeze({
      schemaVersion: bootstrap.schemaVersion,
      worldSessionId: bootstrap.worldSessionId,
      worldId: bootstrap.worldId,
      characterId: bootstrap.characterId,
      leaseExpiresAt: bootstrap.leaseExpiresAt,
      serverSnapshot: Object.freeze({ ...bootstrap.serverSnapshot }),
      hudProjectionRevision: bootstrap.hudProjectionRevision,
      scene: this.#sceneProjection,
    });
  }
}
