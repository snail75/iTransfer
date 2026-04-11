# Mediapult Transfer Desktop

The desktop client is a Tauri tray application. On macOS it builds as `.app` and `.dmg` and appears in the menu bar.

## macOS Upload Flow

1. Click the Mediapult Transfer menu bar icon.
2. Drop files into the upload window or choose files from the button.
3. The client uploads through the configured server URL with the API token stored in the OS keyring.

Directly dropping files onto the menu bar icon is not treated as a production requirement. Tauri provides stable webview/window drag and drop, while tray-icon file drops are not a portable Tauri feature across platforms.
