import {
  apiErrorBodySchema,
  matchSessionResponseSchema,
  normalizeJoinCode,
  type MatchSessionResponse,
  type ServerErrorCode,
} from "@fantom/shared";
import { createRequestId } from "./ids";
import { getServerHttpUrl } from "./serverUrl";

const REQUEST_TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  readonly code: ServerErrorCode | "NETWORK";
  readonly status: number;

  constructor(
    code: ServerErrorCode | "NETWORK",
    message: string,
    status = 0,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function postSession(
  path: string,
  body: unknown,
): Promise<MatchSessionResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const serverUrl = getServerHttpUrl();

  let response: Response;
  try {
    response = await fetch(`${serverUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError(
        "NETWORK",
        "The game server took too long to respond.",
      );
    }
    throw new ApiError(
      "NETWORK",
      `Could not reach the game server at ${serverUrl}. Check that it is running and reachable from this device.`,
    );
  } finally {
    clearTimeout(timeout);
  }

  let payload: unknown = null;
  const text = await response.text();
  try {
    payload = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const parsedError = apiErrorBodySchema.safeParse(payload);
    if (parsedError.success) {
      throw new ApiError(
        parsedError.data.error.code,
        parsedError.data.error.message,
        response.status,
      );
    }
    throw new ApiError(
      "INTERNAL",
      `The game server returned an unexpected ${response.status} response.`,
      response.status,
    );
  }

  const parsed = matchSessionResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      "INTERNAL",
      "The game server returned an unexpected response.",
      response.status,
    );
  }
  return parsed.data;
}

export function createMatch(displayName: string): Promise<MatchSessionResponse> {
  return postSession("/api/matches", {
    requestId: createRequestId(),
    displayName,
  });
}

export function joinMatch(
  joinCode: string,
  displayName: string,
): Promise<MatchSessionResponse> {
  const code = normalizeJoinCode(joinCode);
  return postSession(`/api/matches/${encodeURIComponent(code)}/join`, {
    requestId: createRequestId(),
    displayName,
  });
}
