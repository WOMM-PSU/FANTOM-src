"use client";

import type { MatchSnapshot } from "@fantom/shared";
import { PlayerList } from "./PlayerList";

type Props = {
  match: MatchSnapshot;
  currentPlayerId: string;
  onLeave: () => void;
};

export function FinishedPanel({
  match,
  currentPlayerId,
  onLeave,
}: Props) {
  return (
    <div className="phase-stack">
      <div className="center-copy">
        <p className="eyebrow">Server ended the match</p>
        <h1 className="result-title">Match over</h1>
        <p className="lede">
          {match.endReason === "timer_expired"
            ? "The match timer expired."
            : "The match has ended."}
        </p>
      </div>

      <section className="card" aria-labelledby="results-title">
        <div className="section-heading">
          <h2 className="section-title" id="results-title">
            Final state
          </h2>
          <span className="section-kicker">No score recorded</span>
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
          This milestone ends matches on the timer only. Damage, eliminations,
          scoring, and winners arrive with the combat phase.
        </div>
      </div>

      <button
        type="button"
        className="btn btn-lg btn-primary"
        onClick={onLeave}
      >
        Back to home
      </button>
    </div>
  );
}
