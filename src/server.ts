import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { readWorldHandlerConfig, type WorldHandlerConfig } from "./config.js";
import { HmacAdmissionTicketVerifier } from "./admission-ticket.js";
import { WORLD_PROTOCOL_VERSION, WORLD_ROUTES, WORLD_SERVICE } from "./protocol.js";
import { GardenWorldRuntime } from "./world-runtime.js";

const MAX_BYTES = 8192;

type AdmittedProjection = Readonly<{
  protocolVersion: typeof WORLD_PROTOCOL_VERSION;
  sessionId: string;
  characterId: string;
  worldId: string;
  expiresAt: string;
}>;

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown | null> {
  if (request.headers["content-type"]?.split(";", 1)[0] !== "application/json") return null;
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BYTES) return null;
  }
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]) ? record : null;
}

async function readTicket(request: IncomingMessage): Promise<string | null> {
  const value = exactRecord(await readJson(request), ["ticket"]);
  const ticket = typeof value?.ticket === "string" ? value.ticket.trim() : "";
  return ticket || null;
}

export function admitted(value: unknown, now: Date): AdmittedProjection | null {
  const candidate = exactRecord(value, ["protocolVersion", "sessionId", "characterId", "worldId", "expiresAt"]);
  if (!candidate || candidate.protocolVersion !== WORLD_PROTOCOL_VERSION) return null;
  if (!["sessionId", "characterId", "worldId", "expiresAt"].every((key) => typeof candidate[key] === "string" && candidate[key])) return null;
  const expiresAt = new Date(candidate.expiresAt as string);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) return null;
  return {
    protocolVersion: WORLD_PROTOCOL_VERSION,
    sessionId: candidate.sessionId as string,
    characterId: candidate.characterId as string,
    worldId: candidate.worldId as string,
    expiresAt: candidate.expiresAt as string,
  };
}

function relayConfigured(config: WorldHandlerConfig): boolean {
  return Boolean(
    config.tunnelUrl
    && config.tunnelAllowedOrigin
    && config.callerServiceId
    && config.callerToken
    && config.callerBuild
    && config.callerEnvironment
    && config.tunnelToken
    && config.environment,
  );
}

function printableToken(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && /^[\x21-\x7e]+$/.test(value);
}

function runtimeConfigured(config: WorldHandlerConfig): boolean {
  return Boolean(
    (config.runtimeMode === "host" || config.runtimeMode === "local")
    && config.environment
    && config.runtimeCallerServiceId
    && printableToken(config.runtimeCallerToken)
    && config.runtimeCallerBuild
    && config.runtimeCallerEnvironment
    && config.runtimeLeaseMs
    && config.runtimeMaxInstances
    && config.admissionSigningSecret,
  );
}

