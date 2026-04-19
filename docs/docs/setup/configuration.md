---
id: configuration
---

# Configuration

## General configuration

There are plenty of settings you can adjust to your needs. Mediapult Transfer can be configured in two ways:

### UI

You can change the settings in the UI (`/admin/config`)

### YAML file

You can set the configuration via a YAML file. If you choose this way, you won't be able to change the settings in the UI.

If you use Docker or Podman you can create a `config.yml` file based on the [`config.example.yaml`](https://github.com/mediapult/mediapult-transfer/blob/main/config.example.yaml) and mount it to `/opt/app/config.yaml` in the container.

If you run Mediapult Transfer without Docker/Podman, you can create a `config.yml` file based on the [`config.example.yaml`](https://github.com/mediapult/mediapult-transfer/blob/main/config.example.yaml) in the root directory of the project.

---

### Environment variables

For installation specific configuration, you can use environment variables. The following variables are available:

#### Backend

| Variable                 | Default Value                                           | Description                                                                                              |
| ------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `PORT`                   | `3000`                                                  | The port on which the backend listens.                                                                   |
| `BACKEND_PORT`           | empty                                                   | Legacy fallback for `PORT`.                                                                              |
| `DATABASE_URL`           | `file:../data/mediapult-transfer.db?connection_limit=1` | The URL of the SQLite database.                                                                          |
| `DATA_DIRECTORY`         | `./data`                                                | The directory where data is stored.                                                                      |
| `UPLOAD_DIRECTORY`       | `${DATA_DIRECTORY}/uploads/shares`                      | The directory where local share files are stored. Use an absolute path for Docker volumes.                |
| `CONFIG_FILE`            | `../config.yaml`                                        | Path to the configuration file.                                                                          |
| `DESKTOP_CLIENT_ORIGINS` | Tauri and local desktop dev origins                     | Comma-separated origins that may call the API with bearer tokens from the desktop client.                 |
| `CLAMAV_HOST`            | `127.0.0.1` or `clamav` when running with Docker/Podman  | The IP address of the ClamAV server. See the [ClamAV docs](integrations.md#clamav) for more information. |
| `CLAMAV_PORT`            | `3310`                                                  | The port number of the ClamAV server.                                                                    |

## System configuration and local storage migration

Admins can review the active system configuration in `/admin/system`. The page shows the configuration source, config file path, database location, active local upload path, fallback upload path, temporary upload path, storage provider, SMTP status, and local storage roots currently used by shares.

The local upload path must be absolute and writable by the backend process or container user. Saving a new path affects only new local shares. Existing local shares keep their stored `localStoragePath` until an admin explicitly runs the local storage migration.

The migration assistant on `/admin/system` works in two steps:

1. Run a dry-run to list affected shares, file counts, total bytes, missing source folders, target conflicts, and available free space.
2. Start the migration after reviewing the dry-run. Each share is copied into a temporary folder below the target path, verified, switched in the database, and then removed from the old share folder.

Only one storage migration can run at a time. Uploads, deletes, and share deletion for a share currently being migrated are blocked to avoid race conditions. Downloads remain available where possible; if a share is hit during the short switch-over window, the API returns a temporary error instead of serving incomplete data.

If cleanup of old upload roots is enabled, the migration attempts to remove old root folders after all moved share folders have been deleted. A root folder is removed only when it is empty; folders with unrelated files are left in place and reported as warnings.

S3 storage remains configurable and visible in the UI, but live migration between local storage and S3 is not implemented. Moving the SQLite database location is also not performed live because Prisma initializes the database connection for the running process.

The older `/admin/config/storage` page remains available for detailed configuration. If the UI or YAML setting is empty, the backend uses `UPLOAD_DIRECTORY`.

#### Frontend

| Variable  | Default Value           | Description                              |
| --------- | ----------------------- | ---------------------------------------- |
| `PORT`    | `3000`                  | The port on which the frontend listens.  |
| `API_URL` | `http://localhost:8080` | The URL of the backend for the frontend. |

#### Docker/Podman specific

The root Dockerfile builds a backend-only image. Use a separate frontend or reverse proxy if you need the web UI.

Recommended Docker values for persistent SQLite and uploads:

| Variable           | Recommended Value                                  | Description                                      |
| ------------------ | -------------------------------------------------- | ------------------------------------------------ |
| `PORT`             | `3000`                                             | The backend API port exposed by the container.   |
| `DATA_DIRECTORY`   | `/data`                                            | Mount your persistent host or ZFS path here.     |
| `UPLOAD_DIRECTORY` | `/data/uploads/shares`                             | Local share files live under this directory.     |
| `DATABASE_URL`     | `file:/data/mediapult-transfer.db?connection_limit=1` | SQLite database path on the mounted volume.      |

| Variable                       | Default Value | Description                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_TLS_REJECT_UNAUTHORIZED` | `1` (enabled) | Controls whether Node.js should reject connections to servers with self-signed or invalid certificates. Set to `0` to allow connections to services with self-signed certificates (e.g., LDAPS, proxy). **Warning**: Only use `0` in environments where you trust the network infrastructure. |
