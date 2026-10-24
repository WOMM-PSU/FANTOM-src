# FANTOM — Project Specification

> **FANTOM** is a real-world, multiplayer, phone-only laser-tag game by **Works On My Machine (WOMM-PSU)**.
>
> Real-world movement. Camera-assisted aiming. GPS-based positioning. No dedicated hardware.

This document is the source of truth for the project. Follow it when designing, implementing, and modifying the application. If an implementation detail is unspecified, choose the simplest reliable solution that fits the hackathon timeline. Document significant decisions rather than introducing unnecessary complexity.

---

## 1. Project Overview

### 1.1 Vision

FANTOM turns ordinary smartphones into equipment for a real-world multiplayer laser-tag game.

Players create or join a match, physically move around a defined play area, aim using their phone cameras, and shoot other eligible players. GPS provides approximate positioning, while camera-based player identification and device orientation jointly determine whether a shot is valid.

The game should feel immediately understandable to nontechnical players while delivering a compelling technical demonstration.

### 1.2 Team

- Project: FANTOM
- Team: Works On My Machine
- Organization: WOMM-PSU
- GitHub: https://github.com/WOMM-PSU

### 1.3 Core Principles

1. **Phone-only:** No external sensors, wearables, or dedicated game hardware.
2. **Multiplayer first:** Joining a match and playing together must work reliably.
3. **Camera-assisted combat:** Do not rely exclusively on GPS or compass direction to determine hits.
4. **Server-authoritative game state:** Clients must not directly decide damage, eliminations, ammunition, or scores.
5. **Mobile-first:** Prioritize a usable experience on modern iOS and Android phones.
6. **Safety before immersion:** Players must never be encouraged to run while looking at their screens or play near roads, traffic, stairs, or other hazards.
7. **Hackathon scope:** Prefer a polished, demonstrable core game over a large collection of incomplete features.
8. **Graceful degradation:** If camera, GPS, or orientation data is unavailable or unreliable, fail safely and communicate the problem to the player.

---

## 2. Product Scope

### 2.1 MVP Features

The initial working product must support:

- Creating a match.
- Joining through a QR code or short join code.
- A lobby with player list, host controls, settings, and ready states.
- Configurable arena boundaries.
- Three game modes:
  - Free For All
  - Assassin
  - Team Deathmatch
- Live player positions and a configurable minimap.
- Camera-based player marker detection.
- Device-orientation and camera-aim agreement.
- Weapon firing, ammunition, automatic reloads, and damage.
- Health, shields, elimination, and match results.
- Out-of-bounds enforcement.
- Basic reconnect handling.
- A usable mobile HUD.
- A clear match-end screen.

### 2.2 Features to Defer

Do not prioritize these until the core game is playable:

- User accounts or permanent player profiles.
- Persistent progression, XP, or unlock trees.
- Complex cosmetics.
- Global matchmaking.
- Public matchmaking queues.
- Large-scale distributed game servers.
- Microservices.
- Redis or a dedicated distributed cache.
- Complex 3D environments.
- Full AR world reconstruction.
- Mandatory LiDAR or hardware depth sensors.
- Advanced AI scene understanding.
- Sophisticated anti-cheat infrastructure.
- Elaborate kill streaks or seasonal rankings.
- Payments or in-game purchases.

Optional features may be added after the complete core gameplay loop works on real devices.

---

## 3. Recommended Technology Stack

Use TypeScript throughout the main application.

### 3.1 Frontend

- Next.js
- React
- TypeScript
- CSS Modules or another lightweight styling approach
- Browser camera APIs
- Device orientation APIs
- Geolocation API
- A suitable lightweight computer-vision library or custom marker detector

The frontend is a mobile-first web application. Avoid requiring app-store installation for the initial demo.

Camera, orientation, and geolocation access require appropriate browser permissions. Camera access generally requires HTTPS or localhost.

Use feature detection rather than assuming every browser exposes identical sensor APIs.

### 3.2 Backend

- Node.js
- TypeScript
- A persistent WebSocket connection for gameplay communication
- Supabase Postgres for durable data
- Supabase Realtime where appropriate for lobby or noncritical shared updates

The game server must be authoritative for all consequential game-state changes.

Prefer a dedicated WebSocket game-server process over using database broadcasts as the combat authority.

### 3.3 Deployment

Use the simplest deployment setup that supports:

- HTTPS for the frontend.
- Secure WebSocket connections.
- A reachable backend.
- Environment-based configuration.
- A persistent server process during matches.

The initial backend may keep active match state in memory, provided that each match is managed by one server process and reconnect behavior is documented.

Do not assume an in-memory match survives a server restart.

### 3.4 Suggested Repository Structure

Adapt this structure to the actual repository if a suitable structure already exists.

