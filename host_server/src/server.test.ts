import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import {
  LocalAdmissionPresenceService,
  type AdmissionReplayStore,
  type AdmissionTicketVerifier,
  type VerifiedAdmission,
} from "./local-admission.js";
import {
  GAME_SERVER_PROTOCOL_VERSION,
  GAME_SERVER_ROUTES,
  GAME_SERVER_SERVICE,
  type GameServerAdmissionResponse,
  type GameServerHealth,
} from "./protocol.js";
import { createHostServer } from "./server.js";

const hostConfig = {
  host: "127.0.0.1",
  port: 0,
  buildVersion: "test",
  allowedOrigins: new Set(["http://localhost:3000"]),
};

async function withServer(
  callback: (baseUrl: string) => Promise<void>,
  dependencies: Parameters<typeof createHostServer>[1] = {},
): Promise<void> {
  const server = createHostServer(hostConfig, dependencies);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function verifiedAdmission(): VerifiedAdmission {
  return {
    admissionId: "admission-1",
    playerId: "player-1",
    accountId: "account-1",
    characterId: "character-1",
    worldId: "world-local-1",
    expiresAt: new Date("2026-07-27T12:05:00.000Z"),
  };
}

function createAdmissionPresence(verifier: AdmissionTicketVerifier): LocalAdmissionPresenceService {
  const replayStore: AdmissionReplayStore = {
    async consume() {
      return true;
    },
  };
  return new LocalAdmissionPresenceService({
    verifier,
    replayStore,
    now: () => new Date("2026-07-27T12:00:00.000Z"),
    sessionId: () => "local-session-1",
  });
}

test("host server exposes truthful health without claiming world readiness", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}${GAME_SERVER_ROUTES.health}`);
    const health = (await response.json()) as GameServerHealth;
    assert.equal(response.status, 200);
    assert.equal(health.service, GAME_SERVER_SERVICE);
    assert.equal(health.protocolVersion, GAME_SERVER_PROTOCOL_VERSION);
    assert.equal(health.readyForWorldConnections, false);
  });
});

test("admissions fail closed when verifier, replay, and presence dependencies are absent", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}${GAME_SERVER_ROUTES.admissions}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket: "opaque-ticket" }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "admission_unavailable", protocolVersion: GAME_SERVER_PROTOCOL_VERSION });
  });
});

test("admissions accept only opaque ticket input and return a minimal verifier-derived presence", async () => {
  let receivedTicket: string | null = null;
  const presence = createAdmissionPresence({
    async verify(ticket) {
      receivedTicket = ticket;
      return verifiedAdmission();
    },
  });
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}${GAME_SERVER_ROUTES.admissions}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket: "opaque-ticket" }),
    });
    const body = (await response.json()) as GameServerAdmissionResponse;
    assert.equal(response.status, 201);
    assert.equal(receivedTicket, "opaque-ticket");
    assert.deepEqual(body, {
      protocolVersion: GAME_SERVER_PROTOCOL_VERSION,
      sessionId: "local-session-1",
      characterId: "character-1",
      worldId: "world-local-1",
      expiresAt: "2026-07-27T12:05:00.000Z",
    });
    assert.equal("accountId" in body, false);
    assert.equal("admissionId" in body, false);
  }, { admissionPresence: presence });
});

test("admissions reject malformed or verifier-rejected requests without creating presence", async () => {
  let verifierCalls = 0;
  const presence = createAdmissionPresence({
    async verify() {
      verifierCalls += 1;
      return null;
    },
  });
  await withServer(async (baseUrl) => {
    const malformed = await fetch(`${baseUrl}${GAME_SERVER_ROUTES.admissions}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket: "opaque-ticket", playerId: "browser-claim" }),
    });
    assert.equal(malformed.status, 400);
    assert.equal(verifierCalls, 0);

    const denied = await fetch(`${baseUrl}${GAME_SERVER_ROUTES.admissions}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket: "opaque-ticket" }),
    });
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: "admission_denied", protocolVersion: GAME_SERVER_PROTOCOL_VERSION });
    assert.equal(verifierCalls, 1);
    assert.deepEqual(presence.listPresence(), []);
  }, { admissionPresence: presence });
});
