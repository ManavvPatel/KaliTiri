# Milestone 4 verification report — 2026-10-25

## Verified inside this environment

- `npm test`: **32/32 pass** (25 legacy engine/session tests, 7 new durable-controller tests).
- Full 4- and 6-player simulated hands reach completion; both persist and restore the score/hand state.
- Restore of an in-progress four-player hand retains the exact original dealt cards, current trick, bidder, and turn.
- Unauthorized guests cannot join a started match with only a nickname or forged seat token.
- Seat identity persists independently of temporary Colyseus client/session IDs.
- Private seat secrets are never stored in plaintext in the server snapshot; only hashes are stored.
- Command IDs are deduplicated across persistence/reload so replaying a processed command cannot repeat a move.
- A failed snapshot write rejects the action and restores its pre-action controller state.
- Invalid codes and corrupt saved files reject rather than loading unchecked state.
- JS module syntax (`node --check`) and React JSX parser syntax pass.

## Not verified here

- **Live** Colyseus `0.18` + React `19` socket operation on actual phones: npm dependencies cannot be fetched from registry due environment DNS failure (`EAI_AGAIN`).
- Docker image build and public HTTPS/WSS deployment: depends on npm package download and a public hosting account.
- Exact automatic reconnection on all browser/mobile OS transitions; 300-second SDK seat reservation and post-restart durable recovery require the local drill from `docs/PERSISTENCE.md`.
- Load testing, rate limiting, filesystem backups, resilience to volume failure and multi-instance deployments.

## Required smoke test on Mac

```bash
npm install
npm test
npm run build
npm run dev
```

1. Create a 4-player room across four phones or isolated browser profiles.
2. Bid, call a partner, play 1–2 tricks; confirm everyone has the same public state but different private hands.
3. Refresh one phone and make sure it restores the correct seat.
4. Stop/start the server; reload all phones with the same room URL and same browser profiles. Confirm they reclaim their original hands.
5. Attempt to join the started match from a fresh browser/profile with just its code; it must fail.
6. Finish the hand and start the next; repeat with 6 players.
7. `npm run build && npm start` should serve the production UI on `http://localhost:2567`, including `/api/resolve` and WebSockets.
8. Deploy single container + durable volume, open the HTTPS URL on phones on different networks, and repeat the restart test.
