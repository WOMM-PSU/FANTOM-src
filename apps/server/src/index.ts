import { loadServerRuntimeConfig } from "./config";
import { createGameServer } from "./server";

const config = loadServerRuntimeConfig();
const server = await createGameServer({
  port: config.port,
  host: config.host,
  countdownMs: config.countdownMs,
  reconnectGraceMs: config.reconnectGraceMs,
  finishedMatchTtlMs: config.finishedMatchTtlMs,
  lobbyTtlMs: config.lobbyTtlMs,
  cleanupIntervalMs: config.cleanupIntervalMs,
  corsOrigin: config.corsOrigin,
  maxPlayers: config.maxPlayers,
});

console.log(
  `[fantom] game server listening on http://${server.host}:${server.port} (websocket path /ws)`,
);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[fantom] received ${signal}; shutting down`);
  try {
    await server.close();
    process.exitCode = 0;
  } catch (error) {
    console.error(
      "[fantom] shutdown failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    process.exitCode = 1;
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
