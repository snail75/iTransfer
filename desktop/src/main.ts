import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
const windowDragRegion =
  document.querySelector<HTMLElement>("#window-drag-region")!;
const windowMinimizeButton =
  document.querySelector<HTMLButtonElement>("#window-minimize")!;
const windowCloseButton =
  document.querySelector<HTMLButtonElement>("#window-close")!;
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
const transferNameInput =
  document.querySelector<HTMLInputElement>("#transfer-name")!;
const saveTransferNameButton =
  document.querySelector<HTMLButtonElement>("#save-transfer-name")!;
const passwordEnabledInput =
  document.querySelector<HTMLInputElement>("#password-enabled")!;
const passwordPanel = document.querySelector<HTMLFormElement>("#password-panel")!;
const sharePasswordInput =
  document.querySelector<HTMLInputElement>("#share-password")!;
const passwordCancelButton =
  document.querySelector<HTMLButtonElement>("#password-cancel")!;
const allowPublicUploadInput =
  document.querySelector<HTMLInputElement>("#allow-public-upload")!;
const allowVersioningInput =
  document.querySelector<HTMLInputElement>("#allow-versioning")!;
const passwordStatus =
  document.querySelector<HTMLElement>("#password-status")!;
const uploadsStatus =
  document.querySelector<HTMLElement>("#uploads-status")!;
const versionsStatus =
  document.querySelector<HTMLElement>("#versions-status")!;
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
const uploadList = document.querySelector<HTMLUListElement>("#upload-list")!;
const message = document.querySelector<HTMLParagraphElement>("#message")!;
const progress = document.querySelector<HTMLProgressElement>("#progress")!;
const uploadSpeed =
  document.querySelector<HTMLParagraphElement>("#upload-speed")!;
const lastLink = document.querySelector<HTMLAnchorElement>("#last-link")!;
const sharePlaceholder =
  document.querySelector<HTMLElement>("#share-placeholder")!;
const copyLastLinkButton =
  document.querySelector<HTMLButtonElement>("#copy-last-link")!;

let apiToken = "";
let chunkSize = 10_000_000;
let serverMaxUploadBytes: number | undefined;
let isUploading = false;
let loadedLinks: MyShare[] = [];
let currentShareId: string | undefined;
let sharePassword = "";
let transferNameLocked = false;
let transferNameSource: "empty" | "auto" | "manual" | "locked" = "empty";

const TRANSFER_NAME_KEY = "transferName";
const TRANSFER_NAME_LOCKED_KEY = "transferNameLocked";

void initialize();

