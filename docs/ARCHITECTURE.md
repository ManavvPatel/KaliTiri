# Architecture · Milestone 3 / v0.3

## Runtime components

```text
┌──────────────────────────────────────────────┐
│ Phone / tablet / desktop                    │
│ React 19 + Vite 7                           │
│ @colyseus/sdk                               │
│ Room code, lobby, actions, snapshots        │
└──────────────────────┬───────────────────────┘
                       │ Colyseus matchmaker HTTP + WebSocket
                       ▼
┌──────────────────────────────────────────────┐
│ Colyseus 0.18 server :2567                  │
│ KaliTiriRoom                                │
│   1 Room ⇄ 1 TableSession                   │
│   Handles joins, reconnections, snapshots   │
│   NO raw shared hands in room.state         │
└──────────────────────┬───────────────────────┘
                       │ pure synchronous calls
                       ▼
┌──────────────────────────────────────────────┐
│ TableSession : transport independent         │
│  valid action → actual player's seat         │
│  idempotency + optimistic versioning         │
│  per-seat snapshot projection               │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ game-core (existing)                        │
│ RulesConfig + createMatch + applyMatchAction │
│ shuffle, follow suit, bidding, partnerships  │
│ trick winner, scoring, auditHand             │
└──────────────────────────────────────────────┘
```

## Protocol

- Join host: `client.create('kalitiri', {name, variant:'four'|'six'})`.
- Join invite: `client.joinById(roomId, {name})`; server room is private.
- Client to server `sync`: no payload. Room replies with `snapshot` *only to requesting seat*.
- Client to server `command`: `{ commandId:string, expectedVersion:number, action: { type, ... } }`.
- Server to client `command-result`: `{commandId,ok:true,version}` or `{commandId,ok:false,code,message}`.
- Server to client `snapshot`: private seat projection including `view.hand`, `view.currentTrick`, `legalCards`, public players and scores. Server loops through connected clients and sends individually. No global `room.state` exposure.

## Security and correctness invariants

1. Session ID → immutable seat after dealing; client-supplied `action.seat` ignored.
2. `createMatch()` happens only with all required seats connected; `nextHand()` host-only after completion.
3. Each successful game command increments room `version`. Incorrect versions are rejected; duplicate command IDs are acknowledged idempotently without reapplying.
4. Game state is entirely on the server. React renders projections, never validates final outcomes.
5. `viewForSeat()` is the sole projection for private hands. Partner-card holders are not exposed to other seats prior to reveal. The chosen called card is public according to game rules.
6. Every server room is invite-only (`setPrivate(true)`), locked after play begins, and inaccessible through generic matchmaking.
7. On network drop: `allowReconnection(client, 120)`. Client SDK first attempts automatic reconnection; after reload, stored `room.reconnectionToken` enables manual restoration of the same seat. Tokens are stored in sessionStorage, not invitation links.
8. Room memory is process-local. There is no database or restart persistence yet.

## Risks and mitigations

- **Lost connection during play:** no bot replacement; seat remains reserved once started. Provide 120-second recovery and communicate that a timed-out match may become blocked.
- **Race between player commands:** sequential room event processing and `expectedVersion` guard. User receives stale-state error, then resyncs.
- **Hidden-hand leakage:** no common Schema holding hands; individual snapshots contain hand only for authenticated seat. Server validates hand and suit constraints.
- **Malicious commands:** whitelist action keys, enforce valid card ID format, use server-assigned seat, bound name length, cap Colyseus messages per second.
- **Room ID disclosure:** invites are intentionally bearer links for **unstarted** games; not production authentication.
- **Rules uncertainty:** versioned presets plus documented decisions; do not present provisional match score awards as an undisputed standard.

## Upgrade plan

Milestone 4: run live multi-phone/real-WebSocket tests, add matchmaking tests using `@colyseus/testing`, improve handling of reconnect expiry/forfeits; persistent match state in PostgreSQL/Redis; add observability and HTTPS/WSS deployment. Later layer in verified authentication and public matchmaking.

See [Colyseus docs](https://docs.colyseus.io/room), [private room visibility](https://docs.colyseus.io/matchmaker/visibility), and [reconnection](https://docs.colyseus.io/room/reconnection).

## Milestone 4 overlay — persistent single-origin beta

New persistence/recovery modules are `store.mjs`, `durable-table.mjs`, `registry.mjs`, and `/api/resolve` in `index.mjs`. The previous in-memory-only room/reconnect behavior described above has been superseded by `docs/PERSISTENCE.md`.

All client actions still validate through the pure engine and `TableSession` seat-specific controller. `DurableTable` maps ephemeral WebSocket IDs to stable randomly generated seat IDs, and writes authoritative state before any successful command response is sent. If saving fails, a move does not acknowledge. Persisted secret tokens are SHA-256 hashes; plaintext seat tokens exist only in the connected client and its local browser storage.

Rooms are private and appear through a stable 8-character invite code, which resolves to a possibly new Colyseus `roomId` after a restart. Only the internal recovery API can create an existing room from disk; untrusted SDK room-creation requests cannot use `restoreCode` without a server-only secret. All restored players start disconnected and re-authenticate their own seats; hidden hands never enter the Colyseus shared room state. A single server/volume writer is mandatory.

Production `npm run build && npm start` serves both the React SPA and WebSockets on port `PORT`, suitable for an HTTPS/WSS reverse proxy. Locally Vite `/api` requests proxy to the Colyseus server, and WebSockets use the server's port directly.
