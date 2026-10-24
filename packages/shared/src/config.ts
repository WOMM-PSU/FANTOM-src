import { DEFAULT_MATCH_DURATION_SECONDS } from "./constants";
import { matchConfigSchema } from "./protocol";
import type { MatchConfig } from "./types";

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  mode: "ffa",
  durationSeconds: DEFAULT_MATCH_DURATION_SECONDS,
};

export function parseMatchConfig(input: unknown): MatchConfig | null {
  const result = matchConfigSchema.safeParse(input);
  return result.success ? result.data : null;
}
