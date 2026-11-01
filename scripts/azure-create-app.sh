#!/usr/bin/env bash
# Create only the Azure Container App (and managed build dependencies).
# IMPORTANT: The app initially uses EPHEMERAL storage. Configure Azure Files
# via docs/AZURE_DEPLOY.md BEFORE starting real matches.
set -euo pipefail

if ! command -v az >/dev/null 2>&1; then
  echo 'Azure CLI not found. See https://learn.microsoft.com/cli/azure/install-azure-cli' >&2
  exit 1
fi
if [[ -z "${AZURE_SUBSCRIPTION_ID:-}" ]]; then
  echo 'Set AZURE_SUBSCRIPTION_ID to the subscription that has eligible credits.' >&2
  exit 1
fi
if [[ "${KALITIRI_DEPLOY_APPROVED:-}" != 'YES' ]]; then
  echo 'This command creates billable Azure resources (including an ACR registry).'
  echo 'To proceed, set KALITIRI_DEPLOY_APPROVED=YES. See docs/AZURE_DEPLOY.md.'
  exit 1
fi

RG="${KALITIRI_RESOURCE_GROUP:-rg-kalitiri}"
LOCATION="${KALITIRI_LOCATION:-canadacentral}"
ENVIRONMENT="${KALITIRI_ENVIRONMENT:-cae-kalitiri}"
APP="${KALITIRI_APP:-kalitiri-game}"

az account set --subscription "$AZURE_SUBSCRIPTION_ID"
az extension add --name containerapp --upgrade --yes
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
az group create --name "$RG" --location "$LOCATION" --output table

# Running from the repository root ensures the Dockerfile and workspaces exist.
cd "$(dirname "$0")/.."
az containerapp up \
  --name "$APP" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --environment "$ENVIRONMENT" \
  --source . \
  --ingress external \
  --target-port 2567

az containerapp revision set-mode --name "$APP" --resource-group "$RG" --mode single
az containerapp update \
  --name "$APP" --resource-group "$RG" \
  --cpu 0.5 --memory 1.0Gi \
  --min-replicas 1 --max-replicas 1 \
  --set-env-vars KALITIRI_DATA_DIR=/data/tables NODE_ENV=production

FQDN="$(az containerapp show --name "$APP" --resource-group "$RG" --query properties.configuration.ingress.fqdn --output tsv)"
printf '\nApp deployed at https://%s\n' "$FQDN"
printf '%s\n' 'CRITICAL: Azure Files is NOT YET mounted at /data. Complete docs/AZURE_DEPLOY.md before inviting players.'