async function initialize() {
  bindUiEvents();

  serverUrlInput.value = localStorage.getItem("serverUrl") ?? "";
  localStorage.removeItem("maxUploadSizeMb");
  expirationSelect.value = localStorage.getItem("expiration") ?? "1-weeks";
  transferNameLocked = localStorage.getItem(TRANSFER_NAME_LOCKED_KEY) === "true";
  transferNameInput.value = transferNameLocked
    ? (localStorage.getItem(TRANSFER_NAME_KEY) ?? "")
    : "";
  transferNameSource = transferNameInput.value ? "locked" : "empty";
  allowPublicUploadInput.checked =
    localStorage.getItem("allowPublicUpload") === "true";
  allowVersioningInput.checked =
    localStorage.getItem("allowVersioning") === "true";
  passwordEnabledInput.checked = false;
  localStorage.setItem("passwordEnabled", "false");
  updateOptionStatuses();

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
  windowDragRegion.addEventListener("pointerdown", startWindowDrag);
  windowMinimizeButton.addEventListener("click", () => {
    void getCurrentWindow().minimize().catch(() => undefined);
  });
  windowCloseButton.addEventListener("click", () => {
    void getCurrentWindow().close().catch(() => undefined);
  });
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
    void applyCurrentShareExpiration();
  });
  transferNameInput.addEventListener("input", () => {
    transferNameLocked = false;
    transferNameSource = transferNameInput.value.trim() ? "manual" : "empty";
    localStorage.setItem(TRANSFER_NAME_LOCKED_KEY, "false");
  });
  saveTransferNameButton.addEventListener("click", () => {
    void saveTransferName();
  });
  passwordEnabledInput.addEventListener("change", () => {
    void handlePasswordToggle();
  });
  passwordPanel.addEventListener("submit", (event) => {
    event.preventDefault();
    void savePasswordFromPanel();
  });
  passwordCancelButton.addEventListener("click", cancelPasswordPanel);
  allowPublicUploadInput.addEventListener("change", () => {
    localStorage.setItem(
      "allowPublicUpload",
      allowPublicUploadInput.checked ? "true" : "false",
    );
    updateOptionStatuses();
    void applyCurrentShareBooleanSetting(
      "public-upload",
      { allowPublicUpload: allowPublicUploadInput.checked },
      "Upload setting saved.",
      () => {
        allowPublicUploadInput.checked = !allowPublicUploadInput.checked;
        localStorage.setItem(
          "allowPublicUpload",
          allowPublicUploadInput.checked ? "true" : "false",
        );
        updateOptionStatuses();
      },
    );
  });
  allowVersioningInput.addEventListener("change", () => {
    localStorage.setItem(
      "allowVersioning",
      allowVersioningInput.checked ? "true" : "false",
    );
    updateOptionStatuses();
    void applyCurrentShareBooleanSetting(
      "versioning",
      { allowVersioning: allowVersioningInput.checked },
      "Versioning setting saved.",
      () => {
        allowVersioningInput.checked = !allowVersioningInput.checked;
        localStorage.setItem(
          "allowVersioning",
          allowVersioningInput.checked ? "true" : "false",
        );
        updateOptionStatuses();
      },
    );
  });
  chooseFilesButton.addEventListener("click", () => filePicker.click());
  dropZone.addEventListener("click", (event) => {
    if ((event.target as HTMLElement | null)?.closest("#password-panel")) return;
    if ((event.target as HTMLElement | null)?.closest(".upload-list")) return;
    if (event.target !== chooseFilesButton) filePicker.click();
  });
  filePicker.addEventListener("change", () => {
    if (filePicker.files) {
      const files = Array.from(filePicker.files);
      applyDefaultTransferName(files);
      void uploadFiles(files);
    }
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
      const files = Array.from(event.dataTransfer.files);
      applyDefaultTransferName(files);
      void uploadFiles(files);
    }
  });

  lastLink.addEventListener("click", (event) => {
    event.preventDefault();
    if (lastLink.href) void openUrl(lastLink.href);
  });
  copyLastLinkButton.addEventListener("click", () => {
    if (lastLink.hidden || !lastLink.href || lastLink.href.endsWith("#")) {
      setMessage("Upload a file to create a share link first.");
      return;
    }
    void writeText(lastLink.href);
    setMessage("Share link copied to clipboard.");
  });
}

function startWindowDrag(event: PointerEvent) {
  if (event.button !== 0) return;

  const target = event.target as HTMLElement | null;
  if (target?.closest("button, input, select, textarea, a")) return;

  void getCurrentWindow().startDragging().catch(() => undefined);
}

