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
  security?: { passwordProtected?: boolean };
  files?: Array<{ id: string; name: string; size: string }>;
};

type DesktopLocaleCode =
  | "en-US"
  | "de-DE"
  | "fr-FR"
  | "pt-BR"
  | "es-ES"
  | "it-IT";

const DESKTOP_LOCALES: Array<{ code: DesktopLocaleCode; name: string }> = [
  { code: "de-DE", name: "Deutsch" },
  { code: "en-US", name: "English" },
  { code: "it-IT", name: "Italiano" },
  { code: "fr-FR", name: "Français" },
  { code: "es-ES", name: "Español" },
  { code: "pt-BR", name: "Português" },
];

const DESKTOP_MESSAGES_EN = {
    appAria: "Transporter file transfer",
    openSettings: "Open settings",
    minimizeWindow: "Minimize window",
    closeWindow: "Close window",
    appSections: "App sections",
    transferTab: "Transfer",
    historyTab: "History",
    settingsTitle: "Settings",
    close: "Close",
    serverUrl: "Server URL",
    apiToken: "API token",
    language: "Language",
    save: "Save",
    clearToken: "Clear token",
    transferName: "Transfer Name",
    transferNamePlaceholder: "Enter Transfer Name ...",
    expiration: "Expiration",
    password: "Password",
    uploads: "Uploads",
    versions: "Versions",
    enabled: "Enabled",
    off: "Off",
    setPassword: "Set password",
    enterPassword: "Enter password",
    cancel: "Cancel",
    startNewTransfer: "Start New Transfer",
    chooseFiles: "Drop files here or choose files",
    uploadFiles: "Upload files",
    configureFirst:
      "Configure the server URL and API token before the first upload.",
    secureUpload: "Secure chunked upload",
    ready: "Ready",
    shareableUrl: "Shareable URL",
    uploadToCreateLink: "Upload a file to create a share link",
    copy: "Copy",
    sentLinks: "Sent Links",
    yourTransfers: "Your transfers",
    openWeb: "Open Web",
    refresh: "Refresh",
    searchLinks: "Search links",
    historyLoadHint: "Open History to load your shares.",
    serverLimitPending:
      "Server upload limit is loaded after saving the server URL.",
    oneDay: "1 Day",
    oneWeek: "1 Week",
    twoWeeks: "2 Weeks",
    oneMonth: "1 Month",
    threeMonths: "3 Months",
    oneYear: "1 Year",
    never: "Never",
    storedToken: "Stored token",
    readyDrop: "Ready. Drop files to upload.",
    tokenReadError:
      "Could not read the stored API token. Open Settings to enter it again.",
    enterValidServerUrl: "Enter a valid server URL.",
    apiTokenCleared: "API token cleared.",
    configureFirstShort: "Configure the server URL and API token first.",
    loadingLinks: "Loading links...",
    noLinksFound: "No links found.",
    linkCount: "{shown} of {total} link{plural} shown.",
    filesCount: "{count} files - {size}",
    more: "More",
    less: "Less",
    expires: "Expires {date}",
    expirationUpdated: "Expiration updated.",
    couldNotUpdateExpiration: "Could not update expiration.",
    uploadBackUpdated: "Upload-back setting updated.",
    versioningUpdated: "Versioning setting updated.",
    couldNotUpdateUploadBack: "Could not update upload-back setting.",
    couldNotUpdateVersioning: "Could not update versioning setting.",
    transferNamePlaceholderShort: "Transfer name",
    nameUpdated: "Name updated.",
    couldNotUpdateName: "Could not update name.",
    open: "Open",
    delete: "Delete",
    reallyDelete: "Really delete?",
    deleting: "Deleting...",
    linkDeleted: "Link deleted.",
    couldNotDeleteLink: "Could not delete link.",
    couldNotCreateShare: "Could not create share.",
    couldNotCompleteShare: "Could not complete share.",
    couldNotUpdatePassword: "Could not update password setting.",
    couldNotUpdateSetting: "Could not update setting.",
    uploadSettingSaved: "Upload setting saved.",
    versioningSettingSaved: "Versioning setting saved.",
    expirationSaved: "Expiration saved.",
    passwordSaved: "Password setting saved.",
    passwordRemoved: "Password removed.",
    passwordTooShort: "Password must be at least 3 characters.",
    noServerLimit: "No server limit reported.",
    serverUploadLimit: "Server upload limit: {size}.",
    uploadAlreadyRunning: "An upload is already running.",
    uploadTooLarge: "Upload is {uploadSize}. Server limit is {serverSize}.",
    uploading: "Uploading...",
    queued: "Queued",
    uploaded: "Uploaded",
    uploadCompleteTitle: "Upload complete",
    uploadCompleteNotification: "The share link was copied to the clipboard.",
    uploadCompleteMessage: "Upload complete. Link copied to clipboard.",
    uploadCompleteButton: "Upload complete. Link copied to clip",
    uploadFailed: "Upload failed.",
    uploadFailedChooseFiles: "Upload failed. Choose files",
    transferNameCleared: "Transfer name cleared.",
    couldNotClearTransferName: "Could not clear transfer name.",
    couldNotSaveTransferName: "Could not save transfer name.",
    transferNameSaved: "Transfer name saved.",
    waitForUpload:
      "Wait for the current upload to finish before starting a new transfer.",
    newTransferReady: "New transfer ready. Drop files to upload.",
    copyNeedsLink: "Upload a file to create a share link first.",
    shareLinkCopied: "Share link copied to clipboard.",
    couldNotReachServer: "{fallback} Could not reach {server}.",
    theServer: "the server",
} as const;

