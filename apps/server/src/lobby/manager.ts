import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  DEFAULT_COUNTDOWN_MS,
  DEFAULT_MATCH_CONFIG,
  DEFAULT_MAX_HEALTH,
  DEFAULT_RECONNECT_GRACE_MS,
  FFA_SPAWN_PROTECTION_MS,
  MAX_PLAYERS,
  PLAYER_COLORS,
  START_BLOCK_MESSAGES,
  evaluateStart,
  generateJoinCode,
  isModePlayable,
  normalizeDisplayName,
  normalizeJoinCode,
  parseMatchConfig,
  type MatchConfig,
  type MatchPlayerSnapshot,
  type MatchPhase,
  type MatchSnapshot,
  type PlayerRole,
  type PlayerStatus,
  type ServerMessage,
} from "@fantom/shared";
import { gameError } from "../errors";

export type ConnectionHandle = {
  send(message: ServerMessage): void;
  close(code?: number, reason?: string): void;
};

export type PlayerRecord = {
  id: string;
  displayName: string;
  color: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  joinedAt: number;
  sessionHash: string;
  connection: ConnectionHandle | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
  role: PlayerRole;
  status: PlayerStatus;
  health: number;
  maxHealth: number;
  shield: number;
  weaponId: string | null;
  ammo: number;
  spawnLockedUntil: number;
};

export type MatchRoom = {
  id: string;
  joinCode: string;
  phase: MatchPhase;
  hostPlayerId: string;
  config: MatchConfig;
  configVersion: number;
  createdAt: number;
  players: Map<string, PlayerRecord>;
  countdownEndsAt: number | null;
  startedAt: number | null;
  endsAt: number | null;
  finishedAt: number | null;
  endReason: MatchSnapshot["endReason"];
  countdownTimer: ReturnType<typeof setTimeout> | null;
  endTimer: ReturnType<typeof setTimeout> | null;
};

export type MatchSession = {
  room: MatchRoom;
  player: PlayerRecord;
  sessionToken: string;
};

export type MatchManagerOptions = {
  countdownMs?: number;
  reconnectGraceMs?: number;
  finishedMatchTtlMs?: number;
  lobbyTtlMs?: number;
  maxPlayers?: number;
  now?: () => number;
};

type CachedSession = {
  session: MatchSession;
  expiresAt: number;
};

const SESSION_CACHE_TTL_MS = 30_000;
const SESSION_CACHE_MAX_ENTRIES = 500;

function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sessionMatches(storedHash: string, providedToken: string): boolean {
  const expected = Buffer.from(storedHash, "hex");
  const actual = createHash("sha256").update(providedToken).digest();
  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}

export class MatchManager {
  private readonly matches = new Map<string, MatchRoom>();
  private readonly matchesByCode = new Map<string, MatchRoom>();
  private readonly createCache = new Map<string, CachedSession>();
  private readonly joinCache = new Map<string, CachedSession>();

  private readonly countdownMs: number;
  private readonly reconnectGraceMs: number;
  private readonly finishedMatchTtlMs: number;
  private readonly lobbyTtlMs: number;
  private readonly maxPlayers: number;
  private readonly now: () => number;

  constructor(options: MatchManagerOptions = {}) {
    this.countdownMs = options.countdownMs ?? DEFAULT_COUNTDOWN_MS;
    this.reconnectGraceMs =
      options.reconnectGraceMs ?? DEFAULT_RECONNECT_GRACE_MS;
    this.finishedMatchTtlMs =
      options.finishedMatchTtlMs ?? 10 * 60 * 1_000;
    this.lobbyTtlMs = options.lobbyTtlMs ?? 4 * 60 * 60 * 1_000;
    this.maxPlayers = options.maxPlayers ?? MAX_PLAYERS;
    this.now = options.now ?? Date.now;
  }

  getServerTime(): number {
    return this.now();
  }

  createMatch(displayNameInput: string, requestId?: string): MatchSession {
    const now = this.now();

    if (requestId) {
      const cached = this.createCache.get(requestId);
      if (cached && cached.expiresAt > now) {
        return cached.session;
      }
      if (cached) {
        this.createCache.delete(requestId);
      }
    }

    const joinCode = this.generateUniqueJoinCode();
    const room: MatchRoom = {
      id: randomUUID(),
      joinCode,
      phase: "lobby",
      hostPlayerId: "",
      config: { ...DEFAULT_MATCH_CONFIG },
      configVersion: 0,
      createdAt: now,
      players: new Map(),
      countdownEndsAt: null,
      startedAt: null,
      endsAt: null,
      finishedAt: null,
      endReason: null,
      countdownTimer: null,
      endTimer: null,
    };

    const player = this.createPlayer(displayNameInput, true, now);
    const sessionToken = createSessionToken();

    this.assignColor(room, player);
    player.sessionHash = hashSessionToken(sessionToken);
    room.hostPlayerId = player.id;
    room.players.set(player.id, player);

    this.matches.set(room.id, room);
    this.matchesByCode.set(room.joinCode, room);

    const session: MatchSession = { room, player, sessionToken };
    if (requestId) {
      this.cacheSession(this.createCache, requestId, session, now);
    }
    return session;
  }

