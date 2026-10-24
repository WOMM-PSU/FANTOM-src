import { MAX_DISPLAY_NAME_LENGTH } from "./constants";

const CONTROL_AND_INVISIBLE =
  /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g;

/**
 * Trims, collapses whitespace, removes control/bidi characters, and limits the
 * length by code points so emoji are not split in half.
 */
export function normalizeDisplayName(input: string): string {
  const cleaned = input
    .replace(CONTROL_AND_INVISIBLE, " ")
    .replace(/\s+/g, " ")
    .trim();

  return Array.from(cleaned).slice(0, MAX_DISPLAY_NAME_LENGTH).join("").trim();
}