```text
fantom/
├── CLAUDE.md
├── README.md
├── package.json
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── styles/
│   └── server/
│       └── src/
│           ├── game/
│           ├── lobby/
│           ├── networking/
│           ├── validation/
│           └── index.ts
├── packages/
│   └── shared/
│       └── src/
│           ├── types.ts
│           ├── constants.ts
│           └── protocol.ts
├── supabase/
│   └── migrations/
└── docs/
    ├── architecture.md
    └── testing.md
```

Use a monorepo only if it makes shared types and development simpler. Do not restructure an existing working repository solely to match this example.

---

## 4. Game Lifecycle

Every match follows this lifecycle:

1. **Create:** A host creates a new match.
2. **Join:** Other players scan a QR code or enter a short code.
3. **Configure:** The host chooses mode, arena, duration, and applicable rules.
4. **Ready:** Players confirm that their device permissions and game setup are ready.
5. **Countdown:** Players receive time to put their phones in a safe playing position.
6. **Start:** The server initializes roles, weapons, health, timers, and spawn protection.
7. **Play:** The server processes validated actions and broadcasts game state.
8. **End:** The server determines the winner or winning team.
9. **Results:** The application displays winners, eliminations, assists if implemented, and other relevant statistics.

The server controls the match phase. Clients must not independently start or end a match.

Recommended phases:

```ts
type MatchPhase =
  | "lobby"
  | "countdown"
  | "active"
  | "finished";
```

Use explicit transitions and reject actions that are invalid for the current phase.

---

## 5. Lobby and Match Configuration

### 5.1 Joining

- Generate a short, human-readable join code.
- Provide a QR code containing the join URL.
- Allow players to set a display name.
- Avoid requiring accounts for casual matches.
- Assign each player a unique session identity.
- Prevent duplicate active identities from causing inconsistent match state.
- Validate all join requests on the server.

Use unguessable session credentials where needed. A match code is for discovery, not authorization.

### 5.2 Host Controls

The host can:

- Select the game mode.
- Set the match duration.
- Configure the arena.
- Configure the minimap.
- Configure available pickups.
- Configure weapon drops where supported.
- Start the match when the lobby is valid.

The server validates the final configuration. Never trust arbitrary client-supplied game settings.

### 5.3 Ready Checks

Before starting, check:

- The player has joined successfully.
- The player has accepted required permissions.
- The device can access the features required by the chosen mode.
- The player has received the latest match configuration.

If camera access or sensor access fails, explain the issue and provide a retry path. Do not silently pretend aiming is functioning.

---

## 6. Game Modes

## 6.1 Free For All

Every player competes independently.

### Rules

- Players begin without a weapon.
- Weapon pickups are the primary way to acquire weapons.
- A configurable spawn lockout prevents firing immediately after spawning.
- The default spawn lockout is 5 seconds.
- Picking up a weapon does not bypass spawn protection.
- Players have individual health and elimination state.
- The winner is determined by the configured scoring and match-end rules.

### Configurable Settings

- Match duration.
- Arena size and boundary.
- Minimap enabled or disabled.
- Minimap visibility options.
- Player marker visibility.
- Weapon pickup availability.
- Health pickup availability.
- Shield pickup availability.
- Weapon drop spawn frequency.
- Pickup respawn behavior.

If the minimap is enabled, the host should be able to choose which information it displays, subject to the selected mode's rules.

Possible map layers:

- Teammates or players, where permitted.
- Weapon drops.
- Health drops.
- Shield drops.
- Arena boundary.

Do not expose live enemy positions by default in modes where locating enemies is intended to be part of the challenge.

### Suggested Win Conditions

Support a clear, configurable primary objective:

- Highest score when the timer expires.
- Last player standing, if the match is configured for survival.

For the MVP, prefer one well-tested scoring rule rather than implementing multiple complicated scoring systems.

---

## 6.2 Assassin

One player is the Assassin. All other players are Survivors.

### Rules

- The Assassin is selected by the server.
- The Assassin is identified to all players.
- Only the Assassin can use a weapon.
- Survivors cannot fire weapons.
- Weapon drops are disabled.
- Survivors attempt to survive until the timer expires.
- The Assassin attempts to eliminate every Survivor.

### Spawn Protection

- The Assassin has a default 15-second spawn lockout.
- Survivors receive the same initial head start.
- The server must enforce the lockout regardless of client state.

### Map and Tracking

- The minimap may be enabled or disabled.
- If enabled, player tracking should not reveal live Survivor positions to the Assassin by default.
- Any special tracking rule must be explicit in match settings.
- Do not accidentally leak hidden player positions through network messages or UI components.

### Win Conditions

- Assassin wins if all Survivors are eliminated.
- Survivors win if the timer expires with at least one Survivor alive.
- If all players disconnect or a match becomes invalid, handle the state explicitly rather than awarding an arbitrary winner.

The server owns role assignment and win-condition evaluation.

---

