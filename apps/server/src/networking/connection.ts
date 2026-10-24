import type { RawData, WebSocket } from "ws";
import {
  clientMessageSchema,
  formatValidationError,
  type ServerMessage,
} from "@fantom/shared";
import { GameError } from "../errors";
import type {
  ConnectionHandle,
  MatchManager,
  MatchRoom,
  PlayerRecord,
} from "../lobby/manager";
import { FixedWindowRateLimiter } from "./rateLimiter";

const SOCKET_OPEN = 1;

export type ConnectionOptions = {
  authTimeoutMs?: number;
  heartbeatMs?: number;
  maxMessagesPerWindow?: number;
  rateWindowMs?: number;
};

function rawDataToText(data: RawData): string {
  if (typeof data === "string") {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  return data.toString("utf8");
}

export function attachConnection(
  socket: WebSocket,
  manager: MatchManager,
  options: ConnectionOptions = {},
): void {
  const rateLimiter = new FixedWindowRateLimiter(
    options.maxMessagesPerWindow ?? 40,
    options.rateWindowMs ?? 5_000,
  );
  const seenRequestIds = new Set<string>();

  let room: MatchRoom | null = null;
  let player: PlayerRecord | null = null;
  let isAlive = true;
  let rateLimitNotified = false;

  const send = (message: ServerMessage): void => {
    if (socket.readyState !== SOCKET_OPEN) {
      return;
    }
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // A send failure is followed by a close event, where lobby cleanup runs.
    }
  };

  const connection: ConnectionHandle = {
    send,
    close: (code = 1000, reason = "") => {
      if (socket.readyState === SOCKET_OPEN) {
        socket.close(code, reason);
      }
    },
  };

  const authTimer = setTimeout(() => {
    if (!player) {
      socket.close(4008, "Authentication timeout");
    }
  }, options.authTimeoutMs ?? 15_000);
  authTimer.unref?.();

  const heartbeat = setInterval(() => {
    if (!isAlive) {
      socket.terminate();
      return;
    }
    isAlive = false;
    try {
      socket.ping();
    } catch {
      socket.terminate();
    }
  }, options.heartbeatMs ?? 30_000);
  heartbeat.unref?.();

  socket.on("pong", () => {
    isAlive = true;
  });

  socket.on("message", (data) => {
    if (!rateLimiter.consume("socket")) {
      if (!rateLimitNotified) {
        rateLimitNotified = true;
        send({
          type: "ERROR",
          code: "RATE_LIMITED",
          message: "Too many messages. Slow down.",
        });
      }
      socket.close(1008, "Rate limit exceeded");
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawDataToText(data)) as unknown;
    } catch {
      send({
        type: "ERROR",
        code: "INVALID_MESSAGE",
        message: "Message body must be valid JSON.",
      });
      return;
    }

    const parsed = clientMessageSchema.safeParse(payload);
    if (!parsed.success) {
      send({
        type: "ERROR",
        code: "INVALID_MESSAGE",
        message: formatValidationError(parsed.error),
      });
      return;
    }

    const message = parsed.data;

    if (seenRequestIds.has(message.requestId)) {
      return;
    }
    seenRequestIds.add(message.requestId);
    if (seenRequestIds.size > 200) {
      const oldest = seenRequestIds.values().next().value;
      if (oldest) {
        seenRequestIds.delete(oldest);
      }
    }

    if (message.type === "PING") {
      send({
        type: "PONG",
        clientTime: message.clientTime,
        serverTime: manager.getServerTime(),
      });
      return;
    }

    if (!room || !player) {
      if (message.type === "RESUME_MATCH") {
        try {
          const resumed = manager.resume(
            message.matchId,
            message.playerId,
            message.sessionToken,
            connection,
          );
          room = resumed.room;
          player = resumed.player;
          clearTimeout(authTimer);

          send({
            type: "WELCOME",
            playerId: player.id,
            sessionToken: message.sessionToken,
            match: manager.getSnapshot(room),
            serverTime: manager.getServerTime(),
          });
          manager.broadcast(room);
        } catch (error) {
          if (error instanceof GameError) {
            send({
              type: "ERROR",
              code: error.code,
              message: error.message,
              requestId: message.requestId,
            });
            return;
          }
          console.error(
            "[fantom] resume failed:",
            error instanceof Error ? error.message : "unknown error",
          );
          send({
            type: "ERROR",
            code: "INTERNAL",
            message: "The game server hit an unexpected error.",
            requestId: message.requestId,
          });
        }
        return;
      }

      send({
        type: "ERROR",
        code: "INVALID_SESSION",
        message: "Join a match before sending actions.",
        requestId: message.requestId,
      });
      return;
    }

    if (message.type === "RESUME_MATCH") {
      send({
        type: "ERROR",
        code: "ALREADY_AUTHENTICATED",
        message: "This connection is already attached to a match.",
        requestId: message.requestId,
      });
      return;
    }

    try {
      switch (message.type) {
        case "SET_READY":
          manager.setReady(
            room,
            player,
            message.ready,
            message.configVersion,
          );
          break;
        case "UPDATE_CONFIG":
          manager.updateConfig(room, player, message.config);
          break;
        case "START_MATCH":
          manager.startMatch(room, player, message.configVersion);
          break;
        case "LEAVE_MATCH":
          manager.leave(room, player);
          room = null;
          player = null;
          clearTimeout(authTimer);
          socket.close(1000, "Left match");
          break;
        default:
          break;
      }
    } catch (error) {
      if (error instanceof GameError) {
        send({
          type: "ERROR",
          code: error.code,
          message: error.message,
          requestId: message.requestId,
        });
        return;
      }
      console.error(
        "[fantom] message handling failed:",
        error instanceof Error ? error.message : "unknown error",
      );
      send({
        type: "ERROR",
        code: "INTERNAL",
        message: "The game server hit an unexpected error.",
        requestId: message.requestId,
      });
    }
  });

  socket.on("close", () => {
    clearTimeout(authTimer);
    clearInterval(heartbeat);
    if (room && player) {
      manager.disconnect(room, player, connection);
      room = null;
      player = null;
    }
  });

  socket.on("error", (error) => {
    console.warn(
      "[fantom] websocket error:",
      error instanceof Error ? error.message : "unknown error",
    );
  });
}