const DESKTOP_MESSAGES = {
  "en-US": DESKTOP_MESSAGES_EN,
  "de-DE": {
    ...DESKTOP_MESSAGES_EN,
    appAria: "Transporter-Dateitransfer",
    openSettings: "Einstellungen öffnen",
    minimizeWindow: "Fenster minimieren",
    closeWindow: "Fenster schließen",
    appSections: "App-Bereiche",
    transferTab: "Transfer",
    historyTab: "Verlauf",
    settingsTitle: "Einstellungen",
    close: "Schließen",
    serverUrl: "Server-URL",
    apiToken: "API-Token",
    language: "Sprache",
    save: "Speichern",
    clearToken: "Token löschen",
    transferName: "Transfername",
    transferNamePlaceholder: "Transfernamen eingeben ...",
    expiration: "Ablauf",
    password: "Passwort",
    uploads: "Uploads",
    versions: "Versionen",
    enabled: "Aktiviert",
    off: "Aus",
    setPassword: "Passwort setzen",
    enterPassword: "Passwort eingeben",
    cancel: "Abbrechen",
    startNewTransfer: "Neuen Transfer starten",
    chooseFiles: "Dateien hier ablegen oder auswählen",
    uploadFiles: "Dateien hochladen",
    configureFirst:
      "Konfiguriere Server-URL und API-Token vor dem ersten Upload.",
    secureUpload: "Sicherer Chunk-Upload",
    ready: "Bereit",
    shareableUrl: "Freigabe-URL",
    uploadToCreateLink:
      "Lade eine Datei hoch, um einen Freigabelink zu erstellen",
    copy: "Kopieren",
    sentLinks: "Gesendete Links",
    yourTransfers: "Deine Transfers",
    openWeb: "Web öffnen",
    refresh: "Aktualisieren",
    searchLinks: "Links suchen",
    historyLoadHint: "Öffne den Verlauf, um deine Freigaben zu laden.",
    serverLimitPending:
      "Das Server-Uploadlimit wird nach dem Speichern der Server-URL geladen.",
    oneDay: "1 Tag",
    oneWeek: "1 Woche",
    twoWeeks: "2 Wochen",
    oneMonth: "1 Monat",
    threeMonths: "3 Monate",
    oneYear: "1 Jahr",
    never: "Nie",
    storedToken: "Gespeicherter Token",
    readyDrop: "Bereit. Dateien zum Hochladen ablegen.",
    tokenReadError:
      "Der gespeicherte API-Token konnte nicht gelesen werden. Öffne die Einstellungen und gib ihn erneut ein.",
    enterValidServerUrl: "Gib eine gültige Server-URL ein.",
    apiTokenCleared: "API-Token gelöscht.",
    configureFirstShort: "Konfiguriere zuerst Server-URL und API-Token.",
    loadingLinks: "Links werden geladen...",
    noLinksFound: "Keine Links gefunden.",
    linkCount: "{shown} von {total} Link{plural} angezeigt.",
    filesCount: "{count} Dateien - {size}",
    more: "Mehr",
    less: "Weniger",
    expires: "Ablauf {date}",
    expirationUpdated: "Ablauf aktualisiert.",
    couldNotUpdateExpiration: "Ablauf konnte nicht aktualisiert werden.",
    uploadBackUpdated: "Upload-Back-Einstellung aktualisiert.",
    versioningUpdated: "Versionierung aktualisiert.",
    couldNotUpdateUploadBack:
      "Upload-Back-Einstellung konnte nicht aktualisiert werden.",
    couldNotUpdateVersioning: "Versionierung konnte nicht aktualisiert werden.",
    transferNamePlaceholderShort: "Transfername",
    nameUpdated: "Name aktualisiert.",
    couldNotUpdateName: "Name konnte nicht aktualisiert werden.",
    open: "Öffnen",
    delete: "Löschen",
    reallyDelete: "Wirklich löschen?",
    deleting: "Wird gelöscht...",
    linkDeleted: "Link gelöscht.",
    couldNotDeleteLink: "Link konnte nicht gelöscht werden.",
    couldNotCreateShare: "Freigabe konnte nicht erstellt werden.",
    couldNotCompleteShare: "Freigabe konnte nicht abgeschlossen werden.",
    couldNotUpdatePassword:
      "Passworteinstellung konnte nicht aktualisiert werden.",
    couldNotUpdateSetting: "Einstellung konnte nicht aktualisiert werden.",
    uploadSettingSaved: "Upload-Einstellung gespeichert.",
    versioningSettingSaved: "Versionierung gespeichert.",
    expirationSaved: "Ablauf gespeichert.",
    passwordSaved: "Passworteinstellung gespeichert.",
    passwordRemoved: "Passwort entfernt.",
    passwordTooShort: "Das Passwort muss mindestens 3 Zeichen lang sein.",
    noServerLimit: "Kein Serverlimit gemeldet.",
    serverUploadLimit: "Server-Uploadlimit: {size}.",
    uploadAlreadyRunning: "Es läuft bereits ein Upload.",
    uploadTooLarge: "Upload ist {uploadSize}. Serverlimit ist {serverSize}.",
    uploading: "Wird hochgeladen...",
    queued: "In Warteschlange",
    uploaded: "Hochgeladen",
    uploadCompleteTitle: "Upload abgeschlossen",
    uploadCompleteNotification:
      "Der Freigabelink wurde in die Zwischenablage kopiert.",
    uploadCompleteMessage:
      "Upload abgeschlossen. Link in die Zwischenablage kopiert.",
    uploadCompleteButton: "Upload abgeschlossen. Link kopiert",
    uploadFailed: "Upload fehlgeschlagen.",
    uploadFailedChooseFiles: "Upload fehlgeschlagen. Dateien auswählen",
    transferNameCleared: "Transfername gelöscht.",
    couldNotClearTransferName: "Transfername konnte nicht gelöscht werden.",
    couldNotSaveTransferName: "Transfername konnte nicht gespeichert werden.",
    transferNameSaved: "Transfername gespeichert.",
    waitForUpload:
      "Warte, bis der aktuelle Upload fertig ist, bevor du einen neuen Transfer startest.",
    newTransferReady: "Neuer Transfer bereit. Dateien zum Hochladen ablegen.",
    copyNeedsLink:
      "Lade zuerst eine Datei hoch, um einen Freigabelink zu erstellen.",
    shareLinkCopied: "Freigabelink in die Zwischenablage kopiert.",
    couldNotReachServer: "{fallback} {server} konnte nicht erreicht werden.",
    theServer: "der Server",
  },
  "fr-FR": {
    ...DESKTOP_MESSAGES_EN,
    appAria: "Transfert de fichiers Transporter",
    openSettings: "Ouvrir les paramètres",
    minimizeWindow: "Réduire la fenêtre",
    closeWindow: "Fermer la fenêtre",
    appSections: "Sections de l’application",
    historyTab: "Historique",
    settingsTitle: "Paramètres",
    close: "Fermer",
    serverUrl: "URL du serveur",
    apiToken: "Jeton API",
    language: "Langue",
    save: "Enregistrer",
    clearToken: "Effacer le jeton",
    transferName: "Nom du transfert",
    transferNamePlaceholder: "Saisir le nom du transfert...",
    expiration: "Expiration",
    password: "Mot de passe",
    uploads: "Téléversements",
    versions: "Versions",
    enabled: "Activé",
    off: "Désactivé",
    setPassword: "Définir le mot de passe",
    enterPassword: "Saisir le mot de passe",
    cancel: "Annuler",
    startNewTransfer: "Démarrer un nouveau transfert",
    chooseFiles: "Déposez des fichiers ici ou choisissez-les",
    uploadFiles: "Téléverser des fichiers",
    configureFirst: "Configurez l’URL du serveur et le jeton API avant le premier téléversement.",
    secureUpload: "Téléversement sécurisé par morceaux",
    ready: "Prêt",
    shareableUrl: "URL de partage",
    uploadToCreateLink: "Téléversez un fichier pour créer un lien de partage",
    copy: "Copier",
    sentLinks: "Liens envoyés",
    yourTransfers: "Vos transferts",
    openWeb: "Ouvrir le web",
    refresh: "Actualiser",
    searchLinks: "Rechercher des liens",
    historyLoadHint: "Ouvrez l’historique pour charger vos partages.",
    serverLimitPending: "La limite d’upload du serveur est chargée après l’enregistrement de l’URL du serveur.",
    oneDay: "1 jour",
    oneWeek: "1 semaine",
    twoWeeks: "2 semaines",
    oneMonth: "1 mois",
    threeMonths: "3 mois",
    oneYear: "1 an",
    never: "Jamais",
    storedToken: "Jeton enregistr?",
    readyDrop: "Prêt. Déposez les fichiers ? téléverser.",
    tokenReadError: "Impossible de lire le jeton API enregistré. Ouvrez les paramètres et saisissez-le à nouveau.",
    enterValidServerUrl: "Saisissez une URL de serveur valide.",
    apiTokenCleared: "Jeton API effacé.",
    configureFirstShort: "Configurez d’abord l’URL du serveur et le jeton API.",
    loadingLinks: "Chargement des liens...",
    noLinksFound: "Aucun lien trouvé.",
    linkCount: "{shown} lien(s) sur {total} affiché(s).",
    filesCount: "{count} fichiers - {size}",
    more: "Plus",
    less: "Moins",
    expires: "Expire le {date}",
    expirationUpdated: "Expiration mise ? jour.",
    couldNotUpdateExpiration: "Impossible de mettre à jour l’expiration.",
    uploadBackUpdated: "Paramètre de téléversement retour mis ? jour.",
    versioningUpdated: "Versioning mis ? jour.",
    transferNamePlaceholderShort: "Nom du transfert",
    nameUpdated: "Nom mis ? jour.",
    open: "Ouvrir",
    delete: "Supprimer",
    reallyDelete: "Vraiment supprimer ?",
    deleting: "Suppression...",
    linkDeleted: "Lien supprimé.",
    uploadSettingSaved: "Paramètre d’upload enregistré.",
    versioningSettingSaved: "Versioning enregistré.",
    expirationSaved: "Expiration enregistrée.",
    passwordSaved: "Paramètre de mot de passe enregistré.",
    passwordRemoved: "Mot de passe supprimé.",
    passwordTooShort: "Le mot de passe doit contenir au moins 3 caractères.",
    noServerLimit: "Aucune limite serveur indiquée.",
    serverUploadLimit: "Limite d’upload du serveur : {size}.",
    uploadAlreadyRunning: "Un upload est déjà en cours.",
    uploading: "Téléversement...",
    queued: "En file d’attente",
    uploaded: "Téléversé",
    uploadCompleteTitle: "Upload terminé",
    uploadCompleteNotification: "Le lien de partage a été copié dans le presse-papiers.",
    uploadCompleteMessage: "Upload terminé. Lien copié dans le presse-papiers.",
    uploadCompleteButton: "Upload terminé. Lien copié",
    uploadFailed: "Échec de l’upload.",
    uploadFailedChooseFiles: "Échec de l’upload. Choisir des fichiers",
    transferNameCleared: "Nom du transfert effacé.",
    transferNameSaved: "Nom du transfert enregistré.",
    newTransferReady: "Nouveau transfert prêt. Déposez les fichiers ? téléverser.",
    copyNeedsLink: "Téléversez d’abord un fichier pour créer un lien de partage.",
    shareLinkCopied: "Lien de partage copié dans le presse-papiers.",
    theServer: "le serveur",
  },
  "es-ES": {
    ...DESKTOP_MESSAGES_EN,
    appAria: "Transferencia de archivos Transporter",
    openSettings: "Abrir configuración",
    minimizeWindow: "Minimizar ventana",
    closeWindow: "Cerrar ventana",
    appSections: "Secciones de la app",
    historyTab: "Historial",
    settingsTitle: "Configuración",
    close: "Cerrar",
    serverUrl: "URL del servidor",
    apiToken: "Token API",
    language: "Idioma",
    save: "Guardar",
    clearToken: "Borrar token",
    transferName: "Nombre de transferencia",
    transferNamePlaceholder: "Introduce el nombre de transferencia...",
    expiration: "Expiración",
    password: "Contraseña",
    uploads: "Subidas",
    versions: "Versiones",
    enabled: "Activado",
    off: "Desactivado",
    setPassword: "Definir contraseña",
    enterPassword: "Introduce la contraseña",
    cancel: "Cancelar",
    startNewTransfer: "Iniciar nueva transferencia",
    chooseFiles: "Suelta archivos aquí o elígelos",
    uploadFiles: "Subir archivos",
    configureFirst: "Configura la URL del servidor y el token API antes de la primera subida.",
    ready: "Listo",
    shareableUrl: "URL compartible",
    uploadToCreateLink: "Sube un archivo para crear un enlace compartido",
    copy: "Copiar",
    sentLinks: "Enlaces enviados",
    yourTransfers: "Tus transferencias",
    openWeb: "Abrir web",
    refresh: "Actualizar",
    searchLinks: "Buscar enlaces",
    historyLoadHint: "Abre el historial para cargar tus compartidos.",
    oneDay: "1 día",
    oneWeek: "1 semana",
    twoWeeks: "2 semanas",
    oneMonth: "1 mes",
    threeMonths: "3 meses",
    oneYear: "1 año",
    never: "Nunca",
    storedToken: "Token guardado",
    readyDrop: "Listo. Suelta archivos para subir.",
    enterValidServerUrl: "Introduce una URL de servidor válida.",
    apiTokenCleared: "Token API borrado.",
    loadingLinks: "Cargando enlaces...",
    noLinksFound: "No se encontraron enlaces.",
    linkCount: "{shown} de {total} enlace{plural} mostrados.",
    filesCount: "{count} archivos - {size}",
    more: "Más",
    less: "Menos",
    expires: "Expira {date}",
    expirationUpdated: "Expiración actualizada.",
    uploadBackUpdated: "Configuración de subida de vuelta actualizada.",
    versioningUpdated: "Versiones actualizadas.",
    transferNamePlaceholderShort: "Nombre de transferencia",
    nameUpdated: "Nombre actualizado.",
    open: "Abrir",
    delete: "Eliminar",
    reallyDelete: "¿Eliminar realmente?",
    deleting: "Eliminando...",
    linkDeleted: "Enlace eliminado.",
    passwordTooShort: "La contraseña debe tener al menos 3 caracteres.",
    uploading: "Subiendo...",
    queued: "En cola",
    uploaded: "Subido",
    uploadCompleteTitle: "Subida completa",
    uploadCompleteNotification: "El enlace compartido se copié al portapapeles.",
    uploadCompleteMessage: "Subida completa. Enlace copiado al portapapeles.",
    uploadCompleteButton: "Subida completa. Enlace copiado",
    uploadFailed: "Error al subir.",
    uploadFailedChooseFiles: "Error al subir. Elegir archivos",
    transferNameCleared: "Nombre de transferencia borrado.",
    transferNameSaved: "Nombre de transferencia guardado.",
    newTransferReady: "Nueva transferencia lista. Suelta archivos para subir.",
    copyNeedsLink: "Sube primero un archivo para crear un enlace compartido.",
    shareLinkCopied: "Enlace compartido copiado al portapapeles.",
    theServer: "el servidor",
  },
  "it-IT": {
    ...DESKTOP_MESSAGES_EN,
    appAria: "Trasferimento file Transporter",
    openSettings: "Apri impostazioni",
    minimizeWindow: "Riduci finestra",
    closeWindow: "Chiudi finestra",
    historyTab: "Cronologia",
    settingsTitle: "Impostazioni",
    close: "Chiudi",
    serverUrl: "URL server",
    apiToken: "Token API",
    language: "Lingua",
    save: "Salva",
    clearToken: "Cancella token",
    transferName: "Nome trasferimento",
    transferNamePlaceholder: "Inserisci nome trasferimento...",
    expiration: "Scadenza",
    password: "Password",
    uploads: "Caricamenti",
    versions: "Versioni",
    enabled: "Attivo",
    off: "Disattivo",
    setPassword: "Imposta password",
    enterPassword: "Inserisci password",
    cancel: "Annulla",
    startNewTransfer: "Avvia nuovo trasferimento",
    chooseFiles: "Trascina qui i file o sceglili",
    uploadFiles: "Carica file",
    ready: "Pronto",
    shareableUrl: "URL condivisibile",
    uploadToCreateLink: "Carica un file per creare un link di condivisione",
    copy: "Copia",
    sentLinks: "Link inviati",
    yourTransfers: "I tuoi trasferimenti",
    openWeb: "Apri web",
    refresh: "Aggiorna",
    searchLinks: "Cerca link",
    oneDay: "1 giorno",
    oneWeek: "1 settimana",
    twoWeeks: "2 settimane",
    oneMonth: "1 mese",
    threeMonths: "3 mesi",
    oneYear: "1 anno",
    never: "Mai",
    storedToken: "Token salvato",
    readyDrop: "Pronto. Trascina i file da caricare.",
    loadingLinks: "Caricamento link...",
    noLinksFound: "Nessun link trovato.",
    filesCount: "{count} file - {size}",
    more: "Altro",
    less: "Meno",
    expires: "Scade {date}",
    open: "Apri",
    delete: "Elimina",
    reallyDelete: "Eliminare davvero?",
    deleting: "Eliminazione...",
    linkDeleted: "Link eliminato.",
    uploading: "Caricamento...",
    queued: "In coda",
    uploaded: "Caricato",
    uploadCompleteTitle: "Caricamento completato",
    uploadCompleteNotification: "Il link di condivisione è stato copiato negli appunti.",
    uploadCompleteMessage: "Caricamento completato. Link copiato negli appunti.",
    uploadFailed: "Caricamento non riuscito.",
    transferNameSaved: "Nome trasferimento salvato.",
    copyNeedsLink: "Carica prima un file per creare un link di condivisione.",
    shareLinkCopied: "Link di condivisione copiato negli appunti.",
    theServer: "il server",
  },
  "pt-BR": {
    ...DESKTOP_MESSAGES_EN,
    appAria: "Transferência de arquivos Transporter",
    openSettings: "Abrir configurações",
    minimizeWindow: "Minimizar janela",
    closeWindow: "Fechar janela",
    historyTab: "Histórico",
    settingsTitle: "Configurações",
    close: "Fechar",
    serverUrl: "URL do servidor",
    apiToken: "Token de API",
    language: "Idioma",
    save: "Salvar",
    clearToken: "Limpar token",
    transferName: "Nome da transferência",
    transferNamePlaceholder: "Digite o nome da transferência...",
    expiration: "Expiração",
    password: "Senha",
    uploads: "Uploads",
    versions: "Versões",
    enabled: "Ativado",
    off: "Desativado",
    setPassword: "Definir senha",
    enterPassword: "Digite a senha",
    cancel: "Cancelar",
    startNewTransfer: "Iniciar nova transferência",
    chooseFiles: "Solte arquivos aqui ou escolha arquivos",
    uploadFiles: "Enviar arquivos",
    ready: "Pronto",
    shareableUrl: "URL compartilhável",
    uploadToCreateLink: "Envie um arquivo para criar um link de compartilhamento",
    copy: "Copiar",
    sentLinks: "Links enviados",
    yourTransfers: "Suas transferências",
    openWeb: "Abrir web",
    refresh: "Atualizar",
    searchLinks: "Buscar links",
    oneDay: "1 dia",
    oneWeek: "1 semana",
    twoWeeks: "2 semanas",
    oneMonth: "1 mês",
    threeMonths: "3 meses",
    oneYear: "1 ano",
    never: "Nunca",
    storedToken: "Token armazenado",
    readyDrop: "Pronto. Solte arquivos para enviar.",
    loadingLinks: "Carregando links...",
    noLinksFound: "Nenhum link encontrado.",
    filesCount: "{count} arquivos - {size}",
    more: "Mais",
    less: "Menos",
    expires: "Expira em {date}",
    open: "Abrir",
    delete: "Excluir",
    reallyDelete: "Excluir mesmo?",
    deleting: "Excluindo...",
    linkDeleted: "Link excluído.",
    uploading: "Enviando...",
    queued: "Na fila",
    uploaded: "Enviado",
    uploadCompleteTitle: "Upload concluído",
    uploadCompleteNotification: "O link de compartilhamento foi copiado para a área de transferência.",
    uploadCompleteMessage: "Upload concluído. Link copiado para a área de transferência.",
    uploadFailed: "Falha no upload.",
    transferNameSaved: "Nome da transferência salvo.",
    copyNeedsLink: "Envie primeiro um arquivo para criar um link de compartilhamento.",
    shareLinkCopied: "Link de compartilhamento copiado para a área de transferência.",
    theServer: "o servidor",
  },
} as const;

