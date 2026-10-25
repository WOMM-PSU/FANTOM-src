import { z } from "zod";
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_MATCH_DURATION_SECONDS,
  MIN_MATCH_DURATION_SECONDS,
} from "./constants";
import { isValidJoinCode, normalizeJoinCode } from "./joinCode";
import { normalizeDisplayName } from "./sanitize";
import {
  SERVER_ERROR_CODES,
  type ApiErrorBody,
  type DamageEvent,
  type EliminationEvent,
  type ErrorMessage,
  type MatchPlayerSnapshot,
  type MatchSessionResponse,
  type MatchSnapshot,
  type MatchStateMessage,
  type PongMessage,
  type ShotAcceptedMessage,
  type ShotRejectedMessage,
  type WelcomeMessage,
} from "./types";

export const requestIdSchema = z.string().trim().min(8).max(64);

export const displayNameSchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizeDisplayName(value) : value),
  z.string().min(1).max(MAX_DISPLAY_NAME_LENGTH),
);

export const joinCodeSchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizeJoinCode(value) : value),
  z
    .string()
    .min(4)
    .max(8)
    .refine(isValidJoinCode, "Enter a valid 4-character match code."),
);

export const matchConfigSchema = z.object({
  mode: z.enum(["ffa", "assassin", "tdm"]),
  durationSeconds: z
    .number()
    .int()
    .min(MIN_MATCH_DURATION_SECONDS)
    .max(MAX_MATCH_DURATION_SECONDS),
  allowManualTargeting: z.boolean(),
});

export const playerRoleSchema = z
  .enum(["killer", "healer", "assassin", "survivor"])
  .nullable();

export const playerStatusSchema = z.enum([
  "alive",
  "out_of_zone",
  "eliminated",
]);

export const matchPhaseSchema = z.enum([
  "lobby",
  "countdown",
  "active",
  "finished",
]);

export const serverErrorCodeSchema = z.enum(SERVER_ERROR_CODES);

export const matchPlayerSnapshotSchema: z.ZodType<MatchPlayerSnapshot> =
  z.object({
    id: z.string().min(1),
    displayName: z.string().min(1).max(MAX_DISPLAY_NAME_LENGTH),
    color: z.string().min(1),
    isHost: z.boolean(),
    ready: z.boolean(),
    connected: z.boolean(),
    joinedAt: z.number(),
    role: playerRoleSchema,
    status: playerStatusSchema,
    health: z.number(),
    maxHealth: z.number(),
    shield: z.number(),
    weaponId: z.string().nullable(),
    ammo: z.number(),
    spawnLockedUntil: z.number(),
    nextShotAt: z.number(),
    reloadCompleteAt: z.number().nullable(),
    respawnAt: z.number().nullable(),
    score: z.number().int().nonnegative(),
    kills: z.number().int().nonnegative(),
    deaths: z.number().int().nonnegative(),
    markerId: z.string().min(6).max(32),
  });

export const matchSnapshotSchema: z.ZodType<MatchSnapshot> = z.object({
  matchId: z.string().min(1),
  joinCode: z.string().min(1),
  phase: matchPhaseSchema,
  hostPlayerId: z.string().min(1),
  config: matchConfigSchema,
  configVersion: z.number().int().nonnegative(),
  players: z.array(matchPlayerSnapshotSchema),
  createdAt: z.number(),
  countdownEndsAt: z.number().nullable(),
  startedAt: z.number().nullable(),
  endsAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  endReason: z.literal("timer_expired").nullable(),
  winnerIds: z.array(z.string().min(1)),
});

export const welcomeMessageSchema = z.object({
  type: z.literal("WELCOME"),
  playerId: z.string().min(1),
  sessionToken: z.string().min(20),
  match: matchSnapshotSchema,
  serverTime: z.number(),
}) satisfies z.ZodType<WelcomeMessage>;

export const matchStateMessageSchema = z.object({
  type: z.literal("MATCH_STATE"),
  match: matchSnapshotSchema,
  serverTime: z.number(),
}) satisfies z.ZodType<MatchStateMessage>;

export const errorMessageSchema = z.object({
  type: z.literal("ERROR"),
  code: serverErrorCodeSchema,
  message: z.string().min(1),
  requestId: z.string().optional(),
}) satisfies z.ZodType<ErrorMessage>;

export const pongMessageSchema = z.object({
  type: z.literal("PONG"),
  clientTime: z.number(),
  serverTime: z.number(),
}) satisfies z.ZodType<PongMessage>;

export const shotSourceSchema = z.enum(["camera", "manual"]);

export const orientationReadingSchema = z.object({
  alpha: z.number().min(0).max(360),
  beta: z.number().min(-180).max(180),
  gamma: z.number().min(-90).max(90),
  absolute: z.boolean(),
});