async function bindTauriEvents() {
  try {
    await listen("show-settings", () => toggleSettings(true));
    await listen("tray-open-web", () => {
      const serverUrl = getServerUrl();
      if (serverUrl) void openUrl(serverUrl);
    });
  } catch {
    // The Vite browser preview runs without the Tauri runtime.
  }
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
  const apiUrl = getApiUrl();
  apiToken = apiToken || ((await invoke<string | null>("get_api_token")) ?? "");

  if (!serverUrl || !apiUrl || !apiToken) {
    linksMessage.textContent = "Configure the server URL and API token first.";
    return;
  }

  linksMessage.textContent = "Loading links...";
  linksList.replaceChildren();

  try {
    const response = await fetch(`${apiUrl}/api/shares`, {
      headers: headers(),
    });
    if (!response.ok) throw await responseError(response, "Could not load links.");

    loadedLinks = ((await response.json()) as MyShare[]).sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
    if (loadedLinks.length === 0) {
      linksMessage.textContent = "No links found.";
      return;
    }

    renderLinks();
  } catch (error) {
    linksMessage.textContent =
      error instanceof Error ? networkErrorMessage(error, "Could not load links.") : "Could not load links.";
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
  const fragment = document.createDocumentFragment();
  for (const share of shares) {
    fragment.appendChild(renderLinkItem(serverUrl, share));
  }
  linksList.appendChild(fragment);
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
  fileCount.textContent = `${share.files?.length ?? 0} files · ${formatTransferSize(share.size)}`;

  const chevron = document.createElement("span");
  chevron.textContent = "More";
  chevron.className = "link-meta";

  const expires = document.createElement("p");
  expires.className = "link-meta link-meta-right";
  expires.textContent = `Expires ${formatDate(share.expiration)}`;

  const expirationCard = document.createElement("label");
  expirationCard.className = "option-card option-select history-option-card";
  const expirationCopy = document.createElement("span");
  expirationCopy.className = "option-copy";
  const expirationLabel = document.createElement("span");
  expirationLabel.className = "option-label";
  expirationLabel.textContent = "Expiration";
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
  expirationCopy.append(expirationLabel, expiration);
  expirationCard.append(expirationCopy);

  const passwordCard = document.createElement("label");
  passwordCard.className = "option-card checkbox-label history-option-card";
  const passwordCopy = document.createElement("span");
  passwordCopy.className = "option-copy";
  const passwordTitle = document.createElement("span");
  passwordTitle.className = "option-label";
  passwordTitle.textContent = "Password";
  const passwordStatusValue = document.createElement("span");
  passwordStatusValue.className = "option-value";
  passwordStatusValue.textContent = "Off";
  const passwordToggle = document.createElement("input");
  passwordToggle.type = "checkbox";
  passwordToggle.disabled = true;
  const passwordSwitch = document.createElement("span");
  passwordSwitch.className = "switch disabled-switch";
  passwordSwitch.setAttribute("aria-hidden", "true");
  passwordCopy.append(passwordTitle, passwordStatusValue);
  passwordCard.append(passwordCopy, passwordToggle, passwordSwitch);

  const actions = document.createElement("div");
  actions.className = "link-actions";
  actions.hidden = true;

  const nameRow = document.createElement("div");
  nameRow.className = "transfer-name-row link-name-row";

  const uploadBackLabel = document.createElement("label");
  uploadBackLabel.className = "option-card checkbox-label history-option-card";
  const uploadBackCopy = document.createElement("span");
  uploadBackCopy.className = "option-copy";
  const uploadBackTitle = document.createElement("span");
  uploadBackTitle.className = "option-label";
  uploadBackTitle.textContent = "Uploads";
  const uploadBackStatus = document.createElement("span");
  uploadBackStatus.className = "option-value";
  const uploadBack = document.createElement("input");
  uploadBack.type = "checkbox";
  uploadBack.checked = share.allowPublicUpload;
  uploadBackStatus.textContent = uploadBack.checked ? "Enabled" : "Off";
  uploadBack.addEventListener("change", async () => {
    uploadBackStatus.textContent = uploadBack.checked ? "Enabled" : "Off";
    try {
      await updateSharePublicUpload(serverUrl, share.id, uploadBack.checked);
      linksMessage.textContent = "Upload-back setting updated.";
      await loadLinks();
    } catch (error) {
      uploadBack.checked = !uploadBack.checked;
      uploadBackStatus.textContent = uploadBack.checked ? "Enabled" : "Off";
      linksMessage.textContent =
        error instanceof Error ? error.message : "Could not update upload-back setting.";
    }
  });
  const uploadBackSwitch = document.createElement("span");
  uploadBackSwitch.className = "switch";
  uploadBackSwitch.setAttribute("aria-hidden", "true");
  uploadBackCopy.append(uploadBackTitle, uploadBackStatus);
  uploadBackLabel.append(uploadBackCopy, uploadBack, uploadBackSwitch);

  const versioningLabel = document.createElement("label");
  versioningLabel.className = "option-card checkbox-label history-option-card";
  const versioningCopy = document.createElement("span");
  versioningCopy.className = "option-copy";
  const versioningTitle = document.createElement("span");
  versioningTitle.className = "option-label";
  versioningTitle.textContent = "Versions";
  const versioningStatus = document.createElement("span");
  versioningStatus.className = "option-value";
  const versioning = document.createElement("input");
  versioning.type = "checkbox";
  versioning.checked = share.allowVersioning;
  versioningStatus.textContent = versioning.checked ? "Enabled" : "Off";
  versioning.addEventListener("change", async () => {
    versioningStatus.textContent = versioning.checked ? "Enabled" : "Off";
    try {
      await updateShareVersioning(serverUrl, share.id, versioning.checked);
      linksMessage.textContent = "Versioning setting updated.";
      await loadLinks();
    } catch (error) {
      versioning.checked = !versioning.checked;
      versioningStatus.textContent = versioning.checked ? "Enabled" : "Off";
      linksMessage.textContent =
        error instanceof Error ? error.message : "Could not update versioning setting.";
    }
  });
  const versioningSwitch = document.createElement("span");
  versioningSwitch.className = "switch";
  versioningSwitch.setAttribute("aria-hidden", "true");
  versioningCopy.append(versioningTitle, versioningStatus);
  versioningLabel.append(versioningCopy, versioning, versioningSwitch);

  const nameInput = document.createElement("input");
  nameInput.value = share.name || share.id;
  nameInput.placeholder = "Transfer name";

  const saveNameButton = document.createElement("button");
  saveNameButton.className = "text-button transfer-save-button";
  saveNameButton.type = "button";
  saveNameButton.textContent = "Save";
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
  nameRow.append(nameInput, saveNameButton);

  const historyOptionGrid = document.createElement("div");
  historyOptionGrid.className = "option-grid history-option-grid";
  historyOptionGrid.append(
    expirationCard,
    passwordCard,
    uploadBackLabel,
    versioningLabel,
  );

  const openButton = document.createElement("button");
  openButton.className = "primary-button";
  openButton.type = "button";
  openButton.textContent = "Open";
  openButton.addEventListener("click", () => {
    void openUrl(`${serverUrl}/s/${share.id}`);
  });

  const deleteButton = document.createElement("button");
  deleteButton.className = "secondary-button danger-button";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  let deleteArmed = false;
  let deleteResetTimer: number | undefined;
  deleteButton.addEventListener("click", async () => {
    if (!deleteArmed) {
      deleteArmed = true;
      deleteButton.textContent = "Really delete?";
      window.clearTimeout(deleteResetTimer);
      deleteResetTimer = window.setTimeout(() => {
        deleteArmed = false;
        deleteButton.textContent = "Delete";
      }, 4000);
      return;
    }

    window.clearTimeout(deleteResetTimer);
    deleteButton.disabled = true;
    deleteButton.textContent = "Deleting...";
    try {
      await deleteShare(serverUrl, share.id);
      linksMessage.textContent = "Link deleted.";
      await loadLinks();
    } catch (error) {
      deleteArmed = false;
      deleteButton.disabled = false;
      deleteButton.textContent = "Delete";
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
    nameRow,
    historyOptionGrid,
    openButton,
    deleteButton,
  );
  item.append(summary, actions);
  return item;
}

async function deleteShare(serverUrl: string, shareId: string) {
  const response = await fetch(`${getApiUrl(serverUrl)}/api/shares/${shareId}`, {
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
  const response = await fetch(`${getApiUrl(serverUrl)}/api/shares/${shareId}/expiration`, {
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
  const response = await fetch(`${getApiUrl(serverUrl)}/api/shares/${shareId}/name`, {
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
  const response = await fetch(`${getApiUrl(serverUrl)}/api/shares/${shareId}/public-upload`, {
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
  const response = await fetch(`${getApiUrl(serverUrl)}/api/shares/${shareId}/versioning`, {
    method: "PATCH",
    headers: headers("application/json"),
    body: JSON.stringify({ allowVersioning }),
  });
  if (!response.ok) throw await responseError(response, "Could not update versioning setting.");
}

async function updateSharePassword(
  serverUrl: string,
  shareId: string,
  password?: string,
) {
  const response = await fetch(`${getApiUrl(serverUrl)}/api/shares/${shareId}/password`, {
    method: "PATCH",
    headers: headers("application/json"),
    body: JSON.stringify(password ? { password } : {}),
  });
  if (!response.ok) throw await responseError(response, "Could not update password setting.");
}

async function applyCurrentShareBooleanSetting(
  endpoint: "public-upload" | "versioning",
  payload: Record<string, boolean>,
  successMessage: string,
  revert: () => void,
) {
  if (!currentShareId) return;

  const serverUrl = getServerUrl();
  if (!serverUrl) return;

  try {
    const response = await fetch(`${getApiUrl(serverUrl)}/api/shares/${currentShareId}/${endpoint}`, {
      method: "PATCH",
      headers: headers("application/json"),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw await responseError(response, "Could not update setting.");
    await loadLinksIfVisible();
    setMessage(successMessage);
  } catch (error) {
    revert();
    setMessage(error instanceof Error ? error.message : "Could not update setting.");
  }
}

async function applyCurrentShareExpiration() {
  if (!currentShareId) return;

  const serverUrl = getServerUrl();
  if (!serverUrl) return;

  try {
    await updateShareExpiration(serverUrl, currentShareId, expirationSelect.value);
    await loadLinksIfVisible();
    setMessage("Expiration saved.");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Could not update expiration.");
  }
}

async function handlePasswordToggle() {
  if (passwordEnabledInput.checked) {
    showPasswordPanel();
    updateOptionStatuses();
    return;
  }

  sharePassword = "";
  localStorage.setItem("passwordEnabled", "false");
  updateOptionStatuses();

  if (!currentShareId) return;
  const serverUrl = getServerUrl();
  if (!serverUrl) return;

  try {
    await updateSharePassword(serverUrl, currentShareId, sharePassword || undefined);
    await loadLinksIfVisible();
    setMessage(passwordEnabledInput.checked ? "Password setting saved." : "Password removed.");
  } catch (error) {
    passwordEnabledInput.checked = !passwordEnabledInput.checked;
    sharePassword = "";
    localStorage.setItem(
      "passwordEnabled",
      passwordEnabledInput.checked ? "true" : "false",
    );
    updateOptionStatuses();
    setMessage(error instanceof Error ? error.message : "Could not update password setting.");
  }
}

function showPasswordPanel() {
  passwordPanel.hidden = false;
  sharePasswordInput.value = sharePassword;
  sharePasswordInput.focus();
}

function cancelPasswordPanel() {
  passwordPanel.hidden = true;
  if (!sharePassword) {
    passwordEnabledInput.checked = false;
    localStorage.setItem("passwordEnabled", "false");
    updateOptionStatuses();
  }
}

async function savePasswordFromPanel() {
  const password = sharePasswordInput.value.trim();
  if (password.length < 3) {
    setMessage("Password must be at least 3 characters.");
    sharePasswordInput.focus();
    return;
  }

  sharePassword = password;
  passwordEnabledInput.checked = true;
  localStorage.setItem("passwordEnabled", "true");
  updateOptionStatuses();
  passwordPanel.hidden = true;

  if (!currentShareId) {
    setMessage("Password setting saved.");
    return;
  }

  const serverUrl = getServerUrl();
  if (!serverUrl) return;

  try {
    await updateSharePassword(serverUrl, currentShareId, sharePassword);
    await loadLinksIfVisible();
    setMessage("Password setting saved.");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Could not update password setting.");
  }
}

async function loadServerConfig() {
  const apiUrl = getApiUrl();
  if (!apiUrl) return;

  try {
    const response = await fetch(`${apiUrl}/api/configs`);
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
  const apiUrl = getApiUrl();
  apiToken = apiToken || ((await invoke<string | null>("get_api_token")) ?? "");

  if (!serverUrl || !apiUrl || !apiToken) {
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
  chooseFilesButton.textContent = "Uploading...";
  renderUploadList(files);
  lastLink.hidden = true;

  try {
    const share = await createShare(apiUrl, files);
    currentShareId = share.id;
    let completedBytes = 0;
    const uploadStartedAt = performance.now();

    for (const file of files) {
      updateUploadListItem(file.name, "Uploading");
      await uploadFile(apiUrl, share.id, file, (fileUploadedBytes) => {
        const uploadedBytes = completedBytes + fileUploadedBytes;
        progress.value = uploadBytes > 0 ? (uploadedBytes / uploadBytes) * 100 : 100;
        updateUploadSpeed(uploadedBytes, uploadStartedAt);
      });
      completedBytes += file.size;
      updateUploadListItem(file.name, "Uploaded");
    }

    await completeShare(apiUrl, share.id);
    const shareUrl = `${serverUrl}/s/${share.id}`;
    await writeText(shareUrl);
    await notify("Upload complete", "The share link was copied to the clipboard.");

    lastLink.href = shareUrl;
    lastLink.textContent = shareUrl;
    lastLink.hidden = false;
    sharePlaceholder.hidden = true;
    setMessage("Upload complete. Link copied to clipboard.");
    chooseFilesButton.textContent = "Upload complete. Link copied to clip";
    progress.value = 100;
    updateUploadSpeed(uploadBytes, uploadStartedAt);
  } catch (error) {
    setMessage(error instanceof Error ? networkErrorMessage(error, "Upload failed.") : "Upload failed.");
    chooseFilesButton.textContent = "Upload failed. Choose files";
    await notify("Upload failed", message.textContent ?? "Upload failed.");
  } finally {
    isUploading = false;
  }
}

function renderUploadList(files: File[]) {
  uploadList.replaceChildren();
  uploadList.classList.toggle("is-scrollable", files.length > 1);

  for (const file of files) {
    const item = document.createElement("li");
    item.className = "upload-list-item";
    item.dataset.fileName = file.name;

    const fileName = document.createElement("span");
    fileName.className = "upload-list-name";
    fileName.textContent = file.name;

    const status = document.createElement("span");
    status.className = "upload-list-status";
    status.textContent = "Queued";

    item.append(fileName, status);
    uploadList.appendChild(item);
  }
}

function updateUploadListItem(fileName: string, statusText: string) {
  const item = Array.from(uploadList.children).find(
    (child) => (child as HTMLElement).dataset.fileName === fileName,
  ) as HTMLElement | undefined;
  if (!item) return;

  const status = item.querySelector<HTMLElement>(".upload-list-status");
  if (status) status.textContent = statusText;
}

async function createShare(serverUrl: string, files: File[]) {
  const customShareName = transferNameInput.value.trim();
  const shareName = customShareName || stripExtension(files[0].name);

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
      security: sharePassword ? { password: sharePassword } : {},
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

function getApiUrl(serverUrl = getServerUrl()) {
  const normalized = normalizeServerUrl(serverUrl);
  if (!normalized) return "";

  try {
    const url = new URL(normalized);
    if (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      url.port === "3000"
    ) {
      url.port = "8080";
      return normalizeServerUrl(url.toString());
    }
  } catch {
    return normalized;
  }

  return normalized;
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
  if (days <= 14) return "2-weeks";
  if (days <= 31) return "1-months";
  if (days <= 92) return "3-months";
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

function formatTransferSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
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

function applyDefaultTransferName(files: File[]) {
  if (files.length === 0) return;
  if (
    transferNameInput.value.trim() &&
    (transferNameSource === "manual" || transferNameSource === "locked")
  ) {
    return;
  }

  const transferName = stripExtension(files[0].name);
  transferNameInput.value = transferName;
  transferNameSource = "auto";
  localStorage.setItem(TRANSFER_NAME_KEY, transferName);
  localStorage.setItem(TRANSFER_NAME_LOCKED_KEY, "false");
}

async function saveTransferName() {
  const transferName = transferNameInput.value.trim();
  if (!transferName) {
    transferNameLocked = false;
    transferNameSource = "empty";
    localStorage.removeItem(TRANSFER_NAME_KEY);
    localStorage.setItem(TRANSFER_NAME_LOCKED_KEY, "false");
    setMessage("Transfer name cleared.");
    if (currentShareId) {
      try {
        await updateShareName(getServerUrl(), currentShareId, "");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not clear transfer name.");
      }
    }
    return;
  }

  transferNameLocked = true;
  transferNameSource = "locked";
  transferNameInput.value = transferName;
  localStorage.setItem(TRANSFER_NAME_KEY, transferName);
  localStorage.setItem(TRANSFER_NAME_LOCKED_KEY, "true");

  if (currentShareId) {
    try {
      await updateShareName(getServerUrl(), currentShareId, transferName);
      await loadLinksIfVisible();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save transfer name.");
      return;
    }
  }

  setMessage("Transfer name saved.");
}

async function loadLinksIfVisible() {
  if (!linksPane.hidden) await loadLinks();
}

function updateOptionStatuses() {
  passwordStatus.textContent = passwordEnabledInput.checked ? "Enabled" : "Off";
  uploadsStatus.textContent = allowPublicUploadInput.checked ? "Enabled" : "Off";
  versionsStatus.textContent = allowVersioningInput.checked ? "Enabled" : "Off";
}

async function responseError(response: Response, fallback: string) {
  const body = await safeJson(response);
  return new Error(body?.message ?? fallback);
}

function networkErrorMessage(error: Error, fallback: string) {
  if (error instanceof TypeError && error.message.toLowerCase().includes("fetch")) {
    const apiUrl = getApiUrl();
    return `${fallback} Could not reach ${apiUrl || "the server"}.`;
  }
  return error.message || fallback;
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
