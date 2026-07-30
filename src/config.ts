import {
  DEFAULT_GARDEN_SUN_SCHEDULE,
  type WorldRuntimeMode,
  type WorldSunSchedule,
} from "./world-runtime.js";

export type WorldHandlerConfig = Readonly<{
  host: string;
  port: number;
  buildVersion: string;
  environment?: string | null;
  tunnelUrl: URL | null;
  tunnelAllowedOrigin?: string | null;
  callerServiceId?: string | null;
  callerToken: string | null;
  callerBuild?: string | null;
  callerEnvironment?: string | null;
  tunnelToken: string | null;
  timeoutMs: number;
  runtimeMode?: WorldRuntimeMode | null;
  runtimeCallerServiceId?: string | null;
  runtimeCallerToken?: string | null;
  runtimeCallerBuild?: string | null;
  runtimeCallerEnvironment?: string | null;
  runtimeLeaseMs?: number;
  runtimeMaxInstances?: number;
  admissionSigningSecret?: string | null;
  sunSchedule?: WorldSunSchedule;
}>;

function port(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "3012", 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535 || parsed === 3000) {
    throw new Error("WORLD_HANDLER_PORT must be a valid non-client port.");
  }
  return parsed;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function boundedPositiveInteger(value: string | undefined, fallback: number, name: string, maximum: number): number {
  const parsed = positiveInteger(value, fallback, name);
  if (parsed > maximum) throw new Error(`${name} must be no greater than ${maximum}.`);
  return parsed;
}

function nonNegativeNumber(value: string | undefined, fallback: number, name: string): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number.`);
  return parsed;
}

function rfc3339(value: string | undefined, fallback: string, name: string): string {
  if (!value?.trim()) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value.trim()) {
    throw new Error(`${name} must be canonical RFC3339 UTC milliseconds.`);
  }
  return parsed.toISOString();
}

function origin(value: string | undefined, allowed: string | undefined): URL | null {
  if (!value?.trim()) return null;
  const parsed = new URL(value);
  if (
    !/^https?:$/.test(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
    || !allowed?.trim()
    || parsed.origin !== allowed.trim()
  ) {
    throw new Error("WORLD_TUNNEL_URL must match the approved credential-free Tunnel origin.");
  }
  return parsed;
}

function runtimeMode(value: string | undefined): WorldRuntimeMode | null {
  const mode = value?.trim();
  if (!mode) return null;
  if (mode !== "host" && mode !== "local") throw new Error("WORLD_RUNTIME_MODE must be host or local.");
  return mode;
}

function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

export function readWorldHandlerConfig(env = process.env): WorldHandlerConfig {
  const allowed = env.WORLD_TUNNEL_ALLOWED_ORIGIN;
  const mode = runtimeMode(env.WORLD_RUNTIME_MODE);
  const host = env.WORLD_HANDLER_HOST?.trim() || (mode === "local" ? "127.0.0.1" : "0.0.0.0");
  if (mode === "local" && !isLoopback(host)) {
    throw new Error("Local world runtime must bind to loopback.");
  }
  const admissionSigningSecret = env.WORLD_ADMISSION_SIGNING_SECRET?.trim() || null;
  if (admissionSigningSecret && Buffer.byteLength(admissionSigningSecret) < 32) {
    throw new Error("WORLD_ADMISSION_SIGNING_SECRET must contain at least 32 bytes.");
  }
  return {
    host,
    port: port(env.WORLD_HANDLER_PORT ?? env.PORT),
    buildVersion: env.WORLD_HANDLER_BUILD?.trim() || "dev",
    environment: env.WORLD_HANDLER_ENVIRONMENT?.trim() || null,
    tunnelUrl: origin(env.WORLD_TUNNEL_URL, allowed),
    tunnelAllowedOrigin: allowed?.trim() || null,
    callerServiceId: env.WORLD_GATEWAY_CALLER_SERVICE_ID?.trim() || "knowhere-api-server",
    callerToken: env.WORLD_GATEWAY_CALLER_TOKEN?.trim() || null,
    callerBuild: env.WORLD_GATEWAY_EXPECTED_BUILD?.trim() || null,
    callerEnvironment: env.WORLD_GATEWAY_EXPECTED_ENVIRONMENT?.trim() || null,
    tunnelToken: env.WORLD_TUNNEL_TOKEN?.trim() || null,
    timeoutMs: positiveInteger(env.WORLD_TUNNEL_TIMEOUT_MS, 1500, "WORLD_TUNNEL_TIMEOUT_MS"),
    runtimeMode: mode,
    runtimeCallerServiceId: env.WORLD_RUNTIME_CALLER_SERVICE_ID?.trim()
      || (mode === "local" ? "knowhere-local-client" : "knowhere-api-server"),
    runtimeCallerToken: env.WORLD_RUNTIME_CALLER_TOKEN?.trim() || null,
    runtimeCallerBuild: env.WORLD_RUNTIME_CALLER_BUILD?.trim() || null,
    runtimeCallerEnvironment: env.WORLD_RUNTIME_CALLER_ENVIRONMENT?.trim() || null,
    runtimeLeaseMs: positiveInteger(env.WORLD_RUNTIME_LEASE_MS, 900_000, "WORLD_RUNTIME_LEASE_MS"),
    runtimeMaxInstances: positiveInteger(env.WORLD_RUNTIME_MAX_INSTANCES, 256, "WORLD_RUNTIME_MAX_INSTANCES"),
    admissionSigningSecret,
    sunSchedule: Object.freeze({
      dayDurationSeconds: boundedPositiveInteger(
        env.WORLD_SUN_DAY_DURATION_SECONDS,
        DEFAULT_GARDEN_SUN_SCHEDULE.dayDurationSeconds,
        "WORLD_SUN_DAY_DURATION_SECONDS",
        86_400,
      ),
      nightDurationSeconds: boundedPositiveInteger(
        env.WORLD_SUN_NIGHT_DURATION_SECONDS,
        DEFAULT_GARDEN_SUN_SCHEDULE.nightDurationSeconds,
        "WORLD_SUN_NIGHT_DURATION_SECONDS",
        86_400,
      ),
      cycleEpoch: rfc3339(
        env.WORLD_SUN_CYCLE_EPOCH,
        DEFAULT_GARDEN_SUN_SCHEDULE.cycleEpoch,
        "WORLD_SUN_CYCLE_EPOCH",
      ),
      cycleOffsetSeconds: nonNegativeNumber(
        env.WORLD_SUN_CYCLE_OFFSET_SECONDS,
        DEFAULT_GARDEN_SUN_SCHEDULE.cycleOffsetSeconds,
        "WORLD_SUN_CYCLE_OFFSET_SECONDS",
      ),
      scheduleRevision: positiveInteger(
        env.WORLD_SUN_SCHEDULE_REVISION,
        DEFAULT_GARDEN_SUN_SCHEDULE.scheduleRevision,
        "WORLD_SUN_SCHEDULE_REVISION",
      ),
    }),
  };
}
