"use client";

import {
  CAMERA_CENTER_TOLERANCE,
  CAMERA_MIN_CONFIDENCE,
  GAME_MODE_LABELS,
  WEAPONS,
  type MatchPlayerSnapshot,
  type MatchSnapshot,
  type ShotEvidence,
  type WeaponDefinition,
} from "@fantom/shared";
import { useEffect, useRef, useState } from "react";
import { useCameraAim, buildCameraEvidence } from "@/hooks/useCameraAim";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import { useNow } from "@/hooks/useNow";
import type { ConnectionStatus, UiError } from "@/hooks/useMatchConnection";
import type {
  ReceivedDamageEvent,
  ReceivedEliminationEvent,
  ShotFeedback,
} from "@/hooks/useMatchConnection";
import { formatClock } from "@/lib/format";
import { ConnectionNotice } from "./ConnectionNotice";
import { MarkerDisplay } from "./MarkerDisplay";

type Props = {
  match: MatchSnapshot;
  currentPlayerId: string;
  clockOffset: number;
  shotFeedback: ShotFeedback | null;
  lastDamage: ReceivedDamageEvent | null;
  lastElimination: ReceivedEliminationEvent | null;
  status: ConnectionStatus;
  error: UiError | null;
  onRetry: () => void;
  onDismissError: () => void;
  onFire: (targetPlayerId: string, evidence: ShotEvidence) => void;
  onLeave: () => void;
};

type Sheet = "none" | "menu" | "scoreboard" | "targets";

type FeedTone = "good" | "danger" | "neutral";

type FeedItem = {
  key: string;
  at: number;
  tone: FeedTone;
  text: string;
};

const FEED_LIFETIME_MS = 3_600;