## 6.3 Team Deathmatch

Players are assigned to teams. Each team contains Killers and Healers.

### Killer Rules

- Killers can use weapons.
- Killers can damage opposing players.
- Killers cannot heal other players.
- Killers cannot use healing actions.
- Killers start with the Pulse weapon.
- Optional weapon drops may be enabled by the host.

### Healer Rules

- Healers cannot carry or fire guns.
- Healers can heal Killers and other Healers on their own team.
- Healers cannot heal themselves.
- A Healer may heal another Healer.
- Healing is range-limited.
- Healing is subject to cooldowns and interruption rules.

### Team Composition

- The host configures the Killer-to-Healer ratio.
- Each team must contain at least one Killer.
- Invalid team compositions are rejected before the match begins.
- The server assigns and validates roles.

### Initial Healing Balance

Use these starting values:

- Healing range: 5 meters.
- Healing amount: 25 health.
- Cooldown per target: 5 seconds.
- Healing is interrupted if the healer takes damage.
- Healing cannot exceed the target's maximum health.
- A Healer cannot heal a target outside the permitted team or role rules.

These values are provisional and must be play-tested.

### Win Conditions

Use team score or a clearly defined objective.

For the MVP, team score based on eliminations is recommended. When the timer expires, the team with the higher score wins. Define tie behavior explicitly, such as a draw.

The server evaluates team scores and all role restrictions.

---

## 7. Weapons and Combat Balance

Implement three weapons initially.

| Property | Pulse | Ravager | Viper |
|---|---:|---:|---:|
| Damage per hit | 25 | 50 | 10 |
| Magazine size | 12 | 4 | 30 |
| Time between shots | 500 ms | 1,200 ms | 150 ms |
| Automatic reload duration | 1,200 ms | 2,000 ms | 2,500 ms |
| Intended role | Balanced | Heavy damage | Rapid fire |

These are initial balance values, not final guarantees. Keep them in shared configuration rather than scattering magic numbers throughout the codebase.

### 7.1 Pulse

- Balanced damage.
- Moderate fire rate.
- Medium magazine.
- Reliable default weapon.

### 7.2 Ravager

- High damage.
- Small magazine.
- Slow firing rate.
- Long reload.

### 7.3 Viper

- Low damage per shot.
- High firing rate.
- Large magazine.
- Long reload.

### 7.4 Firing Rules

- The client sends a fire request.
- The server checks that the player is alive and eligible to fire.
- The server checks spawn protection, role, weapon ownership, ammunition, reload status, and shot cooldown.
- The server validates the proposed target and any available aiming evidence.
- Only a valid shot consumes ammunition and applies damage.
- Invalid shots must not cause damage.
- The server broadcasts the resulting state.

A client-side button press is not proof of a valid hit.

### 7.5 Automatic Reload

There is no manual reload button.

When a weapon's magazine becomes empty:

1. The server starts that weapon's reload timer.
2. The weapon cannot fire while reloading.
3. The server restores the magazine when the timer completes.
4. The client displays reload progress.
5. The client must not independently refill ammunition.

If weapon switching during reload is supported, each weapon maintains its own reload state. Switching must not cancel or accelerate the original reload.

For the MVP, one carried weapon per player in Free For All is recommended. More complicated inventory behavior can wait.

### 7.6 Timing

Use server-side timestamps and monotonic timing where appropriate.

Do not trust client clocks for cooldowns, reload completion, or damage timing.

Define firing interval as the minimum time between valid shots, not network latency.

---

## 8. Health, Shields, Pickups, and Elimination

### 8.1 Health

Use a default maximum health of 100 unless testing shows a better value.

- Health cannot exceed maximum health.
- Health cannot fall below zero.
- Damage is applied by the server.
- Reaching zero health causes elimination, subject to explicit game rules.

### 8.2 Shield

- A shield pickup grants up to 50 shield points.
- Shield absorbs incoming damage before health.
- Shield cannot exceed its configured maximum.
- Damage absorption is calculated by the server.
- Shield behavior must be identical for all players.

If shield is intended to absorb at most 50 total damage per pickup, enforce that total rather than treating it as an indefinitely reusable effect.

### 8.3 Health Pack

- Restores 25 health.
- Cannot raise health above maximum.
- Cannot revive eliminated players.
- May be enabled in Free For All.
- Disabled in Assassin and Team Deathmatch for the initial implementation unless explicitly configured.

### 8.4 Weapon Cache

- Grants an available weapon.
- Pickup eligibility is validated by the server.
- A pickup cannot be collected more than once.
- Spawn and respawn behavior is server-controlled.
- Pickup state must be broadcast to all relevant clients.

### 8.5 Elimination

When a player is eliminated:

- Set their health to zero.
- Mark their state as eliminated.
- Remove their ability to shoot, heal, collect pickups, or deal damage.
- Update score and team state.
- Notify relevant players.
- Check whether a win condition has been reached.