const settingsForm = document.querySelector<HTMLFormElement>("#settings")!;
const windowDragRegion = document.querySelector<HTMLElement>(
  "#window-drag-region",
)!;
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
const languageSelect = document.querySelector<HTMLSelectElement>("#language")!;
const serverMaxSize = document.querySelector<HTMLElement>("#server-max-size")!;
const expirationSelect =
  document.querySelector<HTMLSelectElement>("#expiration")!;
const transferNameInput =
  document.querySelector<HTMLInputElement>("#transfer-name")!;
const saveTransferNameButton = document.querySelector<HTMLButtonElement>(
  "#save-transfer-name",
)!;
const passwordEnabledInput =
  document.querySelector<HTMLInputElement>("#password-enabled")!;
const passwordPanel =
  document.querySelector<HTMLFormElement>("#password-panel")!;
const sharePasswordInput =
  document.querySelector<HTMLInputElement>("#share-password")!;
const passwordCancelButton =
  document.querySelector<HTMLButtonElement>("#password-cancel")!;
const allowPublicUploadInput = document.querySelector<HTMLInputElement>(
  "#allow-public-upload",
)!;
const allowVersioningInput =
  document.querySelector<HTMLInputElement>("#allow-versioning")!;
const passwordStatus = document.querySelector<HTMLElement>("#password-status")!;
const uploadsStatus = document.querySelector<HTMLElement>("#uploads-status")!;
const versionsStatus = document.querySelector<HTMLElement>("#versions-status")!;
const refreshLinksButton =
  document.querySelector<HTMLButtonElement>("#refresh-links")!;
