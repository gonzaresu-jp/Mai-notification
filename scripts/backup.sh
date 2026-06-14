#!/bin/bash
BACKUP_DIR="/var/www/html/mai-push/backups"
DB_PATH="/var/www/html/mai-push/data.db"
RETENTION_DAYS=30
mkdir -p "$BACKUP_DIR"
cp "$DB_PATH" "$BACKUP_DIR/data-$(date +%Y%m%d).db"
find "$BACKUP_DIR" -name "data-*.db" -mtime +$RETENTION_DAYS -delete
echo "[$(date)] backup done: data-$(date +%Y%m%d).db"
