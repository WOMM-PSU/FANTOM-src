import { randomUUID } from "node:crypto";
import type { MatchSessionResponse } from "@fantom/shared";
import type { RunningGameServer } from "../src/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TestClient,
  apiErrorCode,
  createTestMatch,
  joinTestMatch,
  postJson,
  startTestServer,
} from "./helpers";

let server: RunningGameServer;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startTestServer({ maxPlayers: 3 });
});

afterEach(async () => {
  for (const client of clients.splice(0)) {
    await client.close().catch(() => undefined);
  }
  await server.close();
});

describe("match creation and joining", () => {
  it("returns health and CORS headers", async () => {
    const health = await fetch(
      `http://127.0.0.1:${server.port}/healthz`,
    );
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });

    const created = await postJson(server, "/api/matches", {
      requestId: randomUUID(),
      displayName: "Nova",
    });
    expect(created.status).toBe(201);
    expect(created.headers.get("access-control-allow-origin")).toBe("*");
    expect(created.headers.get("cache-control")).toBe("no-store");
  });

  it("is idempotent for repeated create and join request ids", async () => {
    const createRequestId = randomUUID();
    const first = await postJson(server, "/api/matches", {
      requestId: createRequestId,
      displayName: "Nova",
    });
    const second = await postJson(server, "/api/matches", {
      requestId: createRequestId,
      displayName: "Nova",
    });

    const firstSession = first.body as MatchSessionResponse;
    const secondSession = second.body as MatchSessionResponse;
    expect(secondSession.matchId).toBe(firstSession.matchId);
    expect(secondSession.playerId).toBe(firstSession.playerId);
    expect(secondSession.sessionToken).toBe(firstSession.sessionToken);

    const joinRequestId = randomUUID();
    const joinFirst = await postJson(
      server,
      `/api/matches/${firstSession.joinCode}/join`,
      { requestId: joinRequestId, displayName: "Echo" },
    );
    const joinSecond = await postJson(
      server,
      `/api/matches/${firstSession.joinCode}/join`,
      { requestId: joinRequestId, displayName: "Echo" },
    );

    expect(joinFirst.status).toBe(200);
    expect(joinSecond.status).toBe(200);
    const guest = joinFirst.body as MatchSessionResponse;
    const guestRetry = joinSecond.body as MatchSessionResponse;
    expect(guestRetry.playerId).toBe(guest.playerId);
    expect(guestRetry.match.players).toHaveLength(2);
  });

  it("rejects unknown codes, duplicate names, invalid input, and full matches", async () => {
    const host = await createTestMatch(server, "Nova");

    const unknown = await postJson(
      server,
      "/api/matches/ZZZZ/join",
      { requestId: randomUUID(), displayName: "Echo" },
    );
    expect(unknown.status).toBe(404);
    expect(apiErrorCode(unknown)).toBe("MATCH_NOT_FOUND");

    const duplicate = await postJson(
      server,
      `/api/matches/${host.joinCode}/join`,
      { requestId: randomUUID(), displayName: "nova" },
    );
    expect(duplicate.status).toBe(409);
    expect(apiErrorCode(duplicate)).toBe("DISPLAY_NAME_TAKEN");

    const invalid = await postJson(
      server,
      `/api/matches/${host.joinCode}/join`,
      { requestId: randomUUID(), displayName: "   " },
    );
    expect(invalid.status).toBe(400);
    expect(apiErrorCode(invalid)).toBe("INVALID_MESSAGE");

    await joinTestMatch(server, host.joinCode, "Echo");
    await joinTestMatch(server, host.joinCode, "Kilo");

    const full = await postJson(
      server,
      `/api/matches/${host.joinCode}/join`,
      { requestId: randomUUID(), displayName: "Lima" },
    );
    expect(full.status).toBe(409);
    expect(apiErrorCode(full)).toBe("MATCH_FULL");
  });

  it("does not allow new players after the match has started", async () => {
    const hostSession = await createTestMatch(server, "Nova");
    const guestSession = await joinTestMatch(
      server,
      hostSession.joinCode,
      "Echo",
    );

    const host = await TestClient.resume(server, hostSession);
    const guest = await TestClient.resume(server, guestSession);
    clients.push(host.client, guest.client);

    const synced = await host.client.waitFor(
      "MATCH_STATE",
      (message) => message.match.players.length === 2,
    );

    host.client.send({
      type: "SET_READY",
      requestId: randomUUID(),
      ready: true,
      configVersion: synced.match.configVersion,
    });
    guest.client.send({
      type: "SET_READY",
      requestId: randomUUID(),
      ready: true,
      configVersion: synced.match.configVersion,
    });
    await host.client.waitFor("MATCH_STATE", (message) =>
      message.match.players.every((player) => player.ready),
    );

    host.client.send({
      type: "START_MATCH",
      requestId: randomUUID(),
      configVersion: synced.match.configVersion,
    });
    await host.client.waitFor(
      "MATCH_STATE",
      (message) => message.match.phase === "active",
      2_000,
    );

    const lateJoin = await postJson(
      server,
      `/api/matches/${hostSession.joinCode}/join`,
      { requestId: randomUUID(), displayName: "Kilo" },
    );
    expect(lateJoin.status).toBe(409);
    expect(apiErrorCode(lateJoin)).toBe("MATCH_NOT_JOINABLE");
  });
});
