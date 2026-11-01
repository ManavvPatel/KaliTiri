# KaliTiri roadmap

**Milestones 1–3:** Rules engine; phone UI / streaming proof of concept; Colyseus + React private rooms (locally tested by project owner).

**Milestone 4 (this release):** Durable filesystem snapshots, stable table codes, per-seat recovery credentials, post-restart room recreation, safe command acknowledgement, recovery tests, Dockerfile and HTTPS deployment instructions. Core/controller tests verified offline. Real Colyseus socket and remote deployment verification pending.

**Milestone 5:** Execute the complete physical-phone recovery drill and deploy the application on an HTTPS/WSS host with a persistent volume. Fix browser-specific reconnect edge cases. Add cleanup of abandoned rooms, host ability to kick/reseat offline guests, reconnection indicator/timer and observability. Lock down rules/scoring variations with experienced players.

**Later:** PostgreSQL transactions, horizontal scaling, user accounts, room expiry, bots, public matchmaking, rankings and app-store packaging.
