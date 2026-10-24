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

export type MatchConfig = {
  mode: GameMode;
  /** Server-owned match length. Validated against shared bounds. */
  durationSeconds: number;
};

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

export type ServerMessage =
  | WelcomeMessage
  | MatchStateMessage
  | ErrorMessage
  | PongMessage;
