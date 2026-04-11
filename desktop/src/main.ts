import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./styles.css";

type ConfigVariable = {
  key: string;
  value?: string;
  defaultValue: string;
};

type MyShare = {
  id: string;
  name?: string;
  expiration: string;
  createdAt: string;
  size: number;
  allowPublicUpload: boolean;
  allowVersioning: boolean;
  files?: Array<{ id: string; name: string; size: string }>;
};

const settingsForm = document.querySelector<HTMLFormElement>("#settings")!;
const settingsToggle =
  document.querySelector<HTMLButtonElement>("#settings-toggle")!;
const settingsClose =
  document.querySelector<HTMLButtonElement>("#settings-close")!;
const settingsPane = document.querySelector<HTMLElement>("#settings-pane")!;
const uploadPane = document.querySelector<HTMLElement>("#upload-pane")!;
const linksPane = document.querySelector<HTMLElement>("#links-pane")!;
const shareFilesTab =
  document.querySelector<HTMLButtonElement>("#share-files-tab")!;
const shareHistoryTab =
  document.querySelector<HTMLButtonElement>("#share-history-tab")!;
const serverUrlInput = document.querySelector<HTMLInputElement>("#server-url")!;
const apiTokenInput = document.querySelector<HTMLInputElement>("#api-token")!;
const serverMaxSize =
  document.querySelector<HTMLElement>("#server-max-size")!;
const expirationSelect =
  document.querySelector<HTMLSelectElement>("#expiration")!;
const allowPublicUploadInput =
  document.querySelector<HTMLInputElement>("#allow-public-upload")!;
const allowVersioningInput =
  document.querySelector<HTMLInputElement>("#allow-versioning")!;
const refreshLinksButton =
  document.querySelector<HTMLButtonElement>("#refresh-links")!;
const seeLinksWebButton =
  document.querySelector<HTMLButtonElement>("#see-links-web")!;
const linksSearchInput =
  document.querySelector<HTMLInputElement>("#links-search")!;
const linksList = document.querySelector<HTMLElement>("#links-list")!;
const linksMessage = document.querySelector<HTMLElement>("#links-message")!;
const clearTokenButton = document.querySelector<HTMLButtonElement>("#clear-token")!;
const dropZone = document.querySelector<HTMLElement>("#drop-zone")!;
const filePicker = document.querySelector<HTMLInputElement>("#file-picker")!;
const chooseFilesButton =
  document.querySelector<HTMLButtonElement>("#choose-files")!;
const message = document.querySelector<HTMLParagraphElement>("#message")!;
const progress = document.querySelector<HTMLProgressElement>("#progress")!;
const uploadSpeed =
  document.querySelector<HTMLParagraphElement>("#upload-speed")!;
const lastLink = document.querySelector<HTMLAnchorElement>("#last-link")!;

let apiToken = "";
let chunkSize = 10_000_000;
let serverMaxUploadBytes: number | undefined;
let isUploading = false;
let loadedLinks: MyShare[] = [];

void initialize();

async function initialize() {
  bindUiEvents();

  serverUrlInput.value = localStorage.getItem("serverUrl") ?? "";
  localStorage.removeItem("maxUploadSizeMb");
  expirationSelect.value = localStorage.getItem("expiration") ?? "1-weeks";
  allowPublicUploadInput.checked =
    localStorage.getItem("allowPublicUpload") === "true";
  allowVersioningInput.checked =
    localStorage.getItem("allowVersioning") === "true";

  try {
    apiToken = (await invoke<string | null>("get_api_token")) ?? "";
    apiTokenInput.value = apiToken ? "Stored token" : "";

    if (serverUrlInput.value && apiToken) {
      setMessage("Ready. Drop files to upload.");
      await loadServerConfig();
    }
  } catch {
    setMessage("Could not read the stored API token. Open Settings to enter it again.");
  }

  await bindTauriEvents();
}