const seeLinksWebButton =
  document.querySelector<HTMLButtonElement>("#see-links-web")!;
const linksSearchInput =
  document.querySelector<HTMLInputElement>("#links-search")!;
const linksList = document.querySelector<HTMLElement>("#links-list")!;
const linksMessage = document.querySelector<HTMLElement>("#links-message")!;
const clearTokenButton =
  document.querySelector<HTMLButtonElement>("#clear-token")!;
const dropZone = document.querySelector<HTMLElement>("#drop-zone")!;
const filePicker = document.querySelector<HTMLInputElement>("#file-picker")!;
const startNewTransferButton = document.querySelector<HTMLButtonElement>(
  "#start-new-transfer",
)!;
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
const expandedLinkIds = new Set<string>();
let currentShareId: string | undefined;
let sharePassword = "";
let transferNameLocked = false;
let transferNameSource: "empty" | "auto" | "manual" | "locked" = "empty";
let currentLanguage: DesktopLocaleCode = "en-US";

const TRANSFER_NAME_MAX_LENGTH = 128;
const TRANSFER_NAME_KEY = "transferName";
const TRANSFER_NAME_LOCKED_KEY = "transferNameLocked";
const DESKTOP_LANGUAGE_KEY = "desktopLanguage";

void initialize();

async function initialize() {
  initializeLanguage();
  bindUiEvents();
  applyDesktopTranslations();

  serverUrlInput.value = localStorage.getItem("serverUrl") ?? "";
  localStorage.removeItem("maxUploadSizeMb");
  expirationSelect.value = localStorage.getItem("expiration") ?? "1-weeks";
  transferNameLocked =
    localStorage.getItem(TRANSFER_NAME_LOCKED_KEY) === "true";
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
    apiTokenInput.value = apiToken ? t("storedToken") : "";

    if (serverUrlInput.value && apiToken) {
      setMessage(t("readyDrop"));
      await loadServerConfig();
    }
  } catch {
    setMessage(t("tokenReadError"));
  }

  await bindTauriEvents();
}

function initializeLanguage() {
  const storedLanguage = localStorage.getItem(DESKTOP_LANGUAGE_KEY);
  currentLanguage = resolveDesktopLocale(storedLanguage || navigator.language);

  languageSelect.replaceChildren();
  for (const locale of DESKTOP_LOCALES) {
    const option = document.createElement("option");
    option.value = locale.code;
    option.textContent = locale.name;
    languageSelect.appendChild(option);
  }
  languageSelect.value = currentLanguage;
}

function resolveDesktopLocale(value: string): DesktopLocaleCode {
  const exact = DESKTOP_LOCALES.find((locale) => locale.code === value)?.code;
  if (exact) return exact;

  const language = value.split("-")[0];
  return (
    DESKTOP_LOCALES.find((locale) => locale.code.startsWith(`${language}-`))
      ?.code ?? "en-US"
  );
}

function t(
  key: keyof typeof DESKTOP_MESSAGES_EN,
  values: Record<string, string | number> = {},
): string {
  const messages =
    DESKTOP_MESSAGES[currentLanguage as keyof typeof DESKTOP_MESSAGES] ??
    DESKTOP_MESSAGES["en-US"];
  const message = String(
    messages[key] ?? DESKTOP_MESSAGES["en-US"][key] ?? key,
  );
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    message,
  );
}

