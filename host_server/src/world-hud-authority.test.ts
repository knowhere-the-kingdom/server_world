import assert from "node:assert/strict";
import test from "node:test";
import { createWorldHudAuthority } from "./world-hud-authority.js";

const presence = { sessionId:"world-session",admissionId:"admission",playerId:"player",accountId:"account",characterId:"character",worldId:"knowhere",admittedAt:new Date(),expiresAt:new Date(Date.now()+60_000) };

test("HUD authority exists only for an admitted player and owns its revision",()=>{
  const authority=createWorldHudAuthority();
  assert.equal(authority.hud("missing"),null);
  authority.admit(presence);
  assert.equal(authority.bootstrap(presence.sessionId)?.characterId,"character");
  assert.equal(authority.hud(presence.sessionId)?.projectionRevision,1);
});

test("inventory commands reject stale revisions and unknown exact instances",()=>{
  const authority=createWorldHudAuthority();authority.admit(presence);
  const stale=authority.move(presence.sessionId,{expectedProjectionRevision:0,itemInstanceId:"item",destination:{bagId:"bag",x:0,y:0}});
  assert.deepEqual({ok:stale.ok,status:stale.status,code:stale.code},{ok:false,status:409,code:"stale_projection"});
  const missing=authority.move(presence.sessionId,{expectedProjectionRevision:1,itemInstanceId:"item",destination:{bagId:"bag",x:0,y:0}});
  assert.deepEqual({ok:missing.ok,status:missing.status,code:missing.code},{ok:false,status:422,code:"item_unavailable"});
});
