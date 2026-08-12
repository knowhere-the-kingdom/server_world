import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalAdmissionPresenceService,
  type AdmissionReplayStore,
  type AdmissionTicketVerifier,
  type VerifiedAdmission,
} from "./local-admission.js";

const now = new Date("2026-07-27T12:00:00.000Z");

function verified(admissionId: string, playerId: string): VerifiedAdmission {
  return {
    admissionId,
    playerId,
    accountId: `account-${playerId}`,
    characterId: `character-${playerId}`,
    worldId: "world-local-1",
    expiresAt: new Date("2026-07-27T12:05:00.000Z"),
  };
}

function createReplayStore(): AdmissionReplayStore {
  const consumed = new Set<string>();
  return {
    async consume(admissionId) {
      if (consumed.has(admissionId)) return false;
      consumed.add(admissionId);
      return true;
    },
  };
}

test("creates presence from verifier-derived identity and records it by local session", async () => {
  const verifier: AdmissionTicketVerifier = {
    async verify(ticket) {
      assert.equal(ticket, "opaque-ticket");
      return verified("admission-1", "player-1");
    },
  };
  const service = new LocalAdmissionPresenceService({
    verifier,
    replayStore: createReplayStore(),
    now: () => now,
    sessionId: () => "local-session-1",
  });

  const result = await service.admit({ ticket: "opaque-ticket" });

  assert.deepEqual(result, {
    ok: true,
    presence: {
      sessionId: "local-session-1",
      admissionId: "admission-1",
      playerId: "player-1",
      accountId: "account-player-1",
      characterId: "character-player-1",
      worldId: "world-local-1",
      admittedAt: now,
      expiresAt: new Date("2026-07-27T12:05:00.000Z"),
    },
  });
  assert.equal(result.ok && service.getPresence(result.presence.sessionId), result.ok && result.presence);
});

test("rejects an invalid or expired verifier result before consuming or creating presence", async () => {
  let consumeCount = 0;
  const replayStore: AdmissionReplayStore = {
    async consume() {
      consumeCount += 1;
      return true;
    },
  };
  const verifier: AdmissionTicketVerifier = {
    async verify(ticket) {
      return ticket === "expired" ? { ...verified("admission-expired", "player-1"), expiresAt: now } : null;
    },
  };
  const service = new LocalAdmissionPresenceService({ verifier, replayStore, now: () => now });

  assert.deepEqual(await service.admit({ ticket: "not-a-ticket" }), { ok: false, reason: "invalid_ticket" });
  assert.deepEqual(await service.admit({ ticket: "expired" }), { ok: false, reason: "expired_ticket" });
  assert.equal(consumeCount, 0);
  assert.deepEqual(service.listPresence(), []);
});

test("replay rejection does not create a second local presence", async () => {
  const verifier: AdmissionTicketVerifier = { async verify() { return verified("admission-once", "player-1"); } };
  const service = new LocalAdmissionPresenceService({ verifier, replayStore: createReplayStore(), now: () => now });

  assert.equal((await service.admit({ ticket: "same-ticket" })).ok, true);
  assert.deepEqual(await service.admit({ ticket: "same-ticket" }), { ok: false, reason: "replayed_ticket" });
  assert.equal(service.listPresence().length, 1);
});

test("keeps independently admitted players as separate local presences", async () => {
  const verifier: AdmissionTicketVerifier = {
    async verify(ticket) {
      return ticket === "ticket-a" ? verified("admission-a", "player-a") : verified("admission-b", "player-b");
    },
  };
  let sequence = 0;
  const service = new LocalAdmissionPresenceService({
    verifier,
    replayStore: createReplayStore(),
    now: () => now,
    sessionId: () => `local-session-${++sequence}`,
  });

  const first = await service.admit({ ticket: "ticket-a" });
  const second = await service.admit({ ticket: "ticket-b" });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(service.listPresence().map((presence) => presence.playerId), ["player-a", "player-b"]);
});

test("explicit disconnect removes only the established local presence", async () => {
  const verifier: AdmissionTicketVerifier = {
    async verify(ticket) {
      return ticket === "ticket-a" ? verified("admission-a", "player-a") : verified("admission-b", "player-b");
    },
  };
  let sequence = 0;
  const service = new LocalAdmissionPresenceService({
    verifier,
    replayStore: createReplayStore(),
    now: () => now,
    sessionId: () => `local-session-${++sequence}`,
  });
  const first = await service.admit({ ticket: "ticket-a" });
  await service.admit({ ticket: "ticket-b" });
  assert.equal(first.ok, true);

  assert.deepEqual(service.disconnect(first.presence.sessionId), { removedSessionIds: ["local-session-1"] });
  assert.equal(service.getPresence("local-session-1"), null);
  assert.deepEqual(service.listPresence().map((presence) => presence.sessionId), ["local-session-2"]);
});

test("expiry sweep removes every expired presence and retains valid players", async () => {
  let current = now;
  const verifier: AdmissionTicketVerifier = {
    async verify(ticket) {
      return ticket === "expires"
        ? { ...verified("admission-expiring", "player-expiring"), expiresAt: new Date("2026-07-27T12:01:00.000Z") }
        : verified("admission-active", "player-active");
    },
  };
  let sequence = 0;
  const service = new LocalAdmissionPresenceService({
    verifier,
    replayStore: createReplayStore(),
    now: () => current,
    sessionId: () => `local-session-${++sequence}`,
  });
  await service.admit({ ticket: "expires" });
  await service.admit({ ticket: "active" });
  current = new Date("2026-07-27T12:01:00.000Z");

  assert.deepEqual(service.sweepExpired(), { removedSessionIds: ["local-session-1"] });
  assert.deepEqual(service.listPresence().map((presence) => presence.playerId), ["player-active"]);
});

test("disconnect and expiry cleanup are idempotent", async () => {
  let current = now;
  const verifier: AdmissionTicketVerifier = {
    async verify() {
      return { ...verified("admission-expiring", "player-expiring"), expiresAt: new Date("2026-07-27T12:01:00.000Z") };
    },
  };
  const service = new LocalAdmissionPresenceService({
    verifier,
    replayStore: createReplayStore(),
    now: () => current,
    sessionId: () => "local-session-1",
  });
  await service.admit({ ticket: "ticket" });

  assert.deepEqual(service.disconnect("local-session-1"), { removedSessionIds: ["local-session-1"] });
  assert.deepEqual(service.disconnect("local-session-1"), { removedSessionIds: [] });
  current = new Date("2026-07-27T12:01:00.000Z");
  assert.deepEqual(service.sweepExpired(), { removedSessionIds: [] });
  assert.deepEqual(service.sweepExpired(), { removedSessionIds: [] });
});
