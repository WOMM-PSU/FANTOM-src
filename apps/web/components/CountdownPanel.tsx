"use client";

import { GAME_MODE_LABELS, type MatchSnapshot } from "@fantom/shared";
import type { ConnectionStatus, UiError } from "@/hooks/useMatchConnection";
import { useNow } from "@/hooks/useNow";
import { countdownNumber } from "@/lib/format";
import { ConnectionNotice } from "./ConnectionNotice";

type Props = {
  match: MatchSnapshot;
  clockOffset: number;
  status: ConnectionStatus;
  error: UiError | null;
  onRetry: () => void;
  onDismissError: () => void;
  onLeave: () => void;
};

export function CountdownPanel({
  match,
  clockOffset,
  status,
  error,
  onRetry,
  onDismissError,
  onLeave,
}: Props) {
  const now = useNow(120);
  const serverNow = now + clockOffset;
  const remaining = Math.max(
    0,
    (match.countdownEndsAt ?? serverNow) - serverNow,
  );

  return (
    <main className="cd-screen">
      <div className="cd-grid" aria-hidden="true" />
      <div className="cd-glow" aria-hidden="true" />
      <div className="cd-scan" aria-hidden="true" />

      <header className="cd-top">
        <span className="cd-brand">FANTOM</span>
        <span className="hud-mode">{GAME_MODE_LABELS[match.config.mode]}</span>
        <span className="cd-code">CODE {match.joinCode}</span>
      </header>

      <ConnectionNotice
        status={status}
        error={error}
        onRetry={onRetry}
        onDismiss={onDismissError}
      />

      <section className="cd-stage">
        <p className="cd-kicker">MATCH GOES LIVE IN</p>
        <div
          className="cd-number"
          aria-live="assertive"
          aria-label={`Match starts in ${countdownNumber(remaining)} seconds`}
        >
          <span className="cd-ring" aria-hidden="true" />
          {countdownNumber(remaining)}
        </div>
        <p className="cd-hint">
          Find your footing. Hold your phone securely and keep the camera
          pointed at a safe, open area.
        </p>

        <ul className="cd-roster" aria-label="Players in this match">
          {match.players.map((player) => (
            <li key={player.id} className="cd-player">
              <span
                className="cd-player-dot"
                style={{ backgroundColor: player.color }}
                aria-hidden="true"
              />
              <span className="cd-player-name">{player.displayName}</span>
              <span className="cd-player-state">
                {player.connected ? "READY" : "LINKING"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="cd-foot">
        <p className="cd-safety">
          <span aria-hidden="true">◎</span> STAY OFF ROADS AND STAIRS · DO NOT RUN
          WHILE LOOKING AT YOUR SCREEN
        </p>
        <button type="button" className="cd-leave" onClick={onLeave}>
          LEAVE MATCH
        </button>
      </footer>
    </main>
  );
}
