#!/usr/bin/env bash
# ponytail: sequential + `|| true` everywhere — a debug snapshot must never abort halfway
cd "$(dirname "$0")/.." || exit 1

DIR="logs/$(date -u +%Y-%m-%dT%H-%M-%SZ)"
mkdir -p "$DIR"

{
  git log -3 --oneline
  echo "branch: $(git branch --show-current)"
  git status --short
} > "$DIR/git.txt" 2>&1 || true

supabase migration list > "$DIR/migrations.json" 2>&1 || true

TOKEN=$(cat ~/.supabase/access-token 2>/dev/null || security find-generic-password -w -s "Supabase CLI" 2>/dev/null)
if [ -n "$TOKEN" ]; then
  curl -sf -G "https://api.supabase.com/v1/projects/gknezlfpalsrqttuxusn/analytics/endpoints/logs.all" \
    -H "Authorization: Bearer $TOKEN" \
    --data-urlencode "sql=select timestamp, event_message from function_logs where timestamp > timestamp_sub(current_timestamp(), interval 60 minute) order by timestamp desc limit 100" \
    > "$DIR/functions.log.raw" 2>&1 || echo "log fetch failed" >> "$DIR/functions.log.raw"
  python3 -m json.tool < "$DIR/functions.log.raw" > "$DIR/functions.log" 2>/dev/null || mv "$DIR/functions.log.raw" "$DIR/functions.log"
  rm -f "$DIR/functions.log.raw"
else
  echo "no Supabase access token found" > "$DIR/functions.log"
fi

pnpm test > "$DIR/tests.txt" 2>&1 || true

{
  echo "node: $(node --version 2>&1)"
  echo "pnpm: $(pnpm --version 2>&1)"
  echo "supabase: $(supabase --version 2>&1)"
} > "$DIR/env.txt" 2>&1 || true

echo "$DIR"
