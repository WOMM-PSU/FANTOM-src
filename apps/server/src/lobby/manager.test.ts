import type { ServerMessage } from "@fantom/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameError } from "../errors";
import {
  MatchManager,
  type ConnectionHandle,
  type MatchRoom,
  type PlayerRecord,
} from "./manager";

class FakeConnection implements ConnectionHandle {
  readonly messages: ServerMessage[] = [];
  closed: { code?: number; reason?: string } | null = null;

  send(message: ServerMessage): void {
    this.messages.push(message);
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
  }
}

type Fixture = {
  manager: MatchManager;
  room: MatchRoom;
  host: PlayerRecord;
  guest: PlayerRecord;
  hostConnection: FakeConnection;
  guestConnection: FakeConnection;
  token: { host: string; guest: string };
};

function createFixture(options: { countdownMs?: number } = {}): Fixture {
  const manager = new MatchManager({
    countdownMs: options.countdownMs ?? 5_000,
    reconnectGraceMs: 60_000,
  });
  const host = manager.createMatch("Host");
  const guest = manager.joinMatch(host.room.joinCode, "Guest");
  const hostConnection = new FakeConnection();
  const guestConnection = new FakeConnection();

  manager.resume(
    host.room.id,
    host.player.id,
    host.sessionToken,
    hostConnection,
  );
  manager.resume(
    guest.room.id,
    guest.player.id,
    guest.sessionToken,
    guestConnection,
  );

  return {
    manager,
    room: host.room,
    host: host.player,
    guest: guest.player,
    hostConnection,
    guestConnection,
    token: {
      host: host.sessionToken,
      guest: guest.sessionToken,
    },
  };
}

function configureShortMatch(fixture: Fixture): void {
  fixture.manager.updateConfig(fixture.room, fixture.host, {
    mode: "ffa",
    durationSeconds: 60,
    allowManualTargeting: false,
  });
  fixture.manager.setReady(
    fixture.room,
    fixture.host,
    true,
    fixture.room.configVersion,
  );
  fixture.manager.setReady(
    fixture.room,
    fixture.guest,
    true,
    fixture.room.configVersion,
  );
}

