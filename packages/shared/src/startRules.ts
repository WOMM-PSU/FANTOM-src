import { isModePlayable, MIN_PLAYERS } from "./constants";
import type { StartBlockReason } from "./constants";
import type { MatchConfig, MatchPhase } from "./types";

export type StartParticipant = {
  id: string;
  ready: boolean;
  connected: boolean;
};

export type StartEvaluationInput = {
  actorId: string;
  hostPlayerId: string;
  phase: MatchPhase;
  config: MatchConfig;
  configVersion: number;
  requestedConfigVersion: number;
  players: StartParticipant[];
};

export type StartEvaluation =
  | { ok: true }
  | { ok: false; reason: StartBlockReason };

/**
 * Single source of truth for whether a match may begin. The server enforces
 * this result; the client uses it only to explain a disabled Start button.
 */
export function evaluateStart(
  input: StartEvaluationInput,
): StartEvaluation {
  if (input.phase !== "lobby") {
    return { ok: false, reason: "WRONG_PHASE" };
  }
  if (input.actorId !== input.hostPlayerId) {
    return { ok: false, reason: "NOT_HOST" };
  }
  if (!isModePlayable(input.config.mode)) {
    return { ok: false, reason: "MODE_UNAVAILABLE" };
  }
  if (input.requestedConfigVersion !== input.configVersion) {
    return { ok: false, reason: "STALE_CONFIG" };
  }
  if (input.players.length < MIN_PLAYERS) {
    return { ok: false, reason: "NOT_ENOUGH_PLAYERS" };
  }
  if (input.players.some((player) => !player.connected)) {
    return { ok: false, reason: "PLAYERS_DISCONNECTED" };
  }
  if (input.players.some((player) => !player.ready)) {
    return { ok: false, reason: "PLAYERS_NOT_READY" };
  }
  return { ok: true };
}