function bindUiEvents() {
  settingsToggle.addEventListener("click", () => toggleSettings());
  settingsClose.addEventListener("click", () => toggleSettings(false));
  shareFilesTab.addEventListener("click", () => showMainPane("files"));
  shareHistoryTab.addEventListener("click", () => {
    showMainPane("history");
    void loadLinks();
  });
  settingsForm.addEventListener("submit", saveSettings);
  clearTokenButton.addEventListener("click", clearToken);
  refreshLinksButton.addEventListener("click", () => loadLinks());
  seeLinksWebButton.addEventListener("click", () => {
    const serverUrl = getServerUrl();
    if (serverUrl) void openUrl(`${serverUrl}/account/shares`);
  });
  linksSearchInput.addEventListener("input", () => renderLinks());
  expirationSelect.addEventListener("change", () => {
    localStorage.setItem("expiration", expirationSelect.value);
  });
  allowPublicUploadInput.addEventListener("change", () => {
    localStorage.setItem(
      "allowPublicUpload",
      allowPublicUploadInput.checked ? "true" : "false",
    );
  });
  allowVersioningInput.addEventListener("change", () => {
    localStorage.setItem(
      "allowVersioning",
      allowVersioningInput.checked ? "true" : "false",
    );
  });
  chooseFilesButton.addEventListener("click", () => filePicker.click());
  filePicker.addEventListener("change", () => {
    if (filePicker.files) void uploadFiles(Array.from(filePicker.files));
    filePicker.value = "";
  });

  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag-over");
  });
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    if (event.dataTransfer?.files?.length) {
      void uploadFiles(Array.from(event.dataTransfer.files));
    }
  });

  lastLink.addEventListener("click", (event) => {
    event.preventDefault();
    if (lastLink.href) void openUrl(lastLink.href);
  });
}

async function bindTauriEvents() {
  await listen("show-settings", () => toggleSettings(true));
  await listen("tray-open-web", () => {
    const serverUrl = getServerUrl();
    if (serverUrl) void openUrl(serverUrl);
  });
}

function toggleSettings(force?: boolean) {
  settingsForm.hidden = force === undefined ? !settingsForm.hidden : !force;
  if (!settingsForm.hidden) serverUrlInput.focus();
}

function showMainPane(pane: "files" | "history") {
  const showHistory = pane === "history";
  uploadPane.hidden = showHistory;
  linksPane.hidden = !showHistory;
  shareFilesTab.classList.toggle("active", !showHistory);
  shareHistoryTab.classList.toggle("active", showHistory);
  settingsPane.hidden = false;
}

async function saveSettings(event: Event) {
  event.preventDefault();
  const serverUrl = normalizeServerUrl(serverUrlInput.value);
  const token = apiTokenInput.value.trim();

  if (!serverUrl) {
    setMessage("Enter a valid server URL.");
    return;
  }

  localStorage.setItem("serverUrl", serverUrl);
  serverUrlInput.value = serverUrl;
  localStorage.setItem("expiration", expirationSelect.value);

  if (token && token !== "Stored token") {
    await invoke("save_api_token", { token });
    apiToken = token;
    apiTokenInput.value = "Stored token";
  }

  await loadServerConfig();
  settingsForm.hidden = true;
  setMessage("Ready. Drop files to upload.");
}

async function clearToken() {
  await invoke("delete_api_token");
  apiToken = "";
  apiTokenInput.value = "";
  linksList.replaceChildren();
  setMessage("API token cleared.");
}

async function loadLinks() {
  const serverUrl = getServerUrl();
  apiToken = apiToken || ((await invoke<string | null>("get_api_token")) ?? "");

  if (!serverUrl || !apiToken) {
    linksMessage.textContent = "Configure the server URL and API token first.";
    return;
  }

  linksMessage.textContent = "Loading links...";
  linksList.replaceChildren();

  try {
    const response = await fetch(`${serverUrl}/api/shares`, {
      headers: headers(),
    });
    if (!response.ok) throw await responseError(response, "Could not load links.");

    loadedLinks = (await response.json()) as MyShare[];
    if (loadedLinks.length === 0) {
      linksMessage.textContent = "No links found.";
      return;
    }

    renderLinks();
  } catch (error) {
    linksMessage.textContent =
      error instanceof Error ? error.message : "Could not load links.";
  }
}

