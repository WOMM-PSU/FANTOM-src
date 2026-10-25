"use client";

import Link from "next/link";
import {
  isValidJoinCode,
  normalizeDisplayName,
  normalizeJoinCode,
} from "@fantom/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, createMatch, joinMatch } from "@/lib/api";
import { loadDisplayName, saveDisplayName } from "@/lib/displayName";
import { readSession, sessionFromResponse, writeSession } from "@/lib/session";
import { Brand } from "./Brand";

export function LandingScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(loadDisplayName());
  }, []);

  function errorMessage(caught: unknown): string {
    return caught instanceof ApiError
      ? caught.message
      : "Something went wrong. Try again.";
  }

  async function createNewMatch(): Promise<void> {
    if (busy) {
      return;
    }
    const displayName = normalizeDisplayName(name);
    if (!displayName) {
      setError("Enter a call sign before creating a match.");
      return;
    }

    setBusy("create");
    setError(null);
    try {
      const response = await createMatch(displayName);
      const session = sessionFromResponse(response);
      saveDisplayName(displayName);
      if (!writeSession(session)) {
        setError(
          "This browser blocked session storage, so the match could not be kept. Allow site storage and try again.",
        );
        return;
      }
      router.push(`/match/${session.joinCode}`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function joinExistingMatch(): Promise<void> {
    if (busy) {
      return;
    }
    const displayName = normalizeDisplayName(name);
    if (!displayName) {
      setError("Enter a call sign before joining a match.");
      return;
    }

    const joinCode = normalizeJoinCode(code);
    if (!isValidJoinCode(joinCode)) {
      setError("Enter the four-character match code.");
      return;
    }

    const existing = readSession(joinCode);
    if (existing) {
      router.push(`/match/${existing.joinCode}`);
      return;
    }

    setBusy("join");
    setError(null);
    try {
      const response = await joinMatch(joinCode, displayName);
      const session = sessionFromResponse(response);
      saveDisplayName(displayName);
      if (!writeSession(session)) {
        setError(
          "This browser blocked session storage, so the match could not be kept. Allow site storage and try again.",
        );
        return;
      }
      router.push(`/match/${session.joinCode}`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="screen landing-screen">
      <div className="landing-grid" aria-hidden="true" />
      <div className="landing-glow" aria-hidden="true" />

      <div className="shell">
        <header className="landing-top">
          <Brand />
          <span className="build-chip">FIELD BUILD 0.2</span>
        </header>

        <section className="hero">
          <p className="eyebrow">WOMM-PSU · REAL-WORLD COMBAT SYSTEM</p>
          <h1 className="hero-title">
            <span className="hero-line">LASER TAG</span>
            <span className="hero-line hero-line-accent">IN THE REAL WORLD</span>
          </h1>
          <p className="lede hero-lede">
            Your phone is the blaster. Your camera is the scope. Lock a visible
            target marker, fire, and let the game server confirm every hit.
          </p>

          <div className="hero-stats">
            <span>
              <b>PHONE</b> ONLY KIT
            </span>
            <span>
              <b>SERVER</b> AUTHORITY
            </span>
            <span>
              <b>CAMERA</b> AIM LOCK
            </span>
          </div>
        </section>

        <section className="panel deploy-panel" aria-labelledby="start-title">
          <div className="panel-head">
            <span className="panel-index">01 / DEPLOY</span>
            <h2 className="panel-title" id="start-title">
              CHOOSE YOUR CALL SIGN
            </h2>
          </div>

          <label className="field">
            <span className="field-label">Call sign</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={24}
              autoComplete="nickname"
              placeholder="e.g. Nova"
              enterKeyHint="next"
            />
          </label>

          <button
            type="button"
            className="btn btn-lg btn-primary"
            onClick={() => void createNewMatch()}
            disabled={busy !== null}
          >
            {busy === "create" ? "Opening arena…" : "Create match"}
          </button>

          <div className="divider">
            <span>Or link to an existing match</span>
          </div>

          <div className="join-row">
            <label className="field">
              <span className="sr-only">Match code</span>
              <input
                className="input code-input"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                placeholder="CODE"
                aria-label="Four-character match code"
              />
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void joinExistingMatch()}
              disabled={busy !== null}
            >
              {busy === "join" ? "Linking…" : "Join"}
            </button>
          </div>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <p className="fine-print">
            No account, no install. Your session lives in this browser tab and
            ends with the match.
          </p>
        </section>

        <section className="brief-strip" aria-label="How a match runs">
          <div className="brief-step">
            <span className="brief-num">01</span>
            <div>
              <strong>FORM A SQUAD</strong>
              <p>Share the four-character code or open the QR invite.</p>
            </div>
          </div>
          <div className="brief-step">
            <span className="brief-num">02</span>
            <div>
              <strong>LOAD THE ARENA</strong>
              <p>The lobby arms everyone and syncs the match rules.</p>
            </div>
          </div>
          <div className="brief-step">
            <span className="brief-num">03</span>
            <div>
              <strong>HUNT THE SIGNAL</strong>
              <p>Camera view, HUD overlay, server-validated hits.</p>
            </div>
          </div>
        </section>

        <p className="safety-note">
          <span aria-hidden="true">◎</span>
          Play in an open, designated area away from roads, traffic, stairs, and
          other hazards. Never run while looking at your phone.
        </p>

        <footer className="page-footer">
          <span>FANTOM · WOMM-PSU</span>
          <Link className="text-link" href="https://github.com/WOMM-PSU">
            WOMM-PSU
          </Link>
        </footer>
      </div>
    </main>
  );
}
