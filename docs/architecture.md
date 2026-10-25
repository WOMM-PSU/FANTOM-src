# Architecture

## Scope of this document

This describes the code that exists today: the multiplayer lobby, server-controlled match
lifecycle, authoritative Free For All combat, the camera-assisted aim pipeline, and the fullscreen
HUD. GPS arena boundaries, the minimap, pickups, and the Assassin/Team Deathmatch rules are future
work; their expected integration points are called out, but they are not implemented.

## Components

```text
┌──────────────────────────────┐          ┌────────────────────────────────┐
│ Phone browser                │          │ Game server (:4000)            │
│                              │          │                                │
│ Next.js / React UI            │  HTTP    │ POST /api/matches              │
│  - landing, lobby, camera HUD │ ───────▶ │ POST /api/matches/:code/join   │
│  - local marker detection     │ ◀─────── │ GET  /healthz                  │
│                              │          │                                │
│ Shared Zod protocol           │  WSS     │ /ws                            │
│  - runtime validation         │ ◀──────▶ │  MatchManager (authority)      │
│  - shared rules/constants     │          │  - match rooms, timers          │
│  - display-name sanitization  │          │  - sessions, host transfer      │
└──────────────────────────────┘          │  - rate limits, validation      │
                                          └────────────────────────────────┘
```

The two processes are intentionally separate. The web app is a static/SSR shell that can be
deployed on any Next.js host; the game server is a persistent Node process for the duration of a
match. There is no database in this milestone.

## Session issuance and authentication

1. `POST /api/matches` validates a display name, creates a match room and its host player, and
   returns:
   - `matchId`, `joinCode`, `playerId`
   - a 256-bit random `sessionToken`
   - the current lobby snapshot and server timestamp
2. `POST /api/matches/:joinCode/join` does the same for a joining player. Joining is only allowed
   in the `lobby` phase and while the room is below the player cap.
3. The server stores only a SHA-256 hash of the token. The raw token is returned once to the
   requesting browser and is never included in a URL, QR code, or server state snapshot.
4. The browser stores the token and identifiers in `sessionStorage` under a per-match key.
5. The browser opens `ws://…/ws` and sends `RESUME_MATCH` with the credentials. The server
   compares the token hash in constant time and attaches the socket to the existing player.
6. If the same session resumes from another socket, the old socket is closed with code `4001`.
   A close from the superseded socket does not mark the player disconnected.

**Why HTTP for create/join instead of a WebSocket message?** It makes joining an explicit user
action with normal HTTP errors and idempotent request IDs, and it avoids "auto-join on mount"
effects creating duplicate players during React development StrictMode double-mounts. The
WebSocket is reserved for authenticated match state and actions. The join code is discovery, not
authorization; the 256-bit token is authorization.

## Server authority

`MatchManager` owns the source of truth. Clients receive a complete `MatchSnapshot` after every
consequential mutation and may only request actions:

| Client action | Server checks |
| --- | --- |
| `RESUME_MATCH` | Match exists, player exists, token hash matches, session belongs to this room |
| `SET_READY` | Membership, `lobby` phase, current `configVersion` |
| `UPDATE_CONFIG` | Membership, host role, `lobby` phase, Zod-validated config, playable mode |
| `START_MATCH` | Host role, `lobby` phase, current config version, connected players, all ready, minimum players |
| `REQUEST_SHOT` | Membership, `active` phase, shooter alive, spawn lock, weapon, reload, ammo, fire interval, target eligibility, marker identity, reticle offset, confidence, orientation presence, range |
| `LEAVE_MATCH` | Membership; host transfer if needed |
| `PING` | Always allowed, including before authentication |

The server owns the phase, host identity, countdown/start/end timestamps, config version, and all
player fields. The Next.js UI computes countdown and remaining-time *displays* from server
timestamps plus a measured clock offset; it never transitions the match itself. When the server
timer fires, it broadcasts the new phase.

### Match lifecycle

```text
lobby ──START_MATCH (host, valid)──▶ countdown ──server timer──▶ active ──timer──▶ finished
  ▲                                     │                          │
  └─────────────────────────────────────┴──────────────────────────┘
         config changes and ready actions are only accepted in lobby
```

- Countdown defaults to 5,000 ms (`COUNTDOWN_MS`; tests inject a short value).
- Active phase sets `startedAt`/`endsAt` from server time and initializes every player's health,
  status, role, weapon, ammo, and spawn-protection values. Only Free For All role/weapon
  initialization is defined in this milestone.
- Active phase also spawns every player with the Pulse, full health, and FFA spawn protection.
  Accepted shots consume ammunition, apply shield-first damage, start automatic reloads, and can
  eliminate and schedule a respawn.
- Finished phase records `finishedAt`, `endReason: "timer_expired"`, and the winner IDs derived from
  server-owned scores. Ties produce multiple winner IDs or an empty list, which the UI presents as
  a draw.
- Timers are process-local `setTimeout` handles tied to the room and cleared when a room is
  destroyed.

### Ready and configuration versions

Each match has a monotonically increasing `configVersion`. Changing mode or duration increments
it and clears every player's ready flag. `SET_READY` and `START_MATCH` include the version the
client acted on; stale requests receive `STALE_CONFIG`. This prevents a host starting a match with
settings some players have not acknowledged.

### Presence, reconnect grace, and host transfer

- A WebSocket close marks the player `connected: false` and broadcasts the state.
- The player is retained for `RECONNECT_GRACE_MS` (default 60,000 ms) so a reload or brief network
  drop can resume the same identity.
- If the grace expires, the player is removed. If the host was removed, the host role moves to the
  first connected remaining player, or the first remaining player if nobody is connected.