Prevent duplicate elimination processing when several events occur close together.

---

## 9. Hybrid Camera Aiming System

This is one of FANTOM's defining technical features.

**GPS determines approximate position. Device orientation estimates aiming direction. The camera identifies the visible player marker. A shot is accepted only when the aiming evidence agrees and the target is valid.**

Do not claim that this approach guarantees perfect physical line-of-sight. It is an approximation that must be tested on real devices.

### 9.1 The Problem

GPS alone is not precise enough to determine which player is being aimed at. Compass and orientation readings can drift, and GPS positions can be several meters off.

Camera-only targeting is also insufficient because:

- A visible object may not be a player.
- A player may be partially or completely occluded.
- A marker may be detected incorrectly.
- Apparent marker size varies with distance.
- Camera and orientation measurements can disagree.
- Different phones have different camera and sensor characteristics.

FANTOM combines multiple signals to reduce false hits.

### 9.2 Player Markers

Each active player should display a distinctive, high-contrast marker on their phone screen.

The marker should encode a short-lived or match-specific player identifier in a format that the camera can detect reliably.

Possible implementations:

- A custom visual fiducial marker.
- A QR-like visual code designed for rapid detection.
- A compact high-contrast marker with a robust identifier.

Do not rely on generic object detection to establish player identity.

A marker must map to an active player in the current match. A marker belonging to an eliminated player or another match must not be accepted as a valid target.

Avoid putting sensitive session credentials or authorization tokens inside a publicly visible marker.

### 9.3 Sensor A: Device Orientation

Use device orientation to estimate the direction in which the phone is pointing.

- Request permission where required.
- Calibrate the device and explain how to hold it.
- Account for device-specific sensor conventions.
- Normalize angles and handle wraparound correctly.
- Smooth noisy readings without introducing excessive lag.
- Detect unavailable or unreliable orientation data.

Do not assume raw compass heading and camera optical direction are interchangeable. Their coordinate frames must be calibrated.

### 9.4 Sensor B: Camera Marker Detection

The camera pipeline should:

1. Acquire camera frames.
2. Detect candidate markers.
3. Decode the marker identity.
4. Find the marker's bounding box or center.
5. Determine its angular position relative to the camera's optical axis.
6. Estimate confidence and tracking stability.
7. Reject stale, ambiguous, or invalid detections.

The marker should be close enough to the aiming reticle for the camera-based aiming condition to pass.

Do not transmit continuous camera video to the game server. Process camera frames locally and send only the minimum necessary validated aiming evidence.

### 9.5 Aim Agreement

A shot should be eligible only when the camera and orientation signals agree within a calibrated tolerance.

Conceptually:

```text
orientation direction ─────┐
                           ├── aim agreement ──┐
camera marker direction ───┘                   │
                                               ├── shot eligibility
marker identity and confidence ────────────────┤
range and target validity ─────────────────────┤
occlusion checks, when available ──────────────┘
```

The exact tolerance must be configurable and calibrated using real devices.

Do not hardcode an arbitrary angle and assume it works across every phone.

Reject a shot if:

- Orientation data is missing or too noisy.
- The camera has no valid target marker.
- The detected target identity is ambiguous.
- Camera and orientation directions disagree beyond the allowed tolerance.
- The target is too far away.
- The target is not eligible for damage.
- The target is eliminated or protected.
- The evidence is too old to trust.

### 9.6 Target Distance

GPS can estimate the distance between players, but its error can be significant at short range.

If the marker's physical width is known, apparent size can provide an approximate camera-based distance estimate under suitable camera calibration.

A simplified pinhole-camera relationship is:

```text
distance ≈ focal_length_in_pixels
           × physical_marker_width
           ÷ observed_marker_width_in_pixels
```

This estimate is only valid when the camera parameters and marker dimensions are known sufficiently well.

Do not infer that every detected object is a player based on size alone. A small nearby object can resemble a large distant object.

Combine available evidence:

- Approximate GPS distance.
- Camera-derived marker distance, if calibrated.
- Marker detection confidence.
- Configured maximum range.
- Target identity.
- Orientation agreement.

If range evidence is contradictory or too uncertain, reject the shot.

The maximum range should be configurable and play-tested rather than assumed to be accurate from GPS alone.

### 9.7 Occlusion

Consider the following example:

- Player A aims at Player C.
- A nonplayer person B stands between A and C.
- C's marker is hidden by B.

A must not damage C merely because the compass points in C's approximate direction.

For the MVP:

- Require a valid visible target marker.
- Reject a shot if the target marker is occluded or cannot be confidently detected.
- Do not attempt to recognize every person in the environment as a player.
- Use marker visibility as the basic line-of-sight condition.

Where supported, an optional depth or foreground-occlusion check can improve reliability. Do not require LiDAR or platform-specific depth hardware.

