---
id: live-deployment
---

# Live Deployment

Use GitHub as the source of truth, but keep production secrets and data on the server. Do not commit `config.yaml`, `.env` files with real credentials, SQLite databases, upload directories, backups, logs or build artifacts.

## Before Pushing

Run these checks locally before committing:

```bash
git status
npm run build --workspace backend
npm run build --workspace frontend
```

Also scan the working tree for accidental secrets. Real API keys, passwords, JWT secrets, OAuth client secrets, private keys and production URLs with credentials must stay in server-side environment files or `config.yaml`, not in Git.

## Server Update Flow

Create a backup before every update:

```bash
cd /opt/mediapult-transfer
APP_DIR="$PWD" BACKUP_DIR="$PWD/backups" ./scripts/backup-mediapult.sh
git pull
docker build -t mediapult-transfer:latest .
docker compose up -d
docker compose logs -f mediapult-transfer
```

With Podman:

```bash
cd /opt/mediapult-transfer
APP_DIR="$PWD" BACKUP_DIR="$PWD/backups" ./scripts/backup-mediapult.sh
git pull
podman build -t mediapult-transfer:latest .
podman-compose up -d
podman-compose logs -f mediapult-transfer
```

## Production Secrets

Keep these values only on the server:

- `config.yaml`
- `.env` files with real credentials
- Reverse-proxy TLS configuration
- SMTP passwords
- OAuth client secrets
- S3 access keys
- JWT or cookie secrets

The desktop client stores its API key through the OS keyring. On Windows this is normally the Windows Credential Manager. The backend stores API tokens as Argon2 hashes, not as cleartext tokens.

## Data and Links

Back up both metadata and files. Existing share links depend on:

- The backend database
- The local upload storage path used by each share
- The current `config.yaml`
- Public image assets and mounted volumes

Changing the admin storage path affects new shares only. If you want to move existing local shares, use the storage migration action in the admin storage settings after a successful backup.

## ClamAV

For production, run ClamAV and keep it reachable from the backend. Local uploads are only released after a clean scan. If ClamAV is unavailable in production, uploads are rejected instead of publishing unscanned files.

## Smoke Test

After every deployment, verify:

- Admin login works.
- Existing share links open.
- An existing file can be downloaded.
- A new upload works.
- Public upload and versioning work for a test link.
- The file list shows the clean scan state for uploaded files.
