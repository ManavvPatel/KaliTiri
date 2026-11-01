# KaliTiri on Azure Container Apps — deployment guide (v0.4)

This guide prepares the existing combined React + Colyseus Docker image for an Azure-hosted private beta. The deployment **has not been executed** in an Azure account and must be validated on the target subscription. Keep one instance, one active game owner, and one persistent Azure Files mount.

## 0. Cost and credit check — before running commands

- Visit **Azure Portal → Cost Management + Billing → Cost analysis / Budgets**, and inspect subscription credits and expiry.
- Azure Container Apps Consumption has monthly free grants but can cost money with `minReplicas: 1` (even when idle, depending on activity).
- `az containerapp up --source .` also creates a Container Registry (ACR), a Container Apps environment, and often a Log Analytics workspace. **These are separate possible charges.** Basic ACR is commonly around USD $5/month before tax, though your region, currency, account discounts, and eligibility may differ. Azure Files storage and transactions add cost.
- If your firm cap after credits is **USD $10 per month**, Render Starter with 1 GB disk is more predictably priced. **Do not assume** the entire Azure solution will stay under $10 once credits expire.
- Choose a dedicated resource group so the optional cleanup command affects only KaliTiri resources. Do not reuse a resource group with unrelated resources.

## 1. Prerequisites on macOS

```bash
brew install azure-cli
az login
az account list --output table
```

Inspect the target subscription ID yourself. Do not paste account secrets or storage keys into chats or Git. Then, **from the extracted `kalitiri-multiplayer` project directory**:

```bash
export AZURE_SUBSCRIPTION_ID='YOUR-SUBSCRIPTION-ID'
export KALITIRI_RESOURCE_GROUP='rg-kalitiri'
export KALITIRI_LOCATION='canadacentral'
export KALITIRI_ENVIRONMENT='cae-kalitiri'
export KALITIRI_APP='kalitiri-game'
export KALITIRI_DEPLOY_APPROVED=YES
bash scripts/azure-create-app.sh
```

The script creates a resource group and deploys the root `Dockerfile` from local source, then sets 0.5 vCPU, 1 GiB RAM, minimum and maximum replicas to one, and single-revision mode. It also configures `KALITIRI_DATA_DIR=/data/tables`. The script does **not** set up storage and does **not** open accounts or authorize billing for you.

**Do not create or play real matches yet:** `/data` is temporary until you mount Azure Files.

## 2. Mount durable Azure Files BEFORE inviting friends

The current engine writes match snapshots and private seat credential data to `/data/tables`. Protect that storage from public access. The easiest initial configuration is through Azure Portal:

1. In the new `rg-kalitiri` resource group, create a **Storage account** compatible with classic Azure Files shares, in Canada Central, on a low-cost suitable storage tier (check the Azure Files billing model and minimum allocations). Use non-public access settings where feasible.
2. In the storage account, create a **classic SMB Azure File share** named `kalitiri-data`. Azure Container Apps does not support the newer top-level Microsoft.FileShares resource for this mount.
3. Open the `kalitiri-game` **Container App → Settings → Storage mounts**. Choose **Azure File share**, select the storage account and the share, and use read/write access. Create a volume named `game-data` and mount it at **`/data`** for the application container. Follow the Portal flow to publish a **new revision** with the mount.
4. In **Revisions and replicas**, confirm single-revision mode, and in **Scale**, confirm **min 1 / max 1**. Check the active revision's mount configuration. The Docker container itself already creates `/data/tables`, but a mounted share may hide the built-in directory; the store can create it if permissions permit.
5. Check logs for successful startup and a writable storage directory. Do not treat HTTP `/health` alone as proof of storage persistence.

The official Azure Files mount instructions are at:
https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts

IMPORTANT: Azure Files can be mounted across revisions. During deployments, single-revision mode may briefly overlap the old and new revision. This beta's JSON-snapshot-based game store has no cross-process locking; **schedule upgrades only when there are no active games**. For unattended zero-downtime deployments or scaling to several instances, we should replace the snapshot store with a transactional backend and distributed coordination.

## 3. Test HTTPS, WebSockets and restart recovery

```bash
az containerapp show \
  --name kalitiri-game --resource-group rg-kalitiri \
  --query properties.configuration.ingress.fqdn --output tsv
```

Open `https://<returned-domain>/health` (should return a healthy JSON result) and then `https://<returned-domain>/` on your phone. Use a second phone on mobile data to prove that the game works beyond your home Wi-Fi. Complete a real four-player match; then start another match, save several tricks, restart the app, and verify recovery from the same browser.

To inspect logs:

```bash
az containerapp logs show -n kalitiri-game -g rg-kalitiri --follow
```

**Never send recovery tokens to other players, and don't make saved game JSON publicly downloadable.**

## 4. Budget and operational safeguards

- Set budget warnings at e.g. USD $5 and $10 equivalent (converted to your subscription billing currency); alerts warn, they don't normally turn services off automatically.
- Review Azure Container Apps consumption, registry charges, Azure Files (including transaction/throughput billing), and Log Analytics separately.
- Enable backups for the storage account. Do not confuse local snapshots with offsite backup.
- Disable auto-scaling to more than one instance for this architecture.
- Limit logging of game actions and never log seat tokens.
- Add input rate limiting and old-room cleanup before a public launch.

## 5. Cleanup / avoiding surprise charges

If your project group has **only** this project's resources and you want everything permanently deleted (including stored games), you may remove it in the portal, or run:

```bash
az group delete --name rg-kalitiri --yes --no-wait
```

**Danger:** This irreversibly deletes the entire resource group, including registry, storage and saved game snapshots. Always verify the group's contents before deletion.

## Key references

- Deploy from local source: https://learn.microsoft.com/en-us/azure/container-apps/containerapp-up
- Azure Files mounts: https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts
- Azure Container Apps pricing: https://azure.microsoft.com/en-us/pricing/details/container-apps/
- Consumption billing: https://learn.microsoft.com/en-us/azure/container-apps/billing
- Azure Files billing: https://learn.microsoft.com/en-us/azure/storage/files/understanding-billing
