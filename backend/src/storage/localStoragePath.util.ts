import * as path from "path";
import { ConfigService } from "src/config/config.service";
import { SHARE_DIRECTORY } from "src/constants";

export function getConfiguredLocalStorageRoot(config: ConfigService): string {
  const configuredPath = config.get("storage.localUploadPath");
  return configuredPath || SHARE_DIRECTORY;
}

export function resolveShareDirectory(share: {
  id: string;
  localStoragePath?: string | null;
}): string {
  return path.join(share.localStoragePath || SHARE_DIRECTORY, share.id);
}
