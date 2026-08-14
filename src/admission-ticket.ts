import { createHmac, timingSafeEqual } from "node:crypto";
import { isWorldId, type WorldId } from "./protocol.js";

export type WorldAdmissionClaims = Readonly<{
  version: "1.0";
  issuer: "knowhere-gatekeeper";
  audience: "local-gamemaster";
  ticketId: string;
  accountId: string;
  sessionId: string;
  authorizationRevision: number;
  characterId: string;
  worldId: WorldId;
  issuedAt: string;
  expiresAt: string;
}>;

export type AdmissionTicketResult =
  | Readonly<{ ok: true; claims: WorldAdmissionClaims }>
  | Readonly<{ ok: false; code: "ticket_invalid" | "ticket_expired" | "ticket_replayed" | "ticket_verification_unavailable" }>;

function opaque(value: unknown, maximumLength = 512): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength && value.trim() === value;
}

function claims(value: unknown): WorldAdmissionClaims | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const expected = ["version", "issuer", "audience", "ticketId", "accountId", "sessionId", "authorizationRevision", "characterId", "worldId", "issuedAt", "expiresAt"].sort();
  const actual = Object.keys(record).sort();
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) return null;
  if (
    record.version !== "1.0"
    || record.issuer !== "knowhere-gatekeeper"
    || record.audience !== "local-gamemaster"
    || !isWorldId(record.worldId)
    || !opaque(record.ticketId)
    || !opaque(record.accountId)
    || !opaque(record.sessionId)
    || !opaque(record.characterId)
    || !Number.isInteger(record.authorizationRevision)
    || (record.authorizationRevision as number) < 0
    || typeof record.issuedAt !== "string"
    || typeof record.expiresAt !== "string"
    || !Number.isFinite(Date.parse(record.issuedAt))
    || !Number.isFinite(Date.parse(record.expiresAt))
    || Date.parse(record.expiresAt) <= Date.parse(record.issuedAt)
  ) return null;
  return Object.freeze(record as WorldAdmissionClaims);
}

export class HmacAdmissionTicketVerifier {
  readonly #consumed = new Map<string, number>();

  constructor(readonly secret: string, readonly now: () => Date = () => new Date()) {
    if (Buffer.byteLength(secret) < 32) throw new Error("WORLD_ADMISSION_SIGNING_SECRET must contain at least 32 bytes.");
  }

  #signature(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("base64url");
  }

  verifyAndConsume(ticket: string): AdmissionTicketResult {
    if (!opaque(ticket, 8192)) return { ok: false, code: "ticket_verification_unavailable" };
    const [payload, suppliedSignature, ...extra] = ticket.split(".");
    if (!payload || !suppliedSignature || extra.length) return { ok: false, code: "ticket_invalid" };
    const expected = Buffer.from(this.#signature(payload));
    const supplied = Buffer.from(suppliedSignature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return { ok: false, code: "ticket_invalid" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      return { ok: false, code: "ticket_invalid" };
    }
    const verified = claims(parsed);
    if (!verified) return { ok: false, code: "ticket_invalid" };
    const nowMs = this.now().getTime();
    for (const [ticketId, expiresAt] of this.#consumed) if (expiresAt <= nowMs) this.#consumed.delete(ticketId);
    if (Date.parse(verified.expiresAt) <= nowMs) return { ok: false, code: "ticket_expired" };
    if (Date.parse(verified.issuedAt) > nowMs + 5_000) return { ok: false, code: "ticket_invalid" };
    if (this.#consumed.has(verified.ticketId)) return { ok: false, code: "ticket_replayed" };
    this.#consumed.set(verified.ticketId, Date.parse(verified.expiresAt));
    return { ok: true, claims: verified };
  }
}