export const shotEvidenceSchema = z.object({
  source: shotSourceSchema,
  markerId: z.string().min(6).max(32).nullable(),
  offsetX: z.number().min(-1).max(1),
  offsetY: z.number().min(-1).max(1),
  confidence: z.number().min(0).max(1),
  distanceMeters: z.number().min(0.1).max(200),
  capturedAt: z.number().nonnegative(),
  orientation: orientationReadingSchema.nullable(),
});

export const shotRejectReasonSchema = z.enum([
  "WRONG_PHASE",
  "NOT_ALIVE",
  "SPAWN_PROTECTED",
  "NO_WEAPON",
  "RELOADING",
  "COOLDOWN",
  "TARGET_UNAVAILABLE",
  "SELF_TARGET",
  "TARGET_PROTECTED",
  "AIM_INVALID",
  "OUT_OF_RANGE",
  "MANUAL_TARGETING_DISABLED",
]);

export const shotAcceptedMessageSchema = z.object({
  type: z.literal("SHOT_ACCEPTED"),
  requestId: z.string(),
  targetId: z.string(),
  damage: z.number().int().nonnegative(),
  shieldDamage: z.number().int().nonnegative(),
  healthDamage: z.number().int().nonnegative(),
  targetHealth: z.number().int().nonnegative(),
  targetShield: z.number().int().nonnegative(),
  eliminated: z.boolean(),
  ammo: z.number().int().nonnegative(),
  nextShotAt: z.number(),
  reloadCompleteAt: z.number().nullable(),
  serverTime: z.number(),
}) satisfies z.ZodType<ShotAcceptedMessage>;

export const shotRejectedMessageSchema = z.object({
  type: z.literal("SHOT_REJECTED"),
  requestId: z.string(),
  reason: shotRejectReasonSchema,
  message: z.string().min(1),
  serverTime: z.number(),
}) satisfies z.ZodType<ShotRejectedMessage>;

export const damageEventSchema = z.object({
  type: z.literal("DAMAGE_EVENT"),
  attackerId: z.string(),
  victimId: z.string(),
  damage: z.number().int().nonnegative(),
  shieldDamage: z.number().int().nonnegative(),
  healthDamage: z.number().int().nonnegative(),
  targetHealth: z.number().int().nonnegative(),
  targetShield: z.number().int().nonnegative(),
  eliminated: z.boolean(),
  respawnAt: z.number().nullable(),
  serverTime: z.number(),
}) satisfies z.ZodType<DamageEvent>;

export const eliminationEventSchema = z.object({
  type: z.literal("ELIMINATION_EVENT"),
  playerId: z.string(),
  byPlayerId: z.string(),
  score: z.number().int().nonnegative(),
  serverTime: z.number(),
}) satisfies z.ZodType<EliminationEvent>;

export const serverMessageSchema = z.discriminatedUnion("type", [
  welcomeMessageSchema,
  matchStateMessageSchema,
  errorMessageSchema,
  pongMessageSchema,
  shotAcceptedMessageSchema,
  shotRejectedMessageSchema,
  damageEventSchema,
  eliminationEventSchema,
]);

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("RESUME_MATCH"),
    requestId: requestIdSchema,
    matchId: z.string().min(1).max(64),
    playerId: z.string().min(1).max(64),
    sessionToken: z.string().min(20).max(200),
  }),
  z.object({
    type: z.literal("SET_READY"),
    requestId: requestIdSchema,
    ready: z.boolean(),
    configVersion: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("UPDATE_CONFIG"),
    requestId: requestIdSchema,
    config: matchConfigSchema,
  }),
  z.object({
    type: z.literal("START_MATCH"),
    requestId: requestIdSchema,
    configVersion: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("REQUEST_SHOT"),
    requestId: requestIdSchema,
    targetPlayerId: z.string().min(1).max(64),
    evidence: shotEvidenceSchema,
  }),
  z.object({
    type: z.literal("LEAVE_MATCH"),
    requestId: requestIdSchema,
  }),
  z.object({
    type: z.literal("PING"),
    requestId: requestIdSchema,
    clientTime: z.number(),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const createMatchRequestSchema = z.object({
  requestId: requestIdSchema,
  displayName: displayNameSchema,
});

export const joinMatchRequestSchema = z.object({
  requestId: requestIdSchema,
  displayName: displayNameSchema,
});

export const apiErrorBodySchema: z.ZodType<ApiErrorBody> = z.object({
  error: z.object({
    code: serverErrorCodeSchema,
    message: z.string().min(1),
  }),
});

export const matchSessionResponseSchema: z.ZodType<MatchSessionResponse> =
  z.object({
    matchId: z.string().min(1),
    joinCode: z.string().min(1),
    playerId: z.string().min(1),
    sessionToken: z.string().min(20),
    match: matchSnapshotSchema,
    serverTime: z.number(),
  });

export function formatValidationError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return "The request was not valid.";
  }
  const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}