function applyDesktopTranslations() {
  document.documentElement.lang = currentLanguage;
  document
    .querySelector(".app-shell")
    ?.setAttribute("aria-label", t("appAria"));
  settingsToggle.setAttribute("aria-label", t("openSettings"));
  windowMinimizeButton.setAttribute("aria-label", t("minimizeWindow"));
  windowCloseButton.setAttribute("aria-label", t("closeWindow"));
  document
    .querySelector(".top-tabs")
    ?.setAttribute("aria-label", t("appSections"));
  shareFilesTab.textContent = t("transferTab");
  shareHistoryTab.textContent = t("historyTab");
  document.querySelector<HTMLElement>(
    ".settings-header .pane-title",
  )!.textContent = t("settingsTitle");
  settingsClose.textContent = t("close");
  setLabelText(serverUrlInput, t("serverUrl"));
  setLabelText(apiTokenInput, t("apiToken"));
  setLabelText(languageSelect, t("language"));
  serverUrlInput.placeholder = "https://transfer.example.com";
  apiTokenInput.placeholder = "mtp...";
  serverMaxSize.textContent = t("serverLimitPending");
  document.querySelector<HTMLButtonElement>("#save-settings")!.textContent =
    t("save");
  clearTokenButton.textContent = t("clearToken");
  setLabelText(transferNameInput, t("transferName"));
  transferNameInput.placeholder = t("transferNamePlaceholder");
  saveTransferNameButton.textContent = t("save");
  applyExpirationOptionLabels(expirationSelect);
  document
    .querySelector(".option-grid")
    ?.setAttribute("aria-label", t("appSections"));
  setOptionLabel("expiration", t("expiration"));
  setOptionLabel("password-enabled", t("password"));
  setOptionLabel("allow-public-upload", t("uploads"));
  setOptionLabel("allow-versioning", t("versions"));
  document.querySelector<HTMLElement>(
    "#password-panel .drop-title",
  )!.textContent = t("setPassword");
  sharePasswordInput.placeholder = t("enterPassword");
  passwordCancelButton.textContent = t("cancel");
  document.querySelector<HTMLButtonElement>(
    "#password-panel .primary-button",
  )!.textContent = t("save");
  startNewTransferButton.textContent = t("startNewTransfer");
  chooseFilesButton.textContent = isUploading
    ? t("uploading")
    : t("chooseFiles");
  uploadList.setAttribute("aria-label", t("uploadFiles"));
  uploadSpeed.textContent ||= "0 KB/s";
  document.querySelectorAll<HTMLElement>(".transfer-meta")[0].textContent =
    t("secureUpload");
  document.querySelectorAll<HTMLElement>(".transfer-meta")[1].textContent =
    t("ready");
  document.querySelector<HTMLElement>(
    ".share-url .section-label",
  )!.textContent = t("shareableUrl");
  if (lastLink.hidden) lastLink.textContent = t("uploadToCreateLink");
  sharePlaceholder.textContent = t("uploadToCreateLink");
  copyLastLinkButton.textContent = t("copy");
  document.querySelector<HTMLElement>(
    ".history-header .section-label",
  )!.textContent = t("sentLinks");
  document.querySelector<HTMLElement>(".history-header h2")!.textContent =
    t("yourTransfers");
  seeLinksWebButton.textContent = t("openWeb");
  refreshLinksButton.textContent = t("refresh");
  linksSearchInput.placeholder = t("searchLinks");
  if (!loadedLinks.length) linksMessage.textContent = t("historyLoadHint");
  updateOptionStatuses();
}

function setLabelText(control: HTMLElement, text: string) {
  const label = control.closest("label");
  if (!label) return;

  for (const child of Array.from(label.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      child.textContent = `\n                ${text}\n                `;
      return;
    }
  }
}

function setOptionLabel(controlId: string, text: string) {
  const input = document.querySelector<HTMLElement>(`#${controlId}`);
  const card = input?.closest(".option-card");
  const label = card?.querySelector<HTMLElement>(".option-label");
  if (label) label.textContent = text;
}

function applyExpirationOptionLabels(select: HTMLSelectElement) {
  const labels: Record<string, keyof typeof DESKTOP_MESSAGES_EN> = {
    "1-days": "oneDay",
    "1-weeks": "oneWeek",
    "2-weeks": "twoWeeks",
    "1-months": "oneMonth",
    "3-months": "threeMonths",
    "1-years": "oneYear",
    never: "never",
  };

  for (const option of Array.from(select.options)) {
    const key = labels[option.value];
    if (key) option.textContent = t(key);
  }
}

function bindUiEvents() {
  windowDragRegion.addEventListener("pointerdown", startWindowDrag);
  windowMinimizeButton.addEventListener("click", () => {
    void getCurrentWindow()
      .minimize()
      .catch(() => undefined);
  });
  windowCloseButton.addEventListener("click", () => {
    void getCurrentWindow()
      .hide()
      .catch(() => undefined);
  });
  settingsToggle.addEventListener("click", () => toggleSettings());
  settingsClose.addEventListener("click", () => toggleSettings(false));
  languageSelect.addEventListener("change", () => {
    currentLanguage = resolveDesktopLocale(languageSelect.value);
    localStorage.setItem(DESKTOP_LANGUAGE_KEY, currentLanguage);
    if (apiToken && apiTokenInput.value) apiTokenInput.value = t("storedToken");
    applyDesktopTranslations();
    renderLinks();
  });
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
      t("uploadSettingSaved"),
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
      t("versioningSettingSaved"),
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
  startNewTransferButton.addEventListener("click", resetTransfer);
  dropZone.addEventListener("click", (event) => {
    if ((event.target as HTMLElement | null)?.closest("#password-panel"))
      return;
    if ((event.target as HTMLElement | null)?.closest(".upload-list")) return;
    if ((event.target as HTMLElement | null)?.closest("#start-new-transfer"))
      return;
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
      setMessage(t("copyNeedsLink"));
      return;
    }
    void writeText(lastLink.href);
    setMessage(t("shareLinkCopied"));
  });
}

function startWindowDrag(event: PointerEvent) {
  if (event.button !== 0) return;

  const target = event.target as HTMLElement | null;
  if (target?.closest("button, input, select, textarea, a")) return;

  void getCurrentWindow()
    .startDragging()
    .catch(() => undefined);
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
    setMessage(t("enterValidServerUrl"));
    return;
  }

  localStorage.setItem("serverUrl", serverUrl);
  serverUrlInput.value = serverUrl;
  localStorage.setItem("expiration", expirationSelect.value);

  if (token && token !== t("storedToken")) {
    await invoke("save_api_token", { token });
    apiToken = token;
    apiTokenInput.value = t("storedToken");
  }

  await loadServerConfig();
  settingsForm.hidden = true;
  setMessage(t("readyDrop"));
}

async function clearToken() {
  await invoke("delete_api_token");
  apiToken = "";
  apiTokenInput.value = "";
  linksList.replaceChildren();
  setMessage(t("apiTokenCleared"));
}

async function loadLinks() {
  const serverUrl = getServerUrl();
  const apiUrl = getApiUrl();
  apiToken = apiToken || ((await invoke<string | null>("get_api_token")) ?? "");

  if (!serverUrl || !apiUrl || !apiToken) {
    linksMessage.textContent = t("configureFirstShort");
    return;
  }

  linksMessage.textContent = t("loadingLinks");

  try {
    const response = await fetch(`${apiUrl}/api/shares`, {
      headers: headers(),
    });
    if (!response.ok)
      throw await responseError(response, "Could not load links.");

    loadedLinks = ((await response.json()) as MyShare[]).sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    );
    if (loadedLinks.length === 0) {
      expandedLinkIds.clear();
      linksList.replaceChildren();
      linksMessage.textContent = t("noLinksFound");
      return;
    }

    renderLinks();
  } catch (error) {
    linksMessage.textContent =
      error instanceof Error
        ? networkErrorMessage(error, "Could not load links.")
        : "Could not load links.";
  }
}

