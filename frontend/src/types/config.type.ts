type Config = {
  key: string;
  defaultValue: string;
  value: string;
  type: string;
};

export type UpdateConfig = {
  key: string;
  value: string;
};

export type AdminConfig = Config & {
  name: string;
  updatedAt: Date;
  secret: boolean;
  description: string;
  obscured: boolean;
  allowEdit: boolean;
};

export type AdminConfigGroupedByCategory = {
  [key: string]: [
    Config & {
      updatedAt: Date;
      secret: boolean;
      description: string;
      obscured: boolean;
      category: string;
    },
  ];
};

export type ConfigVariablesCategory = {
  category: string;
  count: number;
};

export type ConfigHook = {
  configVariables: Config[];
  refresh: () => void;
};

export type SystemStatus = {
  config: {
    source: "database" | "yaml";
    editable: boolean;
    filePath: string;
  };
  database: {
    url: string;
    path: string | null;
    liveMoveSupported: boolean;
  };
  storage: {
    provider: "LOCAL" | "S3";
    localUploadPath: string;
    defaultLocalUploadPath: string;
    tempUploadPath: string;
    s3Enabled: boolean;
    localShareCount: number;
    s3ShareCount: number;
    localRoots: {
      path: string;
      shares: number;
      files: number;
      bytes: number;
    }[];
  };
  smtp: {
    enabled: boolean;
    host: string;
    port: number;
    email: string;
    configured: boolean;
  };
  activeMigration: StorageMigrationJob | null;
};

export type StoragePathValidation = {
  inputPath: string;
  normalizedPath: string;
  valid: boolean;
  exists: boolean;
  writable: boolean;
  availableBytes: number | null;
  errors: string[];
};

export type StorageMigrationDryRunItem = {
  shareId: string;
  sourceRoot: string;
  sourceDirectory: string;
  targetDirectory: string;
  fileCount: number;
  bytes: number;
  issues: string[];
};

export type StorageMigrationDryRun = {
  targetPath: string;
  validation: StoragePathValidation;
  totalLocalShares: number;
  affectedShares: number;
  totalBytes: number;
  availableBytes: number | null;
  blockingIssues: string[];
  items: StorageMigrationDryRunItem[];
};

export type StorageMigrationJobItem = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  sourcePath: string;
  targetPath: string;
  files: number;
  bytes: string;
  errorMessage?: string | null;
  jobId: string;
  shareId?: string | null;
};

export type StorageMigrationJob = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  sourcePath?: string | null;
  targetPath: string;
  totalShares: number;
  movedShares: number;
  skippedShares: number;
  failedShares: number;
  totalBytes: string;
  movedBytes: string;
  deleteEmptySourceRoots: boolean;
  currentShareId?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  items: StorageMigrationJobItem[];
};

export default Config;
