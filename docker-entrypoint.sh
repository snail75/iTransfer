#!/bin/sh
set -e

export PORT="${PORT:-${BACKEND_PORT:-3000}}"
export DATA_DIRECTORY="${DATA_DIRECTORY:-/data}"
export UPLOAD_DIRECTORY="${UPLOAD_DIRECTORY:-$DATA_DIRECTORY/uploads/shares}"
export DATABASE_URL="${DATABASE_URL:-file:$DATA_DIRECTORY/mediapult-transfer.db?connection_limit=1}"

mkdir -p "$DATA_DIRECTORY" "$UPLOAD_DIRECTORY"

case "$DATABASE_URL" in
  file:*)
    db_path="${DATABASE_URL#file:}"
    db_path="${db_path%%\?*}"
    mkdir -p "$(dirname "$db_path")"
    ;;
esac

echo "Initializing Prisma database..."
npx prisma db push --skip-generate
npx prisma db seed

exec "$@"
