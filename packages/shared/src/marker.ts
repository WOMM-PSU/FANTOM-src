import { MARKER_PREFIX } from "./constants";
import { isValidJoinCode, normalizeJoinCode } from "./joinCode";

const MARKER_ID_PATTERN = /^[a-zA-Z0-9_-]{6,32}$/;

export type ParsedPlayerMarker = {
  joinCode: string;
  markerId: string;
};

/**
 * The marker is public by design: it identifies a player inside one match but
 * never contains the session credential. The server still maps it back to the
 * room and verifies that it belongs to the requested target.
 */
export function encodePlayerMarker(
  joinCodeInput: string,
  markerId: string,
): string {
  const joinCode = normalizeJoinCode(joinCodeInput);
  if (!isValidJoinCode(joinCode) || !MARKER_ID_PATTERN.test(markerId)) {
    throw new Error("Cannot encode an invalid player marker.");
  }
  return `${MARKER_PREFIX}:${joinCode}:${markerId}`;
}

export function parsePlayerMarker(
  raw: string,
): ParsedPlayerMarker | null {
  const parts = raw.trim().split(":");
  if (parts.length !== 3 || parts[0] !== MARKER_PREFIX) {
    return null;
  }

  const joinCode = normalizeJoinCode(parts[1] ?? "");
  const markerId = parts[2] ?? "";
  if (!isValidJoinCode(joinCode) || !MARKER_ID_PATTERN.test(markerId)) {
    return null;
  }

  return { joinCode, markerId };
}