function renderLinks() {
  const serverUrl = getServerUrl();
  const query = linksSearchInput.value.trim().toLowerCase();
  const shares = query
    ? loadedLinks.filter((share) =>
        [share.id, share.name, share.files?.map((file) => file.name).join(" ")]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : loadedLinks;

  const visibleShareIds = new Set(shares.map((share) => share.id));
  for (const shareId of Array.from(expandedLinkIds)) {
    if (!visibleShareIds.has(shareId)) expandedLinkIds.delete(shareId);
  }

  linksList.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const share of shares) {
    fragment.appendChild(renderLinkItem(serverUrl, share));
  }
  linksList.appendChild(fragment);
  linksMessage.textContent = t("linkCount", {
    shown: shares.length,
    total: loadedLinks.length,
    plural: loadedLinks.length === 1 ? "" : "s",
  });
}

function renderLinkItem(serverUrl: string, share: MyShare) {
  const item = document.createElement("article");
  item.className = "link-item";
  const isExpanded = expandedLinkIds.has(share.id);

  const summary = document.createElement("button");
  summary.className = "link-summary";
  summary.type = "button";

  const title = document.createElement("p");
  title.className = "link-title";
  title.textContent = share.name || share.id;

  const fileCount = document.createElement("p");
  fileCount.className = "link-meta link-meta-right";
  fileCount.textContent = t("filesCount", {
    count: share.files?.length ?? 0,
    size: formatTransferSize(share.size),
  });

  const chevron = document.createElement("span");
  chevron.textContent = isExpanded ? t("less") : t("more");
  chevron.className = "link-meta";

  const expires = document.createElement("p");
  expires.className = "link-meta link-meta-right";
  expires.textContent = t("expires", { date: formatDate(share.expiration) });

  const expirationCard = document.createElement("label");
  expirationCard.className = "option-card option-select history-option-card";
  const expirationCopy = document.createElement("span");
  expirationCopy.className = "option-copy";
  const expirationLabel = document.createElement("span");
  expirationLabel.className = "option-label";
  expirationLabel.textContent = t("expiration");
  const expiration = document.createElement("select");
  expiration.innerHTML = expirationSelect.innerHTML;
  applyExpirationOptionLabels(expiration);
  expiration.value = valueFromExpiration(share.expiration);
  expiration.addEventListener("change", async () => {
    try {
      await updateShareExpiration(serverUrl, share.id, expiration.value);
      linksMessage.textContent = t("expirationUpdated");
      await loadLinks();
    } catch (error) {
      linksMessage.textContent =
        error instanceof Error ? error.message : t("couldNotUpdateExpiration");
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
  passwordTitle.textContent = t("password");
  const passwordStatusValue = document.createElement("span");
  passwordStatusValue.className = "option-value";
  const initialPasswordProtected = share.security?.passwordProtected === true;
  passwordStatusValue.textContent = initialPasswordProtected
    ? t("enabled")
    : t("off");
  const passwordToggle = document.createElement("input");
  passwordToggle.type = "checkbox";
  passwordToggle.checked = initialPasswordProtected;
  const passwordSwitch = document.createElement("span");
  passwordSwitch.className = "switch";
  passwordSwitch.setAttribute("aria-hidden", "true");
  passwordCopy.append(passwordTitle, passwordStatusValue);
  passwordCard.append(passwordCopy, passwordToggle, passwordSwitch);

  const actions = document.createElement("div");
  actions.className = "link-actions";
  actions.hidden = !isExpanded;

  const nameRow = document.createElement("div");
  nameRow.className = "transfer-name-row link-name-row";

  const passwordRow = document.createElement("div");
  passwordRow.className = "transfer-name-row link-name-row";
  passwordRow.hidden = true;

  const historyPasswordInput = document.createElement("input");
  historyPasswordInput.type = "password";
  historyPasswordInput.placeholder = t("enterPassword");

  const savePasswordButton = document.createElement("button");
  savePasswordButton.className = "text-button transfer-save-button";
  savePasswordButton.type = "button";
  savePasswordButton.textContent = t("save");

  const cancelHistoryPasswordButton = document.createElement("button");
  cancelHistoryPasswordButton.className = "secondary-button";
  cancelHistoryPasswordButton.type = "button";
  cancelHistoryPasswordButton.textContent = t("cancel");

  const restorePasswordState = () => {
    const protectedNow = share.security?.passwordProtected === true;
    passwordToggle.checked = protectedNow;
    passwordStatusValue.textContent = protectedNow ? t("enabled") : t("off");
    historyPasswordInput.value = "";
    passwordRow.hidden = true;
  };

  passwordToggle.addEventListener("change", async () => {
    if (passwordToggle.checked) {
      passwordStatusValue.textContent = t("enabled");
      passwordRow.hidden = false;
      historyPasswordInput.focus();
      return;
    }

    passwordStatusValue.textContent = t("off");
    passwordRow.hidden = true;
    historyPasswordInput.value = "";
    try {
      await updateSharePassword(serverUrl, share.id);
      share.security = { ...(share.security ?? {}), passwordProtected: false };
      linksMessage.textContent = t("passwordRemoved");
      await loadLinks();
    } catch (error) {
      restorePasswordState();
      linksMessage.textContent =
        error instanceof Error ? error.message : t("couldNotUpdatePassword");
    }
  });

  savePasswordButton.addEventListener("click", async () => {
    const password = historyPasswordInput.value.trim();
    if (password.length < 3) {
      linksMessage.textContent = t("passwordTooShort");
      historyPasswordInput.focus();
      return;
    }

    savePasswordButton.disabled = true;
    cancelHistoryPasswordButton.disabled = true;
    try {
      await updateSharePassword(serverUrl, share.id, password);
      share.security = { ...(share.security ?? {}), passwordProtected: true };
      passwordToggle.checked = true;
      passwordStatusValue.textContent = t("enabled");
      historyPasswordInput.value = "";
      passwordRow.hidden = true;
      linksMessage.textContent = t("passwordSaved");
      await loadLinks();
    } catch (error) {
      linksMessage.textContent =
        error instanceof Error ? error.message : t("couldNotUpdatePassword");
    } finally {
      savePasswordButton.disabled = false;
      cancelHistoryPasswordButton.disabled = false;
    }
  });

  cancelHistoryPasswordButton.addEventListener("click", restorePasswordState);
  historyPasswordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      savePasswordButton.click();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      restorePasswordState();
    }
  });

  passwordRow.append(
    historyPasswordInput,
    savePasswordButton,
    cancelHistoryPasswordButton,
  );

  const uploadBackLabel = document.createElement("label");
  uploadBackLabel.className = "option-card checkbox-label history-option-card";
  const uploadBackCopy = document.createElement("span");
  uploadBackCopy.className = "option-copy";
  const uploadBackTitle = document.createElement("span");
  uploadBackTitle.className = "option-label";
  uploadBackTitle.textContent = t("uploads");
  const uploadBackStatus = document.createElement("span");
  uploadBackStatus.className = "option-value";
  const uploadBack = document.createElement("input");
  uploadBack.type = "checkbox";
  uploadBack.checked = share.allowPublicUpload;
  uploadBackStatus.textContent = uploadBack.checked ? t("enabled") : t("off");
  uploadBack.addEventListener("change", async () => {
    uploadBackStatus.textContent = uploadBack.checked ? t("enabled") : t("off");
    try {
      await updateSharePublicUpload(serverUrl, share.id, uploadBack.checked);
      linksMessage.textContent = t("uploadBackUpdated");
      await loadLinks();
    } catch (error) {
      uploadBack.checked = !uploadBack.checked;
      uploadBackStatus.textContent = uploadBack.checked
        ? t("enabled")
        : t("off");
      linksMessage.textContent =
        error instanceof Error ? error.message : t("couldNotUpdateUploadBack");
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
  versioningTitle.textContent = t("versions");
  const versioningStatus = document.createElement("span");
  versioningStatus.className = "option-value";
  const versioning = document.createElement("input");
  versioning.type = "checkbox";
  versioning.checked = share.allowVersioning;
  versioningStatus.textContent = versioning.checked ? t("enabled") : t("off");
  versioning.addEventListener("change", async () => {
    versioningStatus.textContent = versioning.checked ? t("enabled") : t("off");
    try {
      await updateShareVersioning(serverUrl, share.id, versioning.checked);
      linksMessage.textContent = t("versioningUpdated");
      await loadLinks();
    } catch (error) {
      versioning.checked = !versioning.checked;
      versioningStatus.textContent = versioning.checked
        ? t("enabled")
        : t("off");
      linksMessage.textContent =
        error instanceof Error ? error.message : t("couldNotUpdateVersioning");
    }
  });
  const versioningSwitch = document.createElement("span");
  versioningSwitch.className = "switch";
  versioningSwitch.setAttribute("aria-hidden", "true");
  versioningCopy.append(versioningTitle, versioningStatus);
  versioningLabel.append(versioningCopy, versioning, versioningSwitch);

  const nameInput = document.createElement("input");
  nameInput.value = share.name || share.id;
  nameInput.placeholder = t("transferNamePlaceholderShort");

  const saveNameButton = document.createElement("button");
  saveNameButton.className = "text-button transfer-save-button";
  saveNameButton.type = "button";
  saveNameButton.textContent = t("save");
  saveNameButton.addEventListener("click", async () => {
    try {
      await updateShareName(serverUrl, share.id, nameInput.value.trim());
      linksMessage.textContent = t("nameUpdated");
      await loadLinks();
    } catch (error) {
      linksMessage.textContent =
        error instanceof Error ? error.message : t("couldNotUpdateName");
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
  openButton.textContent = t("open");
  openButton.addEventListener("click", () => {
    void openUrl(`${serverUrl}/s/${share.id}`);
  });

  const deleteButton = document.createElement("button");
  deleteButton.className = "secondary-button danger-button";
  deleteButton.type = "button";
  deleteButton.textContent = t("delete");
  let deleteArmed = false;
  let deleteResetTimer: number | undefined;
  deleteButton.addEventListener("click", async () => {
    if (!deleteArmed) {
      deleteArmed = true;
      deleteButton.textContent = t("reallyDelete");
      window.clearTimeout(deleteResetTimer);
      deleteResetTimer = window.setTimeout(() => {
        deleteArmed = false;
        deleteButton.textContent = t("delete");
      }, 4000);
      return;
    }

    window.clearTimeout(deleteResetTimer);
    deleteButton.disabled = true;
    deleteButton.textContent = t("deleting");
    try {
      await deleteShare(serverUrl, share.id);
      expandedLinkIds.delete(share.id);
      linksMessage.textContent = t("linkDeleted");
      await loadLinks();
    } catch (error) {
      deleteArmed = false;
      deleteButton.disabled = false;
      deleteButton.textContent = t("delete");
      linksMessage.textContent =
        error instanceof Error ? error.message : t("couldNotDeleteLink");
    }
  });

  summary.append(title, fileCount, chevron, expires);
  summary.addEventListener("click", () => {
    actions.hidden = !actions.hidden;
    if (actions.hidden) {
      expandedLinkIds.delete(share.id);
    } else {
      expandedLinkIds.add(share.id);
    }
    chevron.textContent = actions.hidden ? t("more") : t("less");
  });

  actions.append(
    nameRow,
    historyOptionGrid,
    passwordRow,
    openButton,
    deleteButton,
  );
  item.append(summary, actions);
  return item;
}

async function deleteShare(serverUrl: string, shareId: string) {
  const response = await fetch(
    `${getApiUrl(serverUrl)}/api/shares/${shareId}`,
    {
      method: "DELETE",
      headers: headers(),
    },
  );
  if (!response.ok)
    throw await responseError(response, t("couldNotDeleteLink"));
}

async function updateShareExpiration(
  serverUrl: string,
  shareId: string,
  expiration: string,
) {
  const response = await fetch(
    `${getApiUrl(serverUrl)}/api/shares/${shareId}/expiration`,
    {
      method: "PATCH",
      headers: headers("application/json"),
      body: JSON.stringify({ expiration }),
    },
  );
  if (!response.ok)
    throw await responseError(response, t("couldNotUpdateExpiration"));
}

async function updateShareName(
  serverUrl: string,
  shareId: string,
  name: string,
) {
  const response = await fetch(
    `${getApiUrl(serverUrl)}/api/shares/${shareId}/name`,
    {
      method: "PATCH",
      headers: headers("application/json"),
      body: JSON.stringify({ name: name || undefined }),
    },
  );
  if (!response.ok)
    throw await responseError(response, t("couldNotUpdateName"));
}

async function updateSharePublicUpload(
  serverUrl: string,
  shareId: string,
  allowPublicUpload: boolean,
) {
  const response = await fetch(
    `${getApiUrl(serverUrl)}/api/shares/${shareId}/public-upload`,
    {
      method: "PATCH",
      headers: headers("application/json"),
      body: JSON.stringify({ allowPublicUpload }),
    },
  );
  if (!response.ok)
    throw await responseError(response, t("couldNotUpdateUploadBack"));
}

async function updateShareVersioning(
  serverUrl: string,
  shareId: string,
  allowVersioning: boolean,
) {
  const response = await fetch(
    `${getApiUrl(serverUrl)}/api/shares/${shareId}/versioning`,
    {
      method: "PATCH",
      headers: headers("application/json"),
      body: JSON.stringify({ allowVersioning }),
    },
  );
  if (!response.ok)
    throw await responseError(response, t("couldNotUpdateVersioning"));
}

async function updateSharePassword(
  serverUrl: string,
  shareId: string,
  password?: string,
) {
  const response = await fetch(
    `${getApiUrl(serverUrl)}/api/shares/${shareId}/password`,
    {
      method: "PATCH",
      headers: headers("application/json"),
      body: JSON.stringify(password ? { password } : {}),
    },
  );
  if (!response.ok)
    throw await responseError(response, t("couldNotUpdatePassword"));
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
    const response = await fetch(
      `${getApiUrl(serverUrl)}/api/shares/${currentShareId}/${endpoint}`,
      {
        method: "PATCH",
        headers: headers("application/json"),
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok)
      throw await responseError(response, t("couldNotUpdateSetting"));
    await loadLinksIfVisible();
    setMessage(successMessage);
  } catch (error) {
    revert();
    setMessage(
      error instanceof Error ? error.message : t("couldNotUpdateSetting"),
    );
  }
}

async function applyCurrentShareExpiration() {
  if (!currentShareId) return;

  const serverUrl = getServerUrl();
  if (!serverUrl) return;

  try {
    await updateShareExpiration(
      serverUrl,
      currentShareId,
      expirationSelect.value,
    );
    await loadLinksIfVisible();
    setMessage(t("expirationSaved"));
  } catch (error) {
    setMessage(
      error instanceof Error ? error.message : t("couldNotUpdateExpiration"),
    );
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
    await updateSharePassword(
      serverUrl,
      currentShareId,
      sharePassword || undefined,
    );
    await loadLinksIfVisible();
    setMessage(
      passwordEnabledInput.checked ? t("passwordSaved") : t("passwordRemoved"),
    );
  } catch (error) {
    passwordEnabledInput.checked = !passwordEnabledInput.checked;
    sharePassword = "";
    localStorage.setItem(
      "passwordEnabled",
      passwordEnabledInput.checked ? "true" : "false",
    );
    updateOptionStatuses();
    setMessage(
      error instanceof Error ? error.message : t("couldNotUpdatePassword"),
    );
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
    setMessage(t("passwordTooShort"));
    sharePasswordInput.focus();
    return;
  }

  sharePassword = password;
  passwordEnabledInput.checked = true;
  localStorage.setItem("passwordEnabled", "true");
  updateOptionStatuses();
  passwordPanel.hidden = true;

  if (!currentShareId) {
    setMessage(t("passwordSaved"));
    return;
  }

  const serverUrl = getServerUrl();
  if (!serverUrl) return;

  try {
    await updateSharePassword(serverUrl, currentShareId, sharePassword);
    await loadLinksIfVisible();
    setMessage(t("passwordSaved"));
  } catch (error) {
    setMessage(
      error instanceof Error ? error.message : t("couldNotUpdatePassword"),
    );
  }
}

async function loadServerConfig() {
  const apiUrl = getApiUrl();
  if (!apiUrl) return;

  try {
    const response = await fetch(`${apiUrl}/api/configs`);
    if (!response.ok) return;
    const configs = (await response.json()) as ConfigVariable[];
    const serverChunkSize = configs.find(
      (config) => config.key === "share.chunkSize",
    );
    chunkSize = parseInt(
      serverChunkSize?.value ?? serverChunkSize?.defaultValue ?? "10000000",
      10,
    );
    const serverMaxSizeConfig = configs.find(
      (config) => config.key === "share.maxSize",
    );
    serverMaxUploadBytes = parseInt(
      serverMaxSizeConfig?.value ?? serverMaxSizeConfig?.defaultValue ?? "",
      10,
    );
    if (Number.isFinite(serverMaxUploadBytes) && serverMaxUploadBytes > 0) {
      serverMaxSize.textContent = t("serverUploadLimit", {
        size: formatBytes(serverMaxUploadBytes),
      });
    } else {
      serverMaxSize.textContent = t("noServerLimit");
    }
  } catch {
    // Keep the local fallback chunk size. Upload will surface connectivity errors.
  }
}

async function uploadFiles(files: File[]) {
  if (isUploading) {
    setMessage(t("uploadAlreadyRunning"));
    return;
  }

  const serverUrl = getServerUrl();
  const apiUrl = getApiUrl();
  apiToken = apiToken || ((await invoke<string | null>("get_api_token")) ?? "");

  if (!serverUrl || !apiUrl || !apiToken) {
    toggleSettings(true);
    setMessage(t("configureFirstShort"));
    return;
  }

  if (files.length === 0) return;

  const uploadBytes = files.reduce((total, file) => total + file.size, 0);
  if (serverMaxUploadBytes && uploadBytes > serverMaxUploadBytes) {
    setMessage(
      t("uploadTooLarge", {
        uploadSize: formatBytes(uploadBytes),
        serverSize: formatBytes(serverMaxUploadBytes),
      }),
    );
    return;
  }

  isUploading = true;
  progress.value = 0;
  uploadSpeed.textContent = "0 KB/s";
  chooseFilesButton.textContent = t("uploading");
  renderUploadList(files);
  lastLink.hidden = true;

  try {
    const share = await createShare(apiUrl, files);
    currentShareId = share.id;
    let completedBytes = 0;
    const uploadStartedAt = performance.now();

    for (const file of files) {
      updateUploadListItem(file.name, t("uploading"));
      await uploadFile(apiUrl, share.id, file, (fileUploadedBytes) => {
        const uploadedBytes = completedBytes + fileUploadedBytes;
        progress.value =
          uploadBytes > 0 ? (uploadedBytes / uploadBytes) * 100 : 100;
        updateUploadSpeed(uploadedBytes, uploadStartedAt);
      });
      completedBytes += file.size;
      updateUploadListItem(file.name, t("uploaded"));
    }

    await completeShare(apiUrl, share.id);
    const shareUrl = `${serverUrl}/s/${share.id}`;
    await writeText(shareUrl);
    await notify(t("uploadCompleteTitle"), t("uploadCompleteNotification"));

    lastLink.href = shareUrl;
    lastLink.textContent = shareUrl;
    lastLink.hidden = false;
    sharePlaceholder.hidden = true;
    setMessage(t("uploadCompleteMessage"));
    chooseFilesButton.textContent = t("uploadCompleteButton");
    progress.value = 100;
    updateUploadSpeed(uploadBytes, uploadStartedAt);
  } catch (error) {
    setMessage(
      error instanceof Error
        ? networkErrorMessage(error, t("uploadFailed"))
        : t("uploadFailed"),
    );
    chooseFilesButton.textContent = t("uploadFailedChooseFiles");
    await notify(t("uploadFailed"), message.textContent ?? t("uploadFailed"));
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
    status.textContent = t("queued");

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

  if (!response.ok)
    throw await responseError(response, t("couldNotCreateShare"));
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
    const blob = file.slice(
      chunkIndex * chunkSize,
      (chunkIndex + 1) * chunkSize,
    );
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
  if (!response.ok)
    throw await responseError(response, t("couldNotCompleteShare"));
}

function headers(contentType?: string) {
  return {
    ...(contentType ? { "Content-Type": contentType } : {}),
    Authorization: `Bearer ${apiToken}`,
  };
}

function getServerUrl() {
  return normalizeServerUrl(
    serverUrlInput.value || localStorage.getItem("serverUrl") || "",
  );
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
  return (
    expirationSelect.value || localStorage.getItem("expiration") || "1-weeks"
  );
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
  if (!Number.isFinite(date.getTime()) || date.getTime() <= 0)
    return t("never").toLowerCase();
  return date.toLocaleDateString(currentLanguage, {
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
  const elapsedSeconds = Math.max(
    (performance.now() - uploadStartedAt) / 1000,
    0.1,
  );
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
  const alphabet =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function stripExtension(name: string) {
  const index = name.lastIndexOf(".");
  const baseName = index > 2 ? name.slice(0, index) : name;
  return baseName.slice(0, TRANSFER_NAME_MAX_LENGTH);
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
  const transferName = transferNameInput.value
    .trim()
    .slice(0, TRANSFER_NAME_MAX_LENGTH);
  if (!transferName) {
    transferNameLocked = false;
    transferNameSource = "empty";
    localStorage.removeItem(TRANSFER_NAME_KEY);
    localStorage.setItem(TRANSFER_NAME_LOCKED_KEY, "false");
    setMessage(t("transferNameCleared"));
    if (currentShareId) {
      try {
        await updateShareName(getServerUrl(), currentShareId, "");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : t("couldNotClearTransferName"),
        );
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
      setMessage(
        error instanceof Error ? error.message : t("couldNotSaveTransferName"),
      );
      return;
    }
  }

  setMessage(t("transferNameSaved"));
}

function resetTransfer() {
  if (isUploading) {
    setMessage(t("waitForUpload"));
    return;
  }

  currentShareId = undefined;
  sharePassword = "";
  transferNameLocked = false;
  transferNameSource = "empty";
  transferNameInput.value = "";
  sharePasswordInput.value = "";
  passwordPanel.hidden = true;
  passwordEnabledInput.checked = false;
  localStorage.removeItem(TRANSFER_NAME_KEY);
  localStorage.setItem(TRANSFER_NAME_LOCKED_KEY, "false");
  localStorage.setItem("passwordEnabled", "false");
  uploadList.replaceChildren();
  uploadList.classList.remove("is-scrollable");
  progress.value = 0;
  uploadSpeed.textContent = "0 KB/s";
  chooseFilesButton.textContent = t("chooseFiles");
  lastLink.href = "#";
  lastLink.textContent = t("uploadToCreateLink");
  lastLink.hidden = true;
  sharePlaceholder.hidden = false;
  updateOptionStatuses();
  setMessage(t("newTransferReady"));
}

async function loadLinksIfVisible() {
  if (!linksPane.hidden) await loadLinks();
}

function updateOptionStatuses() {
  passwordStatus.textContent = passwordEnabledInput.checked
    ? t("enabled")
    : t("off");
  uploadsStatus.textContent = allowPublicUploadInput.checked
    ? t("enabled")
    : t("off");
  versionsStatus.textContent = allowVersioningInput.checked
    ? t("enabled")
    : t("off");
}

async function responseError(response: Response, fallback: string) {
  const body = await safeJson(response);
  return new Error(body?.message ?? fallback);
}

function networkErrorMessage(error: Error, fallback: string) {
  if (
    error instanceof TypeError &&
    error.message.toLowerCase().includes("fetch")
  ) {
    const apiUrl = getApiUrl();
    return t("couldNotReachServer", {
      fallback,
      server: apiUrl || t("theServer"),
    });
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
