import { randomUUID } from "node:crypto";

/**
 * Opaque admission material supplied by a local client after it has obtained a
 * Gatekeeper-issued ticket through the Gateway/API path. This boundary accepts
 * no player, account, character, world, role, or session fields from a caller.
 */
export type AdmissionAttempt = Readonly<{
  ticket: string;
}>;

/** Identity and scope returned only by the trusted ticket verifier. */
export type VerifiedAdmission = Readonly<{
  admissionId: string;
  playerId: string;
  accountId: string;
  characterId: string;
  worldId: string;
  expiresAt: Date;
}>;

export type AdmissionTicketVerifier = Readonly<{
  verify(ticket: string, now: Date): Promise<VerifiedAdmission | null>;
}>;

export type AdmissionReplayStore = Readonly<{
  /** Atomically records the verified admission ID, returning false if it was already consumed. */
  consume(admissionId: string, expiresAt: Date, now: Date): Promise<boolean>;
}>;

export type LocalPlayerPresence = Readonly<{
  sessionId: string;
  admissionId: string;
  playerId: string;
  accountId: string;
  characterId: string;
  worldId: string;
  admittedAt: Date;
  expiresAt: Date;
}>;

export type AdmissionResult =
  | Readonly<{ ok: true; presence: LocalPlayerPresence }>
  | Readonly<{ ok: false; reason: "invalid_ticket" | "expired_ticket" | "replayed_ticket" }>;

export type PresenceCleanupResult = Readonly<{
  removedSessionIds: readonly string[];
}>;

export type LocalAdmissionPresenceOptions = Readonly<{
  verifier: AdmissionTicketVerifier;
  replayStore: AdmissionReplayStore;
  now?: () => Date;
  sessionId?: () => string;
}>;

function hasRequiredIdentity(admission: VerifiedAdmission): boolean {
  return [
    admission.admissionId,
    admission.playerId,
    admission.accountId,
    admission.characterId,
    admission.worldId,
  ].every((value) => value.trim().length > 0);
}

/**
 * Local-only game admission and in-memory player-presence boundary.
 *
 * It neither authenticates a user nor verifies ticket signatures itself. The
 * injected verifier produces the only accepted identity; the injected replay
 * store atomically consumes that verifier result before presence is created.
 * An established local session can be explicitly disconnected, while an expiry
 * sweep removes stale presences without trusting browser identity input. This
 * module has no HTTP listener, database client, or browser identity input.
 */
export class LocalAdmissionPresenceService {
  readonly #verifier: AdmissionTicketVerifier;
  readonly #replayStore: AdmissionReplayStore;
  readonly #now: () => Date;
  readonly #sessionId: () => string;
  readonly #presenceBySession = new Map<string, LocalPlayerPresence>();

  constructor(options: LocalAdmissionPresenceOptions) {
    this.#verifier = options.verifier;
    this.#replayStore = options.replayStore;
    this.#now = options.now ?? (() => new Date());
    this.#sessionId = options.sessionId ?? randomUUID;
  }

  async admit(attempt: AdmissionAttempt): Promise<AdmissionResult> {
    if (!attempt.ticket.trim()) return { ok: false, reason: "invalid_ticket" };

    const now = this.#now();
    const admission = await this.#verifier.verify(attempt.ticket, now);
    if (!admission || !hasRequiredIdentity(admission) || !(admission.expiresAt instanceof Date)) {
      return { ok: false, reason: "invalid_ticket" };
    }
    if (!Number.isFinite(admission.expiresAt.getTime()) || admission.expiresAt.getTime() <= now.getTime()) {
      return { ok: false, reason: "expired_ticket" };
    }

    const consumed = await this.#replayStore.consume(admission.admissionId, admission.expiresAt, now);
    if (!consumed) return { ok: false, reason: "replayed_ticket" };

    const presence: LocalPlayerPresence = Object.freeze({
      sessionId: this.#sessionId(),
      admissionId: admission.admissionId,
      playerId: admission.playerId,
      accountId: admission.accountId,
      characterId: admission.characterId,
      worldId: admission.worldId,
      admittedAt: now,
      expiresAt: admission.expiresAt,
    });
    this.#presenceBySession.set(presence.sessionId, presence);
    return { ok: true, presence };
  }

  getPresence(sessionId: string): LocalPlayerPresence | null {
    this.#removeExpired(this.#now());
    return this.#presenceBySession.get(sessionId) ?? null;
  }

  listPresence(): readonly LocalPlayerPresence[] {
    this.#removeExpired(this.#now());
    return [...this.#presenceBySession.values()];
  }

  /**
   * Removes an established local session after its owning local transport has
   * disconnected. Session IDs are opaque local handles, not identity claims.
   */
  disconnect(sessionId: string): PresenceCleanupResult {
    return this.#remove(sessionId);
  }

  /** Removes every presence whose verifier-derived admission lifetime has ended. */
  sweepExpired(): PresenceCleanupResult {
    return this.#removeExpired(this.#now());
  }

  #remove(sessionId: string): PresenceCleanupResult {
    return this.#presenceBySession.delete(sessionId)
      ? { removedSessionIds: [sessionId] }
      : { removedSessionIds: [] };
  }

  #removeExpired(now: Date): PresenceCleanupResult {
    const removedSessionIds: string[] = [];
    for (const [sessionId, presence] of this.#presenceBySession) {
      if (presence.expiresAt.getTime() <= now.getTime()) {
        this.#presenceBySession.delete(sessionId);
        removedSessionIds.push(sessionId);
      }
    }
    return { removedSessionIds };
  }
}
