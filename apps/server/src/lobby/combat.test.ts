import type { ServerMessage, ShotEvidence } from "@fantom/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MatchManager,
  type ConnectionHandle,
  type MatchRoom,
  type PlayerRecord,
} from "./manager";

class FakeConnection implements ConnectionHandle {
  readonly messages: ServerMessage[] = [];

  send(message: ServerMessage): void {
    this.messages.push(message);
  }

  close(): void {
    // No socket in this unit fixture.
  }

  last<T extends ServerMessage["type"]>(
    type: T,
  ): Extract<ServerMessage, { type: T }> | undefined {
    return this.messages
      .filter(
        (message): message is Extract<ServerMessage, { type: T }> =>
          message.type === type,
      )
      .at(-1);
  }
}

type Fixture = {
  manager: MatchManager;
  room: MatchRoom;
  host: PlayerRecord;
  guest: PlayerRecord;
  hostConnection: FakeConnection;
  guestConnection: FakeConnection;
};

function createActiveMatch(options: { allowManual?: boolean } = {}): Fixture {
  const manager = new MatchManager({
    countdownMs: 100,
    reconnectGraceMs: 60_000,
    spawnProtectionMs: 200,
    respawnMs: 1_000,
    tickIntervalMs: 50,
  });
  const hostSession = manager.createMatch("Host");
  const guestSession = manager.joinMatch(
    hostSession.room.joinCode,
    "Guest",
  );
  const hostConnection = new FakeConnection();
  const guestConnection = new FakeConnection();

  manager.resume(
    hostSession.room.id,
    hostSession.player.id,
    hostSession.sessionToken,
    hostConnection,
  );
  manager.resume(
    guestSession.room.id,
    guestSession.player.id,
    guestSession.sessionToken,
    guestConnection,
  );

  manager.updateConfig(hostSession.room, hostSession.player, {
    mode: "ffa",
    durationSeconds: 60,
    allowManualTargeting: options.allowManual ?? false,
  });
  manager.setReady(
    hostSession.room,
    hostSession.player,
    true,
    hostSession.room.configVersion,
  );
  manager.setReady(
    guestSession.room,
    guestSession.player,
    true,
    hostSession.room.configVersion,
  );
  manager.startMatch(
    hostSession.room,
    hostSession.player,
    hostSession.room.configVersion,
  );

  vi.advanceTimersByTime(100);
  vi.advanceTimersByTime(200);

  return {
    manager,
    room: hostSession.room,
    host: hostSession.player,
    guest: guestSession.player,
    hostConnection,
    guestConnection,
  };
}

function cameraEvidence(
  target: PlayerRecord,
  overrides: Partial<ShotEvidence> = {},
): ShotEvidence {
  return {
    source: "camera",
    markerId: target.markerId,
    offsetX: 0.02,
    offsetY: -0.01,
    confidence: 0.95,
    distanceMeters: 8,
    capturedAt: Date.now(),
    orientation: { alpha: 90, beta: 20, gamma: 0, absolute: true },
    ...overrides,
  };
}