- An explicit leave removes the player immediately.
- `START_MATCH` rejects while any player is disconnected, so the lobby cannot start with ghosts.
- The active match timer continues while players are disconnected; there is no pause.

### Cleanup

A sweep runs every `CLEANUP_INTERVAL_MS` (default 60 s) and deletes:

- finished rooms older than `FINISHED_MATCH_TTL_MS` (default 10 min),
- lobby rooms older than `LOBBY_TTL_MS` (default 4 h),
- empty rooms.

The create/join idempotency caches expire after 30 s and are capped at 500 entries. All of this is
in memory; see [Deployment model](#deployment-model).

## Protocol

Shared TypeScript types and Zod schemas live in `packages/shared`. The server validates every
incoming JSON payload with `clientMessageSchema`; the browser validates every server message with
`serverMessageSchema`. TypeScript alone is not treated as runtime validation.

### Client → server

```text
RESUME_MATCH  { requestId, matchId, playerId, sessionToken }
SET_READY     { requestId, ready, configVersion }
UPDATE_CONFIG { requestId, config }
START_MATCH   { requestId, configVersion }
LEAVE_MATCH   { requestId }
PING          { requestId, clientTime }
```

All mutating messages carry a request ID. The server keeps the 200 most recent IDs per socket and
ignores duplicates, which makes retries harmless. Message size is capped at 8 KiB by `ws`, HTTP
bodies at 4 KiB, and each socket gets 40 messages per 5 seconds. HTTP is limited to 30 requests per
minute per source address in this implementation.

### Server → client

```text
WELCOME          { playerId, sessionToken, match, serverTime }  // once per successful resume
MATCH_STATE      { match, serverTime }                          // full snapshot after changes
SHOT_ACCEPTED    { targetId, damage, shieldDamage, healthDamage, ammo, reload, … }
SHOT_REJECTED    { reason, message }
DAMAGE_EVENT     { attackerId, victimId, damage, targetHealth, eliminated, respawnAt, … }
ELIMINATION_EVENT{ playerId, byPlayerId, score }
ERROR            { code, message, requestId? }
PONG             { clientTime, serverTime }
```

Full snapshots are intentionally used rather than deltas. Match state is small and changes
infrequently; snapshots eliminate a large class of ordering bugs. Combat events are sent in
addition to the snapshot so the HUD can show hit feedback without waiting for a render, but the
snapshot remains the authoritative state. If combat throughput grows, this decision should be
revisited with measured bandwidth, not guessed.

`matchSnapshotSchema` includes every player field the HUD needs (health, shield, role, weapon,
ammo, spawn lock, respawn time, score, kills/deaths, and a match-scoped public marker ID). The
server mutates those values; clients never do.

## Client connection behavior

`useMatchConnection` owns one WebSocket for a match route:

- It resumes only when a session exists; it never auto-joins a match without a credential.
- On transient close it retries with exponential backoff (0.5 s → 8 s, six attempts).
- On `INVALID_SESSION`/`MATCH_NOT_FOUND` it clears the stored credential and shows the join form.
- On reconnect it sends `RESUME_MATCH`; stale local state is never trusted over the server snapshot.
- A 20-second application heartbeat measures server clock offset for timer display.
- The API and WebSocket URL default to the page hostname port 4000. `NEXT_PUBLIC_SERVER_URL`
  overrides both; this is required when the processes are on different hosts in production.

## Validation and security boundaries

- Display names are normalized (whitespace, control/BiDi characters) and limited to 24 code points
  before render or storage. React escapes them as text.
- Shot requests are Zod-validated, rate-limited per socket, and bounded in payload size. The
  server re-checks marker identity against the current room, reticle offset, confidence,
  orientation presence, range, target eligibility, cooldown, reload, and ammunition.
- GPS coordinates and arena boundaries do not exist yet. When they are added, they must be
  validated and rate-limited at the same boundary.
- Origin allow-listing is available through `CORS_ORIGIN`. The default `*` exists only so phones
  can reach a LAN dev server. It is not a public-deployment default.
- HTTP and WebSocket responses never include another player's session token.
- Session tokens are not cryptographic proof of a person; they prove continuity of a player slot.
- The server logs error messages, not credentials or message bodies.
- There is no TLS in the Node process; a reverse proxy or hosting platform must terminate HTTPS.

## Deployment model

The initial server intentionally keeps matches in memory:

- One process serves all matches; no cross-process coordination or Redis.
- A server restart loses active matches; clients receive `INVALID_SESSION` and must rejoin if a
  match still exists.
- Horizontal scaling would require sticky rooms or a match-to-process routing layer. That is out
  of scope for the hackathon.
- No Supabase/Postgres is used yet. It can be added later for durable match history or optional
  accounts, but it must not become combat authority. The WebSocket game server stays authoritative.
- The web app can be hosted independently from the game server, provided HTTPS/WSS and
  `NEXT_PUBLIC_SERVER_URL` are configured.

## Planned extension points

- **Arena/GPS:** add longitude/latitude plus accuracy and timestamp to player state, a local
  coordinate projection in shared code, boundary hysteresis in `MatchManager`, and out-of-bound
  drain timers. Do not reuse screen pixels as world coordinates.
- **Camera calibration:** compare compass heading against a GPS-derived target bearing once
  positions exist, and calibrate the camera optical frame against the device orientation frame.
  Today the server verifies that orientation data is present but cannot check its agreement with
  a target bearing.
- **Modes:** add server-side role/team assignment and win-condition evaluators; do not expose
  hidden enemy positions in snapshots or minimap layers.
- **Pickups:** add server-owned pickup entities, collection validation, respawn timers, and
  snapshot fields.
