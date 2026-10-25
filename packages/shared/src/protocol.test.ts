import { describe, expect, it } from "vitest";
import {
  clientMessageSchema,
  serverMessageSchema,
  type ErrorMessage,
  type MatchSnapshot,
} from "./index";

const snapshot: MatchSnapshot = {
  matchId: "match-1",
  joinCode: "ABCD",
  phase: "lobby",
  hostPlayerId: "player-1",
  config: {
    mode: "ffa",
    durationSeconds: 300,
    allowManualTargeting: false,
  },
  configVersion: 0,
  players: [
    {
      id: "player-1",
      displayName: "Nova",
      color: "#5b9dff",
      isHost: true,
      ready: false,
      connected: true,
      joinedAt: 1,
      role: null,
      status: "alive",
      health: 100,
      maxHealth: 100,
      shield: 0,
      weaponId: null,
      ammo: 0,
      spawnLockedUntil: 0,
      nextShotAt: 0,
      reloadCompleteAt: null,
      respawnAt: null,
      score: 0,
      kills: 0,
      deaths: 0,
      markerId: "marker-123",
    },
  ],
  createdAt: 1,
  countdownEndsAt: null,
  startedAt: null,
  endsAt: null,
  finishedAt: null,
  endReason: null,
  winnerIds: [],
};

describe("client messages", () => {
  it("parses a resume request", () => {
    const result = clientMessageSchema.safeParse({
      type: "RESUME_MATCH",
      requestId: "request-123",
      matchId: "match-1",
      playerId: "player-1",
      sessionToken: "token-that-is-long-enough",
    });
    expect(result.success).toBe(true);
  });

  it("rejects messages with missing fields", () => {
    const result = clientMessageSchema.safeParse({
      type: "SET_READY",
      requestId: "request-123",
      ready: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown message types", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "DECLARE_HIT",
        requestId: "request-123",
        targetId: "player-2",
      }).success,
    ).toBe(false);
  });
});

describe("server messages", () => {
  it("accepts a valid match state snapshot", () => {
    const result = serverMessageSchema.safeParse({
      type: "MATCH_STATE",
      match: snapshot,
      serverTime: 1_700_000_000_000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid error message", () => {
    const error: ErrorMessage = {
      type: "ERROR",
      code: "NOT_HOST",
      message: "Only the host can start the match.",
    };
    expect(serverMessageSchema.safeParse(error).success).toBe(true);
  });

  it("rejects an invalid phase", () => {
    expect(
      serverMessageSchema.safeParse({
        type: "MATCH_STATE",
        match: { ...snapshot, phase: "paused" },
        serverTime: 1,
      }).success,
    ).toBe(false);
  });
});
