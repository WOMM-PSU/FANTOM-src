# FANTOM

> Real-world, multiplayer, phone-only laser tag by **Works On My Machine (WOMM-PSU)**.
>
> Real-world movement. Camera-assisted aiming. GPS-based positioning. No dedicated hardware.

## Current milestone: multiplayer lobby and match lifecycle

This repository currently contains the first working vertical slice of FANTOM:

- A host can create a match from a phone-sized web page.
- Another player can join with a four-character code or QR link.
- The lobby is synchronized across clients over a persistent WebSocket.
- Players ready up and see each other's presence and connection state.
- The host can choose Free For All and a match duration; the server validates settings.
- The server owns the countdown, start, authoritative match timer, and end state.
- Sessions survive a page reload through a tab-scoped session credential.
- Disconnected players get a reconnect grace period and the host role transfers cleanly.
- Rejected actions return explicit errors rather than silently changing the UI.

**This is not yet a playable combat game.** Combat, weapons, shields, pickups, GPS boundaries,
the minimap, camera marker detection, orientation fusion, scoring, and the Assassin and Team
Deathmatch rule sets are still to be built. The active-match screen says so explicitly.

See [docs/roadmap.md](docs/roadmap.md) for the prioritized plan and
[docs/architecture.md](docs/architecture.md) for the system design.

## Quick start

Requires **Node.js 22.12+** (tested on Node 24.3) and npm.

```bash
npm install
npm run dev
```

This starts:

- Web app: <http://localhost:3000>
- Game server: <http://localhost:4000> (`/healthz`, WebSocket at `/ws`)

Open the web app in two browser tabs. Session storage is per tab, so the second tab starts as a
new player; an incognito window also works. For a real two-device demo, see the LAN section below.

### Run two phones on the same Wi-Fi

1. Start both processes with `npm run dev`.
2. Find the computer's LAN IPv4 address (`ipconfig` on Windows, `ifconfig`/`ip addr` on macOS/Linux).
3. On both phones, open `http://<LAN-IP>:3000` — **not** `http://localhost:3000`. The lobby warns
   when the page is open on localhost because that invite link cannot work on a phone.
4. Create a match on one phone and join with the code or QR on the other.
5. Allow inbound TCP 3000 and 4000 through the host firewall if prompted.

The game server binds `0.0.0.0:4000` and defaults `CORS_ORIGIN=*` so LAN devices can reach it.
Next.js development resources allow LAN origins through `allowedDevOrigins` (development only).

### Configuration

The game server reads environment variables from the process; it does not auto-load `.env`.
See [.env.example](.env.example) for server settings. `FANTOM_PORT` takes precedence over a
platform-provided `PORT`, and `PORT=0` falls back to 4000 so LAN clients always have a predictable
address.

The web client calls `http(s)://<page-host>:4000` by default. Override it in
`apps/web/.env.local` with `NEXT_PUBLIC_SERVER_URL` when the game server lives elsewhere; see
[apps/web/.env.example](apps/web/.env.example).

For any deployment:

- Serve the web app over HTTPS; camera APIs will require a secure context.
- Use HTTPS/WSS, not plain HTTP.
- Set `CORS_ORIGIN` to the exact web origin instead of `*`.
- Use one persistent server process; active matches are in memory.
- Proxy `/ws` and the HTTP API, or set `NEXT_PUBLIC_SERVER_URL` to the game server origin.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the game server and Next.js dev server together |
| `npm run dev:server` | Game server with `tsx watch` |
| `npm run dev:web` | Next.js on `0.0.0.0:3000` |
| `npm run test` | Shared rules tests and server unit/integration tests |
| `npm run typecheck` | Strict TypeScript across all workspaces |
| `npm run build` | Production Next.js build |
| `npm run verify` | Typecheck, tests, and production build |

## Repository map

