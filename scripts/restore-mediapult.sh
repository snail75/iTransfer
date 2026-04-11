#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /path/to/mediapult-transfer-backup.tar.gz" >&2
  exit 1
fi

APP_DIR="${APP_DIR:-$(pwd)}"
BACKUP_PATH="$1"

if [ ! -f "$BACKUP_PATH" ]; then
  echo "Backup file not found: $BACKUP_PATH" >&2
  exit 1
fi

tar -xzf "$BACKUP_PATH" -C "$APP_DIR"
echo "Restored $BACKUP_PATH into $APP_DIR"
