import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_CONFIG } from "./config";
import type { MatchConfig } from "./types";
import {
  evaluateStart,
  type StartEvaluationInput,
  type StartParticipant,
} from "./startRules";

function players(
  overrides: Partial<StartParticipant>[] = [],
): StartParticipant[] {
  const base: StartParticipant[] = [
    { id: "host", ready: true, connected: true },
    { id: "guest", ready: true, connected: true },
  ];
  return base.map((player, index) => ({
    ...player,
    ...(overrides[index] ?? {}),
  }));
}

function input(
  overrides: Partial<StartEvaluationInput> = {},
): StartEvaluationInput {
  return {
    actorId: "host",
    hostPlayerId: "host",
    phase: "lobby",
    config: DEFAULT_MATCH_CONFIG,
    configVersion: 3,
    requestedConfigVersion: 3,
    players: players(),
    ...overrides,
  };
}

describe("evaluateStart", () => {
  it("allows the host to start a valid lobby", () => {
    expect(evaluateStart(input())).toEqual({ ok: true });
  });

  it("rejects non-host players", () => {
    expect(evaluateStart(input({ actorId: "guest" }))).toEqual({
      ok: false,
      reason: "NOT_HOST",
    });
  });

  it("rejects invalid phases", () => {
    expect(evaluateStart(input({ phase: "countdown" }))).toEqual({
      ok: false,
      reason: "WRONG_PHASE",
    });
  });

  it("rejects unavailable modes", () => {
    const config: MatchConfig = {
      mode: "assassin",
      durationSeconds: 300,
      allowManualTargeting: false,
    };
    expect(evaluateStart(input({ config }))).toEqual({
      ok: false,
      reason: "MODE_UNAVAILABLE",
    });
  });

  it("rejects stale configuration versions", () => {
    expect(
      evaluateStart(input({ requestedConfigVersion: 2 })),
    ).toEqual({ ok: false, reason: "STALE_CONFIG" });
  });

  it("requires at least two players", () => {
    expect(
      evaluateStart(input({ players: players().slice(0, 1) })),
    ).toEqual({ ok: false, reason: "NOT_ENOUGH_PLAYERS" });
  });

  it("rejects disconnected players", () => {
    expect(
      evaluateStart(input({ players: players([{}, { connected: false }]) })),
    ).toEqual({ ok: false, reason: "PLAYERS_DISCONNECTED" });
  });

  it("rejects players who are not ready", () => {
    expect(
      evaluateStart(input({ players: players([{}, { ready: false }]) })),
    ).toEqual({ ok: false, reason: "PLAYERS_NOT_READY" });
  });
});