```text
fantom/
├── apps/
│   ├── server/                 Node HTTP + WebSocket game server
│   │   ├── src/lobby/          MatchManager: authority, lifecycle, host transfer
│   │   ├── src/networking/     Authenticated socket handling and rate limits
│   │   ├── src/http/           Create/join/health endpoints
│   │   └── tests/              Two-client protocol integration tests
│   └── web/                    Next.js mobile-first app
│       ├── app/                Landing, join, and match routes
│       ├── components/         Lobby, countdown, live, and join UI
│       ├── hooks/              WebSocket session hook
│       └── lib/                API, session storage, URL, formatting
├── packages/shared/            Shared types, Zod protocol, rules, constants
├── docs/                       Architecture, testing, roadmap
├── CLAUDE.md                   Project specification
└── .env.example
```

## Protocol and authority in one paragraph

Creating and joining a match happen over HTTP, which returns an unguessable per-player session
token. The browser keeps that token in `sessionStorage` and opens a WebSocket, sending
`RESUME_MATCH` to attach to the player. From then on the server sends full `MATCH_STATE`
snapshots and accepts a small set of actions (`SET_READY`, `UPDATE_CONFIG`, `START_MATCH`,
`LEAVE_MATCH`, `PING`). The server validates membership, phase, host role, configuration version,
readiness, connection state, payload size, and message rate. Clients cannot set health, scores,
phase, roles, or any other consequential state; those fields exist in the shared snapshot only as
server-initialized values for the combat milestone.

## Verified in this milestone

- `npm run typecheck` passes for shared, server, and web.
- `npm run test` passes: **45 tests** across shared rules and server behavior.
- `npm run build` produces a working Next.js production build.
- Browser verification with two isolated client tabs: create, join via QR/code URL, synchronized
  lobby, ready-up, server countdown, live server timer, reload/resume without a duplicate player,
  leave/removal from both views, and a 2-minute match reaching the synchronized finished screen.
- At a 390 × 844 viewport the finished-match layout has no horizontal overflow, and the primary
  action button is full-width and 54 px tall.

The automated tests use real HTTP and real WebSocket clients, not mocked sockets. See
[docs/testing.md](docs/testing.md).

## Known limitations and technical risks

### Combat and game modes

Only Free For All is selectable. The match initializes health and spawn-protection fields, but
there is no firing, damage, ammunition, reload, shield, elimination, scoring, or winner logic yet.
Assassin and Team Deathmatch are visible as disabled options so the UI does not imply they work.

### Camera and orientation

Camera access requires HTTPS (or localhost). iOS Safari additionally requires
`DeviceOrientationEvent.requestPermission()` from a user gesture, and sensor coordinate frames
differ between devices. Camera marker detection and orientation fusion are **not implemented**;
no part of this build claims camera-assisted aiming works. The next phase must test on real iOS
and Android hardware before the feature is described as functional.

### GPS

GPS is **not implemented**. Indoor accuracy can be tens of meters, and short-range distance from
GPS alone is not reliable enough to trust for hits. The arena phase will need accuracy checks,
a confirmation window, boundary hysteresis, and a clearly labeled development simulation for
indoor demos. No simulated position data is currently presented as live GPS.

### Shot validation and anti-cheat

The eventual hybrid aiming model relies partly on client-reported camera evidence, which a
modified client can forge. Server-side range, target eligibility, phase, cooldown, and rate rules
reduce mistakes but are not cryptographic proof of a real-world hit. This build makes no
anti-cheat claim.

### Infrastructure

- Active matches live in one server process and are lost on restart. This is acceptable for the
  hackathon demo but must be documented to players; reconnect after a server restart cannot
  restore the match.
- No Supabase or other durable store is used yet. Match history, accounts, and persistence are
  deferred.
- Session tokens are 256-bit random values, stored hashed on the server and kept in
  `sessionStorage`; they are not placed in QR codes or URLs. On plain-HTTP LAN demos the traffic
  itself is not encrypted, so use a trusted network. Production must use HTTPS.
- HTTP creation/joining is open by design and rate-limited, with a wildcard CORS default for LAN
  development. Lock CORS down for any public deployment.
- There is no account system; a display name is the only identity players see.

### Browser support

The UI is mobile-first and uses modern CSS, but it has not yet been tested on physical iOS or
Android devices. The camera/GPS phases will require a documented support matrix and graceful
failure messages.

## Team

- Project: **FANTOM**
- Team: **Works On My Machine**
- Organization: [WOMM-PSU](https://github.com/WOMM-PSU)
