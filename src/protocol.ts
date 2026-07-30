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
export const GARDEN_SCENE_SCHEMA_VERSION = 1 as const;