  joinMatch(
    joinCodeInput: string,
    displayNameInput: string,
    requestId?: string,
  ): MatchSession {
    const now = this.now();
    const joinCode = normalizeJoinCode(joinCodeInput);
    const cacheKey = requestId ? `${joinCode}:${requestId}` : null;

    if (cacheKey) {
      const cached = this.joinCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cached.session;
      }
      if (cached) {
        this.joinCache.delete(cacheKey);
      }
    }

    const room = this.matchesByCode.get(joinCode);
    if (!room) {
      throw gameError("MATCH_NOT_FOUND", "No match was found with that code.");
    }
    if (room.phase !== "lobby") {
      throw gameError(
        "MATCH_NOT_JOINABLE",
        "This match has already started. Ask the host to create a new one.",
      );
    }
    if (room.players.size >= this.maxPlayers) {
      throw gameError(
        "MATCH_FULL",
        `This match is full (${this.maxPlayers} players maximum).`,
      );
    }

    const displayName = normalizeDisplayName(displayNameInput);
    if (!displayName) {
      throw gameError("INVALID_MESSAGE", "A display name is required.");
    }
    if (
      [...room.players.values()].some(
        (player) =>
          player.displayName.toLowerCase() === displayName.toLowerCase(),
      )
    ) {
      throw gameError(
        "DISPLAY_NAME_TAKEN",
        "That call sign is already in this match. Choose another.",
      );
    }

    const player = this.createPlayer(displayName, false, now);
    const sessionToken = createSessionToken();
    this.assignColor(room, player);
    player.sessionHash = hashSessionToken(sessionToken);
    room.players.set(player.id, player);

    const session: MatchSession = { room, player, sessionToken };
    if (cacheKey) {
      this.cacheSession(this.joinCache, cacheKey, session, now);
    }

