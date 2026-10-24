import { randomUUID } from "node:crypto";
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
  server = await startTestServer({ maxPlayers: 2 });
});

afterEach(async () => {
  for (const client of clients.splice(0)) {
    await client.close().catch(() => undefined);
  }
  await server.close();
});

function track(client: TestClient): TestClient {
  clients.push(client);
  return client;
}

describe("lobby and match lifecycle", () => {
  it("synchronizes two clients and starts the match on the server", async () => {
    const hostSession = await createTestMatch(server, "Nova");
    const host = track((await TestClient.resume(server, hostSession)).client);

    const guestSession = await joinTestMatch(
      server,
      hostSession.joinCode,
      "Echo",
    );
    const guest = track(
      (await TestClient.resume(server, guestSession)).client,
    );

    const synced = await host.waitFor(
      "MATCH_STATE",
      (message) =>
        message.match.players.length === 2 &&
        message.match.players.every((player) => player.connected),
    );
    expect(synced.match.joinCode).toBe(hostSession.joinCode);
    expect(
      synced.match.players.map((player) => player.displayName).sort(),
    ).toEqual(["Echo", "Nova"]);
    expect(
      synced.match.players.find((player) => player.displayName === "Echo")
        ?.connected,
    ).toBe(true);

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

    const everyoneReady = await host.waitFor(
      "MATCH_STATE",
      (message) => message.match.players.every((player) => player.ready),
    );

    host.send({
      type: "START_MATCH",
      requestId: randomUUID(),
      configVersion: everyoneReady.match.configVersion,
    });

    const countdown = await host.waitFor(
      "MATCH_STATE",
      (message) => message.match.phase === "countdown",
    );
    expect(countdown.match.countdownEndsAt).not.toBeNull();

    const guestCountdown = await guest.waitFor(
      "MATCH_STATE",
      (message) => message.match.phase === "countdown",
    );
    expect(guestCountdown.match.countdownEndsAt).toBe(
      countdown.match.countdownEndsAt,
    );

    const active = await host.waitFor(
      "MATCH_STATE",
      (message) => message.match.phase === "active",
      2_000,
    );
    const guestActive = await guest.waitFor(
      "MATCH_STATE",
      (message) => message.match.phase === "active",
      2_000,
    );

    expect(active.match.endsAt).not.toBeNull();
    expect(guestActive.match.endsAt).toBe(active.match.endsAt);
    for (const player of active.match.players) {
      expect(player.status).toBe("alive");
      expect(player.health).toBe(100);
      expect(player.spawnLockedUntil).toBeGreaterThan(
        active.match.startedAt ?? 0,
      );
    }
  });

  it("enforces host-only actions and config version changes", async () => {
    const hostSession = await createTestMatch(server, "Nova");
    const host = track((await TestClient.resume(server, hostSession)).client);
    const guestSession = await joinTestMatch(
      server,
      hostSession.joinCode,
      "Echo",
    );
    const guest = track(
      (await TestClient.resume(server, guestSession)).client,
    );

    await host.waitFor(
      "MATCH_STATE",
      (message) => message.match.players.length === 2,
    );

    const startRequestId = randomUUID();
    guest.send({
      type: "START_MATCH",
      requestId: startRequestId,
      configVersion: 0,
    });
    const notHost = await guest.waitFor("ERROR");
    expect(notHost.code).toBe("NOT_HOST");
    expect(notHost.requestId).toBe(startRequestId);

    guest.send({
      type: "UPDATE_CONFIG",
      requestId: randomUUID(),
      config: { mode: "ffa", durationSeconds: 120 },
    });
    expect((await guest.waitFor("ERROR")).code).toBe("NOT_HOST");

    host.send({
      type: "SET_READY",
      requestId: randomUUID(),
      ready: true,
      configVersion: 0,
    });
    guest.send({
      type: "SET_READY",
      requestId: randomUUID(),
      ready: true,
      configVersion: 0,
    });
    await host.waitFor("MATCH_STATE", (message) =>
      message.match.players.every((player) => player.ready),
    );

    host.send({
      type: "UPDATE_CONFIG",
      requestId: randomUUID(),
      config: { mode: "ffa", durationSeconds: 120 },
    });
    const reconfigured = await host.waitFor(
      "MATCH_STATE",
      (message) => message.match.configVersion === 1,
    );
    expect(reconfigured.match.config.durationSeconds).toBe(120);
    expect(
      reconfigured.match.players.some((player) => player.ready),
    ).toBe(false);

    host.send({
      type: "START_MATCH",
      requestId: randomUUID(),
      configVersion: 0,
    });
    expect((await host.waitFor("ERROR")).code).toBe("STALE_CONFIG");

    host.send({
      type: "START_MATCH",
      requestId: randomUUID(),
      configVersion: 1,
    });
    expect((await host.waitFor("ERROR")).code).toBe("PLAYERS_NOT_READY");
  });

  it("removes a player who explicitly leaves", async () => {
    const hostSession = await createTestMatch(server, "Nova");
    const host = track((await TestClient.resume(server, hostSession)).client);
    const guestSession = await joinTestMatch(
      server,
      hostSession.joinCode,
      "Echo",
    );
    const guest = track(
      (await TestClient.resume(server, guestSession)).client,
    );

    await host.waitFor(
      "MATCH_STATE",
      (message) => message.match.players.length === 2,
    );
    await guest.leave();

    const afterLeave = await host.waitFor(
      "MATCH_STATE",
      (message) => message.match.players.length === 1,
    );
    expect(afterLeave.match.players[0]?.displayName).toBe("Nova");
  });

  it("rejects an invalid session and closes a session resumed elsewhere", async () => {
    const hostSession = await createTestMatch(server, "Nova");
    const first = track(
      (await TestClient.resume(server, hostSession)).client,
    );

    const unauthenticated = track(await TestClient.open(server));
    unauthenticated.send({
      type: "RESUME_MATCH",
      requestId: randomUUID(),
      matchId: hostSession.matchId,
      playerId: hostSession.playerId,
      sessionToken: "an-invalid-session-token-value",
    });
    expect((await unauthenticated.waitFor("ERROR")).code).toBe(
      "INVALID_SESSION",
    );

    unauthenticated.sendRaw("{not valid json");
    expect((await unauthenticated.waitFor("ERROR")).code).toBe(
      "INVALID_MESSAGE",
    );

    unauthenticated.send({
      type: "SET_READY",
      requestId: randomUUID(),
      ready: true,
      configVersion: 0,
    });
    expect((await unauthenticated.waitFor("ERROR")).code).toBe(
      "INVALID_SESSION",
    );

    const second = await TestClient.resume(server, hostSession);
    clients.push(second.client);

    const closeResult = await first.closePromise;
    expect(closeResult.code).toBe(4001);
    expect(second.welcome.playerId).toBe(hostSession.playerId);
    expect(second.welcome.match.players[0]?.connected).toBe(true);
  });
});
