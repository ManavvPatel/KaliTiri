# Multiplayer protocol — Colyseus v0.3

## Transport

Colyseus 0.18 supports HTTP matchmaking and WebSocket messages. The React web app uses `@colyseus/sdk`. Each private table is a `KaliTiriRoom` which owns a transport-free `TableSession` and the existing authoritative TypeScript engine.

### Join and room lifecycle

1. Host connects with `client.create('kalitiri', {name, variant})` where `variant` is `four` or `six`.
2. The room becomes **private** via `setPrivate(true)`. It is not discoverable via public matchmaking.
3. Host shares `room.roomId` via URL `/?room=room.roomId`. Friends use `client.joinById(roomId, {name})`.
4. Player seat is assigned on the server from their Colyseus `sessionId`; full tables reject extras.
5. Host sends `start` when all seats are present and connected. Colyseus room locks; new players cannot join once dealing starts. Reconnection is reserved for the original seat.

### Client messages

```js
room.send('sync'); // server responds with a seat-scoped snapshot

room.send('command', {
  commandId: crypto.randomUUID(),
  expectedVersion: latestSnapshot.version,
  action: { type: 'play', card: 'S:3' } // or start, bid, pass, call, nextHand
});
```

### Server messages

- `snapshot` — *only* sent to an individual client. Contains `version`, table players, scores, and `viewForSeat`/`viewerLegalCards` from game-core.
- `command-result` — acknowledgement `{commandId, ok:true, version}` or error `{commandId, ok:false, code, message}`.
- `table-error` — failed join validation.

No Colyseus `room.state` includes a whole engine state or all card hands, which prevents accidental hidden-card disclosure. Partner identities appear to each player only as allowed by the rules and the game's `viewForSeat` projection.

### Idempotency and concurrency

- `expectedVersion` prevents stale actions from modifying the hand.
- `commandId` prevents duplicate action reapplication after retries.
- Clients cannot assign their own seat: controller overwrites any client-provided `seat` with the `sessionId`-associated seat.
- The rules engine validates each card play, bids, turns, follow-suit, and score transitions.

### Reconnection

- During abnormal disconnect, Colyseus `allowReconnection(client,120)` preserves the seat up to two minutes.
- The SDK attempts automatic recovery for brief network interruption. On reload, the app reads `room.reconnectionToken` from tab session storage and uses `client.reconnect(token)`.
- After the reservation expires, the match stays unresolved if an essential player is absent. Administrative forfeit, bot takeover, and database-backed recovery are future features.

### Development ports

- React/Vite: port **5173**, open the game here.
- Colyseus: port **2567** for HTTP matchmaking and WebSockets.
- The React client defaults to the browser hostname on port 2567; set `VITE_COLYSEUS_URL` explicitly for hosted deployments.

## Non-goals of this milestone

Guest accounts and short-lived private rooms only. There is no production security framework, persistent database, cross-process scaling, public matchmaking or anti-collusion system. Use TLS/reverse proxy and harden authorization before public hosting.
