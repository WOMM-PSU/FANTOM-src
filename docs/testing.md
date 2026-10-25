# Testing

## Commands

```bash
npm run typecheck   # strict TypeScript, all workspaces
npm test            # shared rules + server unit/integration tests
npm run build       # production Next.js build
npm run verify      # all three
```

The test suites use Vitest 5. Integration tests start a real HTTP + WebSocket server on an
ephemeral port with real `ws` clients and real `fetch` calls. No sockets are mocked.

## Current automated coverage

| Area | File | Cases |
| --- | --- | --- |
| Join-code alphabet and normalization | `packages/shared/src/joinCode.test.ts` | 3 |
| Display-name sanitization and length | `packages/shared/src/sanitize.test.ts` | 4 |
| Config validation and HTTP schemas | `packages/shared/src/config.test.ts` | 6 |
| Start eligibility rules | `packages/shared/src/startRules.test.ts` | 8 |
| Client/server protocol schemas | `packages/shared/src/protocol.test.ts` | 6 |
| Match lifecycle, readiness, host transfer, sessions | `apps/server/src/lobby/manager.test.ts` | 7 |
| Two-client lobby sync and countdown | `apps/server/tests/lobby.test.ts` | 4 |
| Join rules, idempotency, limits, CORS | `apps/server/tests/join.test.ts` | 4 |
| Runtime config parsing | `apps/server/src/config.test.ts` | 3 |

**Total: 45 passing tests.** Last run: 2026-10-24.

The manager tests use fake timers to prove:

- countdown → active initialization → timer-driven finish;
- all players must be connected and ready;
- settings changes reset ready state and invalidate old config versions;
- unavailable modes are rejected;
- host transfer after the reconnect grace;
- invalid session tokens are rejected;
- a session resumed on a second socket closes the first with code 4001.

The integration tests prove:

- two real clients see the same player list after the second player joins;
- readiness and countdown states reach both clients;
- only the host can change settings/start, and stale versions are rejected;
- explicit leave removes the player from the other client's view;
- invalid tokens and unauthenticated actions are rejected;
- HTTP create/join are idempotent for a repeated request ID;
- unknown codes, duplicate names, invalid bodies, full rooms, and joins after start return the
  expected status/code;
- health and CORS headers are present.

## Manually verified browser flow

Run `npm run dev`, then use two isolated browser tabs (one normal, one incognito) or two devices
on the same LAN.

1. Enter a call sign and create a match. The URL changes to `/match/CODE` and the lobby shows the
   code, QR toggle, player list, and host settings.
2. Open `/join/CODE` in the second tab. Enter a different call sign. Both lobbies show both
   players with synchronized state.
3. Select a 2-minute match in the host settings (this resets ready), then both players press
   "I'm ready". The host's Start button enables.
4. The host starts. Both clients show the server countdown and then the live screen with the same
   `endsAt`-derived timer and all players initialized to 100 HP / alive.
5. Reload the host page during the match. The session resumes from `sessionStorage`; there is still
   exactly one host player.
6. Let the timer expire. Both clients transition to the finished screen with the same "timer
   expired" result and no fabricated score or winner.
7. Reload the finished view. The session resumes and the server still reports the finished result.
8. Leave from the second tab. It returns home and the remaining client's player list drops to one.
9. Try a stale/unknown join code, a join after the match has started, and an invalid session:
   explicit messages appear, no silent failure.

Observed during this milestone: all of the above worked on the local machine with two isolated
clients, including a 2-minute finished match and a rejected post-start join. Console showed only
Next.js dev tools and HMR messages caused by restarting the dev server; there were no application
errors in either client.

This is **not** proof of physical-device compatibility or camera/GPS behavior. Those features are
not implemented yet.

## Gaps in automated coverage

- No browser automation suite (Playwright/Cypress). The UI was exercised manually.
- No automated browser test for the finished-phase UI. A 2-minute match was completed manually and
  both clients reached the finished screen; the manager test covers the server-side transition.
- No mobile-viewport screenshot or physical-device layout review. A 390 × 844 DOM check found no
  horizontal overflow on the finished screen.
- No load/stress test for many rooms or simultaneous joins.
- No reconnect test across a real network interruption, only close/resume with real sockets.
- No camera, orientation, geolocation, or shot-validation tests, because the features do not exist.

## Required tests before the next milestone is called done

### Combat (Phase 4)

- firing interval boundaries, magazine depletion, automatic reload start/completion;
- invalid shots consume nothing and apply no damage;
- spawn protection blocks damage and firing;
- shield absorbs before health and is capped;
- simultaneous shots/eliminations cannot double-count;
- eliminated players cannot fire, heal, or pick up;
- FFA scoring and timer winner/last-standing rules;
- reconnect preserves ammo/reload state;
- results agree across all clients.

### GPS/arena (Phase 3)

- deterministic simulated coordinates for inside, outside, jitter, poor accuracy, stale data, and
  implausible jumps;
- exit confirmation window and hysteresis;
- 10 HP/s drain only after confirmed exit;
- invulnerability/fire/heal/pickup restrictions while out of zone;
- one-second grace after re-entry;
- production code cannot silently substitute simulated positions.

### Camera aiming (Phase 5)

Manual on at least one iOS and one Android device:

1. target marker centered and visible → accepted;
2. camera pointed away while target remains visible → rejected;
3. orientation and camera disagree → rejected;
4. marker too small/far → rejected;
5. two markers visible → ambiguous/rejected;
6. eliminated player's marker → rejected;
7. foreground person occludes marker → rejected;
8. partial occlusion → rejected unless confidence remains sufficient;
9. camera permission denied → explicit failure and retry;
10. orientation permission denied/unavailable → explicit failure and no false claim;
11. abrupt orientation change → recalibration, not a false hit;
12. stale/noisy sensor readings → reject.

Also add unit tests for marker identity mapping, angle wraparound/tolerance, marker distance
estimation, and evidence age/confidence thresholds. Do not treat client evidence as anti-cheat.

## Physical-device and safety checklist

Before a live demo:

- choose an open, designated area away from roads, traffic, stairs, and water;
- walk the arena boundary and mark it visibly;
- confirm phones have battery and are in a secure grip/lanyard;
- tell players not to run while looking at screens;
- have a host stop/leave action and a clear way to end the match immediately;
- verify permissions on each phone before the audience arrives;
- run the full lobby-to-results flow twice with the exact demo devices;
- keep a fallback: if GPS or camera is unreliable, demonstrate the lobby/combat loop with a
  **clearly labeled** development simulation, never as live sensor data.