    this.broadcast(room);
    return session;
  }

  resume(
    matchId: string,
    playerId: string,
    sessionToken: string,
    connection: ConnectionHandle,
  ): { room: MatchRoom; player: PlayerRecord } {
    const room = this.matches.get(matchId);
    const player = room?.players.get(playerId);

    if (
      !room ||
      !player ||
      !sessionMatches(player.sessionHash, sessionToken)
    ) {
      throw gameError(
        "INVALID_SESSION",
        "That match session is no longer valid. Join again if the match is still open.",
      );
    }

    const previousConnection = player.connection;
    player.connection = connection;
    player.connected = true;

    if (player.graceTimer) {
      clearTimeout(player.graceTimer);
      player.graceTimer = null;
    }

    if (previousConnection && previousConnection !== connection) {
      try {
        previousConnection.close(
          4001,
          "Session resumed in another connection",
        );
      } catch {
        // The old socket may already be closing; nothing else to clean up.
      }
    }

    return { room, player };
  }

  disconnect(
    room: MatchRoom,
    player: PlayerRecord,
    connection: ConnectionHandle,
  ): void {
    if (player.connection !== connection) {
      return;
    }

    player.connection = null;
    player.connected = false;
    this.broadcast(room);

    if (!room.players.has(player.id)) {
      return;
    }

    if (player.graceTimer) {
      clearTimeout(player.graceTimer);
    }

    player.graceTimer = setTimeout(() => {
      player.graceTimer = null;
      if (!player.connected && room.players.has(player.id)) {
        this.removePlayer(room, player);
      }
    }, this.reconnectGraceMs);
  }

  leave(room: MatchRoom, player: PlayerRecord): void {
    this.removePlayer(room, player);
  }

  setReady(
    room: MatchRoom,
    player: PlayerRecord,
    ready: boolean,
    configVersion: number,
  ): void {
    this.assertMember(room, player);

    if (room.phase !== "lobby") {
      throw gameError("WRONG_PHASE", START_BLOCK_MESSAGES.WRONG_PHASE);
    }
    if (configVersion !== room.configVersion) {
      throw gameError("STALE_CONFIG", START_BLOCK_MESSAGES.STALE_CONFIG);
    }

    player.ready = ready;
    this.broadcast(room);
  }

  updateConfig(
    room: MatchRoom,
    actor: PlayerRecord,
    configInput: unknown,
  ): void {
    this.assertMember(room, actor);

    if (room.phase !== "lobby") {
      throw gameError("WRONG_PHASE", START_BLOCK_MESSAGES.WRONG_PHASE);
    }
    if (actor.id !== room.hostPlayerId) {
      throw gameError("NOT_HOST", "Only the host can change match settings.");
    }

    const config = parseMatchConfig(configInput);
    if (!config) {
      throw gameError("INVALID_MESSAGE", "Those match settings are not valid.");
    }
    if (!isModePlayable(config.mode)) {
      throw gameError(
        "MODE_UNAVAILABLE",
        "That game mode is not available in this build.",
      );
    }

    room.config = config;
    room.configVersion += 1;
    for (const player of room.players.values()) {
      player.ready = false;
    }
    this.broadcast(room);
  }

  startMatch(
    room: MatchRoom,
    actor: PlayerRecord,
    requestedConfigVersion: number,
  ): void {
    this.assertMember(room, actor);

    const evaluation = evaluateStart({
      actorId: actor.id,
      hostPlayerId: room.hostPlayerId,
      phase: room.phase,
      config: room.config,
      configVersion: room.configVersion,
      requestedConfigVersion,
      players: [...room.players.values()].map((player) => ({
        id: player.id,
        ready: player.ready,
        connected: player.connected,
      })),
    });

    if (!evaluation.ok) {
      throw gameError(
        evaluation.reason,
        START_BLOCK_MESSAGES[evaluation.reason],
      );
    }

    const now = this.now();
    room.phase = "countdown";
    room.countdownEndsAt = now + this.countdownMs;
    room.startedAt = null;
    room.endsAt = null;
    room.finishedAt = null;
    room.endReason = null;

    for (const player of room.players.values()) {
      player.ready = false;
    }

    this.broadcast(room);

    room.countdownTimer = setTimeout(() => {
      room.countdownTimer = null;
      this.beginActivePhase(room);
    }, this.countdownMs);
  }

  getSnapshot(room: MatchRoom): MatchSnapshot {
    return {
      matchId: room.id,
      joinCode: room.joinCode,
      phase: room.phase,
      hostPlayerId: room.hostPlayerId,
      config: { ...room.config },
      configVersion: room.configVersion,
      players: [...room.players.values()]
        .sort(
          (left, right) =>
            left.joinedAt - right.joinedAt ||
            left.id.localeCompare(right.id),
        )
        .map((player) => this.toPlayerSnapshot(player)),
      createdAt: room.createdAt,
      countdownEndsAt: room.countdownEndsAt,
      startedAt: room.startedAt,
      endsAt: room.endsAt,
      finishedAt: room.finishedAt,
      endReason: room.endReason,
    };
  }

  broadcast(room: MatchRoom): void {
    const message: ServerMessage = {
      type: "MATCH_STATE",
      match: this.getSnapshot(room),
      serverTime: this.now(),
    };

    for (const player of room.players.values()) {
      player.connection?.send(message);
    }
  }

  cleanup(): void {
    const now = this.now();
    this.pruneCache(this.createCache, now);
    this.pruneCache(this.joinCache, now);

    for (const room of [...this.matches.values()]) {
      const finishedExpired =
        room.phase === "finished" &&
        room.finishedAt !== null &&
        room.finishedAt + this.finishedMatchTtlMs <= now;
      const lobbyExpired =
        room.phase === "lobby" && room.createdAt + this.lobbyTtlMs <= now;

      if (room.players.size === 0 || finishedExpired || lobbyExpired) {
        this.destroyRoom(room);
      }
    }
  }

  destroyAll(): void {
    for (const room of [...this.matches.values()]) {
      this.destroyRoom(room);
    }
    this.createCache.clear();
    this.joinCache.clear();
  }

  private beginActivePhase(room: MatchRoom): void {
    if (room.phase !== "countdown") {
      return;
    }

    const now = this.now();
    room.phase = "active";
    room.startedAt = now;
    room.endsAt = now + room.config.durationSeconds * 1_000;

    // Free For All is the only playable mode in this milestone. This is where
    // mode-specific role and weapon initialization will be added.
    for (const player of room.players.values()) {
      player.ready = false;
      player.role = null;
      player.status = "alive";
      player.maxHealth = DEFAULT_MAX_HEALTH;
      player.health = DEFAULT_MAX_HEALTH;
      player.shield = 0;
      player.weaponId = null;
      player.ammo = 0;
      player.spawnLockedUntil = now + FFA_SPAWN_PROTECTION_MS;
    }

    this.broadcast(room);

    room.endTimer = setTimeout(() => {
      room.endTimer = null;
      this.finishMatch(room);
    }, room.endsAt - now);
  }

  private finishMatch(room: MatchRoom): void {
    if (room.phase !== "active") {
      return;
    }

    room.phase = "finished";
    room.finishedAt = this.now();
    room.endReason = "timer_expired";
    this.broadcast(room);
  }

  private removePlayer(room: MatchRoom, player: PlayerRecord): void {
    if (!room.players.has(player.id)) {
      return;
    }

    if (player.graceTimer) {
      clearTimeout(player.graceTimer);
      player.graceTimer = null;
    }

    room.players.delete(player.id);
    player.isHost = false;

    if (room.hostPlayerId === player.id) {
      const players = [...room.players.values()];
      const nextHost =
        players.find((candidate) => candidate.connected) ?? players[0] ?? null;
      room.hostPlayerId = nextHost?.id ?? "";
      if (nextHost) {
        nextHost.isHost = true;
      }
    }

    if (room.players.size === 0) {
      this.destroyRoom(room);
      return;
    }

    this.broadcast(room);
  }

  private destroyRoom(room: MatchRoom): void {
    if (room.countdownTimer) {
      clearTimeout(room.countdownTimer);
      room.countdownTimer = null;
    }
    if (room.endTimer) {
      clearTimeout(room.endTimer);
      room.endTimer = null;
    }
    for (const player of room.players.values()) {
      if (player.graceTimer) {
        clearTimeout(player.graceTimer);
        player.graceTimer = null;
      }
      player.connection = null;
    }

    this.matches.delete(room.id);
    if (this.matchesByCode.get(room.joinCode) === room) {
      this.matchesByCode.delete(room.joinCode);
    }
  }

  private assertMember(room: MatchRoom, player: PlayerRecord): void {
    if (room.players.get(player.id) !== player) {
      throw gameError(
        "INVALID_SESSION",
        "Your match session is no longer active.",
      );
    }
  }

  private createPlayer(
    displayNameInput: string,
    isHost: boolean,
    now: number,
  ): PlayerRecord {
    const displayName = normalizeDisplayName(displayNameInput);
    if (!displayName) {
      throw gameError("INVALID_MESSAGE", "A display name is required.");
    }

    return {
      id: randomUUID(),
      displayName,
      color: PLAYER_COLORS[0],
      isHost,
      ready: false,
      connected: false,
      joinedAt: now,
      sessionHash: "",
      connection: null,
      graceTimer: null,
      role: null,
      status: "alive",
      health: DEFAULT_MAX_HEALTH,
      maxHealth: DEFAULT_MAX_HEALTH,
      shield: 0,
      weaponId: null,
      ammo: 0,
      spawnLockedUntil: 0,
    };
  }

  private assignColor(room: MatchRoom, player: PlayerRecord): void {
    const usedColors = new Set(
      [...room.players.values()].map((candidate) => candidate.color),
    );
    const available = PLAYER_COLORS.find((color) => !usedColors.has(color));
    player.color =
      available ??
      PLAYER_COLORS[room.players.size % PLAYER_COLORS.length] ??
      PLAYER_COLORS[0] ??
      "#5b9dff";
  }

  private generateUniqueJoinCode(): string {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const code = generateJoinCode();
      if (!this.matchesByCode.has(code)) {
        return code;
      }
    }
    throw gameError(
      "INTERNAL",
      "Could not allocate a match code. Try again.",
    );
  }

  private cacheSession(
    cache: Map<string, CachedSession>,
    key: string,
    session: MatchSession,
    now: number,
  ): void {
    cache.set(key, {
      session,
      expiresAt: now + SESSION_CACHE_TTL_MS,
    });
    this.pruneCache(cache, now);
  }

  private pruneCache(
    cache: Map<string, CachedSession>,
    now: number,
  ): void {
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) {
        cache.delete(key);
      }
    }
    while (cache.size > SESSION_CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (!oldest) {
        break;
      }
      cache.delete(oldest);
    }
  }

  private toPlayerSnapshot(player: PlayerRecord): MatchPlayerSnapshot {
    return {
      id: player.id,
      displayName: player.displayName,
      color: player.color,
      isHost: player.isHost,
      ready: player.ready,
      connected: player.connected,
      joinedAt: player.joinedAt,
      role: player.role,
      status: player.status,
      health: player.health,
      maxHealth: player.maxHealth,
      shield: player.shield,
      weaponId: player.weaponId,
      ammo: player.ammo,
      spawnLockedUntil: player.spawnLockedUntil,
    };
  }
}
