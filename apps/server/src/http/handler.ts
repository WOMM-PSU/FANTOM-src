import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createMatchRequestSchema,
  formatValidationError,
  joinMatchRequestSchema,
  type MatchSessionResponse,
} from "@fantom/shared";
import { GameError, gameError } from "../errors";
import type { MatchManager, MatchSession } from "../lobby/manager";
import { FixedWindowRateLimiter } from "../networking/rateLimiter";

const MAX_BODY_BYTES = 4_096;
const API_REQUESTS_PER_MINUTE = 30;

export type HttpHandlerOptions = {
  manager: MatchManager;
  corsOrigin: string;
};

type HttpHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  if (response.headersSent) {
    response.end();
    return;
  }
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function sendError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  sendJson(response, status, { error: { code, message } });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new GameError(
      "PAYLOAD_TOO_LARGE",
      "Request body is too large.",
      413,
    );
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new GameError(
        "PAYLOAD_TOO_LARGE",
        "Request body is too large.",
        413,
      );
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    throw gameError("INVALID_MESSAGE", "A JSON request body is required.");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw gameError("INVALID_MESSAGE", "Request body must be valid JSON.");
  }
}

function toSessionResponse(
  session: MatchSession,
  manager: MatchManager,
): MatchSessionResponse {
  return {
    matchId: session.room.id,
    joinCode: session.room.joinCode,
    playerId: session.player.id,
    sessionToken: session.sessionToken,
    match: manager.getSnapshot(session.room),
    serverTime: manager.getServerTime(),
  };
}

function clientIp(request: IncomingMessage): string {
  return request.socket.remoteAddress ?? "unknown";
}

export function createHttpHandler(
  options: HttpHandlerOptions,
): HttpHandler {
  const limiter = new FixedWindowRateLimiter(
    API_REQUESTS_PER_MINUTE,
    60_000,
  );

  return async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", options.corsOrigin);
    response.setHeader("Vary", "Origin");
    response.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS",
    );
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type",
    );
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");

    const origin = request.headers.origin;
    if (
      options.corsOrigin !== "*" &&
      origin !== undefined &&
      origin !== options.corsOrigin
    ) {
      request.resume();
      sendError(
        response,
        403,
        "INVALID_MESSAGE",
        "This origin is not allowed to call the game server.",
      );
      return;
    }

    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", "http://localhost");

    if (url.pathname === "/healthz") {
      if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        sendError(response, 405, "INVALID_MESSAGE", "Method not allowed.");
        return;
      }
      sendJson(response, 200, { ok: true });
      return;
    }

    if (!url.pathname.startsWith("/api/")) {
      sendError(response, 404, "MATCH_NOT_FOUND", "Not found.");
      return;
    }

    if (!limiter.consume(clientIp(request))) {
      request.resume();
      sendError(
        response,
        429,
        "RATE_LIMITED",
        "Too many requests. Wait a moment and try again.",
      );
      return;
    }

    try {
      if (url.pathname === "/api/matches") {
        if (request.method !== "POST") {
          response.setHeader("Allow", "POST");
          sendError(response, 405, "INVALID_MESSAGE", "Method not allowed.");
          return;
        }

        const parsed = createMatchRequestSchema.safeParse(
          await readJsonBody(request),
        );
        if (!parsed.success) {
          throw gameError(
            "INVALID_MESSAGE",
            formatValidationError(parsed.error),
          );
        }

        const session = options.manager.createMatch(
          parsed.data.displayName,
          parsed.data.requestId,
        );
        sendJson(
          response,
          201,
          toSessionResponse(session, options.manager),
        );
        return;
      }

      const joinMatch = /^\/api\/matches\/([^/]+)\/join$/.exec(
        url.pathname,
      );
      if (joinMatch) {
        if (request.method !== "POST") {
          response.setHeader("Allow", "POST");
          sendError(response, 405, "INVALID_MESSAGE", "Method not allowed.");
          return;
        }

        let joinCode: string;
        try {
          joinCode = decodeURIComponent(joinMatch[1] ?? "");
        } catch {
          throw gameError("INVALID_MESSAGE", "That match code is not valid.");
        }

        const parsed = joinMatchRequestSchema.safeParse(
          await readJsonBody(request),
        );
        if (!parsed.success) {
          throw gameError(
            "INVALID_MESSAGE",
            formatValidationError(parsed.error),
          );
        }

        const session = options.manager.joinMatch(
          joinCode,
          parsed.data.displayName,
          parsed.data.requestId,
        );
        sendJson(
          response,
          200,
          toSessionResponse(session, options.manager),
        );
        return;
      }

      sendError(response, 404, "MATCH_NOT_FOUND", "API route not found.");
    } catch (error) {
      if (error instanceof GameError) {
        sendError(response, error.httpStatus, error.code, error.message);
        return;
      }

      console.error(
        "[fantom] unhandled HTTP error:",
        error instanceof Error ? error.message : "unknown error",
      );
      sendError(
        response,
        500,
        "INTERNAL",
        "The game server hit an unexpected error.",
      );
    }
  };
}
