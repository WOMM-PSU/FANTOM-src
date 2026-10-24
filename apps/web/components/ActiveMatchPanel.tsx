"use client";

import { GAME_MODE_LABELS, type MatchSnapshot } from "@fantom/shared";
import { useNow } from "@/hooks/useNow";
import { formatClock } from "@/lib/format";
import { PlayerList } from "./PlayerList";

type Props = {
  match: MatchSnapshot;
  currentPlayerId: string;
  clockOffset: number;
};

export function ActiveMatchPanel({
  match,
  currentPlayerId,
  clockOffset,
}: Props) {
  const now = useNow(500);
  const serverNow = now + clockOffset;
  const endsAt = match.endsAt ?? serverNow;
  const remaining = Math.max(0, endsAt - serverNow);

  const startedAt = match.startedAt ?? serverNow;
  const duration = Math.max(1, endsAt - startedAt);
  const elapsedFraction = Math.min(
    1,
    Math.max(0, (serverNow - startedAt) / duration),
  );

  return (
    <div className="phase-stack">
      <div className="live-header">
        <span className="live-chip">
          <span className="live-dot" aria-hidden="true" />
          Live
        </span>
        <span className="section-kicker">
          {GAME_MODE_LABELS[match.config.mode]}
        </span>
      </div>

      <div className="timer-card">
        <span className="timer-label">Time remaining</span>
        <span className="timer-value" aria-label={`${formatClock(remaining)} remaining`}>
          {formatClock(remaining)}
        </span>
        <div className="timer-track" aria-hidden="true">
          <div
            className="timer-fill"
            style={{ width: `${Math.round(elapsedFraction * 100)}%` }}
          />
        </div>
      </div>

      <section className="card" aria-labelledby="alive-title">
        <div className="section-heading">
          <h2 className="section-title" id="alive-title">
            Players
          </h2>
          <span className="section-kicker">
            {match.players.filter((player) => player.status === "alive").length}{" "}
            alive
          </span>
        </div>
        <PlayerList
          players={match.players}
          currentPlayerId={currentPlayerId}
          phase={match.phase}
        />
      </section>

      <div className="notice notice-info" role="note">
        <span className="notice-dot" aria-hidden="true" />
        <div className="notice-body">
          <strong>Lifecycle build.</strong> Combat, GPS arena boundaries, and
          camera-assisted aiming are not enabled yet. This screen reflects
          the authoritative server timer and player state only.
        </div>
      </div>

      <p className="safety-note">
        <span aria-hidden="true">◎</span>
        Stay aware of your surroundings. This build does not ask you to move
        or aim with the camera.
      </p>
    </div>
  );
}
