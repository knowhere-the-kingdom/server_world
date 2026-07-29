import type { LocalPlayerPresence } from "./local-admission.js";

type InventoryItem = { instanceId:string; definitionId:string; containerId:string; x:number; y:number; quantity:number };
type State = { presence:LocalPlayerPresence; revision:number; items:InventoryItem[] };
export type InventoryMove = Readonly<{ expectedProjectionRevision:number; itemInstanceId:string; destination:Record<string,unknown> }>;

export function createWorldHudAuthority() {
  const states = new Map<string,State>();
  return Object.freeze({
    admit(presence:LocalPlayerPresence) { states.set(presence.sessionId,{presence,revision:1,items:[]}); },
    bootstrap(sessionId:string) { const state=states.get(sessionId); return state ? { schemaVersion:1,worldSessionId:state.presence.sessionId,worldId:state.presence.worldId,characterId:state.presence.characterId,leaseExpiresAt:state.presence.expiresAt.toISOString(),serverSnapshot:{contentRevision:state.revision,contentHash:`world:${state.presence.worldId}:${state.revision}`} } : null; },
    hud(sessionId:string) { const state=states.get(sessionId); return state ? { schemaVersion:2,projectionRevision:state.revision,source:"gamemaster",meters:{health:{current:100,max:100},spirit:{current:80,max:100}},inventory:{definitions:[],instances:state.items,placements:state.items.map((item)=>({instanceId:item.instanceId,containerId:item.containerId,x:item.x,y:item.y}))},equipment:[],actionSlots:[],abilities:[],map:{markers:[]},logs:[] } : null; },
    move(sessionId:string, command:InventoryMove) { const state=states.get(sessionId); if(!state)return {ok:false,status:401,code:"world_session_unavailable"}; if(!Number.isInteger(command.expectedProjectionRevision)||command.expectedProjectionRevision!==state.revision)return {ok:false,status:409,code:"stale_projection",projection:this.hud(sessionId)}; const item=state.items.find((candidate)=>candidate.instanceId===command.itemInstanceId); if(!item)return {ok:false,status:422,code:"item_unavailable",projection:this.hud(sessionId)}; const destination=command.destination??{};const x=Number(destination.x),y=Number(destination.y);if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0)return {ok:false,status:422,code:"invalid_placement",projection:this.hud(sessionId)}; item.containerId=String(destination.bagId??destination.slot??item.containerId);item.x=x;item.y=y;state.revision+=1;return {ok:true,projection:this.hud(sessionId)}; },
    revoke(sessionId:string){states.delete(sessionId);}
  });
}
export type WorldHudAuthority = ReturnType<typeof createWorldHudAuthority>;
