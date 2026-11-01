# HTTPS/WSS deployment: Railway (single instance)

This milestone includes a production Dockerfile. **No remote deployment is performed by this package.** The steps below are a suggested beta deployment, and must be tested end-to-end before public invitations.

1. Commit the project to **your own private GitHub repository**. Never commit `data/`, local `.env`, or saved game JSON.
2. In [Railway](https://railway.com/), create a project/service from the GitHub repo. Railway should use the root `Dockerfile`.
3. Attach a persistent **Volume** mounted at `/data`. Set `KALITIRI_DATA_DIR=/data/tables` (already the Dockerfile's default). Use a **single replica**. Ensure the Railway volume persists after redeploys and back it up.
4. Generate a Railway service **public domain**. Railway terminates HTTPS/WSS and forwards to the container's `PORT`. The Node process uses `PORT` (Railway provided, or Docker default `2567`). Ensure the service publicly exposes its HTTP listener and WebSockets, not a private `.railway.internal` address.
5. Run a health check for `/health`. Open the Railway `https://...` domain in Safari; **do not** use `:5173` publicly. The same Colyseus server serves the bundled React app and WS connections on that origin.
6. Complete the full 4-phone test over different networks, then restart/redeploy the service and verify players rejoin their saved seats and matches resume.

### Configuration

| Variable | Example | Purpose |
|---|---|---|
| `PORT` | supplied automatically | WebSockets + HTTPS reverse-proxy target |
| `KALITIRI_DATA_DIR` | `/data/tables` | Must live on durable volume |
| `NODE_ENV` | `production` | Node runtime mode |

Vite uses `location.origin` as the production Colyseus endpoint by default, so the browser gets `wss://` when opened on an HTTPS domain. Development remains on ports **5173** (Vite) and **2567** (server).

### Known beta limitations

No Postgres, Redis, multi-instance coordination, durable external backups, account auth, analytics, rate limits, or bots yet. Raw snapshots contain private game state. Protect filesystem access. The server holds offline seats, so unclaimed rooms remain in memory and on disk; add room expiry/host management before scale.
