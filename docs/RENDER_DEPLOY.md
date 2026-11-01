# KaliTiri on Render — approximately $7.25/month base configuration

The repository includes `render.yaml`, a Render Blueprint describing a single Docker web service (Starter $7/month), 1 GB persistent disk ($0.25/GB/month), health check, and production data directory. Review the pricing page for your billing account and any excess transfer charges before approving the Blueprint.

1. Commit the project to a private GitHub repo. Do not commit `.env`, local `data`, or real game JSON.
2. Log in to [Render](https://dashboard.render.com/). Go to **New → Blueprint**, connect your GitHub repository, inspect the resources/plan/disk, and approve after checking cost.
3. Allow the Docker build to complete. `render.yaml` selects `runtime: docker` and `healthCheckPath: /health`.
4. Open the assigned `https://...onrender.com` URL and `/health`. The combined Node backend serves React on the same origin; production browsers use secure WebSockets on that origin.
5. Start a game on four independent phones. Then redeploy and ensure your seats and match recover from persistent storage.

**Known limitation:** Render persistent disks are attached to one instance and prevent zero-downtime deploys. Plan deployments between games and use the included room recovery flow. Monitor traffic/bandwidth and 512 MiB RAM usage; upgrade only if real load demands it.

Docs: https://render.com/docs/disks and https://render.com/docs/websocket
