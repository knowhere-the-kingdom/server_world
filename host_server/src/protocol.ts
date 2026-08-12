export const GAME_SERVER_SERVICE = "knowhere-game-server" as const;
export const GAME_SERVER_PROTOCOL_VERSION = "1.0.0" as const;
export const GAME_SERVER_DEFAULT_PORT = 3002;

export const GAME_SERVER_ROUTES = {
  health: "/v1/health",
  version: "/v1/version",
  admissions: "/v1/admissions",
  bootstrap: "/v1/world/bootstrap",
  hud: "/v1/world/hud",
  inventoryMove: "/v1/world/inventory/move",
} as const;

export type GameServerHealth = {
  service: typeof GAME_SERVER_SERVICE;
  status: "ok";
  protocolVersion: typeof GAME_SERVER_PROTOCOL_VERSION;
  buildVersion: string;
  startedAt: string;
  uptimeSeconds: number;
  migrationPhase: "host-core";
  readyForWorldConnections: false;
};

export type GameServerVersion = {
  service: typeof GAME_SERVER_SERVICE;
  protocolVersion: typeof GAME_SERVER_PROTOCOL_VERSION;
  buildVersion: string;
  supportedProtocolVersions: readonly string[];
};

/** The only browser-supplied admission field is opaque ticket material. */
export type GameServerAdmissionRequest = Readonly<{
  ticket: string;
}>;

/** Minimal local-session projection; account and admission identifiers stay private. */
export type GameServerAdmissionResponse = Readonly<{
  protocolVersion: typeof GAME_SERVER_PROTOCOL_VERSION;
  sessionId: string;
  characterId: string;
  worldId: string;
  expiresAt: string;
}>;
