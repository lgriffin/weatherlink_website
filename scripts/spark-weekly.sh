#!/usr/bin/env bash
# Weekly retrain on the model machine: top up the data, retrain, send the
# scores and the run's outcome to the site.
set -uo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo"
set -a; [ -f .env ] && . ./.env; set +a
started="$(date -u +%FT%TZ)"

status=ok
message=""
if ! { pnpm -s archive:harvest && pnpm -s archive:rebuild && (cd ml && .venv/bin/python -m wxml train); }; then
  status=failed
  message="Training failed on $(hostname -s); see the cron log there."
fi

if [ "$status" = ok ]; then
  scripts/push-output.sh model-scores ml/out/metrics.json
fi
printf '{"status":"%s","task":"train","startedAt":"%s","finishedAt":"%s","message":"%s"}' \
  "$status" "$started" "$(date -u +%FT%TZ)" "$message" | scripts/push-output.sh harvest -
[ "$status" = ok ]