If the camera cannot distinguish a foreground obstruction from the target reliably, prefer rejecting the shot over guessing.

### 9.8 Camera Permissions and Lifecycle

- Request camera access only when needed.
- Explain why it is required.
- Stop camera tracks when leaving the aiming view or ending a match.
- Handle permission denial and camera initialization errors.
- Avoid keeping the camera active in the background unnecessarily.
- Provide a clear indication when aiming is unavailable.
- Avoid collecting or storing camera footage.

### 9.9 Client and Server Responsibilities

The client is responsible for:

- Camera access.
- Local marker detection.
- Sensor calibration.
- Local aiming feedback.
- Producing a target candidate and associated evidence.
- Displaying the reticle and target feedback.

The server is responsible for:

- Player and target eligibility.
- Weapon and ammunition rules.
- Spawn protection.
- Shot cooldown.
- Match phase.
- Maximum permitted range checks using available position data.
- Health and shield calculations.
- Final acceptance or rejection of a shot.
- Damage and elimination.

A client can lie about camera detections. Therefore, client-reported aiming evidence is not cryptographic proof of a real-world hit. Implement basic validation and rate limits, and document this limitation. Do not claim robust anti-cheat based solely on client-side computer vision.

For a hackathon MVP, a well-designed client aiming pipeline combined with authoritative server rules is acceptable.

---

## 10. Arena and GPS Boundaries

### 10.1 Arena Definition

The server maintains an arena boundary.

Use a geographic polygon or another explicit representation suitable for the chosen implementation. Convert geographic coordinates into a local coordinate system when convenient for distance and geometry calculations.

Do not use screen pixels as authoritative physical coordinates.

### 10.2 GPS Updates

Clients periodically submit their location and available accuracy information.

The server should:

- Validate coordinate ranges.
- Reject malformed data.
- Reject implausible movement or update rates.
- Track the age and accuracy of location updates.
- Avoid treating stale coordinates as current.
- Apply boundary hysteresis to reduce GPS-jitter errors.

Do not trust client-reported location as tamper-proof evidence.

### 10.3 Boundary States

Suggested player states:

```ts
type PlayerStatus =
  | "alive"
  | "out_of_zone"
  | "eliminated";
```

A player may be alive but temporarily outside the permitted arena.

### 10.4 Outside-Arena Rules

When a player is confirmed outside the arena:

- Their interface changes to a gray or warning state.
- They cannot shoot.
- They cannot be damaged by other players.
- They cannot heal.
- They cannot collect pickups.
- Their health drains at 10 HP per second.
- At zero health, they are eliminated normally.

When they return inside:

- Start a 1-second grace period.
- Restore normal combat eligibility after the grace period.
- Continue enforcing the match's other restrictions.

All these rules must be applied by the server.

### 10.5 GPS Uncertainty

GPS jitter must not cause rapid transitions between inside and outside.

- Use a configurable boundary margin.
- Require consistent evidence before confirming an exit.
- Track reported accuracy.
- Use a short confirmation window.
- If accuracy is too poor, pause boundary-based combat decisions for that player rather than applying arbitrary damage.
- Clearly tell the player when location quality prevents reliable gameplay.

The 10 HP-per-second drain starts only after a confirmed exit, not on a single noisy coordinate.

### 10.6 Safe Arena Setup

- Encourage play in an open, designated area away from roads and traffic.
- Avoid dangerous locations when selecting boundaries.
- Make boundaries visible before the match begins.
- Give players a clear warning before starting.
- Do not encourage players to run while staring at the phone.
- Provide a safe way to stop or leave a match.

For indoor demonstrations where GPS is unreliable, use a clearly labeled development simulation or manually controlled test positions. Do not silently substitute fake location data in production.

---

## 11. Minimap and HUD

### 11.1 Minimap

The minimap should be compact and usable on a phone.

It may show:

- The arena boundary.
- The local player.
- Teammates where permitted.
- Enemy positions only when the mode allows them.
- Weapon, health, and shield pickups when enabled.

Minimap visibility and its layers are configurable where the mode supports them.

The minimap is informational. It must not override camera-based aiming or server-side target validation.

### 11.2 Main Aiming View

The primary aiming view should prioritize:

- Camera preview.
- Central reticle.
- Target detection state.
- Weapon name.
- Ammunition.
- Reload progress.
- Health and shield.
- Spawn protection timer.
- Arena status.
- Shoot control.

Do not cover the entire camera view with UI.

### 11.3 Visual Feedback

Use consistent states:

- Normal: restrained blue accents.
- Taking damage: brief red flash or directional indicator.
- Out of bounds: gray interface and clear warning.
- Reloading: visible progress and disabled firing.
- Invalid aim: subtle explanation.
- Valid target: distinct target feedback.
- Eliminated: clear end-of-life state.

