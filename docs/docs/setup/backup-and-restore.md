---
id: backup-and-restore
---

# Backup and Restore

Mediapult Transfer stores link metadata in the backend database and local files in the configured upload directory. Back up both before updating.

## What to Back Up

- Backend data directory, including the SQLite database and `uploads/shares`
- Any additional local upload paths configured in `/admin/config/storage`
- `config.yaml`, `.env`, `docker-compose.yml` and `docker-compose.local.yml`
- Public image volume, usually `data/images`

## Backup Before Update

```bash
cd /opt/mediapult-transfer
APP_DIR="$PWD" BACKUP_DIR="$PWD/backups" ./scripts/backup-mediapult.sh
git pull
docker build -t mediapult-transfer:latest .
docker compose up -d
docker compose logs -f mediapult-transfer
```

With Podman, replace the Docker commands with:

```bash
podman build -t mediapult-transfer:latest .
podman-compose up -d
podman-compose logs -f mediapult-transfer
```

## Restore After Failure

```bash
cd /opt/mediapult-transfer
docker compose down
APP_DIR="$PWD" ./scripts/restore-mediapult.sh ./backups/mediapult-transfer-YYYYMMDDTHHMMSSZ.tar.gz
docker compose up -d
```

After restore, verify:

- Login works for an admin user.
- Existing share links still open.
- At least one existing file can be downloaded.
- New upload and ClamAV scanning work.

## Storage Path Note

Changing `/admin/config/storage` only affects new shares. Existing shares keep their original local storage path so links continue to work after updates.
