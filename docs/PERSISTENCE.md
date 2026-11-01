# Milestone 4: persistence and seat recovery

## What is persisted

After each accepted action, seat join, or connectivity change, `DiskTableStore` atomically rewrites `KALITIRI_DATA_DIR/<STABLE_CODE>.json` (temp + fsync + rename). Game snapshots contain all private card hands and seat credential **hashes**. Protect the directory with file permissions and volume access controls. It must never be served as static assets. In a write failure, a command is **not acknowledged**, and the controller restores its previous state.

The **8-character table code** is a shareable locator, *not* an authentication token. Every seat gets a **private 256-bit seatToken** sent individually over the WebSocket on `identity`. React stores it in this device's `localStorage` under `kalitiri.seat.<CODE>`. Don't send seat tokens to other players. A private browser window, cleared website data, or switching phones without transferring the credential makes that hand unrecoverable. Currently there is no account-based recovery or administrative override.

## Reconnect behavior

1. Short network drops: the Colyseus SDK attempts automatic reconnection to the same live Room; server reserves the socket for **300 seconds**.
2. Browser reload/app restart: React tries the saved Colyseus reconnection token first.
3. Server restart/redeploy: the original Colyseus room ID is gone. The client `POST`s `{code,seatToken}` to `/api/resolve`. The server loads the saved table (if no live instance exists), creates a **new Colyseus room instance**, and returns its current `roomId`. The client joins with `{seatToken}` to reclaim the **same original player seat and hand**.
4. After the short SDK grace period: the private seat token can reclaim a disconnected seat on an existing room. It cannot take over an actively connected seat.

`/api/resolve` doesn't hand out private game state; for started matches a matching seat token is necessary, and `onAuth` checks ownership again. In the lobby, a room code suffices to join as a new player while a seat remains available. Roster entries remain reserved until players reclaim them, including in lobbies.

## Operating constraints

- **Single Colyseus process and a single persistent writer** only. Do not scale to multiple replicas sharing a directory. For high-availability/multi-node workloads, migrate to PostgreSQL with transactional locking and a distributed room directory.
- On a crash or restart, existing WebSockets close; clients reconnect into freshly created room instances. Transparent SDK reconnection across process restarts is **not** provided.
- Atomic rename protects against partially written snapshots but is not a substitute for off-site backups. Keep volume backups, and avoid destroying the volume on redeploy.
- Persistent state schema version **1** is validated. Future game-rule changes need explicit migrations; do not silently load snapshots under different rules.
- A player who loses their private token cannot recover their seat automatically. Host kick/seat removal, match expiry, and accounts aren't implemented yet.
- Do not publish until live restart/rejoin testing, penetration review and regional scoring verification are complete. Guest sessions are not full authentication.

## Local crash/restart drill

1. `npm install && npm run dev` and open `http://localhost:5173`.
2. Create a game on four phones or four separate browser profiles. Save each player's URL; confirm it's `?room=<8-CHARACTER-CODE>`.
3. Play at least a few tricks, then stop the **server** (`Ctrl+C` terminates both if running through `npm run dev`).
4. Run `npm run dev` again **without deleting `data/tables`**.
5. Refresh the same URL on the same device/profile. It should attempt SDK reconnect, then fall back to durable seat recovery. Confirm identical hand, scores, trick, turn and partner secrecy.
6. Test a fresh browser profile with the same invite URL **after the game started**: without a seat token it must be denied.
7. Test lobby recovery and a new hand after the restart.

## API

- `GET /health` — lightweight health check.
- `POST /api/resolve` with `Content-Type: application/json`, JSON `{ "code": "ABCDEFG2", "seatToken": "optional-private-token" }` — returns `{ roomId, code }` or 4xx. The code shown is an example, not a real table.
- Colyseus `create('kalitiri', {name,variant})` starts a new persistent table.
- Colyseus `joinById(resolvedRoomId, {name})` joins an unfinished table; `joinById(resolvedRoomId, {seatToken})` restores a seated player.

No REST endpoint returns hands, secrets, card-holder mappings or match state.
