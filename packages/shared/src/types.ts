export type GameMode = "ffa" | "assassin" | "tdm";

export type PlayerRole =
  | "killer"
  | "healer"
  | "assassin"
  | "survivor"
  | null;

export type PlayerStatus = "alive" | "out_of_zone" | "eliminated";

export type MatchPhase = "lobby" | "countdown" | "active" | "finished";

export type MatchEndReason = "timer_expired";

export type WeaponId = "pulse" | "ravager" | "viper";

export type WeaponDefinition = {
  id: WeaponId;
  name: string;
  damage: number;
  magazineSize: number;
  fireIntervalMs: number;
  reloadDurationMs: number;
  rangeMeters: number;
};

export type ShotSource = "camera" | "manual";

export type MatchConfig = {
  mode: GameMode;
  /** Server-owned match length. Validated against shared bounds. */
  durationSeconds: number;
  /**
   * Development/demo fallback for devices without a usable camera or
   * orientation sensor. It is never presented as camera-assisted aiming.
   */
  allowManualTargeting: boolean;
};

export type OrientationReading = {
  alpha: number;
  beta: number;
  gamma: number;
  absolute: boolean;
};

export type ShotEvidence = {
  source: ShotSource;
  /** Marker identity decoded from the target's QR marker, if any. */
  markerId: string | null;
  /** Marker center relative to the camera frame center, normalized to [-1, 1]. */
  offsetX: number;
  offsetY: number;
  /** Detection confidence, 0..1. */
  confidence: number;
  /** Client estimate derived from marker size; the server treats this as evidence. */
  distanceMeters: number;
  /** Client capture time, used only for diagnostics and staleness messaging. */
  capturedAt: number;
  orientation: OrientationReading | null;
};

export type ShotRejectReason =
  | "WRONG_PHASE"
  | "NOT_ALIVE"
  | "SPAWN_PROTECTED"
  | "NO_WEAPON"
  | "RELOADING"
  | "COOLDOWN"
  | "TARGET_UNAVAILABLE"
  | "SELF_TARGET"
  | "TARGET_PROTECTED"
  | "AIM_INVALID"
  | "OUT_OF_RANGE"
  | "MANUAL_TARGETING_DISABLED";

export type MatchPlayerSnapshot = {
  id: string;
  displayName: string;
  color: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  joinedAt: number;
  role: PlayerRole;
  status: PlayerStatus;
  health: number;
  maxHealth: number;
  shield: number;
  weaponId: string | null;
  ammo: number;
  spawnLockedUntil: number;
  nextShotAt: number;
  reloadCompleteAt: number | null;
  respawnAt: number | null;
  score: number;
  kills: number;
  deaths: number;
  /** Public, match-scoped identity displayed in the player's QR marker. */
  markerId: string;
};

export type MatchSnapshot = {
  matchId: string;
  joinCode: string;
  phase: MatchPhase;
  hostPlayerId: string;
  config: MatchConfig;
  configVersion: number;
  players: MatchPlayerSnapshot[];
  createdAt: number;
  countdownEndsAt: number | null;
  startedAt: number | null;
  endsAt: number | null;
  finishedAt: number | null;
  endReason: MatchEndReason | null;
  /** Empty for a draw or a match with no eliminations. */
  winnerIds: string[];
};

export type MatchSessionCredentials = {
  matchId: string;
  joinCode: string;
  playerId: string;
  sessionToken: string;
};

export type MatchSessionResponse = MatchSessionCredentials & {
  match: MatchSnapshot;
  serverTime: number;
};

export type WelcomeMessage = {
  type: "WELCOME";
  playerId: string;
  sessionToken: string;
  match: MatchSnapshot;
  serverTime: number;
};

export type MatchStateMessage = {
  type: "MATCH_STATE";
  match: MatchSnapshot;
  serverTime: number;
};

export type ErrorMessage = {
  type: "ERROR";
  code: ServerErrorCode;
  message: string;
  requestId?: string;
};

export type PongMessage = {
  type: "PONG";
  clientTime: number;
  serverTime: number;
};

export type ShotAcceptedMessage = {
  type: "SHOT_ACCEPTED";
  requestId: string;
  targetId: string;
  damage: number;
  shieldDamage: number;
  healthDamage: number;
  targetHealth: number;
  targetShield: number;
  eliminated: boolean;
  ammo: number;
  nextShotAt: number;
  reloadCompleteAt: number | null;
  serverTime: number;
};

export type ShotRejectedMessage = {
  type: "SHOT_REJECTED";
  requestId: string;
  reason: ShotRejectReason;
  message: string;
  serverTime: number;
};

export type DamageEvent = {
  type: "DAMAGE_EVENT";
  attackerId: string;
  victimId: string;
  damage: number;
  shieldDamage: number;
  healthDamage: number;
  targetHealth: number;
  targetShield: number;
  eliminated: boolean;
  respawnAt: number | null;
  serverTime: number;
};

export type EliminationEvent = {
  type: "ELIMINATION_EVENT";
  playerId: string;
  byPlayerId: string;
  score: number;
  serverTime: number;
};

export type ServerMessage =
  | WelcomeMessage
  | MatchStateMessage
  | ErrorMessage
  | PongMessage
  | ShotAcceptedMessage
  | ShotRejectedMessage
  | DamageEvent
  | EliminationEvent;

export const SERVER_ERROR_CODES = [
  "INVALID_MESSAGE",
  "INVALID_SESSION",
  "ALREADY_AUTHENTICATED",
  "MATCH_NOT_FOUND",
  "MATCH_FULL",
  "MATCH_NOT_JOINABLE",
  "DISPLAY_NAME_TAKEN",
  "NOT_HOST",
  "WRONG_PHASE",
  "STALE_CONFIG",
  "MODE_UNAVAILABLE",
  "NOT_ENOUGH_PLAYERS",
  "PLAYERS_NOT_READY",
  "PLAYERS_DISCONNECTED",
  "RATE_LIMITED",
  "PAYLOAD_TOO_LARGE",
  "INTERNAL",
] as const;

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];

export type ApiErrorBody = {
  error: {
    code: ServerErrorCode;
    message: string;
  };
};
