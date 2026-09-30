#!/usr/bin/env bash
# Send one output file to the site's Outputs page.
#
#   scripts/push-output.sh <forecast|model-scores|outages|harvest> <file.json | ->
#
# Reads SITE_URL and INGEST_TOKEN from the environment or the repo's .env.
# INGEST_SOURCE (default: this machine's hostname) is the name the page shows.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$repo/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$repo/.env"
  set +a
fi

kind="${1:?usage: push-output.sh <forecast|model-scores|outages|harvest> <file.json | ->}"
file="${2:?usage: push-output.sh <kind> <file.json | ->}"
: "${SITE_URL:?Set SITE_URL, e.g. http://nas.local:1456}"
: "${INGEST_TOKEN:?Set INGEST_TOKEN to the same value as on the site}"
source_name="${INGEST_SOURCE:-$(hostname -s 2>/dev/null || hostname)}"

if [ "$file" = "-" ]; then data="@-"; else data="@$file"; fi

curl --fail-with-body -sS -X POST "${SITE_URL%/}/api/v1/ingest/$kind" \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "X-Source: $source_name" \
  -H "Content-Type: application/json" \
  --data-binary "$data"
echo
