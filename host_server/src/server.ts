import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { readHostServerConfig, type HostServerConfig } from "./config.js";
import type { AdmissionResult, LocalAdmissionPresenceService } from "./local-admission.js";
import { createWorldHudAuthority, type WorldHudAuthority } from "./world-hud-authority.js";
import { createConfiguredAdmissionPresence } from "./admission-runtime.js";
import {
  GAME_SERVER_PROTOCOL_VERSION,
  GAME_SERVER_ROUTES,
  GAME_SERVER_SERVICE,
  type GameServerAdmissionRequest,
  type GameServerAdmissionResponse,
  type GameServerHealth,
  type GameServerVersion,
} from "./protocol.js";

/**
 * The host receives an already-assembled local admission/presence service.
 * Its verifier and replay store remain injected into that service; this HTTP
 * adapter never creates, substitutes, or bypasses either dependency.
 */
export type HostServerDependencies = Readonly<{
  admissionPresence?: Pick<LocalAdmissionPresenceService, "admit">;
  hudAuthority?: WorldHudAuthority;
}>;

const MAX_ADMISSION_REQUEST_BYTES = 8 * 1024;

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
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-max-age": "600",
    });
    response.end();
    return true;
  }

  return false;
}

function isAdmissionRequest(value: unknown): value is GameServerAdmissionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length === 1 && entries[0][0] === "ticket" && typeof entries[0][1] === "string";
}

async function readAdmissionRequest(request: IncomingMessage): Promise<GameServerAdmissionRequest | null> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return null;

  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_ADMISSION_REQUEST_BYTES) return null;
  }

  try {
    const value: unknown = JSON.parse(body);
    return isAdmissionRequest(value) ? value : null;
  } catch {
    return null;
  }
}

function writeAdmissionResult(response: ServerResponse, result: AdmissionResult): void {
  if (!result.ok) {
    writeJson(response, 401, { error: "admission_denied", protocolVersion: GAME_SERVER_PROTOCOL_VERSION });
    return;
  }

  const body: GameServerAdmissionResponse = {
    protocolVersion: GAME_SERVER_PROTOCOL_VERSION,
    sessionId: result.presence.sessionId,
    characterId: result.presence.characterId,
    worldId: result.presence.worldId,
    expiresAt: result.presence.expiresAt.toISOString(),
  };
  writeJson(response, 201, body);
}

export function createHostServer(
  config: HostServerConfig = readHostServerConfig(),
  dependencies: HostServerDependencies = {},
) {
  const startedAt = new Date();
  const startedAtMonotonic = performance.now();
  const hudAuthority = dependencies.hudAuthority ?? createWorldHudAuthority();

  return createServer(async (request, response) => {
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

    if (request.method === "POST" && pathname === GAME_SERVER_ROUTES.admissions) {
      if (!dependencies.admissionPresence) {
        writeJson(response, 503, { error: "admission_unavailable", protocolVersion: GAME_SERVER_PROTOCOL_VERSION });
        return;
      }
      const admissionRequest = await readAdmissionRequest(request);
      if (!admissionRequest) {
        writeJson(response, 400, { error: "invalid_request", protocolVersion: GAME_SERVER_PROTOCOL_VERSION });
        return;
      }
      const result=await dependencies.admissionPresence.admit(admissionRequest);
      if(result.ok)hudAuthority.admit(result.presence);
      writeAdmissionResult(response,result);
      return;
    }

    if (request.method === "GET" && (pathname === GAME_SERVER_ROUTES.bootstrap || pathname === GAME_SERVER_ROUTES.hud)) {
      const sessionId=request.headers["x-world-session-id"];
      if(typeof sessionId!=="string"){writeJson(response,400,{error:"invalid_request",protocolVersion:GAME_SERVER_PROTOCOL_VERSION});return;}
      const projection=pathname===GAME_SERVER_ROUTES.bootstrap?hudAuthority.bootstrap(sessionId):hudAuthority.hud(sessionId);
      writeJson(response,projection?200:401,projection??{error:"world_session_unavailable",protocolVersion:GAME_SERVER_PROTOCOL_VERSION});return;
    }

    if (request.method === "POST" && pathname === GAME_SERVER_ROUTES.inventoryMove) {
      const sessionId=request.headers["x-world-session-id"];
      if(typeof sessionId!=="string"){writeJson(response,400,{error:"invalid_request",protocolVersion:GAME_SERVER_PROTOCOL_VERSION});return;}
      let raw="";for await(const chunk of request){raw+=chunk;if(Buffer.byteLength(raw)>MAX_ADMISSION_REQUEST_BYTES){writeJson(response,400,{error:"invalid_request"});return;}}
      let command;try{command=JSON.parse(raw);}catch{writeJson(response,400,{error:"invalid_request"});return;}
      const result=hudAuthority.move(sessionId,command);writeJson(response,result.ok?200:(result.status??503),result.ok?result.projection:{error:result.code,projection:result.projection});return;
    }

    writeJson(response, 404, { error: "not_found", protocolVersion: GAME_SERVER_PROTOCOL_VERSION });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = readHostServerConfig();
  const admissionPresence=createConfiguredAdmissionPresence(process.env.WORLD_ADMISSION_SIGNING_SECRET);
  const server = createHostServer(config,admissionPresence?{admissionPresence}:{});
  server.listen(config.port, config.host, () => {
    console.log(`${GAME_SERVER_SERVICE} ${GAME_SERVER_PROTOCOL_VERSION} listening on http://${config.host}:${config.port}`);
  });
}
