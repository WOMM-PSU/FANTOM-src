"use client";

import Link from "next/link";
import { normalizeDisplayName, normalizeJoinCode } from "@fantom/shared";
import { useEffect, useState } from "react";
import { ApiError, joinMatch } from "@/lib/api";
import { loadDisplayName, saveDisplayName } from "@/lib/displayName";
import { sessionFromResponse, type StoredSession } from "@/lib/session";

type Props = {
  joinCode: string;
  onJoined: (session: StoredSession) => boolean;
  notice?: string | null;
};

export function JoinMatchCard({ joinCode, onJoined, notice }: Props) {
  const code = normalizeJoinCode(joinCode);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(loadDisplayName());
  }, []);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (busy) {
      return;
    }

    const displayName = normalizeDisplayName(name);
    if (!displayName) {
      setError("Choose the call sign other players will see.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await joinMatch(code, displayName);
      const stored = sessionFromResponse(response);
      saveDisplayName(displayName);
      const accepted = onJoined(stored);
      if (!accepted) {
        setError(
          "The match was joined, but this browser could not keep the session. Allow site storage and try again.",
        );
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not join this match. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card join-card" aria-labelledby="join-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Match {code || "—"}</p>
          <h1 className="panel-title" id="join-title">
            Enter the arena
          </h1>
        </div>
      </div>

      {notice ? (
        <div className="notice notice-info" role="note">
          <div className="notice-body">{notice}</div>
        </div>
      ) : null}

      <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
        <label className="field">
          <span className="field-label">Your call sign</span>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            autoComplete="nickname"
            enterKeyHint="go"
            placeholder="e.g. Nova"
            aria-invalid={Boolean(error)}
          />
        </label>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="btn btn-lg btn-primary"
          disabled={busy}
        >
          {busy ? "Joining…" : "Join match"}
        </button>
      </form>

      <p className="fine-print">
        Join only from a safe, open area. Camera and motion access are requested
        when the match begins, and camera frames never leave your device.
      </p>

      <Link className="text-link" href="/">
        Back to home
      </Link>
    </section>
  );
}
