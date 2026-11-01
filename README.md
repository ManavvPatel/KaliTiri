# KaliTiri Multiplayer · Milestone 4 (v0.4)

A phone-first React/Vite + Colyseus private multiplayer game with a standalone TypeScript rules engine. Supports both **4-player** and **6-player** variants.

**This update adds durable game snapshots and stable private seat recovery.** Players can return to their hands after brief network drops, browser reloads, and **server restarts** as long as the server uses the **same persistent storage directory** and players use the **same browser profile** with their saved seat token.

> **Beta release / verification:** 32 offline tests pass, including full 4- and 6-player persisted game simulations, privacy, replay protection, and restart recovery. This build could not be installed/run end-to-end with actual Colyseus sockets in the generation environment because npm registry access was unavailable. Please perform the live multi-phone and restart drill on your Mac before deploying publicly.

## Quick start on Mac (from extracted project root)

Requires Node **20.19+**; Node 22 recommended.

```bash
node -v
npm install
npm test
npm run dev
```

Open **http://localhost:5173** on the Mac. Find the Mac Wi-Fi IP with `ipconfig getifaddr en0`, then open **http://YOUR_MAC_IP:5173** on phones on the same Wi-Fi. Development also uses Colyseus on port **2567**, which phones must reach. **Do not open port 2567 to access the web page.**

Create a new room, copy the stable **8-character table code** or invitation link, and invite friends. Start once all 4 (or 6) seats are connected.

To test persistence, start a hand, play several moves, then stop/restart `npm run dev` without deleting the `data/` directory. Refresh the **same invite URL in the same phone browser/profile**; the UI should restore your hand. Detailed drill: [docs/PERSISTENCE.md](docs/PERSISTENCE.md).

**Upgrading from v0.3:** This is a separate release. Existing in-memory v0.3 rooms are **not** migrated; create a new table in v0.4. Keep the new `data/tables` directory when updating v0.4 later.

## Public HTTPS deployment

The repo contains a `Dockerfile` for a **single instance** that serves both the built React app and Colyseus on one origin. In production players open the public **HTTPS** URL directly (no `:5173`); the client uses secure WebSockets automatically.

For an example on Railway with a persistent volume, follow [docs/DEPLOY.md](docs/DEPLOY.md). A Docker/container filesystem without a mounted persistent volume will **lose matches on redeploy**.

## Project layout

```text
apps/react-web/src/App.jsx                   React UI, durable seat reconnect flow
apps/react-web/src/styles.css                Mobile-first game screen styling
apps/colyseus-server/index.mjs              HTTP API, restore coordination, static production UI
apps/colyseus-server/KaliTiriRoom.mjs       Colyseus room adapter and socket validation
apps/colyseus-server/session.mjs            Authoritative game commands + seat projections
apps/colyseus-server/durable-table.mjs      Persistent seat credentials + transactions
apps/colyseus-server/store.mjs              Atomic filesystem snapshots
apps/colyseus-server/registry.mjs           Active-room index, internal restore authorization
apps/colyseus-server/test/                  Controller and durability tests
packages/game-core/src/                     Pure game engine, rules, scores
packages/game-core/test/                    Engine tests
apps/demo/simulate.mjs                      Standalone rules simulation
Dockerfile                                  Single-origin production container
```

## Commands

| Command | Purpose |
|---|---|
| `npm install` | Install workspace packages (needs npm access) |
| `npm test` | Compile core and run offline engine + durable controller tests |
| `npm run dev` | Launch Vite `5173` and Colyseus `2567` |
| `npm run build` | Compile engine + build production React bundle |
| `npm start` | Launch the production server after `npm run build` |
| `npm run demo` | CLI test simulation |
| `npm run typecheck` | Type-check the TypeScript engine |

## Privacy and limitations

- Card hands and unrevealed partners are **server-only**; the server sends a seat-specific snapshot to each client.
- A **shareable table code is not authentication**. A private seat token (256 bits) identifies the saved seat; only its SHA-256 hash is written with game data. The token is saved in browser local storage and sent only to the matching socket. Share room URLs but **never share seat tokens**.
- Progress and credential hashes are in `KALITIRI_DATA_DIR` (defaults to `./data/tables`); **saved game JSON includes every player's cards**, so protect and back up the directory.
- This implementation is **single-process only**, not PostgreSQL-backed and not suitable for multiple server replicas. Durable snapshots are designed for beta testing, not a distributed high-availability service.
- If someone clears local storage/uses a different device and loses their seat token, there is no account recovery. Guest seats are not yet replaceable by the host; abandoned rooms need later expiry/cleanup.
- Regional bidding/scoring conventions are still provisional; see [docs/RULES.md](docs/RULES.md).
- No public matchmaking, accounts, bots or advanced abuse prevention yet. Do not deploy ranked competitions based on provisional rules.

See [docs/PERSISTENCE.md](docs/PERSISTENCE.md), [docs/DEPLOY.md](docs/DEPLOY.md), and [TEST_REPORT.md](TEST_REPORT.md).

## Cloud deployment choices (October 2026)

- **Azure Container Apps:** `docs/AZURE_DEPLOY.md` and `scripts/azure-create-app.sh` (uses existing cloud credits, but metered billing and Azure Files configuration are required).
- **Render:** `render.yaml` and `docs/RENDER_DEPLOY.md` (single-instance Starter with a 1 GB persistent disk, estimated $7.25/month before overages/taxes).

These are deployment preparation files, **not evidence of a live deployment**. Both hosts must be verified with physical phones and storage restart tests.
