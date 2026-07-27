import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { readHostServerConfig, type HostServerConfig } from "./config.js";
import {
  GAME_SERVER_PROTOCOL_VERSION,
  GAME_SERVER_ROUTES,
  GAME_SERVER_SERVICE,
  type GameServerHealth,
  type GameServerVersion,
} from "./protocol.js";

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function applyCors(request: IncomingMessage, response: ServerResponse, config: HostServerConfig): boolean {
  const origin = request.headers.origin;
  const allowed = Boolean(origin && config.allowedOrigins.has(origin));

  if (allowed && origin) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "Origin");
  }

  if (request.method === "OPTIONS") {
    response.writeHead(allowed ? 204 : 403, {
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-max-age": "600",
    });
    response.end();
    return true;
  }

  return false;
}

export function createHostServer(config: HostServerConfig = readHostServerConfig()) {
  const startedAt = new Date();
  const startedAtMonotonic = performance.now();

  return createServer((request, response) => {
    if (applyCors(request, response, config)) return;
    const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;

    if (request.method === "GET" && pathname === GAME_SERVER_ROUTES.health) {
      const health: GameServerHealth = {
        service: GAME_SERVER_SERVICE,
        status: "ok",
        protocolVersion: GAME_SERVER_PROTOCOL_VERSION,
        buildVersion: config.buildVersion,
        startedAt: startedAt.toISOString(),
        uptimeSeconds: Math.max(0, Math.floor((performance.now() - startedAtMonotonic) / 1000)),
        migrationPhase: "host-core",
        readyForWorldConnections: false,
      };
      writeJson(response, 200, health);
      return;
    }

    if (request.method === "GET" && pathname === GAME_SERVER_ROUTES.version) {
      const version: GameServerVersion = {
        service: GAME_SERVER_SERVICE,
        protocolVersion: GAME_SERVER_PROTOCOL_VERSION,
        buildVersion: config.buildVersion,
        supportedProtocolVersions: [GAME_SERVER_PROTOCOL_VERSION],
      };
      writeJson(response, 200, version);
      return;
    }

    writeJson(response, 404, { error: "not_found", protocolVersion: GAME_SERVER_PROTOCOL_VERSION });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = readHostServerConfig();
  const server = createHostServer(config);
  server.listen(config.port, config.host, () => {
    console.log(`${GAME_SERVER_SERVICE} ${GAME_SERVER_PROTOCOL_VERSION} listening on http://${config.host}:${config.port}`);
  });
}
