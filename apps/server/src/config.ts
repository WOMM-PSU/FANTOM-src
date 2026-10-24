export type ServerRuntimeConfig = {
  port: number;
  host: string;
  countdownMs: number;
  reconnectGraceMs: number;
  finishedMatchTtlMs: number;
  lobbyTtlMs: number;
  cleanupIntervalMs: number;
  corsOrigin: string;
  maxPlayers: number;
};

function parseInteger(
  raw: string | undefined,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `${name} must be an integer between ${min} and ${max} (received "${raw}").`,
    );
  }
  return value;
}

function readInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  return parseInteger(env[name], name, fallback, min, max);
}

function readPort(env: NodeJS.ProcessEnv): number {
  // Some development hosts export PORT=0 ("pick any port"). The game server
  // must stay reachable at a predictable port for phones on the LAN.
  const raw = env.FANTOM_PORT?.trim() || env.PORT?.trim();
  if (!raw || raw === "0") {
    return 4000;
  }
  return parseInteger(raw, "FANTOM_PORT/PORT", 4000, 1, 65_535);
}

export function loadServerRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerRuntimeConfig {
  return {
    port: readPort(env),
    host: env.HOST?.trim() || "0.0.0.0",
    countdownMs: readInteger(env, "COUNTDOWN_MS", 5_000, 0, 60_000),
    reconnectGraceMs: readInteger(
      env,
      "RECONNECT_GRACE_MS",
      60_000,
      5_000,
      10 * 60_000,
    ),
    finishedMatchTtlMs: readInteger(
      env,
      "FINISHED_MATCH_TTL_MS",
      10 * 60_000,
      60_000,
      24 * 60 * 60_000,
    ),
    lobbyTtlMs: readInteger(
      env,
      "LOBBY_TTL_MS",
      4 * 60 * 60_000,
      5 * 60_000,
      24 * 60 * 60_000,
    ),
    cleanupIntervalMs: readInteger(
      env,
      "CLEANUP_INTERVAL_MS",
      60_000,
      5_000,
      60 * 60_000,
    ),
    corsOrigin: env.CORS_ORIGIN?.trim() || "*",
    maxPlayers: readInteger(env, "MAX_PLAYERS", 16, 2, 16),
  };
}
