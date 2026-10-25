import { randomUUID } from "node:crypto";
import type { MatchStateMessage } from "@fantom/shared";
import type { RunningGameServer } from "../src/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TestClient,
  createTestMatch,
  joinTestMatch,
  startTestServer,
} from "./helpers";

let server: RunningGameServer;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startTestServer({
    maxPlayers: 2,
    countdownMs: 40,
    spawnProtectionMs: 40,
    respawnMs: 300,
    tickIntervalMs: 20,
  });
});

afterEach(async () => {
  for (const client of clients.splice(0)) {
    await client.close().catch(() => undefined);
  }
  await server.close();
});

async function startTwoPlayerMatch(): Promise<{
  host: TestClient;
  guest: TestClient;
  hostSession: Awaited<ReturnType<typeof createTestMatch>>;
  guestSession: Awaited<ReturnType<typeof joinTestMatch>>;
  active: MatchStateMessage;
}> {
  const hostSession = await createTestMatch(server, "Nova");
  const guestSession = await joinTestMatch(
    server,
    hostSession.joinCode,
    "Echo",
  );
  const host = (await TestClient.resume(server, hostSession)).client;
  const guest = (await TestClient.resume(server, guestSession)).client;
  clients.push(host, guest);

  const synced = await host.waitFor(
    "MATCH_STATE",
    (message) =>
      message.match.players.length === 2 &&
      message.match.players.every((player) => player.connected),
  );

  host.send({
    type: "SET_READY",
    requestId: randomUUID(),
    ready: true,
    configVersion: synced.match.configVersion,
  });
  guest.send({
    type: "SET_READY",
    requestId: randomUUID(),
    ready: true,
    configVersion: synced.match.configVersion,
  });
  await host.waitFor("MATCH_STATE", (message) =>
    message.match.players.every((player) => player.ready),
  );
  host.send({
    type: "START_MATCH",
    requestId: randomUUID(),
    configVersion: synced.match.configVersion,
  });

  const active = await host.waitFor(
    "MATCH_STATE",
    (message) => message.match.phase === "active",
    2_000,
  );
  await guest.waitFor(
    "MATCH_STATE",
    (message) => message.match.phase === "active",
    2_000,
  );
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, (active.match.players[0]?.spawnLockedUntil ?? 0) - Date.now() + 30)),
  );

  return { host, guest, hostSession, guestSession, active };
}

function evidenceFor(markerId: string, offsetX = 0) {
  return {
    source: "camera" as const,
    markerId,
    offsetX,
    offsetY: 0,
    confidence: 0.95,
    distanceMeters: 5,
    capturedAt: Date.now(),
    orientation: { alpha: 90, beta: 20, gamma: 0, absolute: true },
  };
}

describe("combat over a real websocket", () => {
  it("accepts one valid shot, synchronizes damage, and preserves ammo after reconnect", async () => {
    const { host, guest, hostSession, active } = await startTwoPlayerMatch();
    const target = active.match.players.find(
      (player) => player.displayName === "Echo",
    );
    expect(target).toBeDefined();

    host.send({
      type: "REQUEST_SHOT",
      requestId: randomUUID(),
      targetPlayerId: target?.id ?? "",
      evidence: evidenceFor(target?.markerId ?? ""),
    });

    const accepted = await host.waitFor("SHOT_ACCEPTED");
    expect(accepted.damage).toBe(25);
    const damage = await guest.waitFor("DAMAGE_EVENT");
    expect(damage.victimId).toBe(target?.id);
    expect(damage.healthDamage).toBe(25);

    const damaged = await guest.waitFor(
      "MATCH_STATE",
      (message) =>
        message.match.players.find((player) => player.id === target?.id)
          ?.health === 75,
    );
    expect(
      damaged.match.players.find((player) => player.id === target?.id)?.health,
    ).toBe(75);

    await new Promise((resolve) => setTimeout(resolve, 550));
    host.send({
      type: "REQUEST_SHOT",
      requestId: randomUUID(),
      targetPlayerId: target?.id ?? "",
      evidence: evidenceFor(target?.markerId ?? "", 0.7),
    });
    const rejected = await host.waitFor("SHOT_REJECTED");
    expect(rejected.reason).toBe("AIM_INVALID");

    const beforeReconnect = await host.waitFor(
      "MATCH_STATE",
      (message) =>
        message.match.players.find(
          (player) => player.id === hostSession.playerId,
        )?.ammo === 11,
    );
    expect(
      beforeReconnect.match.players.find(
        (player) => player.id === hostSession.playerId,
      )?.ammo,
    ).toBe(11);

    await host.close();
    const resumed = await TestClient.resume(server, hostSession);
    clients.push(resumed.client);
    const hostAfter = resumed.welcome.match.players.find(
      (player) => player.id === hostSession.playerId,
    );
    expect(hostAfter?.ammo).toBe(11);
  });
});
