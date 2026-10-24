"use client";

import { normalizeJoinCode } from "@fantom/shared";
import { useRouter } from "next/navigation";
import { useMatchConnection } from "@/hooks/useMatchConnection";
import { ActiveMatchPanel } from "./ActiveMatchPanel";
import { Brand } from "./Brand";
import { ConnectionNotice } from "./ConnectionNotice";
import { CountdownPanel } from "./CountdownPanel";
import { FinishedPanel } from "./FinishedPanel";
import { JoinMatchCard } from "./JoinMatchCard";
import { LobbyPanel } from "./LobbyPanel";

type Props = {
  joinCode: string;
};

export function MatchScreen({ joinCode }: Props) {
  const router = useRouter();
  const connection = useMatchConnection(joinCode);

  function leaveMatch(): void {
    connection.leave();
    router.push("/");
  }

  if (!connection.sessionLoaded) {
    return (
      <MatchShell>
        <header className="match-topbar">
          <Brand compact />
        </header>
        <div className="center-stage compact-stage">
          <p className="eyebrow">Match</p>
          <h1 className="panel-title">Loading match…</h1>
        </div>
      </MatchShell>
    );
  }

  if (!connection.session) {
    const notice = connection.sessionExpired
      ? "That session expired. The server may have restarted, or you were removed from the match. Join again if it is still open."
      : connection.error?.message;

    return (
      <MatchShell>
        <header className="simple-topbar">
          <Brand />
        </header>
        <JoinMatchCard
          joinCode={joinCode}
          onJoined={connection.joinWithSession}
          notice={notice}
        />
        <Footer />
      </MatchShell>
    );
  }

  if (!connection.match) {
    return (
      <MatchShell>
        <header className="match-topbar">
          <Brand compact />
          <div className="topbar-actions">
            <span className="code-chip">{connection.session.joinCode}</span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={leaveMatch}
            >
              Leave
            </button>
          </div>
        </header>

        <ConnectionNotice
          status={connection.status}
          error={connection.error}
          onRetry={connection.retry}
          onDismiss={connection.clearError}
        />

        <div className="center-stage compact-stage">
          <p className="eyebrow">Match {connection.session.joinCode}</p>
          <h1 className="panel-title">
            {connection.status === "reconnecting"
              ? "Reconnecting…"
              : "Connecting to the match…"}
          </h1>
          <p className="lede center-copy">
            Waiting for the authoritative game state from the server.
          </p>
          <div className="skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </MatchShell>
    );
  }

  const match = connection.match;

  return (
    <MatchShell>
      <header className="match-topbar">
        <Brand compact />
        <div className="topbar-actions">
          <span className="code-chip">
            {normalizeJoinCode(match.joinCode)}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={leaveMatch}
          >
            Leave
          </button>
        </div>
      </header>

      <ConnectionNotice
        status={connection.status}
        error={connection.error}
        onRetry={connection.retry}
        onDismiss={connection.clearError}
      />

      {match.phase === "lobby" ? (
        <LobbyPanel
          match={match}
          currentPlayerId={connection.session.playerId}
          status={connection.status}
          onReady={connection.setReady}
          onUpdateConfig={connection.updateConfig}
          onStart={connection.startMatch}
          onLeave={leaveMatch}
        />
      ) : null}

      {match.phase === "countdown" ? (
        <CountdownPanel
          match={match}
          clockOffset={connection.clockOffset}
        />
      ) : null}

      {match.phase === "active" ? (
        <ActiveMatchPanel
          match={match}
          currentPlayerId={connection.session.playerId}
          clockOffset={connection.clockOffset}
        />
      ) : null}

      {match.phase === "finished" ? (
        <FinishedPanel
          match={match}
          currentPlayerId={connection.session.playerId}
          onLeave={leaveMatch}
        />
      ) : null}

      <Footer />
    </MatchShell>
  );
}

function MatchShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="screen">
      <div className="shell">{children}</div>
    </main>
  );
}

function Footer() {
  return (
    <footer className="page-footer">
      <span>FANTOM · WOMM-PSU</span>
      <span>Play safe.</span>
    </footer>
  );
}
