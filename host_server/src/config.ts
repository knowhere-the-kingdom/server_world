import { GAME_SERVER_DEFAULT_PORT } from "./protocol.js";

export type HostServerConfig = {
  host: string;
  port: number;
  buildVersion: string;
  allowedOrigins: ReadonlySet<string>;
};

function readPort(value: string | undefined): number {
  const port = value ? Number.parseInt(value, 10) : GAME_SERVER_DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 3000) {
    throw new Error("Game Server port must be a valid port other than client port 3000.");
  }
  return port;
}

export function readHostServerConfig(environment = process.env): HostServerConfig {
  const origins = environment.KNOWHERE_GAME_SERVER_ALLOWED_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000";
  return {
    host: environment.KNOWHERE_GAME_SERVER_HOST?.trim() || (environment.RAILWAY_ENVIRONMENT ? "0.0.0.0" : "127.0.0.1"),
    port: readPort(environment.KNOWHERE_GAME_SERVER_PORT ?? environment.PORT),
    buildVersion: environment.KNOWHERE_GAME_SERVER_BUILD?.trim() || "dev",
    allowedOrigins: new Set(origins.split(",").map((origin) => origin.trim()).filter(Boolean)),
  };
}
