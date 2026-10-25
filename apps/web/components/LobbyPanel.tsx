"use client";

import {
  GAME_MODE_LABELS,
  MAX_PLAYERS,
  START_BLOCK_MESSAGES,
  evaluateStart,
  type MatchConfig,
  type MatchSnapshot,
} from "@fantom/shared";
import type { ConnectionStatus } from "@/hooks/useMatchConnection";
import { LobbySettings } from "./LobbySettings";
import { MatchCodeCard } from "./MatchCodeCard";
import { PlayerList } from "./PlayerList";

type Props = {
  match: MatchSnapshot;
  currentPlayerId: string;
  status: ConnectionStatus;
  onReady: (ready: boolean) => void;
  onUpdateConfig: (config: MatchConfig) => void;
  onStart: () => void;
  onLeave: () => void;
};

export function LobbyPanel({
  match,
  currentPlayerId,
  status,
  onReady,
  onUpdateConfig,
  onStart,
  onLeave,
}: Props) {
  const me = match.players.find(
    (player) => player.id === currentPlayerId,
  );
  const isHost = match.hostPlayerId === currentPlayerId;
  const connected = status === "open";

  const startCheck = evaluateStart({
    actorId: match.hostPlayerId,
    hostPlayerId: match.hostPlayerId,
    phase: match.phase,
    config: match.config,
    configVersion: match.configVersion,
    requestedConfigVersion: match.configVersion,
    players: match.players,
  });
  const startHint = startCheck.ok
    ? "Everyone is ready."
    : START_BLOCK_MESSAGES[startCheck.reason];

  return (
    <div className="phase-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Squad lobby · {GAME_MODE_LABELS[match.config.mode]}</p>
          <h1 className="panel-title">
            {isHost ? "Build your squad" : "Standing by"}
          </h1>
        </div>
        <span className="count-chip">
          {match.players.length}/{MAX_PLAYERS} linked
        </span>
      </div>

      <MatchCodeCard joinCode={match.joinCode} />

      <section className="card" aria-labelledby="players-title">
        <div className="section-heading">
          <h2 className="section-title" id="players-title">
            Squad roster
          </h2>
          <span className="section-kicker">Ready check</span>
        </div>
        <PlayerList
          players={match.players}
          currentPlayerId={currentPlayerId}
          phase={match.phase}
        />
      </section>

      {isHost ? (
        <LobbySettings
          config={match.config}
          disabled={!connected}
          onChange={onUpdateConfig}
        />
      ) : null}

      <div className="lobby-actions">
        <button
          type="button"
          className={`btn btn-lg ${me?.ready ? "btn-secondary" : "btn-primary"}`}
          onClick={() => onReady(!(me?.ready ?? false))}
          disabled={!connected || !me}
          aria-pressed={me?.ready ?? false}
        >
          {me?.ready ? "Stand down" : "Ready up"}
        </button>

        {isHost ? (
          <>
            <button
              type="button"
              className="btn btn-lg btn-secondary"
              onClick={onStart}
              disabled={!connected || !startCheck.ok}
            >
              Deploy squad
            </button>
            <p className="action-hint" aria-live="polite">
              {startHint}
            </p>
          </>
        ) : (
          <p className="action-hint" aria-live="polite">
            {startCheck.ok
              ? "Waiting for the host to start the match."
              : startHint}
          </p>
        )}

        <p className="safety-note">
          <span aria-hidden="true">◎</span>
          Play in an open area away from roads and traffic. Never run while
          looking at your phone.
        </p>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={onLeave}
        >
          Leave match
        </button>
      </div>
    </div>
  );
}