function tokenMatches(provided: string | undefined, expected: string | null | undefined): boolean {
  if (!provided || !printableToken(expected)) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function runtimeCallerAllowed(request: IncomingMessage, config: WorldHandlerConfig): boolean {
  return request.headers["x-knowhere-service-id"] === config.runtimeCallerServiceId
    && request.headers["x-knowhere-protocol-version"] === WORLD_PROTOCOL_VERSION
    && request.headers["x-knowhere-build"] === config.runtimeCallerBuild
    && request.headers["x-knowhere-environment"] === config.runtimeCallerEnvironment
    && tokenMatches(
      typeof request.headers["x-knowhere-service-token"] === "string"
        ? request.headers["x-knowhere-service-token"]
        : undefined,
      config.runtimeCallerToken,
    );
}

function relayCallerAllowed(request: IncomingMessage, config: WorldHandlerConfig): boolean {
  return request.headers["x-knowhere-service-id"] === config.callerServiceId
    && tokenMatches(
      typeof request.headers["x-knowhere-service-token"] === "string"
        ? request.headers["x-knowhere-service-token"]
        : undefined,
      config.callerToken,
    )
    && request.headers["x-knowhere-protocol-version"] === WORLD_PROTOCOL_VERSION
    && request.headers["x-knowhere-build"] === config.callerBuild
    && request.headers["x-knowhere-environment"] === config.callerEnvironment;
}

function makeRuntime(config: WorldHandlerConfig, now: () => Date): GardenWorldRuntime | null {
  if (!runtimeConfigured(config)) return null;
  return new GardenWorldRuntime(
    config.runtimeMode!,
    config.runtimeLeaseMs!,
    config.runtimeMaxInstances!,
    now,
    undefined,
    config.sunSchedule,
  );
}

export function createWorldHandler(
  config: WorldHandlerConfig = readWorldHandlerConfig(),
  now: () => Date = () => new Date(),
  injectedRuntime?: GardenWorldRuntime,
) {
  const runtime = injectedRuntime ?? makeRuntime(config, now);
  const ticketVerifier = runtime && runtimeConfigured(config)
    ? new HmacAdmissionTicketVerifier(config.admissionSigningSecret!, now)
    : null;
  return createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const relayReady = relayConfigured(config);
    const runtimeReady = Boolean(runtime && runtimeConfigured(config));

    if (request.method === "GET" && pathname === WORLD_ROUTES.health) {
      return json(response, 200, {
        service: WORLD_SERVICE,
        status: "ok",
        protocolVersion: WORLD_PROTOCOL_VERSION,
        buildVersion: config.buildVersion,
        admissionRelay: relayReady ? "configured" : "not-configured",
        worldRuntime: runtimeReady ? "configured" : "not-configured",
        runtimeMode: runtimeReady ? config.runtimeMode : null,
      });
    }

    if (request.method === "GET" && pathname === WORLD_ROUTES.readiness) {
      return json(response, relayReady || runtimeReady ? 200 : 503, {
        service: WORLD_SERVICE,
        status: relayReady || runtimeReady ? "ready" : "unavailable",
        protocolVersion: WORLD_PROTOCOL_VERSION,
        admissionRelay: relayReady ? "ready" : "unavailable",
        worldRuntime: runtimeReady ? "ready" : "unavailable",
        runtimeMode: runtimeReady ? config.runtimeMode : null,
      });
    }

    if (pathname === WORLD_ROUTES.prewarm) {
      if (request.method !== "POST") return json(response, 404, { error: "not_found", protocolVersion: WORLD_PROTOCOL_VERSION });
      if (!runtimeReady) return json(response, 503, { error: "world_runtime_unavailable", protocolVersion: WORLD_PROTOCOL_VERSION });
      if (!runtimeCallerAllowed(request, config)) return json(response, 403, { error: "world_runtime_denied", protocolVersion: WORLD_PROTOCOL_VERSION });
      const result = runtime!.prewarm(await readJson(request));
      return result
        ? json(response, 200, result)
        : json(response, 400, { error: "invalid_request", protocolVersion: WORLD_PROTOCOL_VERSION });
    }

    if (runtimeReady && (pathname === WORLD_ROUTES.bootstrap || pathname === WORLD_ROUTES.scene)) {
      if (request.method !== "GET") return json(response, 404, { error: "not_found", protocolVersion: WORLD_PROTOCOL_VERSION });
      if (!runtimeCallerAllowed(request, config)) return json(response, 403, { error: "world_runtime_denied", protocolVersion: WORLD_PROTOCOL_VERSION });
      const worldSessionId = request.headers["x-world-session-id"];
      if (typeof worldSessionId !== "string" || !worldSessionId) return json(response, 400, { error: "invalid_request", protocolVersion: WORLD_PROTOCOL_VERSION });
      const projection = pathname === WORLD_ROUTES.bootstrap
        ? runtime!.bootstrap(worldSessionId)
        : runtime!.scene(worldSessionId);
      if (projection) return json(response, 200, projection);
      if (!relayReady || pathname === WORLD_ROUTES.scene) {
        return json(response, 409, { error: "world_session_unavailable", protocolVersion: WORLD_PROTOCOL_VERSION });
      }
    }

    if ([WORLD_ROUTES.bootstrap, WORLD_ROUTES.hud, WORLD_ROUTES.inventoryMove].includes(pathname as typeof WORLD_ROUTES.bootstrap)) {
      if (!relayReady) return json(response, 503, { error: "world_authority_unavailable", protocolVersion: WORLD_PROTOCOL_VERSION });
      if (!relayCallerAllowed(request, config)) return json(response, 403, { error: "world_authority_denied", protocolVersion: WORLD_PROTOCOL_VERSION });
      const worldSessionId = request.headers["x-world-session-id"];
      if (typeof worldSessionId !== "string" || !worldSessionId) return json(response, 400, { error: "invalid_request", protocolVersion: WORLD_PROTOCOL_VERSION });
      let body: string | undefined;
      if (request.method === "POST") {
        body = "";
        for await (const chunk of request) {
          body += chunk;
          if (Buffer.byteLength(body) > MAX_BYTES) return json(response, 400, { error: "invalid_request", protocolVersion: WORLD_PROTOCOL_VERSION });
        }
      }
      try {
        const upstream = await fetch(new URL(pathname, config.tunnelUrl!), {
          method: request.method,
          headers: {
            "content-type": "application/json",
            "x-knowhere-service-id": WORLD_SERVICE,
            "x-knowhere-protocol-version": WORLD_PROTOCOL_VERSION,
            "x-knowhere-build": config.buildVersion,
            "x-knowhere-environment": config.environment!,
            "x-knowhere-service-token": config.tunnelToken!,
            "x-world-session-id": worldSessionId,
          },
          body,
          signal: AbortSignal.timeout(config.timeoutMs),
        });
        const data = await upstream.json();
        if (pathname === WORLD_ROUTES.bootstrap && upstream.ok && runtimeReady) {
          const enriched = runtime!.attachScene(data);
          return enriched
            ? json(response, upstream.status, enriched)
            : json(response, 503, { error: "world_authority_unavailable", protocolVersion: WORLD_PROTOCOL_VERSION });
        }
        return json(response, upstream.status, data);
      } catch {
        return json(response, 503, { error: "world_authority_unavailable", protocolVersion: WORLD_PROTOCOL_VERSION });
      }
    }

    if (request.method !== "POST" || pathname !== WORLD_ROUTES.admissions) {
      return json(response, 404, { error: "not_found", protocolVersion: WORLD_PROTOCOL_VERSION });
    }
    if (runtimeReady) {
      if (!runtimeCallerAllowed(request, config)) return json(response, 403, { error: "admission_denied", protocolVersion: WORLD_PROTOCOL_VERSION });
      const ticket = await readTicket(request);
      if (!ticket) return json(response, 400, { error: "invalid_request", protocolVersion: WORLD_PROTOCOL_VERSION });
      const verified = ticketVerifier!.verifyAndConsume(ticket);
      if (!verified.ok) {
        const unavailable = verified.code === "ticket_verification_unavailable";
        return json(response, unavailable ? 503 : 401, {
          error: unavailable ? "admission_unavailable" : "admission_denied",
          protocolVersion: WORLD_PROTOCOL_VERSION,
        });
      }
      const projection = runtime!.admit(verified.claims);
      return projection
        ? json(response, 201, projection)
        : json(response, 503, { error: "admission_unavailable", protocolVersion: WORLD_PROTOCOL_VERSION });
    }
    if (!relayReady) return json(response, 503, { error: "admission_unavailable", protocolVersion: WORLD_PROTOCOL_VERSION });
    if (!relayCallerAllowed(request, config)) return json(response, 403, { error: "admission_denied", protocolVersion: WORLD_PROTOCOL_VERSION });
    const ticket = await readTicket(request);
    if (!ticket) return json(response, 400, { error: "invalid_request", protocolVersion: WORLD_PROTOCOL_VERSION });
    try {
      const upstream = await fetch(new URL(WORLD_ROUTES.admissions, config.tunnelUrl!), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-knowhere-service-id": WORLD_SERVICE,
          "x-knowhere-protocol-version": WORLD_PROTOCOL_VERSION,
          "x-knowhere-build": config.buildVersion,
          "x-knowhere-environment": config.environment!,
          "x-knowhere-service-token": config.tunnelToken!,
        },
        body: JSON.stringify({ ticket }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (upstream.status === 201 && upstream.headers.get("content-type")?.startsWith("application/json")) {
        const projection = admitted(await upstream.json(), now());
        if (projection) return json(response, 201, projection);
      }
      return json(response, upstream.status === 401 ? 401 : 503, {
        error: upstream.status === 401 ? "admission_denied" : "admission_unavailable",
        protocolVersion: WORLD_PROTOCOL_VERSION,
      });
    } catch {
      return json(response, 503, { error: "admission_unavailable", protocolVersion: WORLD_PROTOCOL_VERSION });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = readWorldHandlerConfig();
  createWorldHandler(config).listen(config.port, config.host, () => {
    console.log(`${WORLD_SERVICE} ${WORLD_PROTOCOL_VERSION} listening on http://${config.host}:${config.port}`);
  });
}
