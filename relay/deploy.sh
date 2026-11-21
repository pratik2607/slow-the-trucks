#!/bin/sh
# Deploys the relay to Cloud Run on the stock Node image, with server.js handed in at start-up, so
# nothing has to be built. Needs gcloud signed in to a project where Vertex AI is switched on.
# If OPENAI_API_KEY is set in your shell it is passed to the service's settings, never written here.
# Usage: OPENAI_API_KEY=... sh relay/deploy.sh <gcloud project> [region]
set -e
PROJECT="$1"
REGION="${2:-us-east4}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT
printf 'SERVER_B64: "%s"\nGOOGLE_CLOUD_PROJECT: "%s"\n' "$(base64 < "$HERE/server.js" | tr -d '\n')" "$PROJECT" > "$ENV_FILE"
if [ -n "$OPENAI_API_KEY" ]; then printf 'OPENAI_API_KEY: "%s"\n' "$OPENAI_API_KEY" >> "$ENV_FILE"; fi
gcloud run deploy slow-the-trucks-ask --project "$PROJECT" --region "$REGION" \
  --image=docker.io/library/node:22-alpine --allow-unauthenticated \
  --max-instances 2 --memory 256Mi --concurrency 30 --timeout 60 \
  --command=sh --args='^@^-c@echo "$SERVER_B64" | base64 -d > /tmp/server.mjs && exec node /tmp/server.mjs' \
  --env-vars-file "$ENV_FILE" --quiet
