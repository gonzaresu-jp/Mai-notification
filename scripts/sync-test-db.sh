#!/usr/bin/env bash
# sync-test-db.sh - 本番 data.db を staging (data-test.db) にスナップショットコピー
# 使い方: bash scripts/sync-test-db.sh
# ※ staging API が起動している場合は先に止めてから実行（ロック競合回避）
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="data.db"
DST="data-test.db"

if [ ! -f "$SRC" ]; then
  echo "error: $SRC not found" >&2
  exit 1
fi

DOTENV_LOG=$( [ -x "$(command -v dotenv)" ] && echo yes || echo no )
if pm2 describe mai-push-api-test >/dev/null 2>&1 && pm2 pid mai-push-api-test >/dev/null 2>&1; then
  PID=$(pm2 pid mai-push-api-test 2>/dev/null || true)
  if [ -n "$PID" ] && [ "$PID" != "0" ]; then
    echo "warning: mai-push-api-test (pid=$PID) が稼働中です。先に pm2 stop mai-push-api-test を推奨"
  fi
fi

sqlite3 "$SRC" ".backup '$DST'"
echo "synced: $SRC -> $DST"
sqlite3 "$DST" "PRAGMA integrity_check;" | head -1
ls -la "$DST"
