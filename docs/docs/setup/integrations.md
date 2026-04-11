---
id: integrations
---

# Integrations

## ClamAV

ClamAV is used to scan uploaded local files for malicious content. In production, uploads are blocked when ClamAV is not available, and files are only made visible after a clean scan.

Please note that ClamAV needs a lot of [resources](https://docs.clamav.net/manual/Installing/Docker.html#memory-ram-requirements).

### Docker / Podman

If you are already running ClamAV elsewhere, you can specify the `CLAMAV_HOST` environment variable to point to that instance.

Else you have to add the ClamAV container to the Mediapult Transfer Docker/Podman Compose stack:

1. Add the ClamAV container to the Docker/Podman Compose stack and start the container.

```diff
services:
  mediapult-transfer:
    image: mediapult/mediapult-transfer
    ...
+   depends_on:
+     clamav:
+       condition: service_healthy

+  clamav:
+    restart: unless-stopped
+    image: clamav/clamav

```

2. Docker/Podman will wait for ClamAV to start before starting Mediapult Transfer. This may take a minute or two.
3. The Mediapult Transfer logs should now log "ClamAV is active"

### Stand-Alone

1. Install ClamAV
2. Specify the `CLAMAV_HOST` environment variable for the backend and restart the Mediapult Transfer backend.

## Scan Status

Clean files are marked with a virus-free status in the UI. S3 storage is not scanned in this version; use local storage for enforced malware scanning.
