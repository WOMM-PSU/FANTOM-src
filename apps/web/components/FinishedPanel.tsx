"use client";

import {
  GAME_MODE_LABELS,
  type MatchPlayerSnapshot,
  type MatchSnapshot,
} from "@fantom/shared";

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
  const winners = match.players.filter((player) =>
    match.winnerIds.includes(player.id),
  );
  const winnerNames = winners.map((player) => player.displayName);
  const currentWon = winners.some((player) => player.id === currentPlayerId);
  const isDraw = match.winnerIds.length !== 1;

  const verdict = isDraw ? (winners.length > 1 ? "DRAW" : "DRAW") : currentWon ? "VICTORY" : "DEFEAT";
  const headline = isDraw
    ? "NO CLEAR WINNER"
    : currentWon
      ? "YOU OWN THE ARENA"
      : "ELIMINATED FROM THE TOP SPOT";

  const me = match.players.find((player) => player.id === currentPlayerId);
  const ranks = sortPlayers(match.players);

  return (
    <div className="result-stack">
      <section
        className={`result-banner${currentWon ? " is-victory" : isDraw ? " is-draw" : " is-defeat"}`}
      >
        <div className="result-banner-glow" aria-hidden="true" />
        <div className="result-banner-lines" aria-hidden="true" />
        <p className="result-kicker">
          MATCH OVER · {GAME_MODE_LABELS[match.config.mode]} · {match.joinCode}
        </p>
        <h1 className="result-verdict">{verdict}</h1>
        <p className="result-headline">{headline}</p>
        <p className="result-summary">
          {isDraw
            ? winners.length > 1
              ? `${winnerNames.join(" · ")} tied at the top.`
              : "No elimination was confirmed before the timer expired."
            : `${winnerNames[0]} closed the match with ${winners[0]?.score ?? 0} points.`}
        </p>
        <div className="result-stats">
          <ResultStat label="YOUR SCORE" value={me?.score ?? 0} />
          <ResultStat label="ELIMS" value={me?.kills ?? 0} />
          <ResultStat label="DEATHS" value={me?.deaths ?? 0} />
          <ResultStat
            label="RANK"
            value={
              ranks.findIndex((player) => player.id === currentPlayerId) + 1
            }
          />
        </div>
      </section>

      <section className="panel result-board" aria-labelledby="results-title">
        <div className="result-board-head">
          <h2 className="panel-title" id="results-title">
            FINAL STANDINGS
          </h2>
          <span className="section-kicker">
            {match.endReason === "timer_expired"
              ? "TIMER EXPIRED"
              : "SERVER ENDED"}
          </span>
        </div>

        <ol className="result-ranks">
          {ranks.map((player, index) => (
            <li
              key={player.id}
              className={`result-row${player.id === currentPlayerId ? " is-you" : ""}${
                player.status === "eliminated" ? " is-out" : ""
              }`}
            >
              <span className="result-pos">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span
                className="result-swatch"
                style={{ backgroundColor: player.color }}
                aria-hidden="true"
              />
              <span className="result-name">
                {player.displayName}
                {player.id === currentPlayerId ? " (YOU)" : ""}
              </span>
              <span className="result-meta">
                {player.kills}E · {player.deaths}D
              </span>
              <span className="result-score">{player.score}</span>
            </li>
          ))}
        </ol>

        <p className="result-fine">
          Every hit, elimination, and score was validated by the game server.
          Ties are draws.
        </p>
      </section>

      <button type="button" className="btn btn-lg btn-primary" onClick={onLeave}>
        BACK TO BASE
      </button>
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="result-stat">
      <span className="result-stat-value">{value}</span>
      <span className="result-stat-label">{label}</span>
    </div>
  );
}

function sortPlayers(players: MatchPlayerSnapshot[]): MatchPlayerSnapshot[] {
  return [...players].sort(
    (left, right) =>
      right.score - left.score ||
      right.kills - left.kills ||
      left.deaths - right.deaths ||
      left.joinedAt - right.joinedAt,
  );
}
