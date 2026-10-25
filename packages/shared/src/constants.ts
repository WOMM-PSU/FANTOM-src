import type {
  GameMode,
  MatchPhase,
  PlayerRole,
  PlayerStatus,
  ServerErrorCode,
  WeaponDefinition,
  WeaponId,
} from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 16;

export const MAX_DISPLAY_NAME_LENGTH = 24;

export const JOIN_CODE_LENGTH = 4;
// No I, O, 0, or 1: they are too easy to confuse when read aloud or typed.
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const MIN_MATCH_DURATION_SECONDS = 60;
export const MAX_MATCH_DURATION_SECONDS = 30 * 60;
export const DEFAULT_MATCH_DURATION_SECONDS = 300;
export const DURATION_OPTIONS_SECONDS = [120, 300, 600] as const;

export const DEFAULT_COUNTDOWN_MS = 5_000;
export const FFA_SPAWN_PROTECTION_MS = 5_000;
export const FFA_RESPAWN_MS = 5_000;
export const DEFAULT_MAX_HEALTH = 100;
export const MAX_SHIELD = 50;

export const WEAPONS = {
  pulse: {
    id: "pulse",
    name: "Pulse",
    damage: 25,
    magazineSize: 12,
    fireIntervalMs: 500,
    reloadDurationMs: 1_200,
    rangeMeters: 25,
  },
  ravager: {
    id: "ravager",
    name: "Ravager",
    damage: 50,
    magazineSize: 4,
    fireIntervalMs: 1_200,
    reloadDurationMs: 2_000,
    rangeMeters: 18,
  },
  viper: {
    id: "viper",
    name: "Viper",
    damage: 10,
    magazineSize: 30,
    fireIntervalMs: 150,
    reloadDurationMs: 2_500,
    rangeMeters: 30,
  },
} as const satisfies Record<WeaponId, WeaponDefinition>;

/** Free For All starts with a Pulse until weapon caches are implemented. */
export const FFA_STARTING_WEAPON: WeaponId = "pulse";

export const CAMERA_CENTER_TOLERANCE = 0.16;
export const CAMERA_MIN_CONFIDENCE = 0.5;
export const CAMERA_MIN_MARKER_SIZE = 0.025;
export const MARKER_PREFIX = "FANTOM1";

export const DEFAULT_RECONNECT_GRACE_MS = 60_000;

export const PLAYER_COLORS = [
  "#5b9dff",
  "#ff8a5b",
  "#4fd1a5",
  "#f4c95d",
  "#c084fc",
  "#ff6b9d",
  "#63d3e6",
  "#a3e635",
] as const;

export const GAME_MODES = [
  "ffa",
  "assassin",
  "tdm",
] as const satisfies readonly GameMode[];

/** Only modes with complete server rules may be selected by a host. */
export const PLAYABLE_MODES = ["ffa"] as const satisfies readonly GameMode[];

export function isModePlayable(mode: GameMode): boolean {
  return (PLAYABLE_MODES as readonly GameMode[]).includes(mode);
}

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  ffa: "Free For All",
  assassin: "Assassin",
  tdm: "Team Deathmatch",
};

export const GAME_MODE_DESCRIPTIONS: Record<GameMode, string> = {
  ffa: "Score eliminations before the timer expires. Ties are draws.",
  assassin: "One hunter, everyone else survives. Not enabled yet.",
  tdm: "Teams of killers and healers. Not enabled yet.",
};

export const MATCH_PHASE_LABELS: Record<MatchPhase, string> = {
  lobby: "Lobby",
  countdown: "Get ready",
  active: "Match live",
  finished: "Match ended",
};

export const PLAYER_ROLE_LABELS: Record<Exclude<PlayerRole, null>, string> = {
  killer: "Killer",
  healer: "Healer",
  assassin: "Assassin",
  survivor: "Survivor",
};

export const PLAYER_STATUS_LABELS: Record<PlayerStatus, string> = {
  alive: "Alive",
  out_of_zone: "Out of bounds",
  eliminated: "Eliminated",
};

export type StartBlockReason = Extract<
  ServerErrorCode,
  | "NOT_HOST"
  | "WRONG_PHASE"
  | "STALE_CONFIG"
  | "MODE_UNAVAILABLE"
  | "NOT_ENOUGH_PLAYERS"
  | "PLAYERS_NOT_READY"
  | "PLAYERS_DISCONNECTED"
>;

export const START_BLOCK_MESSAGES: Record<StartBlockReason, string> = {
  NOT_HOST: "Only the host can start the match.",
  WRONG_PHASE: "The match has already started.",
  STALE_CONFIG: "The settings changed. Review them and try again.",
  MODE_UNAVAILABLE: "That game mode is not available in this build.",
  NOT_ENOUGH_PLAYERS: `At least ${MIN_PLAYERS} players are needed to start.`,
  PLAYERS_NOT_READY: "All players must be ready before the match can start.",
  PLAYERS_DISCONNECTED:
    "Someone lost connection. Wait for them to reconnect or leave the match.",
};
