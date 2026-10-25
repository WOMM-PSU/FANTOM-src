"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  normalizeJoinCode,
  serverMessageSchema,
  type ClientMessage,
  type DamageEvent,
  type EliminationEvent,
  type MatchConfig,
  type MatchSnapshot,
  type ServerErrorCode,
  type ShotEvidence,
  type ShotRejectReason,
} from "@fantom/shared";
import { createRequestId } from "@/lib/ids";
import { getWebSocketUrl } from "@/lib/serverUrl";
import {
  clearStoredSession,
  readSession,
  writeSession,
  type StoredSession,
} from "@/lib/session";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "offline";

export type UiErrorCode = ServerErrorCode | "NETWORK" | "STORAGE";

export type UiError = {
  code: UiErrorCode;
  message: string;
};

export type ShotFeedback =
  | {
      accepted: true;
      at: number;
      targetId: string;
      damage: number;
      shieldDamage: number;
      healthDamage: number;
      eliminated: boolean;
    }
  | {
      accepted: false;
      at: number;
      reason: ShotRejectReason;
      message: string;
    };

export type ReceivedDamageEvent = DamageEvent & { receivedAt: number };
export type ReceivedEliminationEvent = EliminationEvent & {
  receivedAt: number;
};

export type MatchConnection = {
  sessionLoaded: boolean;
  session: StoredSession | null;
  match: MatchSnapshot | null;
  status: ConnectionStatus;
  error: UiError | null;
  sessionExpired: boolean;
  clockOffset: number;
  shotFeedback: ShotFeedback | null;
  lastDamage: ReceivedDamageEvent | null;
  lastElimination: ReceivedEliminationEvent | null;
  joinWithSession: (session: StoredSession) => boolean;
  setReady: (ready: boolean) => void;
  updateConfig: (config: MatchConfig) => void;
  startMatch: () => void;
  fireShot: (targetPlayerId: string, evidence: ShotEvidence) => void;
  leave: () => void;
  retry: () => void;
  clearError: () => void;
};

const MAX_RECONNECT_ATTEMPTS = 6;
const HEARTBEAT_INTERVAL_MS = 20_000;

