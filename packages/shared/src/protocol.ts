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
  type ErrorMessage,
  type MatchPlayerSnapshot,
  type MatchSessionResponse,
  type MatchSnapshot,
  type MatchStateMessage,
  type PongMessage,
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

export const serverMessageSchema = z.discriminatedUnion("type", [
  welcomeMessageSchema,
  matchStateMessageSchema,
  errorMessageSchema,
  pongMessageSchema,
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