Do not communicate a confirmed hit until the server confirms it.

### 11.4 Accessibility and Usability

- Use large, touch-friendly controls.
- Keep critical status text readable outdoors.
- Avoid color as the only indicator of status.
- Keep controls away from accidental touches.
- Minimize unnecessary animations.
- Provide a safe, obvious leave-match action.
- Do not require players to operate complicated controls while moving.

---

## 12. Shared Data Model

Keep shared types in a common package so the frontend and backend agree on the protocol.

A starting player model:

```ts
export type PlayerRole =
  | "killer"
  | "healer"
  | "assassin"
  | "survivor"
  | null;

export type PlayerStatus =
  | "alive"
  | "out_of_zone"
  | "eliminated";

export type Player = {
  id: string;
  displayName: string;
  teamId: string | null;
  role: PlayerRole;
  status: PlayerStatus;
  health: number;
  maxHealth: number;
  shield: number;
  weaponId: string | null;
  ammo: number;
  nextShotAt: number;
  reloadCompleteAt: number | null;
  spawnLockedUntil: number;
  x: number | null;
  y: number | null;
  lastLocationAt: number | null;
};
```

This is an initial model, not a requirement to store every property exactly as written. Adjust the model when the implementation demands it.

For location, choose one consistent representation. If using latitude and longitude, name the fields accordingly instead of disguising them as local `x` and `y` coordinates.

### 12.1 Additional Entities

Implement the minimum entities needed:

- Match
- Player
- Team
- Weapon definition
- Pickup
- Shot request
- Shot result
- Match result

Represent weapon definitions as configuration:

```ts
export type WeaponDefinition = {
  id: string;
  name: string;
  damage: number;
  magazineSize: number;
  fireIntervalMs: number;
  reloadDurationMs: number;
};
```

Do not duplicate weapon constants in multiple frontend components.

### 12.2 Validation

Validate network payloads at runtime.

TypeScript types alone do not validate incoming JSON.

Reject:

- Missing required fields.
- Invalid player IDs.
- Invalid target IDs.
- Unknown weapons.
- Invalid coordinates.
- Impossible state transitions.
- Excessive payload sizes.
- Malformed or stale requests.

---

## 13. Networking and Server Authority

### 13.1 General Rules

The server is the source of truth for consequential game state.

Clients may request actions but cannot directly set:

- Health.
- Shield.
- Ammunition.
- Weapon ownership.
- Reload completion.
- Cooldowns.
- Elimination status.
- Match score.
- Match winner.
- Team role.
- Pickup availability.

### 13.2 Suggested Client Messages

Use a documented protocol with explicit message types.

Possible client-to-server messages:

```text
JOIN_MATCH
LEAVE_MATCH
PLAYER_READY
UPDATE_LOCATION
REQUEST_SHOT
REQUEST_HEAL
REQUEST_PICKUP
REQUEST_MATCH_START
```

Possible server-to-client messages:

```text
LOBBY_STATE
MATCH_STARTED
PLAYER_UPDATED
PICKUP_UPDATED
SHOT_ACCEPTED
SHOT_REJECTED
PLAYER_DAMAGED
PLAYER_ELIMINATED
HEAL_APPLIED
MATCH_STATE
MATCH_FINISHED
ERROR
```

These are conceptual names. Define the actual TypeScript message schemas in the shared protocol package.

Do not accept client messages that directly declare another player has been hit.

### 13.3 Shot Requests

A shot request should include only the data necessary to evaluate it, such as:

- Shooter identity, inferred from the authenticated connection where possible.
- Proposed target identity.
- Request identifier.
- Relevant aiming evidence.
- A client timestamp only for diagnostics, not as authoritative timing.

The server determines the actual firing time and validates the action.

Avoid trusting a client-supplied shooter ID when the server can derive identity from the connection session.

### 13.4 Rate Limits and Idempotency

- Rate-limit high-frequency messages.
- Apply the weapon's server-side firing interval.
- Prevent repeated processing of the same request.
- Avoid duplicate damage from retries.
- Reject actions from disconnected or eliminated players.
- Bound incoming message sizes.

### 13.5 Reconnection

A player who briefly loses connectivity should not create a second player identity accidentally.

- Reconnect using a session credential.
- Restore the current server state.
- Do not trust a stale client-side snapshot.
- Apply a documented timeout policy for disconnected players.
- Prevent disconnected players from firing or healing.

Do not add elaborate persistence for active matches unless the hackathon requirements demand it.

---

## 14. Security and Privacy

FANTOM uses sensitive device capabilities even though it does not need user accounts.

### Required safeguards