export function useMatchConnection(joinCode: string): MatchConnection {
  const code = normalizeJoinCode(joinCode);

  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [match, setMatch] = useState<MatchSnapshot | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<UiError | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const [shotFeedback, setShotFeedback] = useState<ShotFeedback | null>(null);
  const [lastDamage, setLastDamage] = useState<ReceivedDamageEvent | null>(
    null,
  );
  const [lastElimination, setLastElimination] =
    useState<ReceivedEliminationEvent | null>(null);

  const sessionRef = useRef<StoredSession | null>(null);
  const matchRef = useRef<MatchSnapshot | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const updateMatch = useCallback((next: MatchSnapshot | null) => {
    matchRef.current = next;
    setMatch(next);
  }, []);

  useEffect(() => {
    setSessionLoaded(false);
    setSessionExpired(false);
    setError(null);
    updateMatch(null);

    const stored = readSession(code);
    sessionRef.current = stored;
    setSession(stored);
    setSessionLoaded(true);
  }, [code, updateMatch]);

  useEffect(() => {
    if (!sessionLoaded || !session) {
      setStatus("idle");
      return;
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let heartbeat: number | undefined;
    let reconnectTimer: number | undefined;
    let attempts = 0;

    const connect = (): void => {
      if (disposed) {
        return;
      }

      setStatus(
        attempts === 0 && matchRef.current === null
          ? "connecting"
          : "reconnecting",
      );

      socket = new WebSocket(getWebSocketUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed || !socket) {
          return;
        }
        socket.send(
          JSON.stringify({
            type: "RESUME_MATCH",
            requestId: createRequestId(),
            matchId: session.matchId,
            playerId: session.playerId,
            sessionToken: session.sessionToken,
          } satisfies ClientMessage),
        );

        heartbeat = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                type: "PING",
                requestId: createRequestId(),
                clientTime: Date.now(),
              } satisfies ClientMessage),
            );
          }
        }, HEARTBEAT_INTERVAL_MS);
      };

      socket.onmessage = (event) => {
        let raw: unknown;
        try {
          raw = JSON.parse(String(event.data)) as unknown;
        } catch {
          return;
        }

        const parsed = serverMessageSchema.safeParse(raw);
        if (!parsed.success) {
          console.warn("[fantom] ignored a malformed server message");
          return;
        }

        const message = parsed.data;
        switch (message.type) {
          case "WELCOME": {
            attempts = 0;
            setStatus("open");
            updateMatch(message.match);
            setClockOffset(message.serverTime - Date.now());
            setError(null);
            setSessionExpired(false);
            break;
          }
          case "MATCH_STATE": {
            setStatus("open");
            updateMatch(message.match);
            setClockOffset(message.serverTime - Date.now());
            setError((current) =>
              current?.code === "NETWORK" ? null : current,
            );
            break;
          }
          case "PONG": {
            setClockOffset(message.serverTime - Date.now());
            break;
          }
          case "SHOT_ACCEPTED": {
            setShotFeedback({
              accepted: true,
              at: Date.now(),
              targetId: message.targetId,
              damage: message.damage,
              shieldDamage: message.shieldDamage,
              healthDamage: message.healthDamage,
              eliminated: message.eliminated,
            });
            break;
          }
          case "SHOT_REJECTED": {
            setShotFeedback({
              accepted: false,
              at: Date.now(),
              reason: message.reason,
              message: message.message,
            });
            break;
          }
          case "DAMAGE_EVENT": {
            setLastDamage({ ...message, receivedAt: Date.now() });
            break;
          }
          case "ELIMINATION_EVENT": {
            setLastElimination({ ...message, receivedAt: Date.now() });
            break;
          }
          case "ERROR": {
            setError({ code: message.code, message: message.message });
            if (
              message.code === "INVALID_SESSION" ||
              message.code === "MATCH_NOT_FOUND"
            ) {
              clearStoredSession(code);
              sessionRef.current = null;
              setSession(null);
              setSessionExpired(true);
              updateMatch(null);
              setStatus("idle");
            }
            break;
          }
        }
      };

      socket.onclose = (event) => {
        if (disposed) {
          return;
        }
        if (heartbeat !== undefined) {
          window.clearInterval(heartbeat);
          heartbeat = undefined;
        }
        if (socketRef.current === socket) {
          socketRef.current = null;
        }

        if (event.code === 4001) {
          setStatus("offline");
          setError({
            code: "INVALID_SESSION",
            message:
              "This match was resumed in another tab or device. Reload to take it back.",
          });
          return;
        }

        attempts += 1;
        if (attempts > MAX_RECONNECT_ATTEMPTS) {
          setStatus("offline");
          setError({
            code: "NETWORK",
            message:
              "Lost connection to the game server. Check your network, then retry.",
          });
          return;
        }

        setStatus("reconnecting");
        const delay = Math.min(500 * 2 ** (attempts - 1), 8_000);
        reconnectTimer = window.setTimeout(connect, delay);
      };

      socket.onerror = () => {
        // onclose follows and owns retry/offline state.
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
      if (heartbeat !== undefined) {
        window.clearInterval(heartbeat);
      }
      if (socket) {
        socket.close(1000, "Page closed");
      }
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [code, session, sessionLoaded, retryNonce, updateMatch]);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError({
        code: "NETWORK",
        message: "Not connected to the game server yet.",
      });
      return;
    }
    socket.send(JSON.stringify(message));
  }, []);

  const joinWithSession = useCallback((next: StoredSession): boolean => {
    if (!writeSession(next)) {
      setError({
        code: "STORAGE",
        message:
          "This browser blocked session storage, so the match session cannot be kept. Allow site storage and try again.",
      });
      return false;
    }
    sessionRef.current = next;
    setSessionExpired(false);
    setError(null);
    setStatus("connecting");
    setSession(next);
    return true;
  }, []);

  const setReady = useCallback(
    (ready: boolean) => {
      const current = matchRef.current;
      if (!current) {
        return;
      }
      send({
        type: "SET_READY",
        requestId: createRequestId(),
        ready,
        configVersion: current.configVersion,
      });
    },
    [send],
  );

  const updateConfig = useCallback(
    (config: MatchConfig) => {
      send({
        type: "UPDATE_CONFIG",
        requestId: createRequestId(),
        config,
      });
    },
    [send],
  );

  const startMatch = useCallback(() => {
    const current = matchRef.current;
    if (!current) {
      return;
    }
    send({
      type: "START_MATCH",
      requestId: createRequestId(),
      configVersion: current.configVersion,
    });
  }, [send]);

  const fireShot = useCallback(
    (targetPlayerId: string, evidence: ShotEvidence) => {
      send({
        type: "REQUEST_SHOT",
        requestId: createRequestId(),
        targetPlayerId,
        evidence,
      });
    },
    [send],
  );

  const leave = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN && matchRef.current) {
      socket.send(
        JSON.stringify({
          type: "LEAVE_MATCH",
          requestId: createRequestId(),
        } satisfies ClientMessage),
      );
    }
    socket?.close(1000, "Left match");
    socketRef.current = null;
    clearStoredSession(code);
    sessionRef.current = null;
    setSession(null);
    setSessionExpired(false);
    setError(null);
    setShotFeedback(null);
    setLastDamage(null);
    setLastElimination(null);
    updateMatch(null);
    setStatus("idle");
  }, [code, updateMatch]);

  const retry = useCallback(() => {
    if (!sessionRef.current) {
      return;
    }
    setError(null);
    setStatus("connecting");
    setRetryNonce((current) => current + 1);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    sessionLoaded,
    session,
    match,
    status,
    error,
    sessionExpired,
    clockOffset,
    shotFeedback,
    lastDamage,
    lastElimination,
    joinWithSession,
    setReady,
    updateConfig,
    startMatch,
    fireShot,
    leave,
    retry,
    clearError,
  };
}