function renderLinks() {
  const serverUrl = getServerUrl();
  const query = linksSearchInput.value.trim().toLowerCase();
  const shares = query
    ? loadedLinks.filter((share) =>
        [
          share.id,
          share.name,
          share.files?.map((file) => file.name).join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : loadedLinks;

  linksList.replaceChildren();
  for (const share of shares) {
    linksList.appendChild(renderLinkItem(serverUrl, share));
  }
  linksMessage.textContent = `${shares.length} of ${loadedLinks.length} link${loadedLinks.length === 1 ? "" : "s"} shown.`;
}

function renderLinkItem(serverUrl: string, share: MyShare) {
  const item = document.createElement("article");
  item.className = "link-item";

  const summary = document.createElement("button");
  summary.className = "link-summary";
  summary.type = "button";

  const title = document.createElement("p");
  title.className = "link-title";
  title.textContent = share.name || share.id;

  const fileCount = document.createElement("p");
  fileCount.className = "link-meta link-meta-right";
  fileCount.textContent = `${share.files?.length ?? 0} files`;

  const chevron = document.createElement("span");
  chevron.textContent = "More";
  chevron.className = "link-meta";

  const expires = document.createElement("p");
  expires.className = "link-meta link-meta-right";
  expires.textContent = `Expires ${formatDate(share.expiration)}`;

  const expiration = document.createElement("select");
  expiration.innerHTML = expirationSelect.innerHTML;
  expiration.value = valueFromExpiration(share.expiration);
  expiration.addEventListener("change", async () => {
    try {
      await updateShareExpiration(serverUrl, share.id, expiration.value);
      linksMessage.textContent = "Expiration updated.";
      await loadLinks();
    } catch (error) {
      linksMessage.textContent =
        error instanceof Error ? error.message : "Could not update expiration.";
    }
  });

  const actions = document.createElement("div");
  actions.className = "link-actions";
  actions.hidden = true;

  const uploadBackLabel = document.createElement("label");
  uploadBackLabel.className = "checkbox-label";
  const uploadBack = document.createElement("input");
  uploadBack.type = "checkbox";
  uploadBack.checked = share.allowPublicUpload;
  uploadBack.addEventListener("change", async () => {
    try {
      await updateSharePublicUpload(serverUrl, share.id, uploadBack.checked);
      linksMessage.textContent = "Upload-back setting updated.";
      await loadLinks();
    } catch (error) {
      uploadBack.checked = !uploadBack.checked;
      linksMessage.textContent =
        error instanceof Error ? error.message : "Could not update upload-back setting.";
    }
  });
  uploadBackLabel.append(uploadBack, "Allow uploads back to this link");

  const versioningLabel = document.createElement("label");
  versioningLabel.className = "checkbox-label";
  const versioning = document.createElement("input");
  versioning.type = "checkbox";
  versioning.checked = share.allowVersioning;
  versioning.addEventListener("change", async () => {
    try {
      await updateShareVersioning(serverUrl, share.id, versioning.checked);
      linksMessage.textContent = "Versioning setting updated.";
      await loadLinks();
    } catch (error) {
      versioning.checked = !versioning.checked;
      linksMessage.textContent =
        error instanceof Error ? error.message : "Could not update versioning setting.";
    }
  });
  versioningLabel.append(versioning, "Allow versioning");

  const nameInput = document.createElement("input");
  nameInput.className = "full-row";
  nameInput.value = share.name || share.id;
  nameInput.placeholder = "Transfer name";

  const saveNameButton = document.createElement("button");
  saveNameButton.type = "button";
  saveNameButton.textContent = "Save name";
  saveNameButton.addEventListener("click", async () => {
    try {
      await updateShareName(serverUrl, share.id, nameInput.value.trim());
      linksMessage.textContent = "Name updated.";
      await loadLinks();
    } catch (error) {
      linksMessage.textContent =
        error instanceof Error ? error.message : "Could not update name.";
    }
  });

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = "Open";
  openButton.addEventListener("click", () => {
    void openUrl(`${serverUrl}/s/${share.id}`);
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", async () => {
    if (!confirm(`Delete ${share.id}?`)) return;
    try {
      await deleteShare(serverUrl, share.id);
      linksMessage.textContent = "Link deleted.";
      await loadLinks();
    } catch (error) {
      linksMessage.textContent =
        error instanceof Error ? error.message : "Could not delete link.";
    }
  });

  summary.append(title, fileCount, chevron, expires);
  summary.addEventListener("click", () => {
    actions.hidden = !actions.hidden;
    chevron.textContent = actions.hidden ? "More" : "Less";
  });

  actions.append(
    nameInput,
    saveNameButton,
    uploadBackLabel,
    versioningLabel,
    expiration,
    openButton,
    deleteButton,
  );
  item.append(summary, actions);
  return item;
}

async function deleteShare(serverUrl: string, shareId: string) {
  const response = await fetch(`${serverUrl}/api/shares/${shareId}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!response.ok) throw await responseError(response, "Could not delete link.");
}

async function updateShareExpiration(
  serverUrl: string,
  shareId: string,
  expiration: string,
) {
  const response = await fetch(`${serverUrl}/api/shares/${shareId}/expiration`, {
    method: "PATCH",
    headers: headers("application/json"),
    body: JSON.stringify({ expiration }),
  });
  if (!response.ok) throw await responseError(response, "Could not update expiration.");
}

async function updateShareName(
  serverUrl: string,
  shareId: string,
  name: string,
) {
  const response = await fetch(`${serverUrl}/api/shares/${shareId}/name`, {
    method: "PATCH",
    headers: headers("application/json"),
    body: JSON.stringify({ name: name || undefined }),
  });
  if (!response.ok) throw await responseError(response, "Could not update name.");
}

async function updateSharePublicUpload(
  serverUrl: string,
  shareId: string,
  allowPublicUpload: boolean,
) {
  const response = await fetch(`${serverUrl}/api/shares/${shareId}/public-upload`, {
    method: "PATCH",
    headers: headers("application/json"),
    body: JSON.stringify({ allowPublicUpload }),
  });
  if (!response.ok) throw await responseError(response, "Could not update upload-back setting.");
}

async function updateShareVersioning(
  serverUrl: string,
  shareId: string,
  allowVersioning: boolean,
) {
  const response = await fetch(`${serverUrl}/api/shares/${shareId}/versioning`, {
    method: "PATCH",
    headers: headers("application/json"),
    body: JSON.stringify({ allowVersioning }),
  });
  if (!response.ok) throw await responseError(response, "Could not update versioning setting.");
}

async function loadServerConfig() {
  const serverUrl = getServerUrl();
  if (!serverUrl) return;

  try {
    const response = await fetch(`${serverUrl}/api/configs`);
    if (!response.ok) return;
    const configs = (await response.json()) as ConfigVariable[];
    const serverChunkSize = configs.find((config) => config.key === "share.chunkSize");
    chunkSize = parseInt(serverChunkSize?.value ?? serverChunkSize?.defaultValue ?? "10000000");
    const serverMaxSizeConfig = configs.find((config) => config.key === "share.maxSize");
    serverMaxUploadBytes = parseInt(
      serverMaxSizeConfig?.value ?? serverMaxSizeConfig?.defaultValue ?? "",
      10,
    );
    if (Number.isFinite(serverMaxUploadBytes) && serverMaxUploadBytes > 0) {
      serverMaxSize.textContent = `Server upload limit: ${formatBytes(serverMaxUploadBytes)}.`;
    } else {
      serverMaxSize.textContent = "No server limit reported.";
    }
  } catch {
    // Keep the local fallback chunk size. Upload will surface connectivity errors.
  }
}

async function uploadFiles(files: File[]) {
  if (isUploading) {
    setMessage("An upload is already running.");
    return;
  }

  const serverUrl = getServerUrl();
  apiToken = apiToken || ((await invoke<string | null>("get_api_token")) ?? "");

  if (!serverUrl || !apiToken) {
    toggleSettings(true);
    setMessage("Configure the server URL and API token first.");
    return;
  }

  if (files.length === 0) return;

  const uploadBytes = files.reduce((total, file) => total + file.size, 0);
  if (serverMaxUploadBytes && uploadBytes > serverMaxUploadBytes) {
    setMessage(
      `Upload is ${formatBytes(uploadBytes)}. Server limit is ${formatBytes(serverMaxUploadBytes)}.`,
    );
    return;
  }

  isUploading = true;
  progress.value = 0;
  uploadSpeed.textContent = "0 KB/s";
  lastLink.hidden = true;

  try {
    const share = await createShare(serverUrl, files);
    let completedBytes = 0;
    const uploadStartedAt = performance.now();

    for (const file of files) {
      await uploadFile(serverUrl, share.id, file, (fileUploadedBytes) => {
        const uploadedBytes = completedBytes + fileUploadedBytes;
        progress.value = uploadBytes > 0 ? (uploadedBytes / uploadBytes) * 100 : 100;
        updateUploadSpeed(uploadedBytes, uploadStartedAt);
      });
      completedBytes += file.size;
    }

    await completeShare(serverUrl, share.id);
    const shareUrl = `${serverUrl}/s/${share.id}`;
    await writeText(shareUrl);
    await notify("Upload complete", "The share link was copied to the clipboard.");

    lastLink.href = shareUrl;
    lastLink.textContent = shareUrl;
    lastLink.hidden = false;
    setMessage("Upload complete. Link copied to clipboard.");
    progress.value = 100;
    updateUploadSpeed(uploadBytes, uploadStartedAt);
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Upload failed.");
    await notify("Upload failed", message.textContent ?? "Upload failed.");
  } finally {
    isUploading = false;
  }
}

async function createShare(serverUrl: string, files: File[]) {
  const shareName = stripExtension(files[0].name);

  const response = await fetch(`${serverUrl}/api/shares`, {
    method: "POST",
    headers: headers("application/json"),
    body: JSON.stringify({
      id: createShareId(),
      name: shareName && shareName.length >= 3 ? shareName : undefined,
      expiration: getExpiration(),
      allowPublicUpload: allowPublicUploadInput.checked,
      allowVersioning: allowVersioningInput.checked,
      recipients: [],
      security: {},
    }),
  });

  if (!response.ok) throw await responseError(response, "Could not create share.");
  return (await response.json()) as { id: string };
}

async function uploadFile(
  serverUrl: string,
  shareId: string,
  file: File,
  onProgress: (uploadedBytes: number) => void,
) {
  let fileId: string | undefined;
  let chunks = Math.ceil(file.size / chunkSize);
  if (chunks === 0) chunks = 1;

  for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
    const blob = file.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize);
    const url = new URL(`${serverUrl}/api/shares/${shareId}/files`);
    if (fileId) url.searchParams.set("id", fileId);
    url.searchParams.set("name", file.name);
    url.searchParams.set("chunkIndex", chunkIndex.toString());
    url.searchParams.set("totalChunks", chunks.toString());

    const response = await fetch(url, {
      method: "POST",
      headers: headers("application/octet-stream"),
      body: blob,
    });

    if (!response.ok) {
      const body = await safeJson(response);
      if (
        body?.error === "unexpected_chunk_index" &&
        Number.isInteger(body.expectedChunkIndex)
      ) {
        chunkIndex = body.expectedChunkIndex - 1;
        continue;
      }
      throw new Error(body?.message ?? `Could not upload ${file.name}.`);
    }

    fileId = ((await response.json()) as { id: string }).id;
    onProgress(Math.min(file.size, (chunkIndex + 1) * chunkSize));
  }
}

async function completeShare(serverUrl: string, shareId: string) {
  const response = await fetch(`${serverUrl}/api/shares/${shareId}/complete`, {
    method: "POST",
    headers: headers(),
  });
  if (!response.ok) throw await responseError(response, "Could not complete share.");
}

function headers(contentType?: string) {
  return {
    ...(contentType ? { "Content-Type": contentType } : {}),
    Authorization: `Bearer ${apiToken}`,
  };
}

function getServerUrl() {
  return normalizeServerUrl(serverUrlInput.value || localStorage.getItem("serverUrl") || "");
}

function normalizeServerUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function getExpiration() {
  return expirationSelect.value || localStorage.getItem("expiration") || "1-weeks";
}

function valueFromExpiration(expiration: string) {
  const timestamp = new Date(expiration).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "never";

  const days = Math.max(1, Math.round((timestamp - Date.now()) / 86_400_000));
  if (days <= 1) return "1-days";
  if (days <= 7) return "1-weeks";
  if (days <= 31) return "1-months";
  if (days <= 366) return "1-years";
  return "never";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return "never";
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }
  return `${Math.ceil(bytes / 1024 / 1024)} MB`;
}

function updateUploadSpeed(uploadedBytes: number, uploadStartedAt: number) {
  const elapsedSeconds = Math.max((performance.now() - uploadStartedAt) / 1000, 0.1);
  uploadSpeed.textContent = formatSpeed(uploadedBytes / elapsedSeconds);
}

function formatSpeed(bytesPerSecond: number) {
  if (bytesPerSecond >= 1024 * 1024 * 1024) {
    return `${(bytesPerSecond / 1024 / 1024 / 1024).toFixed(1)} GB/s`;
  }
  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
  }
  return `${Math.max(0, bytesPerSecond / 1024).toFixed(1)} KB/s`;
}

function createShareId() {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function stripExtension(name: string) {
  const index = name.lastIndexOf(".");
  return index > 2 ? name.slice(0, index).slice(0, 30) : name.slice(0, 30);
}

async function responseError(response: Response, fallback: string) {
  const body = await safeJson(response);
  return new Error(body?.message ?? fallback);
}

async function safeJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function notify(title: string, body: string) {
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  if (granted) sendNotification({ title, body });
}

function setMessage(value: string) {
  message.textContent = value;
}