- Use HTTPS and secure WebSockets in deployed environments.
- Keep secrets on the server.
- Never expose service-role keys in frontend code.
- Validate every game-changing action.
- Validate match membership and roles.
- Rate-limit network requests.
- Avoid exposing hidden enemy positions.
- Do not store camera footage.
- Request location and camera permissions only when needed.
- Provide a clear explanation of why permissions are required.
- Avoid collecting unnecessary personal information.
- Expire temporary match credentials appropriately.
- Sanitize display names before rendering.
- Do not put private session credentials into public QR codes or visible player markers.

The system is a casual game, not a safety-critical positioning system. Do not claim that GPS or camera validation prevents cheating or guarantees accurate real-world distances.

---

## 15. Testing Strategy

Test game rules independently from the UI.

### 15.1 Unit Tests

Test:

- Weapon firing intervals.
- Magazine depletion.
- Automatic reload.
- Weapon switching during reload, if supported.
- Damage calculations.
- Shield absorption.
- Healing limits.
- Healing cooldowns.
- Healing interruption.
- Spawn protection.
- Role restrictions.
- Pickup availability.
- Out-of-bounds transitions.
- Elimination.
- Match-end conditions.
- Score calculation.
- Duplicate event prevention.

### 15.2 Multiplayer Integration Tests

Test at least two clients in one match.

Verify:

- Players join the same lobby.
- The host starts the match.
- State updates reach all clients.
- A valid shot changes target health.
- An invalid shot does not change target health.
- Two simultaneous shots do not corrupt health or score.
- Eliminated players cannot continue acting.
- Reload state remains consistent after reconnect.
- Hidden positions are not sent to unauthorized players.
- Match results agree across all clients.

### 15.3 Camera-Aiming Tests

Test on actual devices, not only a desktop browser.

Required scenarios:

1. A aims directly at B and B's marker is visible.
2. A aims away from B while B remains in camera view.
3. Camera aim and orientation disagree.
4. A marker is too small or too far away.
5. Two markers are visible.
6. A marker belongs to an eliminated player.
7. A nonplayer person crosses in front of the target.
8. The target marker becomes partially occluded.
9. Camera permission is denied.
10. Orientation permission is denied or unavailable.
11. The device changes orientation abruptly.
12. Sensor readings become stale or noisy.

The desired behavior for ambiguous cases is to reject the shot.

### 15.4 GPS Tests

Test:

- Normal location updates.
- Stale location data.
- Poor accuracy.
- Boundary jitter.
- Confirmed arena exit.
- Return inside.
- GPS permission denial.
- Impossible coordinate jumps.
- Temporary loss of location.

Use deterministic simulated positions in automated tests. Keep simulations clearly separated from production behavior.

### 15.5 Physical Safety Tests

Before a live demonstration:

- Choose a safe, open play area.
- Make boundaries clear.
- Tell players not to run while looking at their phones.
- Ensure the play area is away from traffic and other hazards.
- Provide an immediate way to stop the match.
- Verify that players can safely look away from their devices while moving.

---

## 16. Development Workflow

Before implementing a feature:

1. Inspect the current repository.
2. Read this document and the existing README.
3. Identify what already works.
4. Reuse existing components and abstractions when sensible.
5. Make the smallest complete change.
6. Run the relevant tests and type checks.
7. Fix regressions before moving on.
8. Update documentation when behavior or architecture changes.

Do not rewrite working code merely to match a preferred architecture.

### Coding Standards

- Use TypeScript for application and server code.
- Prefer explicit types at system boundaries.
- Keep shared game rules in reusable modules.
- Validate untrusted data at runtime.
- Keep components small and focused.
- Avoid unnecessary dependencies.
- Avoid duplicated constants.
- Avoid large, monolithic components.
- Do not introduce abstractions without a concrete use case.
- Use clear names for game states and events.
- Handle errors explicitly.
- Never silently ignore failed permission requests or network operations.
- Do not add fake functionality merely to make a demo appear complete.

### Claude-Specific Instructions

When working in this repository:

- Treat this file as the project specification.
- Inspect existing code before proposing or implementing structural changes.
- Implement real functionality rather than UI-only placeholders.
- Do not claim that a feature works without verifying it.
- Do not invent test results.
- Do not replace server-side validation with client-side checks.
- Do not introduce new dependencies without a clear reason.
- Do not build optional features while core gameplay is broken.
- When a requirement is ambiguous, choose the smallest safe interpretation and document it.
- When changing a game rule, update its server logic, shared types, client feedback, and tests together.
- Report important limitations honestly, especially for camera aiming, GPS precision, browser compatibility, and anti-cheat.
- Keep the README aligned with the actual implementation.

---

## 17. Hackathon Implementation Order

Build in the following order. Do not attempt to implement every feature simultaneously.

### Phase 1: Foundation

- [ ] Inspect repository and establish the app structure.
- [ ] Create shared types and protocol.
- [ ] Set up the frontend and backend.
- [ ] Establish a working WebSocket connection.
- [ ] Create a match.
- [ ] Join through a code or QR link.
- [ ] Display lobby state across clients.

