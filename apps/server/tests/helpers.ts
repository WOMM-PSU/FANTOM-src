import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import type {
  ApiErrorBody,
  ClientMessage,
  MatchSessionResponse,
  ServerMessage,
} from "@fantom/shared";
import {
  createGameServer,
  type GameServerOptions,
  type RunningGameServer,
} from "../src/server";

type Waiter = {
  matches: (message: ServerMessage) => boolean;
  resolve: (message: ServerMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export async function startTestServer(
  options: GameServerOptions = {},
): Promise<RunningGameServer> {
  return createGameServer({
    port: 0,
    host: "127.0.0.1",
    countdownMs: 60,
    ...options,
  });
}

export type JsonResponse = {
  status: number;
  body: unknown;
  headers: Headers;
};

export async function postJson(
  server: RunningGameServer,
  path: string,
  body: unknown,
): Promise<JsonResponse> {
  const response = await fetch(
    `http://127.0.0.1:${server.port}${path}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed, headers: response.headers };
}

export async function createTestMatch(
  server: RunningGameServer,
  displayName: string,
  requestId = randomUUID(),
): Promise<MatchSessionResponse> {
  const response = await postJson(server, "/api/matches", {
    requestId,
    displayName,
  });
  if (response.status !== 201) {
    throw new Error(
      `Expected 201 creating a match, received ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }
  return response.body as MatchSessionResponse;
}

export async function joinTestMatch(
  server: RunningGameServer,
  joinCode: string,
  displayName: string,
  requestId = randomUUID(),
): Promise<MatchSessionResponse> {
  const response = await postJson(
    server,
    `/api/matches/${encodeURIComponent(joinCode)}/join`,
    { requestId, displayName },
  );
  if (response.status !== 200) {
    throw new Error(
      `Expected 200 joining a match, received ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }
  return response.body as MatchSessionResponse;
}

export function apiErrorCode(response: JsonResponse): string {
  const body = response.body as ApiErrorBody | null;
  return body?.error?.code ?? "NO_ERROR_BODY";
}

export class TestClient {
  readonly closePromise: Promise<{ code: number; reason: string }>;

  private readonly messages: ServerMessage[] = [];
  private waiters: Waiter[] = [];

  private constructor(private readonly socket: WebSocket) {
    this.closePromise = new Promise((resolve) => {
      socket.once("close", (code, reason) => {
        this.rejectWaiters(
          new Error(`Socket closed before the expected message (${code})`),
        );
        resolve({ code, reason: reason.toString() });
      });
    });

    socket.on("message", (data) => {
      let parsed: ServerMessage;
      try {
        parsed = JSON.parse(data.toString()) as ServerMessage;
      } catch {
        return;
      }

      const waiterIndex = this.waiters.findIndex((waiter) =>
        waiter.matches(parsed),
      );
      if (waiterIndex >= 0) {
        const [waiter] = this.waiters.splice(waiterIndex, 1);
        if (waiter) {
          clearTimeout(waiter.timer);
          waiter.resolve(parsed);
        }
        return;
      }

      this.messages.push(parsed);
    });
  }

  static async open(server: RunningGameServer): Promise<TestClient> {
    const socket = new WebSocket(
      `ws://127.0.0.1:${server.port}/ws`,
    );
    await new Promise<void>((resolve, reject) => {
      const onOpen = (): void => {
        socket.off("error", onError);
        resolve();
      };
      const onError = (error: Error): void => {
        socket.off("open", onOpen);
        reject(error);
      };
      socket.once("open", onOpen);
      socket.once("error", onError);
    });
    return new TestClient(socket);
  }

  static async resume(
    server: RunningGameServer,
    session: MatchSessionResponse,
    token = session.sessionToken,
  ): Promise<{
    client: TestClient;
    welcome: Extract<ServerMessage, { type: "WELCOME" }>;
  }> {
    const client = await TestClient.open(server);
    client.send({
      type: "RESUME_MATCH",
      requestId: randomUUID(),
      matchId: session.matchId,
      playerId: session.playerId,
      sessionToken: token,
    });
    const welcome = await client.waitFor("WELCOME");
    return { client, welcome };
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  sendRaw(payload: string): void {
    this.socket.send(payload);
  }

  waitFor<T extends ServerMessage["type"]>(
    type: T,
    predicate?: (
      message: Extract<ServerMessage, { type: T }>,
    ) => boolean,
    timeoutMs = 2_000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const matches = (
      message: ServerMessage,
    ): message is Extract<ServerMessage, { type: T }> =>
      message.type === type &&
      (!predicate ||
        predicate(message as Extract<ServerMessage, { type: T }>));

    const existingIndex = this.messages.findIndex(matches);
    if (existingIndex >= 0) {
      const [existing] = this.messages.splice(existingIndex, 1);
      return Promise.resolve(
        existing as Extract<ServerMessage, { type: T }>,
      );
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex(
          (waiter) => waiter.timer === timer,
        );
        if (index >= 0) {
          this.waiters.splice(index, 1);
        }
        reject(
          new Error(`Timed out waiting for ${type} websocket message`),
        );
      }, timeoutMs);

      this.waiters.push({
        matches,
        resolve: (message) => {
          resolve(message as Extract<ServerMessage, { type: T }>);
        },
        reject,
        timer,
      });
    });
  }

  async leave(): Promise<void> {
    this.send({
      type: "LEAVE_MATCH",
      requestId: randomUUID(),
    });
    await this.closePromise;
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) {
      await this.closePromise;
      return;
    }
    this.socket.close();
    await this.closePromise;
  }

  private rejectWaiters(error: Error): void {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }
}
