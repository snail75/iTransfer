#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
IMAGES_DIR="${IMAGES_DIR:-$DATA_DIR/images}"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
BACKUP_PATH="$BACKUP_DIR/mediapult-transfer-$STAMP.tar.gz"
MANIFEST="$(mktemp)"

mkdir -p "$BACKUP_DIR"
trap 'rm -f "$MANIFEST"' EXIT

for path in "$DATA_DIR" "$IMAGES_DIR" "$APP_DIR/config.yaml" "$APP_DIR/docker-compose.yml" "$APP_DIR/docker-compose.local.yml" "$APP_DIR/.env"; do
  if [ -e "$path" ]; then
    realpath --relative-to="$APP_DIR" "$path" >> "$MANIFEST"
  fi
done

tar --exclude="$BACKUP_DIR" -czf "$BACKUP_PATH" -C "$APP_DIR" -T "$MANIFEST"

if [ ! -s "$BACKUP_PATH" ]; then
  echo "Backup failed: $BACKUP_PATH is empty" >&2
  exit 1
fi

echo "$BACKUP_PATH"
