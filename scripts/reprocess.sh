#!/usr/bin/env bash
# Manually trigger the reprocess sweep (same call the hourly cron makes):
# re-parses raw_sms stuck pending/failed, re-routes unrouted transactions.
# Run after shipping a parser fix instead of waiting for the next :10 cron tick.
set -euo pipefail

SECRET=$(supabase db query --linked "select secret from cron_config" \
  | python3 -c "import sys,json; s=sys.stdin.read(); print(json.loads(s[s.index('{'):])['rows'][0]['secret'])")

curl -s -X POST "https://gknezlfpalsrqttuxusn.supabase.co/functions/v1/reprocess" \
  -H "X-Cron-Secret: $SECRET" -H "Content-Type: application/json" -d '{}'
echo
