# Roadmap

The guiding principle from `CLAUDE.md`: **reliable core gameplay first, camera aiming second,
three complete modes third, polish last.** Every phase below ends with a demonstrable behavior
and tests, not just UI scaffolding.

## Status — 2026-10-24

**Done: Phases 1, 2, 4, and the first camera/HUD slice of Phase 5.**

- Monorepo, shared types/protocol, Next.js app, Node game server.
- HTTP create/join with unguessable sessions; QR/code join; synchronized lobby.
- Ready states, host-only mode/duration settings, config versions, countdown, server start/end.
- Reconnect grace, explicit leave, host transfer, validation, rate limits.
- Authoritative Free For All: Pulse, ammunition, automatic reload, damage, shields, spawn
  protection, elimination, respawn, scoring, timer winner/draw, and a results screen.
- Fullscreen camera HUD with translucent overlay, local QR marker detection, target lock, hit
  feedback, scoreboard, and a clearly labeled practice-targeting fallback.
- Multi-client unit and WebSocket integration tests plus repeated manual browser runs.

**Not done:** GPS arena, minimap, pickups, Ravager/Viper in normal play, Assassin, Team
Deathmatch, full compass/bearing fusion, physical-device camera validation.

> The phase plans below are kept as the working plan. Sections that describe combat or camera
> aiming as future work are superseded by the current implementation and tests.

## P0 — Close the lobby/lifecycle slice

Goal: make the current slice boringly reliable and demo-ready with two or three phones.

1. Test the current flow on real iOS Safari and Android Chrome over LAN HTTPS or a tunnel.
   Identify dev-origin, WebSocket, and session-storage issues early.
2. Results now come from server-owned FFA scores. Keep the rule honest: a tie or a match with no
   confirmed elimination is a draw.
3. Add host "return to lobby" / rematch after a finished match (optional, small).
4. Add a browser-level smoke test for create → join → ready → start if Playwright is available.
5. Tighten deployment documentation and a repeatable demo script.

**Exit:** two physical phones join, ready, start, survive a reload, and leave cleanly without
developer intervention.

## P1 — Arena and positioning (Phase 3)

Goal: approximate real-world positions and safe boundary enforcement.

1. Geolocation permission flow with explicit failure/retry UI.
2. Send location updates with accuracy and client timestamps; server validates ranges and rate.
3. Convert lat/lng to a local meter-based coordinate system in shared code.
4. Host configures an arena polygon or center/radius; validate on the server.
5. Persist arena and player positions in state; add minimap with configurable layers.
6. Boundary hysteresis and poor-accuracy handling: no damage on a single noisy fix.
7. Confirmed `out_of_zone`: gray UI, no fire/damage/heal/pickup, 10 HP/s drain, 1 s re-entry grace.
8. Deterministic simulation mode for automated tests and indoor demos, clearly labeled in UI and
   logs.

**Exit:** two deterministic test clients can produce inside/outside transitions, drain, return,
and a minimap screenshot without false transitions from a single jittered coordinate.

**Risk gate:** test outdoors on real phones before promising a GPS-based demo. If accuracy is
unusable, make the arena/manual-position demo explicit and keep the combat loop working.

## P2 — Combat core (Phase 4)

Goal: a real Free For All match with server-authoritative damage.

1. Add Pulse configuration in shared constants; give FFA players a weapon at start.
2. Shot request → target/aim evidence → server checks: phase, alive, connected, in-zone, role,
   spawn lock, weapon ownership, ammo, reload, cooldown, range, target eligibility.
3. Apply shield → health damage; eliminate exactly once; broadcast damage/elimination events and
   updated state.
4. Automatic reload timers with client progress driven by server timestamps.
5. FFA scoring, timer end, last-standing option, winner/draw handling, and results.
6. Combat feedback in the HUD: reticle state, ammo, reload bar, health/shield, hit confirmation
   only after server acceptance.
7. Tests for every rule in `docs/testing.md`; two-client integration tests for simultaneous shots
   and reconnect consistency.

**Exit:** a controlled two-phone test produces valid hits, rejected shots, ammo depletion,
automatic reload, eliminations, and a winner that both clients agree on.

## P3 — Camera aiming (Phase 5)

Goal: demonstrate the defining differentiator without overclaiming.

