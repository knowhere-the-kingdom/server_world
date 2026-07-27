export const GAME_SERVER_SERVICE = "knowhere-game-server" as const;
export const GAME_SERVER_PROTOCOL_VERSION = "1.0.0" as const;
export const GAME_SERVER_DEFAULT_PORT = 3002;

export const GAME_SERVER_ROUTES = {
  health: "/v1/health",
  version: "/v1/version",
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
