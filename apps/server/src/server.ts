import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";
import { DEFAULT_COUNTDOWN_MS, DEFAULT_RECONNECT_GRACE_MS } from "@fantom/shared";
import { createHttpHandler } from "./http/handler";
import { MatchManager } from "./lobby/manager";
import { attachConnection } from "./networking/connection";

const MAX_WS_PAYLOAD_BYTES = 8 * 1_024;

export type GameServerOptions = {
  port?: number;
  host?: string;
  countdownMs?: number;
  reconnectGraceMs?: number;
  finishedMatchTtlMs?: number;
  lobbyTtlMs?: number;
  cleanupIntervalMs?: number;
  corsOrigin?: string;
  maxPlayers?: number;
};

export type RunningGameServer = {
  port: number;
  host: string;
  manager: MatchManager;
  close(): Promise<void>;
};

export async function createGameServer(
  options: GameServerOptions = {},
): Promise<RunningGameServer> {
  const port = options.port ?? 4000;
  const host = options.host ?? "0.0.0.0";
  const corsOrigin = options.corsOrigin ?? "*";

  const manager = new MatchManager({
    countdownMs: options.countdownMs ?? DEFAULT_COUNTDOWN_MS,
    reconnectGraceMs:
      options.reconnectGraceMs ?? DEFAULT_RECONNECT_GRACE_MS,
    finishedMatchTtlMs: options.finishedMatchTtlMs,
    lobbyTtlMs: options.lobbyTtlMs,
    maxPlayers: options.maxPlayers,
  });

  const handleHttp = createHttpHandler({ manager, corsOrigin });

  const httpServer: HttpServer = createServer((request, response) => {
    void handleHttp(request, response).catch((error: unknown) => {
      console.error(
        "[fantom] fatal HTTP handler error:",
        error instanceof Error ? error.message : "unknown error",
      );
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader("Content-Type", "application/json");
      }
      response.end('{"error":{"code":"INTERNAL","message":"Server error."}}');
    });
  });

  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_WS_PAYLOAD_BYTES,
  });

  httpServer.on("upgrade", (request, socket, head) => {
    let pathname: string;
    try {
      pathname = new URL(
        request.url ?? "/",
        "http://localhost",
      ).pathname;
    } catch {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    if (pathname !== "/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    const origin = request.headers.origin;
    if (
      corsOrigin !== "*" &&
      origin !== undefined &&
      origin !== corsOrigin
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, request);
    });
  });

  webSocketServer.on("connection", (socket) => {
    attachConnection(socket, manager);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      httpServer.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      httpServer.off("error", onError);
      resolve();
    };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(port, host);
  });

  const address = httpServer.address();
  if (!address || typeof address === "string") {
    await closeHttpServer(httpServer);
    throw new Error("The game server did not expose a TCP address.");
  }

  const sweep = setInterval(
    () => manager.cleanup(),
    options.cleanupIntervalMs ?? 60_000,
  );
  sweep.unref();

  let closed = false;

  return {
    port: address.port,
    host,
    manager,
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      clearInterval(sweep);

      for (const client of webSocketServer.clients) {
        client.terminate();
      }
      webSocketServer.close();
      manager.destroyAll();

      httpServer.closeAllConnections();
      await closeHttpServer(httpServer);
    },
  };
}

function closeHttpServer(server: HttpServer): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