**Exit condition:** Two separate devices can join the same lobby and see consistent player lists.

### Phase 2: Match Lifecycle

- [ ] Host settings.
- [ ] Ready states.
- [ ] Countdown.
- [ ] Server-controlled match start and end.
- [ ] Basic results screen.

**Exit condition:** A complete lobby-to-results lifecycle works without manual server intervention.

### Phase 3: Positioning and Arena

- [ ] Request geolocation.
- [ ] Send location updates.
- [ ] Display the minimap.
- [ ] Configure the arena boundary.
- [ ] Validate location freshness and accuracy.
- [ ] Implement safe out-of-bounds handling.

**Exit condition:** Players can see approximate positions and the server correctly handles a confirmed boundary exit.

### Phase 4: Combat

- [ ] Implement health and elimination.
- [ ] Implement Pulse.
- [ ] Add ammunition and automatic reload.
- [ ] Add server-side firing intervals.
- [ ] Add spawn protection.
- [ ] Implement shot requests and server validation.
- [ ] Add basic combat feedback.

**Exit condition:** A controlled test can produce valid damage, rejected shots, reloads, and eliminations consistently.

### Phase 5: Camera Aiming

- [ ] Implement a visible player marker.
- [ ] Detect and decode the marker.
- [ ] Map marker identity to a current match participant.
- [ ] Calibrate camera and orientation coordinates.
- [ ] Compute camera-relative target direction.
- [ ] Enforce aim agreement.
- [ ] Reject ambiguous or occluded targets.
- [ ] Test on at least two actual devices.

**Exit condition:** A valid target can be identified and aimed at, while clearly invalid targeting is rejected.

If full sensor fusion proves unreliable within the hackathon, retain the working game loop and clearly label any development-only fallback. Never present simulated aiming as real camera-based aiming.

### Phase 6: Game Modes

- [ ] Free For All.
- [ ] Assassin role assignment and win conditions.
- [ ] Team Deathmatch team assignment.
- [ ] Killer and Healer restrictions.
- [ ] Team scoring.

**Exit condition:** All three modes have distinct, correctly enforced rules.

### Phase 7: Pickups and Remaining Weapons

- [ ] Add Ravager.
- [ ] Add Viper.
- [ ] Add weapon pickups.
- [ ] Add health packs.
- [ ] Add shields.
- [ ] Add pickup respawn behavior.

**Exit condition:** Pickup ownership and weapon behavior remain consistent across all clients.

### Phase 8: Polish and Demo

- [ ] Improve mobile HUD.
- [ ] Improve permission and sensor error messages.
- [ ] Add reconnect handling.
- [ ] Test all modes from start to finish.
- [ ] Fix critical bugs.
- [ ] Document known limitations.
- [ ] Prepare a short, repeatable live demonstration.

**Exit condition:** A new player can join and understand how to play without a developer explaining every screen.

---

## 18. Hackathon Demo Plan

The demo should prove that FANTOM is a playable game, not merely a mockup.

Recommended demonstration:

1. Open FANTOM on multiple phones.
2. Create a match and scan the QR code to join.
3. Configure the mode and start the countdown.
4. Show the live minimap and arena.
5. Demonstrate camera marker detection.
6. Aim at a valid player and show the resulting hit.
7. Demonstrate a rejected shot when the target is not correctly aligned or its marker is occluded.
8. Show damage, ammunition depletion, and automatic reload.
9. Demonstrate a game-mode-specific mechanic, such as a Healer restoring a teammate's health.
10. Finish the match and display results.

Prioritize a repeatable demonstration with two or three phones over a larger match that is unreliable.

If the environment makes GPS unreliable, use a documented demo setup. Do not misrepresent simulated data as live GPS.

---

## 19. Definition of Done

FANTOM's MVP is ready when all of the following are true:

- A host can create a match.
- Players can join using a QR code or short code.
- Lobby state is synchronized.
- A match can start and end correctly.
- The three game modes have distinct rules.
- The server controls damage, health, ammunition, cooldowns, and elimination.
- Automatic reload works.
- Camera-based marker detection identifies a player.
- Camera direction and device orientation must agree within the configured tolerance.
- Ambiguous targeting is rejected.
- GPS boundaries use accuracy checks and hysteresis.
- Poor sensor data fails safely.
- The HUD is usable on real phones.
- Critical multiplayer and game-rule tests pass.
- Permissions, privacy, and physical safety are handled explicitly.
- Known limitations are documented.
- The demo can be repeated without depending on luck.

---

## 20. Final Engineering Principle

FANTOM's differentiator is not the number of features. It is the combination of a working multiplayer game, real-world positioning, and camera-assisted targeting on ordinary phones.

Build the smallest version that demonstrates that combination convincingly.

**Reliable core gameplay first. Camera aiming second. Three complete game modes third. Visual polish and optional features last.**
