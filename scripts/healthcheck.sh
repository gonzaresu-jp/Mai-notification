#!/bin/bash
API_BASE="http://localhost:8080"
WORKER_BASE="http://localhost:3002"
WEBHOOK_URL="https://discord.com/api/webhooks/1495218824553828493/6286WjliqT-Zonh3AHtDTmgpfR1BLWiwFnWOOQNsZfxUsm4i7dS1ESPDYskbL8WGm1US"
HOSTNAME=$(hostname)
send_alert() {
    local level="$1" title="$2" desc="$3"
    local color=16776960
    [ "$level" = "ERROR" ] && color=16711680
    curl -s -H "Content-Type: application/json" \
         -X POST "$WEBHOOK_URL" \
         -d "{
           \"embeds\": [{
             \"title\": \"$title\",
             \"description\": \"$desc\",
             \"color\": $color,
             \"footer\": {\"text\": \"Host: $HOSTNAME | healthcheck\"},
             \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
           }]
         }" > /dev/null 2>&1
}

# Check API (mai-push-api on 8080)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API_BASE/api/health" 2>&1)
if [ "$HTTP_CODE" != "200" ]; then
    send_alert "ERROR" "API Down" "health endpoint returned HTTP $HTTP_CODE"
    exit 1
fi

# Check Worker (mai-push-worker on 3002)
WORKER_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$WORKER_BASE/api/health" 2>&1)
if [ "$WORKER_HTTP" != "200" ]; then
    send_alert "ERROR" "Worker Down" "worker health endpoint returned HTTP $WORKER_HTTP"
    exit 1
fi

# Check scraper status (at least one scraper should report)
RESULT=$(curl -s --max-time 10 "$API_BASE/api/scraper-status" 2>/dev/null)
ITEM_COUNT=$(echo "$RESULT" | python3 -c "import sys,json; data=json.load(sys.stdin); items=data.get('items') if isinstance(data,dict) else data; print(len(items) if isinstance(items,list) else 0)" 2>/dev/null)
if [ -z "$ITEM_COUNT" ] || [ "$ITEM_COUNT" -eq 0 ]; then
    send_alert "WARN" "scraper-status empty" "scraper-status API returned empty response"
    exit 1
fi
echo "[$(date)] healthcheck OK (${ITEM_COUNT} items)"
