export const WORLD_SERVICE = "knowhere-world-handler" as const;
export const WORLD_PROTOCOL_VERSION = "1.0.0" as const;
export const WORLD_ROUTES = {
  health: "/v1/health",
  readiness: "/v1/readiness",
  admissions: "/v1/admissions",
  prewarm: "/v1/world/prewarm",
  bootstrap: "/v1/world/bootstrap",
  scene: "/v1/world/scene",
  hud: "/v1/world/hud",
  inventoryMove: "/v1/world/inventory/move",
} as const;

export const GARDEN_WORLD_ID = "garden" as const;
export const UNDERWORLD_WORLD_ID = "underworld" as const;
export const WORLD_IDS = [GARDEN_WORLD_ID, UNDERWORLD_WORLD_ID] as const;
export type WorldId = (typeof WORLD_IDS)[number];
export function isWorldId(value: unknown): value is WorldId {
  return typeof value === "string" && WORLD_IDS.includes(value as WorldId);
}
export const GARDEN_SCENE_SCHEMA_VERSION = 1 as const;
