#!/usr/bin/env bash
# Evening forecast on the model machine: top up the data, forecast, send it.
# Run from cron shortly after 18:00 local time (see the machine guide).
#
# Needs in .env: WEATHERLINK_API_KEY/SECRET, SITE_URL, INGEST_TOKEN, and
# optionally FORECAST_MODEL (an Ollama model name, e.g. station-forecaster).
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo"
set -a; [ -f .env ] && . ./.env; set +a
out="$repo/ml/out"
mkdir -p "$out"

pnpm -s archive:harvest
pnpm -s archive:rebuild

ask=()
if [ -n "${FORECAST_MODEL:-}" ]; then ask=(--ask "$FORECAST_MODEL"); fi
cd ml
# Keep the weather models' past runs, then forecast, keep it in the ledger and send it to the site.
.venv/bin/python -m wxml guidance-sync || echo "Guidance sync failed; forecasting with what is saved." >&2
.venv/bin/python -m wxml issue --publish site "${ask[@]}"
# Score earlier forecasts now that their nights are known.
.venv/bin/python -m wxml verify
