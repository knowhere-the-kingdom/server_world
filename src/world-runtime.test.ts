import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { type Server } from "node:http";
import test from "node:test";

import { readWorldHandlerConfig, type WorldHandlerConfig } from "./config.js";
import { HmacAdmissionTicketVerifier } from "./admission-ticket.js";
import { createWorldHandler } from "./server.js";
import { GARDEN_SCENE, UNDERWORLD_SCENE, GardenWorldRuntime } from "./world-runtime.js";

const runtimeConfig: WorldHandlerConfig = {
  host: "127.0.0.1",
  port: 0,
  buildVersion: "world-test",
  environment: "test",
  tunnelUrl: null,
  callerServiceId: "knowhere-api-server",
  callerToken: null,
  tunnelToken: null,
  timeoutMs: 100,
  runtimeMode: "host",
  runtimeCallerServiceId: "knowhere-api-server",
  runtimeCallerToken: "runtime-token",
  runtimeCallerBuild: "api-test",
  runtimeCallerEnvironment: "test",
  runtimeLeaseMs: 900_000,
  runtimeMaxInstances: 4,
  admissionSigningSecret: "world-test-secret-with-at-least-32-bytes",
};

const runtimeHeaders = {
  "content-type": "application/json",
  "x-knowhere-service-id": "knowhere-api-server",
  "x-knowhere-service-token": "runtime-token",
  "x-knowhere-protocol-version": "1.0.0",
  "x-knowhere-build": "api-test",
  "x-knowhere-environment": "test",
};

const bootstrapBase = {
  schemaVersion: 1,
  worldSessionId: "world-session-1",
  worldId: "garden",
  characterId: "character-1",
  leaseExpiresAt: "2026-08-01T00:00:00.000Z",
  serverSnapshot: { contentRevision: 1, contentHash: "garden-content-1" },
  hudProjectionRevision: 1,
};

const ticketClaims = {
  version: "1.0",
  issuer: "knowhere-gatekeeper",
  audience: "local-gamemaster",
  ticketId: "ticket-1",
  accountId: "account-1",
  sessionId: "identity-session-1",
  authorizationRevision: 1,
  characterId: "character-1",
  worldId: "garden",
  issuedAt: "2026-07-29T11:59:55.000Z",
  expiresAt: "2026-07-29T12:01:00.000Z",
} as const;

function signTicket(value: object, secret = runtimeConfig.admissionSigningSecret!): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  server.close();
  await once(server, "close");
}

test("Garden prewarm is anonymous, exact, and idempotent", () => {
  const runtime = new GardenWorldRuntime("host");
  const expected = { worldId: "garden", status: "ready", sceneRevision: 1 };
  assert.deepEqual(runtime.prewarm({ worldId: "garden" }), expected);
  assert.deepEqual(runtime.prewarm({ worldId: "garden" }), expected);
  assert.equal(runtime.prewarm({ worldId: "garden", accountId: "forbidden" }), null);
  assert.equal(runtime.prewarm({ worldId: "official" }), null);
});

test("Garden scene matches the web renderer's exact three-component contract", () => {
  const runtime = new GardenWorldRuntime("host");
  assert.equal(runtime.scene(), null);
  runtime.prewarm({ worldId: "garden" });
  assert.deepEqual(runtime.scene(), GARDEN_SCENE);
  assert.deepEqual(Object.keys(GARDEN_SCENE).sort(), ["sceneId", "schemaVersion", "skybox", "sun", "voxelLandscape"]);
  assert.deepEqual(GARDEN_SCENE.voxelLandscape, {
    kind: "flat-chunk-grid", voxelSizeMeters: 1, chunkSize: 16, chunkRadius: 14,
    diffuse: "#3f9b45", emissive: "#102d13", specular: "#17351a",
  });
  assert.deepEqual(GARDEN_SCENE.skybox, {
    kind: "solid-color-sphere", diameter: 440, segments: 24, dayColor: "#55a9ed", nightColor: "#020718",
  });
  assert.deepEqual(GARDEN_SCENE.sun, {
    kind: "orbiting-mythic-sun",
    assetId: "mythic-sun",
    assetVersion: 1,
    diameter: 52,
    quality: "medium",
    seed: 17,
    palette: { heart: "#ffe29a", plasma: "#ff8a3d", ember: "#b84a32", shadow: "#3a1820" },
    dayDurationSeconds: 60,
    nightDurationSeconds: 60,
    cycleEpoch: "2026-01-01T00:00:00.000Z",
    cycleOffsetSeconds: 0,
    scheduleRevision: 1,
    sunlight: "#fff3d0", maxIntensity: 1.25,
  });
});

