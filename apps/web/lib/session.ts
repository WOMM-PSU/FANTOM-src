import {
  normalizeJoinCode,
  type MatchSessionResponse,
} from "@fantom/shared";

export type StoredSession = {
  matchId: string;
  joinCode: string;
  playerId: string;
  sessionToken: string;
};

const SESSION_KEY_PREFIX = "fantom.session.";

function sessionKey(joinCode: string): string {
  return `${SESSION_KEY_PREFIX}${normalizeJoinCode(joinCode)}`;
}

export function sessionFromResponse(
  response: MatchSessionResponse,
): StoredSession {
  return {
    matchId: response.matchId,
    joinCode: response.joinCode,
    playerId: response.playerId,
    sessionToken: response.sessionToken,
  };
}

export function readSession(joinCode: string): StoredSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(sessionKey(joinCode));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.matchId !== "string" ||
      typeof parsed.joinCode !== "string" ||
      typeof parsed.playerId !== "string" ||
      typeof parsed.sessionToken !== "string" ||
      parsed.sessionToken.length < 20
    ) {
      return null;
    }
    return {
      matchId: parsed.matchId,
      joinCode: parsed.joinCode,
      playerId: parsed.playerId,
      sessionToken: parsed.sessionToken,
    };
  } catch {
    return null;
  }
}

export function writeSession(session: StoredSession): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    window.sessionStorage.setItem(
      sessionKey(session.joinCode),
      JSON.stringify(session),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearStoredSession(joinCode: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(sessionKey(joinCode));
  } catch {
    // There is nothing else to clear if storage is unavailable.
  }
}
