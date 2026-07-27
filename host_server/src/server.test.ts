import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { GAME_SERVER_PROTOCOL_VERSION, GAME_SERVER_ROUTES, GAME_SERVER_SERVICE, type GameServerHealth } from "./protocol.js";
import { createHostServer } from "./server.js";

test("host server exposes truthful health without claiming world readiness", async () => {
  const server = createHostServer({
    host: "127.0.0.1",
    port: 0,
    buildVersion: "test",
    allowedOrigins: new Set(["http://localhost:3000"]),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}${GAME_SERVER_ROUTES.health}`);
    const health = (await response.json()) as GameServerHealth;
    assert.equal(response.status, 200);
    assert.equal(health.service, GAME_SERVER_SERVICE);
    assert.equal(health.protocolVersion, GAME_SERVER_PROTOCOL_VERSION);
    assert.equal(health.readyForWorldConnections, false);
  } finally {
    server.close();
    await once(server, "close");
  }
});
