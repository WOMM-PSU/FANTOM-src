import type { ServerErrorCode } from "@fantom/shared";

export class GameError extends Error {
  readonly code: ServerErrorCode;
  readonly httpStatus: number;

  constructor(code: ServerErrorCode, message: string, httpStatus = 400) {
    super(message);
    this.name = "GameError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function httpStatusForErrorCode(code: ServerErrorCode): number {
  switch (code) {
    case "INVALID_MESSAGE":
    case "MODE_UNAVAILABLE":
      return 400;
    case "INVALID_SESSION":
      return 401;
    case "NOT_HOST":
      return 403;
    case "MATCH_NOT_FOUND":
      return 404;
    case "RATE_LIMITED":
      return 429;
    case "PAYLOAD_TOO_LARGE":
      return 413;
    case "INTERNAL":
      return 500;
    default:
      return 409;
  }
}

export function gameError(
  code: ServerErrorCode,
  message: string,
): GameError {
  return new GameError(code, message, httpStatusForErrorCode(code));
}