function expectGameError(fn: () => void, code: string): void {
  try {
    fn();
    expect.unreachable(`Expected GameError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(GameError);
    expect((error as GameError).code).toBe(code);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MatchManager lifecycle", () => {
  it("counts down, initializes players, and finishes on the server timer", () => {
    const fixture = createFixture();
    configureShortMatch(fixture);

    fixture.manager.startMatch(
      fixture.room,
      fixture.host,
      fixture.room.configVersion,
    );

    expect(fixture.room.phase).toBe("countdown");
    expect(fixture.room.countdownEndsAt).toBe(Date.now() + 5_000);

    vi.advanceTimersByTime(5_000);

    expect(fixture.room.phase).toBe("active");
    expect(fixture.room.startedAt).toBe(Date.now());
    expect(fixture.room.endsAt).toBe(Date.now() + 60_000);

    for (const player of [fixture.host, fixture.guest]) {
      expect(player.status).toBe("alive");
      expect(player.health).toBe(100);
      expect(player.maxHealth).toBe(100);
      expect(player.weaponId).toBe("pulse");
      expect(player.ammo).toBe(12);
      expect(player.spawnLockedUntil).toBe(Date.now() + 5_000);
    }

    vi.advanceTimersByTime(60_000);

    expect(fixture.room.phase).toBe("finished");
    expect(fixture.room.endReason).toBe("timer_expired");
    expect(fixture.room.finishedAt).toBe(Date.now());

    const phases = fixture.guestConnection.messages
      .filter((message) => message.type === "MATCH_STATE")
      .map((message) => message.match.phase);
    expect(phases).toContain("countdown");
    expect(phases).toContain("active");
    expect(phases).toContain("finished");
  });

  it("requires every player to be connected and ready", () => {
    const fixture = createFixture();

    expectGameError(
      () =>
        fixture.manager.startMatch(
          fixture.room,
          fixture.guest,
          fixture.room.configVersion,
        ),
      "NOT_HOST",
    );

    expectGameError(
      () =>
        fixture.manager.startMatch(
          fixture.room,
          fixture.host,
          fixture.room.configVersion,
        ),
      "PLAYERS_NOT_READY",
    );

    fixture.manager.setReady(
      fixture.room,
      fixture.host,
      true,
      fixture.room.configVersion,
    );

    fixture.manager.disconnect(
      fixture.room,
      fixture.guest,
      fixture.guestConnection,
    );

    expectGameError(
      () =>
        fixture.manager.startMatch(
          fixture.room,
          fixture.host,
          fixture.room.configVersion,
        ),
      "PLAYERS_DISCONNECTED",
    );
  });

  it("invalidates ready states when the host changes settings", () => {
    const fixture = createFixture();

    expectGameError(
      () =>
        fixture.manager.updateConfig(fixture.room, fixture.guest, {
          mode: "ffa",
          durationSeconds: 120,
          allowManualTargeting: false,
        }),
      "NOT_HOST",
    );

    fixture.manager.setReady(
      fixture.room,
      fixture.host,
      true,
      fixture.room.configVersion,
    );

    fixture.manager.updateConfig(fixture.room, fixture.host, {
      mode: "ffa",
      durationSeconds: 120,
      allowManualTargeting: false,
    });

    expect(fixture.room.configVersion).toBe(1);
    expect(fixture.host.ready).toBe(false);
    expect(fixture.guest.ready).toBe(false);

    expectGameError(
      () =>
        fixture.manager.startMatch(
          fixture.room,
          fixture.host,
          fixture.room.configVersion,
        ),
      "PLAYERS_NOT_READY",
    );

    fixture.manager.setReady(
      fixture.room,
      fixture.host,
      true,
      fixture.room.configVersion,
    );
    fixture.manager.setReady(
      fixture.room,
      fixture.guest,
      true,
      fixture.room.configVersion,
    );

    expectGameError(
      () =>
        fixture.manager.startMatch(
          fixture.room,
          fixture.host,
          fixture.room.configVersion - 1,
        ),
      "STALE_CONFIG",
    );
  });

  it("rejects unavailable game modes", () => {
    const fixture = createFixture();
    expectGameError(
      () =>
        fixture.manager.updateConfig(fixture.room, fixture.host, {
          mode: "assassin",
          durationSeconds: 300,
          allowManualTargeting: false,
        }),
      "MODE_UNAVAILABLE",
    );
  });

  it("transfers host after the host's reconnect grace expires", () => {
    const fixture = createFixture();

    fixture.manager.disconnect(
      fixture.room,
      fixture.host,
      fixture.hostConnection,
    );

    expect(fixture.room.players.get(fixture.host.id)?.connected).toBe(false);

    vi.advanceTimersByTime(60_000);

    expect(fixture.room.players.has(fixture.host.id)).toBe(false);
    expect(fixture.room.hostPlayerId).toBe(fixture.guest.id);
    expect(fixture.guest.isHost).toBe(true);
  });

  it("rejects an invalid session token", () => {
    const fixture = createFixture();
    const otherConnection = new FakeConnection();

    expectGameError(
      () =>
        fixture.manager.resume(
          fixture.room.id,
          fixture.host.id,
          "not-the-right-token",
          otherConnection,
        ),
      "INVALID_SESSION",
    );
  });

  it("closes the old socket when a session is resumed elsewhere", () => {
    const fixture = createFixture();
    const secondConnection = new FakeConnection();

    fixture.manager.resume(
      fixture.room.id,
      fixture.host.id,
      fixture.token.host,
      secondConnection,
    );

    expect(fixture.hostConnection.closed?.code).toBe(4001);
    expect(fixture.host.connected).toBe(true);

    fixture.manager.disconnect(
      fixture.room,
      fixture.host,
      fixture.hostConnection,
    );
    expect(fixture.host.connected).toBe(true);
  });
});