export function CombatHud({
  match,
  currentPlayerId,
  clockOffset,
  shotFeedback,
  lastDamage,
  lastElimination,
  status,
  error,
  onRetry,
  onDismissError,
  onFire,
  onLeave,
}: Props) {
  const now = useNow(100);
  const serverNow = now + clockOffset;
  const me = match.players.find((player) => player.id === currentPlayerId);
  const weapon: WeaponDefinition | null = me?.weaponId
    ? (WEAPONS[me.weaponId as keyof typeof WEAPONS] ?? null)
    : null;

  const [sheet, setSheet] = useState<Sheet>("none");
  const [markerOpen, setMarkerOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const sheetRef = useRef<Sheet>("none");

  const orientation = useDeviceOrientation();
  const camera = useCameraAim({
    enabled: match.phase === "active" && me?.status === "alive",
    joinCode: match.joinCode,
    players: match.players,
    currentPlayerId,
    requestOrientationPermission: orientation.requestPermission,
  });

  const { status: cameraStatus, supported: cameraSupported, error: cameraError } =
    camera;
  const startCamera = camera.start;
  const playerStatus = me?.status;

  // The match view is the camera view. Try to bring the feed up as soon as the
  // player is alive; if the browser requires a gesture, the HUD asks for a tap.
  useEffect(() => {
    if (playerStatus !== "alive") {
      return;
    }
    if (!cameraSupported || cameraError) {
      return;
    }
    if (cameraStatus === "idle" || cameraStatus === "stopped") {
      void startCamera();
    }
  }, [cameraError, cameraStatus, cameraSupported, playerStatus, startCamera]);

  useEffect(() => {
    function onFullscreenChange(): void {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);

  if (!me) {
    return null;
  }

  const endsAt = match.endsAt ?? serverNow;
  const remaining = Math.max(0, endsAt - serverNow);
  const startedAt = match.startedAt ?? serverNow;
  const duration = Math.max(1, endsAt - startedAt);
  const elapsedFraction = Math.min(
    1,
    Math.max(0, (serverNow - startedAt) / duration),
  );
  const spawnRemaining = Math.max(0, me.spawnLockedUntil - serverNow);
  const reloadRemaining =
    me.reloadCompleteAt === null
      ? 0
      : Math.max(0, me.reloadCompleteAt - serverNow);
  const reloadFraction = weapon
    ? Math.min(1, Math.max(0, 1 - reloadRemaining / weapon.reloadDurationMs))
    : 0;
  const cooldownRemaining = Math.max(0, me.nextShotAt - serverNow);
  const eliminated = me.status === "eliminated";
  const respawnRemaining =
    me.respawnAt === null ? 0 : Math.max(0, me.respawnAt - serverNow);
  const protectedNow = spawnRemaining > 0;
  const cameraActive = camera.status === "active";

  const feedback =
    shotFeedback && now - shotFeedback.at < 3_200 ? shotFeedback : null;
  const damage =
    lastDamage && now - lastDamage.receivedAt < 3_000 ? lastDamage : null;
  const elimination =
    lastElimination && now - lastElimination.receivedAt < 4_200
      ? lastElimination
      : null;

  const target = camera.target;
  const targetPlayer = target
    ? match.players.find((player) => player.id === target.playerId)
    : null;
  const targetIsEligible =
    !!targetPlayer &&
    targetPlayer.status === "alive" &&
    targetPlayer.connected &&
    targetPlayer.id !== currentPlayerId;
  const cameraInRange =
    !!weapon && !!target && target.distanceMeters <= weapon.rangeMeters;
  const targetLocked =
    cameraActive &&
    !!target &&
    !!targetPlayer &&
    target.centered &&
    target.confidence >= CAMERA_MIN_CONFIDENCE &&
    targetIsEligible;

  const canFireCamera =
    targetLocked &&
    cameraInRange &&
    !!weapon &&
    !eliminated &&
    !protectedNow &&
    me.ammo > 0 &&
    me.reloadCompleteAt === null &&
    cooldownRemaining <= 0 &&
    !!orientation.reading;

  const canFireBase =
    !!weapon &&
    !eliminated &&
    !protectedNow &&
    me.ammo > 0 &&
    me.reloadCompleteAt === null &&
    cooldownRemaining <= 0;

  function fireCamera(): void {
    if (!target || !canFireCamera) {
      return;
    }
    const evidence = buildCameraEvidence(target, orientation.reading);
    if (evidence) {
      onFire(target.playerId, evidence);
    }
  }

  function fireManual(targetPlayerId: string): void {
    if (!canFireBase || !weapon) {
      return;
    }
    onFire(targetPlayerId, {
      source: "manual",
      markerId: null,
      offsetX: 0,
      offsetY: 0,
      confidence: 1,
      distanceMeters: Math.min(10, weapon.rangeMeters),
      capturedAt: Date.now(),
      orientation: null,
    });
    setSheet("none");
  }

  async function toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
      setSheet("none");
    } catch {
      // Fullscreen is a convenience; the match remains playable without it.
    }
  }

  const fireLabel = eliminated
    ? "DOWN"
    : !weapon
      ? "UNARMED"
      : protectedNow
        ? "SHIELD"
        : me.reloadCompleteAt !== null
          ? "RELOAD"
          : me.ammo <= 0
            ? "EMPTY"
            : cooldownRemaining > 0
              ? "WAIT"
              : !cameraActive
                ? "NO CAM"
                : targetLocked && !cameraInRange
                  ? "RANGE"
                  : !targetLocked
                    ? "NO LOCK"
                    : "FIRE";

  const feed = buildFeed({
    match,
    currentPlayerId,
    feedback,
    damage,
    elimination,
    now,
  });

  const healthFraction = Math.max(
    0,
    Math.min(1, me.health / Math.max(1, me.maxHealth)),
  );
  const shieldFraction = Math.max(0, Math.min(1, me.shield / 50));
  const magazine = weapon?.magazineSize ?? 0;

  return (
    <div
      className={`hud${eliminated ? " hud-is-down" : ""}${protectedNow ? " hud-is-protected" : ""}`}
    >
      <video
        ref={camera.videoRef}
        className={`hud-camera${cameraActive ? " is-live" : ""}`}
        playsInline
        muted
        aria-label="Camera aiming view"
      />

      <div className="hud-world" aria-hidden="true" />
      <div className="hud-grid" aria-hidden="true" />
      <div className="hud-scan" aria-hidden="true" />
      <div className="hud-vignette" aria-hidden="true" />
      <span className="hud-corner hud-corner-tl" aria-hidden="true" />
      <span className="hud-corner hud-corner-tr" aria-hidden="true" />
      <span className="hud-corner hud-corner-bl" aria-hidden="true" />
      <span className="hud-corner hud-corner-br" aria-hidden="true" />

      {damage && damage.victimId === currentPlayerId ? (
        <div
          key={damage.receivedAt}
          className="hud-damage-flash"
          aria-hidden="true"
        />
      ) : null}

      <header className="hud-top">
        <div className="hud-top-left">
          <span className="hud-mode">{GAME_MODE_LABELS[match.config.mode]}</span>
          <span className="hud-elim-count">
            <b>{me.kills}</b> ELIMS
          </span>
        </div>

        <div
          className={`hud-clock${remaining <= 30_000 ? " is-low" : ""}`}
          aria-label={`${formatClock(remaining)} remaining`}
        >
          <span className="hud-clock-label">TIME</span>
          <span className="hud-clock-value">{formatClock(remaining)}</span>
          <div className="hud-clock-track" aria-hidden="true">
            <span style={{ width: `${Math.round(elapsedFraction * 100)}%` }} />
          </div>
        </div>

        <button
          type="button"
          className="hud-menu-btn"
          onClick={() => setSheet(sheet === "menu" ? "none" : "menu")}
          aria-label="Open match menu"
          aria-expanded={sheet === "menu"}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </header>

      <ConnectionNotice
        status={status}
        error={error}
        onRetry={onRetry}
        onDismiss={onDismissError}
      />

      <div className="hud-feed" aria-live="polite">
        {feed.map((item) => (
          <div key={item.key} className={`hud-toast hud-toast-${item.tone}`}>
            {item.text}
          </div>
        ))}
      </div>

      <div
        className={`hud-reticle${targetLocked && cameraInRange && canFireCamera ? " is-locked" : ""}${
          targetPlayer && target?.centered && !targetIsEligible ? " is-denied" : ""
        }`}
        aria-hidden="true"
      >
        <span className="hud-reticle-ring" />
        <span className="hud-reticle-dot" />
        <span className="hud-reticle-tick hud-reticle-tick-n" />
        <span className="hud-reticle-tick hud-reticle-tick-s" />
        <span className="hud-reticle-tick hud-reticle-tick-e" />
        <span className="hud-reticle-tick hud-reticle-tick-w" />
        {feedback?.accepted ? (
          <span
            key={feedback.at}
            className="hud-hitmarker"
            aria-hidden="true"
          />
        ) : null}
      </div>

      {target && targetPlayer && cameraActive ? (
        <>
          <div
            className={`hud-target-bracket${targetLocked ? " is-locked" : ""}`}
            style={{
              left: `${clamp(50 + target.offsetX * 50, 6, 94)}%`,
              top: `${clamp(50 + target.offsetY * 50, 10, 90)}%`,
              width: `${clamp(72 + target.sizeRatio * 220, 68, 210)}px`,
              height: `${clamp(72 + target.sizeRatio * 220, 68, 210)}px`,
            }}
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
            <span />
          </div>
          <div
            className={`hud-lock${targetLocked ? " is-locked" : ""}`}
            role="status"
          >
            <span className="hud-lock-name">{targetPlayer.displayName}</span>
            <span className="hud-lock-state">
              {targetLocked
                ? cameraInRange
                  ? `LOCKED · ${target.distanceMeters.toFixed(1)}m`
                  : `TOO FAR · ${target.distanceMeters.toFixed(0)}m`
                : target.centered
                  ? "TARGET INVALID"
                  : `ALIGN · ${Math.abs(target.offsetX) > CAMERA_CENTER_TOLERANCE ? "PAN" : "TILT"}`}
            </span>
          </div>
        </>
      ) : null}

      <section className="hud-vitals" aria-label="Your status">
        <div className="hud-meter">
          <span className="hud-meter-label">
            HP
            <b>
              {me.health}
              <small>/{me.maxHealth}</small>
            </b>
          </span>
          <span className="hud-meter-track">
            <span
              className="hud-meter-fill hud-meter-health"
              style={{ width: `${healthFraction * 100}%` }}
            />
          </span>
        </div>
        <div className="hud-meter">
          <span className="hud-meter-label">
            SHIELD
            <b>
              {me.shield}
              <small>/50</small>
            </b>
          </span>
          <span className="hud-meter-track">
            <span
              className="hud-meter-fill hud-meter-shield"
              style={{ width: `${shieldFraction * 100}%` }}
            />
          </span>
        </div>
        <span className="hud-callsign">
          {me.displayName}
          {protectedNow ? (
            <em>SPAWN SHIELD {Math.ceil(spawnRemaining / 1_000)}s</em>
          ) : null}
        </span>
      </section>

      <section className="hud-weapon" aria-label="Weapon and ammunition">
        <span className="hud-weapon-name">{weapon?.name ?? "No weapon"}</span>
        <span className="hud-ammo">
          <b>{me.ammo}</b>
          <small>/{magazine || "—"}</small>
        </span>
        <span className="hud-mag" aria-hidden="true">
          {Array.from({ length: Math.min(magazine, 12) || 12 }).map((_, index) => {
            const filled =
              magazine > 0
                ? index < Math.ceil((me.ammo / magazine) * Math.min(magazine, 12))
                : false;
            return (
              <span
                key={index}
                className={filled ? "is-filled" : undefined}
              />
            );
          })}
        </span>
        {me.reloadCompleteAt !== null ? (
          <span className="hud-reload" role="status">
            <span className="hud-reload-bar" aria-hidden="true">
              <span style={{ width: `${Math.round(reloadFraction * 100)}%` }} />
            </span>
            <span className="hud-reload-label">
              RELOADING {Math.ceil(reloadRemaining / 100) / 10}s
            </span>
          </span>
        ) : null}
      </section>

      <div className="hud-controls">
        <button
          type="button"
          className="hud-side-btn"
          onClick={() => setMarkerOpen(true)}
          disabled={eliminated}
        >
          <span className="hud-side-icon" aria-hidden="true">
            ▣
          </span>
          MY MARKER
        </button>
        <button
          type="button"
          className={`hud-fire${canFireCamera ? " is-ready" : ""}`}
          onClick={fireCamera}
          disabled={!canFireCamera}
          aria-label={
            canFireCamera ? "Fire at locked target" : `Cannot fire: ${fireLabel}`
          }
        >
          <span className="hud-fire-core" aria-hidden="true" />
          <span className="hud-fire-label">{fireLabel}</span>
        </button>
        <button
          type="button"
          className="hud-side-btn"
          onClick={() =>
            setSheet(sheet === "scoreboard" ? "none" : "scoreboard")
          }
        >
          <span className="hud-side-icon" aria-hidden="true">
            ≡
          </span>
          SCORES
        </button>
      </div>

      {camera.status !== "active" ? (
        <div className="hud-camera-prompt" role="status">
          <p className="hud-prompt-kicker">
            {camera.status === "starting"
              ? "CAMERA LINKING"
              : camera.status === "error"
                ? "CAMERA OFFLINE"
                : "AIMING STANDBY"}
          </p>
          <p className="hud-prompt-text">
            {camera.status === "starting"
              ? "Hold your phone upright and step into a safe, open area."
              : camera.error ??
                "The match view is your camera. Enable it to see target markers and lock on."}
          </p>
          <button
            type="button"
            className="hud-action"
            onClick={() => void camera.start()}
            disabled={camera.status === "starting"}
          >
            {camera.status === "error" ? "RETRY CAMERA" : "ENABLE CAMERA"}
          </button>
          {match.config.allowManualTargeting && !eliminated ? (
            <button
              type="button"
              className="hud-link"
              onClick={() => setSheet("targets")}
            >
              Use practice targeting
            </button>
          ) : null}
          <p className="hud-prompt-fine">
            Camera frames stay on this device. Only the locked target and aim
            evidence are sent to the server.
          </p>
        </div>
      ) : null}

      {camera.status === "active" && !orientation.reading ? (
        <button
          type="button"
          className="hud-motion-chip"
          onClick={() => void orientation.requestPermission()}
        >
          <span aria-hidden="true">!</span>
          {orientation.supported
            ? "ENABLE MOTION FOR AIM LOCK"
            : "MOTION SENSOR UNAVAILABLE"}
        </button>
      ) : null}

      {eliminated ? (
        <div className="hud-down" role="alert">
          <p className="hud-down-kicker">SIGNAL LOST</p>
          <h2 className="hud-down-title">ELIMINATED</h2>
          <p className="hud-down-count">
            RESPAWN IN{" "}
            <b>{Math.max(1, Math.ceil(respawnRemaining / 1_000))}</b>
          </p>
          <p className="hud-down-text">
            You cannot fire or be hit until you redeploy.
          </p>
        </div>
      ) : null}

      {sheet !== "none" ? (
        <div
          className="hud-sheet-backdrop"
          role="presentation"
          onClick={() => setSheet("none")}
        >
          <section
            className="hud-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={
              sheet === "menu"
                ? "Match menu"
                : sheet === "scoreboard"
                  ? "Scoreboard"
                  : "Practice targeting"
            }
            onClick={(event) => event.stopPropagation()}
          >
            <span className="hud-sheet-grip" aria-hidden="true" />

            {sheet === "menu" ? (
              <>
                <div className="hud-sheet-head">
                  <div>
                    <p className="hud-sheet-kicker">
                      MATCH {match.joinCode}
                    </p>
                    <h2 className="hud-sheet-title">MATCH MENU</h2>
                  </div>
                  <button
                    type="button"
                    className="hud-close"
                    onClick={() => setSheet("none")}
                    aria-label="Close menu"
                  >
                    ✕
                  </button>
                </div>
                <p className="hud-sheet-text">
                  The match keeps running while this menu is open. Keep your head
                  up and your phone pointed at a safe area.
                </p>
                <div className="hud-menu-grid">
                  <button
                    type="button"
                    className="hud-menu-item"
                    onClick={() => setSheet("scoreboard")}
                  >
                    <span>SCOREBOARD</span>
                    <small>
                      {match.players.filter((player) => player.status === "alive").length}{" "}
                      alive
                    </small>
                  </button>
                  <button
                    type="button"
                    className="hud-menu-item"
                    onClick={() => setMarkerOpen(true)}
                    disabled={eliminated}
                  >
                    <span>MY MARKER</span>
                    <small>Show target code</small>
                  </button>
                  <button
                    type="button"
                    className="hud-menu-item"
                    onClick={() => void toggleFullscreen()}
                  >
                    <span>{fullscreen ? "EXIT FULLSCREEN" : "FULLSCREEN"}</span>
                    <small>More screen, less browser</small>
                  </button>
                  {match.config.allowManualTargeting ? (
                    <button
                      type="button"
                      className="hud-menu-item"
                      onClick={() => setSheet("targets")}
                      disabled={eliminated}
                    >
                      <span>PRACTICE TARGETS</span>
                      <small>Development fallback</small>
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="hud-danger"
                  onClick={onLeave}
                >
                  LEAVE MATCH
                </button>
                <p className="hud-sheet-fine">
                  Play safe. Do not run while looking at your screen, and stay
                  clear of roads, traffic, and stairs.
                </p>
              </>
            ) : null}

            {sheet === "scoreboard" ? (
              <>
                <div className="hud-sheet-head">
                  <div>
                    <p className="hud-sheet-kicker">LIVE RANKING</p>
                    <h2 className="hud-sheet-title">SCOREBOARD</h2>
                  </div>
                  <button
                    type="button"
                    className="hud-close"
                    onClick={() => setSheet("none")}
                    aria-label="Close scoreboard"
                  >
                    ✕
                  </button>
                </div>
                <ul className="hud-ranks">
                  {sortPlayers(match.players).map((player, index) => (
                    <li
                      key={player.id}
                      className={`hud-rank${player.id === currentPlayerId ? " is-you" : ""}${
                        player.status === "eliminated" ? " is-out" : ""
                      }`}
                    >
                      <span className="hud-rank-pos">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span
                        className="hud-rank-swatch"
                        style={{ backgroundColor: player.color }}
                        aria-hidden="true"
                      />
                      <span className="hud-rank-name">
                        {player.displayName}
                        {player.id === currentPlayerId ? " (YOU)" : ""}
                      </span>
                      <span className="hud-rank-hp">
                        {player.status === "eliminated"
                          ? "OUT"
                          : player.connected
                            ? `${player.health} HP`
                            : "OFFLINE"}
                      </span>
                      <span className="hud-rank-score">{player.score}</span>
                    </li>
                  ))}
                </ul>
                <p className="hud-sheet-fine">
                  {me.kills} eliminations · {me.deaths} deaths · {me.score}{" "}
                  points. Scores are confirmed by the game server.
                </p>
              </>
            ) : null}

            {sheet === "targets" ? (
              <>
                <div className="hud-sheet-head">
                  <div>
                    <p className="hud-sheet-kicker">DEVELOPMENT FALLBACK</p>
                    <h2 className="hud-sheet-title">PRACTICE TARGETS</h2>
                  </div>
                  <button
                    type="button"
                    className="hud-close"
                    onClick={() => setSheet("none")}
                    aria-label="Close practice targets"
                  >
                    ✕
                  </button>
                </div>
                <p className="hud-sheet-text">
                  The host enabled this fallback. It is not camera-assisted
                  aiming and should not be used for a public match.
                </p>
                <div className="hud-target-list">
                  {match.players
                    .filter((player) => player.id !== currentPlayerId)
                    .map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        className="hud-target-btn"
                        disabled={!canFireBase || player.status !== "alive"}
                        onClick={() => fireManual(player.id)}
                      >
                        <span
                          className="hud-rank-swatch"
                          style={{ backgroundColor: player.color }}
                          aria-hidden="true"
                        />
                        <span className="hud-target-name">
                          {player.displayName}
                          {player.status !== "alive" ? " (OUT)" : ""}
                        </span>
                        <span className="hud-target-score">
                          {player.score} PTS
                        </span>
                      </button>
                    ))}
                </div>
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      <MarkerDisplay
        open={markerOpen}
        joinCode={match.joinCode}
        markerId={me.markerId}
        displayName={me.displayName}
        eliminated={eliminated}
        onClose={() => setMarkerOpen(false)}
      />
    </div>
  );
}

function buildFeed({
  match,
  currentPlayerId,
  feedback,
  damage,
  elimination,
  now,
}: {
  match: MatchSnapshot;
  currentPlayerId: string;
  feedback: ShotFeedback | null;
  damage: ReceivedDamageEvent | null;
  elimination: ReceivedEliminationEvent | null;
  now: number;
}): FeedItem[] {
  const items: FeedItem[] = [];

  if (feedback) {
    if (feedback.accepted) {
      const targetName =
        match.players.find((player) => player.id === feedback.targetId)
          ?.displayName ?? "target";
      items.push({
        key: `shot-${feedback.at}`,
        at: feedback.at,
        tone: "good",
        text: `HIT ${targetName.toUpperCase()} · ${feedback.damage} DMG${
          feedback.eliminated ? " · ELIMINATED" : ""
        }`,
      });
    } else {
      items.push({
        key: `shot-${feedback.at}`,
        at: feedback.at,
        tone: "danger",
        text: feedback.message.toUpperCase(),
      });
    }
  }

  // A hit you landed is already confirmed by SHOT_ACCEPTED. Repeating it from
  // the damage broadcast would show the same event twice.
  const damageIsMyConfirmedHit =
    damage?.attackerId === currentPlayerId && feedback?.accepted === true;

  if (damage && !damageIsMyConfirmedHit) {
    const isVictim = damage.victimId === currentPlayerId;
    const attacker =
      match.players.find((player) => player.id === damage.attackerId)
        ?.displayName ?? "unknown";
    const victim =
      match.players.find((player) => player.id === damage.victimId)
        ?.displayName ?? "target";
    items.push({
      key: `dmg-${damage.receivedAt}`,
      at: damage.receivedAt,
      tone: isVictim ? "danger" : "good",
      text: isVictim
        ? `TAKING FIRE FROM ${attacker.toUpperCase()} · -${damage.damage}`
        : `HIT ${victim.toUpperCase()} · -${damage.damage}${
            damage.eliminated ? " · ELIMINATED" : ""
          }`,
    });
  }

  if (elimination) {
    const victim =
      match.players.find((player) => player.id === elimination.playerId)
        ?.displayName ?? "a player";
    const killer =
      match.players.find((player) => player.id === elimination.byPlayerId)
        ?.displayName ?? "a player";
    items.push({
      key: `elim-${elimination.receivedAt}`,
      at: elimination.receivedAt,
      tone: elimination.byPlayerId === currentPlayerId ? "good" : "neutral",
      text: `${victim.toUpperCase()} DOWN · ${killer.toUpperCase()} +${elimination.score}`,
    });
  }

  return items
    .filter((item) => now - item.at < FEED_LIFETIME_MS)
    .sort((left, right) => right.at - left.at)
    .slice(0, 2);
}

function sortPlayers(
  players: MatchPlayerSnapshot[],
): MatchPlayerSnapshot[] {
  return [...players].sort(
    (left, right) =>
      right.score - left.score ||
      right.kills - left.kills ||
      left.deaths - right.deaths ||
      left.joinedAt - right.joinedAt,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