test("Garden sun schedule is a server_world-specific scene variable", () => {
  const schedule = {
    dayDurationSeconds: 900,
    nightDurationSeconds: 300,
    cycleEpoch: "2026-07-29T00:00:00.000Z",
    cycleOffsetSeconds: 45,
    scheduleRevision: 7,
  };
  const runtime = new GardenWorldRuntime("host", 900_000, 4, undefined, undefined, schedule);
  runtime.prewarm({ worldId: "garden" });
  const scene = runtime.scene();
  assert.ok(scene);
  assert.deepEqual({
    dayDurationSeconds: scene.sun.dayDurationSeconds,
    nightDurationSeconds: scene.sun.nightDurationSeconds,
    cycleEpoch: scene.sun.cycleEpoch,
    cycleOffsetSeconds: scene.sun.cycleOffsetSeconds,
    scheduleRevision: scene.sun.scheduleRevision,
  }, schedule);
  assert.equal(scene.sun.assetId, "mythic-sun");
});

test("Underworld is a closed one-kilometer stone voxel starter world with a static high-noon sun", () => {
  assert.deepEqual(UNDERWORLD_SCENE.voxelLandscape, {
    kind: "flat-stone-voxel-plane",
    voxelSizeMeters: 1,
    widthMeters: 1000,
    depthMeters: 1000,
    surfaceY: 0,
    blockMaterial: "stone",
    renderChunkSizeMeters: 100,
    diffuse: "#6f7478",
    emissive: "#111416",
    specular: "#30363b",
  });
  assert.deepEqual(UNDERWORLD_SCENE.topology, {
    kind: "inside-out-cube-sphere",
    projection: "spherified-cube",
    radiusMeters: 6371000,
    starterPatchMeters: 1000,
    gravityDirection: "away-from-center",
  });
  assert.deepEqual(UNDERWORLD_SCENE.skybox, GARDEN_SCENE.skybox);
  assert.deepEqual(UNDERWORLD_SCENE.sun.palette, GARDEN_SCENE.sun.palette);
  assert.deepEqual(UNDERWORLD_SCENE.sun.fixedPosition, { x: 0, y: 180, z: 0 });
});

test("Underworld prewarm and admission bootstrap only the selected closed world", () => {
  const runtime = new GardenWorldRuntime("host", 900_000, 4, () => new Date("2026-07-29T12:00:00.000Z"), () => "underworld-session-1");
  assert.deepEqual(runtime.prewarm({ worldId: "underworld" }), { worldId: "underworld", status: "ready", sceneRevision: 1 });
  const admitted = runtime.admit({ ...ticketClaims, ticketId: "underworld-ticket-1", worldId: "underworld" });
  assert.ok(admitted);
  assert.equal(admitted.worldId, "underworld");
  const bootstrap = runtime.bootstrap(admitted.sessionId);
  assert.ok(bootstrap);
  assert.equal(bootstrap.worldId, "underworld");
  assert.deepEqual(bootstrap.scene, UNDERWORLD_SCENE);
});

test("verified admission binds a distinct Garden world session with one-call bootstrap", () => {
  const runtime = new GardenWorldRuntime("host", 900_000, 4, () => new Date("2026-07-29T12:00:00.000Z"), () => "world-session-1");
  assert.equal(runtime.attachScene(bootstrapBase), null);
  runtime.prewarm({ worldId: "garden" });
  assert.deepEqual(runtime.attachScene(bootstrapBase), { ...bootstrapBase, scene: GARDEN_SCENE });
  assert.equal(runtime.attachScene({ ...bootstrapBase, worldId: "official" }), null);
  assert.equal(runtime.attachScene({ ...bootstrapBase, ticket: "forbidden" }), null);
  const admitted = runtime.admit(ticketClaims);
  assert.ok(admitted);
  assert.equal(admitted.sessionId, "world-session-1");
  assert.notEqual(admitted.sessionId, ticketClaims.sessionId);
  const bootstrap = runtime.bootstrap(admitted.sessionId);
  assert.ok(bootstrap);
  assert.equal(bootstrap.characterId, "character-1");
  assert.deepEqual(bootstrap.scene, GARDEN_SCENE);
  assert.equal(Object.hasOwn(bootstrap, "accountId"), false);
});