function manualEvidence(target: PlayerRecord): ShotEvidence {
  return {
    source: "manual",
    markerId: null,
    offsetX: 0,
    offsetY: 0,
    confidence: 1,
    distanceMeters: 5,
    capturedAt: Date.now(),
    orientation: null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("FFA combat", () => {
  it("starts players with a Pulse and accepts a valid camera shot", () => {
    const fixture = createActiveMatch();
    expect(fixture.host.weaponId).toBe("pulse");
    expect(fixture.host.ammo).toBe(12);

    fixture.manager.requestShot(
      fixture.room,
      fixture.host,
      fixture.guest.id,
      cameraEvidence(fixture.guest),
      "shot-1",
    );

    expect(fixture.guest.health).toBe(75);
    expect(fixture.host.ammo).toBe(11);
    expect(fixture.guestConnection.last("DAMAGE_EVENT")?.damage).toBe(25);
    expect(fixture.hostConnection.last("SHOT_ACCEPTED")?.targetId).toBe(
      fixture.guest.id,
    );
  });

  it("rejects self-targets, invalid aim, and manual shots by default", () => {
    const fixture = createActiveMatch();

    fixture.manager.requestShot(
      fixture.room,
      fixture.host,
      fixture.host.id,
      cameraEvidence(fixture.host),
      "self",
    );
    expect(fixture.hostConnection.last("SHOT_REJECTED")?.reason).toBe(
      "SELF_TARGET",
    );

    fixture.manager.requestShot(
      fixture.room,
      fixture.host,
      fixture.guest.id,
      cameraEvidence(fixture.guest, { offsetX: 0.5 }),
      "offset",
    );
    expect(fixture.hostConnection.last("SHOT_REJECTED")?.reason).toBe(
      "AIM_INVALID",
    );

    fixture.manager.requestShot(
      fixture.room,
      fixture.host,
      fixture.guest.id,
      manualEvidence(fixture.guest),
      "manual",
    );
    expect(fixture.hostConnection.last("SHOT_REJECTED")?.reason).toBe(
      "MANUAL_TARGETING_DISABLED",
    );

    expect(fixture.host.ammo).toBe(12);
    expect(fixture.guest.health).toBe(100);
  });

  it("requires motion orientation for camera shots and honors the manual flag", () => {
    const fixture = createActiveMatch({ allowManual: true });

    fixture.manager.requestShot(
      fixture.room,
      fixture.host,
      fixture.guest.id,
      cameraEvidence(fixture.guest, { orientation: null }),
      "no-orientation",
    );
    expect(fixture.hostConnection.last("SHOT_REJECTED")?.reason).toBe(
      "AIM_INVALID",
    );

    fixture.manager.requestShot(
      fixture.room,
      fixture.host,
      fixture.guest.id,
      manualEvidence(fixture.guest),
      "manual-ok",
    );
    expect(fixture.guest.health).toBe(75);
    expect(fixture.host.ammo).toBe(11);
  });

  it("enforces cooldown only after a valid shot and never charges invalid shots", () => {
    const fixture = createActiveMatch();

    fixture.manager.requestShot(
      fixture.room,
      fixture.host,
      fixture.guest.id,
      cameraEvidence(fixture.guest),
      "first",
    );
    fixture.manager.requestShot(
      fixture.room,
      fixture.host,
      fixture.guest.id,
      cameraEvidence(fixture.guest),
      "second",
    );

    expect(fixture.hostConnection.last("SHOT_REJECTED")?.reason).toBe(
      "COOLDOWN",
    );
    expect(fixture.host.ammo).toBe(11);
    expect(fixture.guest.health).toBe(75);

    vi.advanceTimersByTime(500);
    fixture.manager.requestShot(
      fixture.room,
      fixture.host,
      fixture.guest.id,
      cameraEvidence(fixture.guest),
      "third",
    );
    expect(fixture.guest.health).toBe(50);
  });

  it("absorbs damage with shield before health", () => {
    const fixture = createActiveMatch();
    fixture.guest.shield = 30;

    fixture.manager.requestShot(
      fixture.room,
      fixture.host,
      fixture.guest.id,
      cameraEvidence(fixture.guest),
      "shield",
    );

    expect(fixture.guest.shield).toBe(5);
    expect(fixture.guest.health).toBe(100);
    expect(fixture.guestConnection.last("DAMAGE_EVENT")?.shieldDamage).toBe(
      25,
    );
  });

  it("starts an automatic reload at zero ammo and rejects shots while reloading", () => {
    const fixture = createActiveMatch();
    fixture.host.ammo = 1;

    fixture.manager.requestShot(
      fixture.room,
      fixture.host,
      fixture.guest.id,
      cameraEvidence(fixture.guest),
      "last-round",
    );
    expect(fixture.host.ammo).toBe(0);
    expect(fixture.host.reloadCompleteAt).not.toBeNull();

    fixture.manager.requestShot(
      fixture.room,
      fixture.host,
      fixture.guest.id,
      cameraEvidence(fixture.guest),
      "during-reload",
    );
    expect(fixture.hostConnection.last("SHOT_REJECTED")?.reason).toBe(
      "RELOADING",
    );

    vi.advanceTimersByTime(1_200);
    expect(fixture.host.ammo).toBe(12);
    expect(fixture.host.reloadCompleteAt).toBeNull();
  });

  it("cannot fire while spawn protection is active or damage a protected target", () => {
    const manager = new MatchManager({
      countdownMs: 100,
      spawnProtectionMs: 5_000,
      tickIntervalMs: 50,
    });
    const hostSession = manager.createMatch("Host");
    const guestSession = manager.joinMatch(
      hostSession.room.joinCode,
      "Guest",
    );
    const hostConnection = new FakeConnection();
    const guestConnection = new FakeConnection();
    manager.resume(
      hostSession.room.id,
      hostSession.player.id,
      hostSession.sessionToken,
      hostConnection,
    );
    manager.resume(
      guestSession.room.id,
      guestSession.player.id,
      guestSession.sessionToken,
      guestConnection,
    );
    manager.setReady(
      hostSession.room,
      hostSession.player,
      true,
      hostSession.room.configVersion,
    );
    manager.setReady(
      guestSession.room,
      guestSession.player,
      true,
      hostSession.room.configVersion,
    );
    manager.startMatch(
      hostSession.room,
      hostSession.player,
      hostSession.room.configVersion,
    );
    vi.advanceTimersByTime(100);

    manager.requestShot(
      hostSession.room,
      hostSession.player,
      guestSession.player.id,
      cameraEvidence(guestSession.player),
      "too-early",
    );
    expect(hostConnection.last("SHOT_REJECTED")?.reason).toBe(
      "SPAWN_PROTECTED",
    );
    expect(guestSession.player.health).toBe(100);

    vi.advanceTimersByTime(5_000);
    guestSession.player.spawnLockedUntil = Date.now() + 1_000;
    manager.requestShot(
      hostSession.room,
      hostSession.player,
      guestSession.player.id,
      cameraEvidence(guestSession.player),
      "target-protected",
    );
    expect(hostConnection.last("SHOT_REJECTED")?.reason).toBe(
      "TARGET_PROTECTED",
    );
  });

  it("eliminates once, awards the killer, and respawns with protection", () => {
    const fixture = createActiveMatch();
    fixture.guest.health = 25;

    fixture.manager.requestShot(
      fixture.room,
      fixture.host,
      fixture.guest.id,
      cameraEvidence(fixture.guest),
      "eliminate",
    );

    expect(fixture.guest.status).toBe("eliminated");
    expect(fixture.guest.respawnAt).not.toBeNull();
    expect(fixture.host.score).toBe(1);
    expect(fixture.host.kills).toBe(1);
    expect(fixture.guest.deaths).toBe(1);
    expect(fixture.guestConnection.last("ELIMINATION_EVENT")?.playerId).toBe(
      fixture.guest.id,
    );

    vi.advanceTimersByTime(500);
    fixture.manager.requestShot(
      fixture.room,
      fixture.host,
      fixture.guest.id,
      cameraEvidence(fixture.guest),
      "already-dead",
    );
    expect(fixture.hostConnection.last("SHOT_REJECTED")?.reason).toBe(
      "TARGET_UNAVAILABLE",
    );

    vi.advanceTimersByTime(500);
    expect(fixture.guest.status).toBe("alive");
    expect(fixture.guest.health).toBe(100);
    expect(fixture.guest.spawnLockedUntil).toBeGreaterThan(Date.now());
  });

  it("ends on the timer with a winner and treats ties as draws", () => {
    const fixture = createActiveMatch();
    fixture.host.score = 2;
    fixture.guest.score = 1;

    vi.advanceTimersByTime(60_000);
    expect(fixture.room.phase).toBe("finished");
    expect(fixture.room.winnerIds).toEqual([fixture.host.id]);
    expect(fixture.room.finishedAt).toBe(
      (fixture.room.startedAt ?? 0) + 60_000,
    );

    const tie = createActiveMatch();
    tie.host.score = 1;
    tie.guest.score = 1;
    vi.advanceTimersByTime(60_000);
    expect(tie.room.winnerIds.sort()).toEqual(
      [tie.host.id, tie.guest.id].sort(),
    );
  });
});
