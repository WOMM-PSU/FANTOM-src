import {
  PLAYER_STATUS_LABELS,
  type MatchPhase,
  type MatchPlayerSnapshot,
} from "@fantom/shared";

type Props = {
  players: MatchPlayerSnapshot[];
  currentPlayerId: string;
  phase: MatchPhase;
};

export function PlayerList({ players, currentPlayerId, phase }: Props) {
  return (
    <ul className="player-list" aria-label="Players in this match">
      {players.map((player) => {
        const isYou = player.id === currentPlayerId;
        const isLobby = phase === "lobby" || phase === "countdown";

        return (
          <li
            className={`player-row${player.connected ? "" : " player-row-offline"}`}
            key={player.id}
          >
            <span
              className="player-dot"
              style={{ backgroundColor: player.color }}
              aria-hidden="true"
            />
            <span className="player-name">
              {player.displayName}
              {isYou ? <span className="player-you"> (you)</span> : null}
            </span>
            <span className="player-badges">
              {player.isHost ? (
                <span className="badge badge-host">Host</span>
              ) : null}
              {!player.connected ? (
                <span className="badge badge-offline">Reconnecting</span>
              ) : isLobby ? (
                <span
                  className={`badge${player.ready ? " badge-ready" : ""}`}
                >
                  {player.ready ? "Ready" : "Waiting"}
                </span>
              ) : (
                <>
                  <span className="badge badge-status">
                    {PLAYER_STATUS_LABELS[player.status]}
                  </span>
                  <span className="player-health">
                    {player.health} HP
                  </span>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