test("private host prewarm uses the API identity and exact response", async () => {
  const runtime = new GardenWorldRuntime("host");
  const server = createWorldHandler(runtimeConfig, undefined, runtime);
  const base = await listen(server);
  try {
    assert.equal((await fetch(`${base}/v1/readiness`)).status, 200);
    const denied = await fetch(`${base}/v1/world/prewarm`, {
      method: "POST",
      headers: { ...runtimeHeaders, "x-knowhere-service-token": "wrong" },
      body: JSON.stringify({ worldId: "garden" }),
    });
    assert.equal(denied.status, 403);
    const response = await fetch(`${base}/v1/world/prewarm`, {
      method: "POST",
      headers: runtimeHeaders,
      body: JSON.stringify({ worldId: "garden" }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { worldId: "garden", status: "ready", sceneRevision: 1 });
  } finally {
    await close(server);
  }
});

test("host admission verifies and consumes the Gatekeeper HMAC ticket before bootstrap", async () => {
  const clock = () => new Date("2026-07-29T12:00:00.000Z");
  const runtime = new GardenWorldRuntime("host", 900_000, 4, clock, () => "world-session-1");
  const server = createWorldHandler({
    ...runtimeConfig,
  }, clock, runtime);
  const base = await listen(server);
  try {
    const prewarm = await fetch(`${base}/v1/world/prewarm`, {
      method: "POST", headers: runtimeHeaders, body: JSON.stringify({ worldId: "garden" }),
    });
    assert.equal(prewarm.status, 200);
    const ticket = signTicket(ticketClaims);
    const admission = await fetch(`${base}/v1/admissions`, {
      method: "POST", headers: runtimeHeaders, body: JSON.stringify({ ticket }),
    });
    assert.equal(admission.status, 201);
    const admitted = await admission.json();
    assert.equal(admitted.sessionId, "world-session-1");
    assert.equal(admitted.characterId, "character-1");

    const replay = await fetch(`${base}/v1/admissions`, {
      method: "POST", headers: runtimeHeaders, body: JSON.stringify({ ticket }),
    });
    assert.equal(replay.status, 401);

    const response = await fetch(`${base}/v1/world/bootstrap`, {
      headers: { ...runtimeHeaders, "x-world-session-id": admitted.sessionId },
    });
    assert.equal(response.status, 200);
    const bootstrap = await response.json();
    assert.equal(bootstrap.worldSessionId, "world-session-1");
    assert.equal(bootstrap.characterId, "character-1");
    assert.deepEqual(bootstrap.scene, GARDEN_SCENE);
  } finally {
    await close(server);
  }
});

test("Gatekeeper-compatible verifier rejects tampering, wrong scope, expiry, and replay", () => {
  const verifier = new HmacAdmissionTicketVerifier(
    runtimeConfig.admissionSigningSecret!,
    () => new Date("2026-07-29T12:00:00.000Z"),
  );
  assert.deepEqual(verifier.verifyAndConsume(signTicket({ ...ticketClaims, audience: "browser" })), { ok: false, code: "ticket_invalid" });
  assert.deepEqual(verifier.verifyAndConsume(signTicket({ ...ticketClaims, worldId: "official" })), { ok: false, code: "ticket_invalid" });
  assert.deepEqual(verifier.verifyAndConsume(signTicket({ ...ticketClaims, ticketId: "expired", expiresAt: "2026-07-29T11:59:59.000Z" })), { ok: false, code: "ticket_expired" });
  assert.deepEqual(verifier.verifyAndConsume(`${signTicket(ticketClaims)}tampered`), { ok: false, code: "ticket_invalid" });
  assert.equal(verifier.verifyAndConsume(signTicket(ticketClaims)).ok, true);
  assert.deepEqual(verifier.verifyAndConsume(signTicket(ticketClaims)), { ok: false, code: "ticket_replayed" });
});

test("local mode is loopback-only and uses a distinct configured caller", async () => {
  const runtime = new GardenWorldRuntime("local");
  const server = createWorldHandler({
    ...runtimeConfig,
    runtimeMode: "local",
    runtimeCallerServiceId: "knowhere-local-client",
    runtimeCallerToken: "local-token",
    runtimeCallerBuild: "desktop-alpha",
  }, undefined, runtime);
  const base = await listen(server);
  try {
    const response = await fetch(`${base}/v1/world/prewarm`, {
      method: "POST",
      headers: {
        ...runtimeHeaders,
        "x-knowhere-service-id": "knowhere-local-client",
        "x-knowhere-service-token": "local-token",
        "x-knowhere-build": "desktop-alpha",
      },
      body: JSON.stringify({ worldId: "garden" }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).worldId, "garden");
  } finally {
    await close(server);
  }
});

test("local configuration rejects non-loopback binding and incomplete mode values", () => {
  assert.throws(
    () => readWorldHandlerConfig({ WORLD_RUNTIME_MODE: "local", WORLD_HANDLER_HOST: "0.0.0.0" }),
    /must bind to loopback/,
  );
  assert.throws(() => readWorldHandlerConfig({ WORLD_RUNTIME_MODE: "automatic" }), /must be host or local/);
  assert.equal(readWorldHandlerConfig({ WORLD_RUNTIME_MODE: "local" }).host, "127.0.0.1");
});

test("sun schedule environment values are bounded and canonical", () => {
  const config = readWorldHandlerConfig({
    WORLD_SUN_DAY_DURATION_SECONDS: "900",
    WORLD_SUN_NIGHT_DURATION_SECONDS: "300",
    WORLD_SUN_CYCLE_EPOCH: "2026-07-29T00:00:00.000Z",
    WORLD_SUN_CYCLE_OFFSET_SECONDS: "45.5",
    WORLD_SUN_SCHEDULE_REVISION: "7",
  });
  assert.deepEqual(config.sunSchedule, {
    dayDurationSeconds: 900,
    nightDurationSeconds: 300,
    cycleEpoch: "2026-07-29T00:00:00.000Z",
    cycleOffsetSeconds: 45.5,
    scheduleRevision: 7,
  });
  assert.throws(
    () => readWorldHandlerConfig({ WORLD_SUN_DAY_DURATION_SECONDS: "86401" }),
    /WORLD_SUN_DAY_DURATION_SECONDS/,
  );
  assert.throws(
    () => readWorldHandlerConfig({ WORLD_SUN_CYCLE_EPOCH: "2026-07-29" }),
    /WORLD_SUN_CYCLE_EPOCH/,
  );
});
