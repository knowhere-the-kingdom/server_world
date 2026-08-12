import { createHmac, timingSafeEqual } from "node:crypto";
import { LocalAdmissionPresenceService, type VerifiedAdmission } from "./local-admission.js";

export function createConfiguredAdmissionPresence(secret:string|undefined):LocalAdmissionPresenceService|null {
  if(!secret)return null;
  if(Buffer.byteLength(secret)<32)throw new Error("WORLD_ADMISSION_SIGNING_SECRET must contain at least 32 bytes.");
  const consumed=new Set<string>();
  return new LocalAdmissionPresenceService({
    verifier:{async verify(ticket){
      try{const [payload,signature,...extra]=ticket.split(".");if(!payload||!signature||extra.length)return null;const expected=Buffer.from(createHmac("sha256",secret).update(payload).digest("base64url"));const supplied=Buffer.from(signature);if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))return null;const claims=JSON.parse(Buffer.from(payload,"base64url").toString("utf8")) as Record<string,unknown>;if(claims.version!=="1.0"||claims.issuer!=="knowhere-gatekeeper"||claims.audience!=="local-gamemaster")return null;const expiresAt=new Date(String(claims.expiresAt));if(!Number.isFinite(expiresAt.getTime()))return null;return {admissionId:String(claims.ticketId),playerId:String(claims.accountId),accountId:String(claims.accountId),characterId:String(claims.characterId),worldId:String(claims.worldId),expiresAt} satisfies VerifiedAdmission;}catch{return null;}
    }},
    replayStore:{async consume(admissionId){if(consumed.has(admissionId))return false;consumed.add(admissionId);return true;}}
  });
}