**Do a timeboxed feasibility spike before investing in UI polish.** The spike must prove marker
detection and orientation calibration on one iOS and one Android device.

1. Choose a marker format (QR-like or a custom fiducial) and a lightweight local detector with a
   graceful fallback if `BarcodeDetector` is unavailable.
2. Display match-scoped, short-lived player markers that do not contain session credentials.
3. Request camera and orientation permissions in context, with explanations and retry paths.
4. Calibrate camera optical direction against device orientation; normalize angles and smooth noise.
5. Reject when the marker is not near the reticle, confidence is low, evidence is stale, two
   markers are visible, the target is eliminated/protected/out of range, or the marker is occluded.
6. Process frames locally; send only minimal evidence + target ID to the server. Stop tracks when
   leaving the aiming view or ending a match.
7. Add angle, marker-identity, distance, evidence-age, and occlusion rejection tests; run the
   device test matrix.

**Exit:** a valid target marker can be acquired and a shot accepted; pointing away, hiding the
marker, or disagreeing orientation is rejected. If full fusion is not reliable in the timebox,
keep the combat loop intact and label any fallback as development-only. Never claim simulated
aiming is camera-based.

## P4 — Assassin and Team Deathmatch (Phase 6)

1. Server-side role/team assignment and validation.
2. Assassin: one assassin, survivors cannot fire, weapon drops disabled, 15 s spawn lock, win by
   elimination or survivor timeout; do not leak survivor positions.
3. TDM: teams with killers/healers, host-configured ratio, at least one killer per team, Pulse for
   killers, heal rules (5 m, 25 HP, 5 s per target, interrupted by damage, no self-heal), team
   scoring, ties/draws.
4. Mode-specific snapshots must not reveal hidden positions; add tests for leaked enemy data.
5. Distinct lobby/start/results copy for each mode.

**Exit:** all three modes have distinct, server-enforced rules and tests.

## P5 — Pickups and remaining weapons (Phase 7)

1. Ravager and Viper definitions from shared configuration.
2. Weapon caches with server-validated pickup, one-time collection, respawn policy.
3. Health packs (25 HP, capped, no revive) and shields (50 max, finite absorption).
4. Pickup state broadcast and minimap layers.
5. Respawn/reconnect consistency tests.

**Exit:** pickup ownership and weapon behavior agree across all clients after reconnect.

## P6 — Polish and demo (Phase 8)

1. Physical-device HUD readability, safe-area layout, and touch ergonomics.
2. Permission and sensor error messages a nontechnical player can act on.
3. Reconnect edge cases, host migration messaging, and finished-match cleanup.
4. All modes run end-to-end; critical bugs fixed.
5. Documented limitations and a repeatable 3-phone demo script.
6. Optional: durable match history in Supabase **after** the authoritative game loop is reliable.

**Exit:** a new player can join and understand what to do without a developer narrating each
screen.

## Scope guardrails

- Do not add accounts, progression, cosmetics, payments, public matchmaking, or microservices
  during the hackathon.
- Do not let Supabase broadcasts become combat authority.
- Do not add Redis or multi-process coordination until there is a measured need.
- Do not build a prettier UI while the core game loop is broken or untested.
- Do not claim camera or GPS accuracy that has not been verified on physical devices.
- Keep shared rules in `packages/shared`; never duplicate weapon or game constants in components.

## Definition-of-done checklist (from CLAUDE.md)

- [x] Host creates a match.
- [x] Players join via code/QR.
- [x] Lobby state is synchronized.
- [x] Server-controlled countdown and match start.
- [x] Server-controlled results/winners with real Free For All scoring.
- [ ] Three distinct game modes.
- [x] Server-authoritative damage/ammo/cooldowns/elimination.
- [x] Automatic reload.
- [ ] Camera marker identification + orientation agreement + ambiguity rejection (marker
  identification and reticle confidence are implemented and tested; full bearing fusion needs GPS
  and a physical-device test).
- [ ] GPS boundaries with accuracy checks and hysteresis.
- [ ] Usable physical-phone HUD for aiming (implemented as a fullscreen camera HUD; physical-device
  readability and ergonomics are still unverified).
- [x] Combat/multiplayer tests. Physical-device camera tests remain.
- [ ] Documented, repeatable live demo.
