import clsx from "clsx";
import Link from "next/link";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  TbAlertTriangle,
  TbCheck,
  TbDatabase,
  TbInfoCircle,
  TbMail,
  TbPlayerPlay,
  TbServer,
  TbX,
} from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import Meta from "../../components/Meta";
import CenterLoader from "../../components/core/CenterLoader";
import ConfigurationHeader from "../../components/admin/configuration/ConfigurationHeader";
import ConfigurationNavBar from "../../components/admin/configuration/ConfigurationNavBar";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Container,
  Input,
  Progress,
} from "../../components/ui";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import configService from "../../services/config.service";
import {
  AdminConfig,
  StorageMigrationDryRun,
  StorageMigrationJob,
  StoragePathValidation,
  SystemStatus,
} from "../../types/config.type";
import toast from "../../utils/toast.util";

const ACTIVE_MIGRATION_STATUSES = ["PENDING", "RUNNING", "CANCEL_REQUESTED"];
type TranslateFn = ReturnType<typeof useTranslate>;

export default function AdminSystemPage() {
  const t = useTranslate();
  const globalConfig = useConfig();
  const [isMobileNavBarOpened, setIsMobileNavBarOpened] = useState(false);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [storageConfig, setStorageConfig] = useState<AdminConfig | null>(null);
  const [targetPath, setTargetPath] = useState("");
  const [validation, setValidation] = useState<StoragePathValidation | null>(
    null,
  );
  const [dryRun, setDryRun] = useState<StorageMigrationDryRun | null>(null);
  const [migrationJob, setMigrationJob] = useState<StorageMigrationJob | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [deleteEmptySourceRoots, setDeleteEmptySourceRoots] = useState(true);

  const loadSystem = useCallback(async () => {
    const [systemStatus, storageConfigVariables] = await Promise.all([
      configService.getSystemStatus(),
      configService.getByCategory("storage"),
    ]);
    const localUploadPathConfig =
      storageConfigVariables.find(
        (configVariable) => configVariable.key === "storage.localUploadPath",
      ) ?? null;

    setStatus(systemStatus);
    setStorageConfig(localUploadPathConfig);
    setMigrationJob(systemStatus.activeMigration);
    setTargetPath((current) => current || systemStatus.storage.localUploadPath);
  }, []);

  useEffect(() => {
    loadSystem()
      .catch(toast.axiosError)
      .finally(() => setIsLoading(false));
  }, [loadSystem]);

  useEffect(() => {
    if (
      !migrationJob ||
      !ACTIVE_MIGRATION_STATUSES.includes(migrationJob.status)
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      configService
        .getStorageMigration(migrationJob.id)
        .then((job) => {
          setMigrationJob(job);
          if (!ACTIVE_MIGRATION_STATUSES.includes(job.status)) {
            void loadSystem();
          }
        })
        .catch(toast.axiosError);
    }, 2000);

    return () => window.clearInterval(interval);
  }, [loadSystem, migrationJob]);

  const isPathDirty = useMemo(() => {
    if (!status) return false;
    return targetPath.trim() !== status.storage.localUploadPath;
  }, [status, targetPath]);

  const canEditConfig = storageConfig?.allowEdit !== false;
  const canStartMigration =
    !isPathDirty &&
    !!dryRun &&
    dryRun.blockingIssues.length === 0 &&
    dryRun.affectedShares > 0 &&
    !isMigrationActive(migrationJob);

  const migrationProgress = migrationJob
    ? percentage(
        migrationJob.movedShares + migrationJob.skippedShares,
        migrationJob.totalShares,
      )
    : 0;

  const saveStoragePath = async () => {
    setIsSaving(true);
    try {
      await configService.updateMany([
        { key: "storage.localUploadPath", value: targetPath.trim() },
      ]);
      await globalConfig.refresh();
      setValidation(null);
      setDryRun(null);
      await loadSystem();
      toast.success(t("admin.system.storage.save-success"));
    } catch (error) {
      toast.axiosError(error);
    } finally {
      setIsSaving(false);
    }
  };

  const validatePath = async () => {
    setIsValidating(true);
    try {
      setValidation(await configService.validateStoragePath(targetPath));
    } catch (error) {
      toast.axiosError(error);
    } finally {
      setIsValidating(false);
    }
  };

  const runDryRun = async () => {
    setIsDryRunning(true);
    try {
      const result = await configService.dryRunStorageMigration(targetPath);
      setDryRun(result);
      setValidation(result.validation);
    } catch (error) {
      toast.axiosError(error);
    } finally {
      setIsDryRunning(false);
    }
  };

  const startMigration = async () => {
    setIsStarting(true);
    try {
      const job = await configService.createStorageMigration(
        targetPath,
        deleteEmptySourceRoots,
      );
      setMigrationJob(job);
      toast.success(t("admin.system.migration.started"));
    } catch (error) {
      toast.axiosError(error);
    } finally {
      setIsStarting(false);
    }
  };

  const cancelMigration = async () => {
    if (!migrationJob) return;

    setIsCancelling(true);
    try {
      setMigrationJob(
        await configService.cancelStorageMigration(migrationJob.id),
      );
      toast.success(t("admin.system.migration.cancel-requested"));
    } catch (error) {
      toast.axiosError(error);
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <>
      <Meta title={t("admin.system.title")} />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <ConfigurationHeader
          isMobileNavBarOpened={isMobileNavBarOpened}
          setIsMobileNavBarOpened={setIsMobileNavBarOpened}
        />
        <ConfigurationNavBar
          categoryId="system"
          isMobileNavBarOpened={isMobileNavBarOpened}
          setIsMobileNavBarOpened={setIsMobileNavBarOpened}
        />
        <main className={clsx("pt-16 transition-all", "sm:ml-64 lg:ml-80")}>
          <Container size="xl" className="py-8">
            {isLoading || !status ? (
              <CenterLoader />
            ) : (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-text dark:text-text-dark">
                    <FormattedMessage id="admin.system.title" />
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    <FormattedMessage id="admin.system.description" />
                  </p>
                </div>

                {!canEditConfig && (
                  <Alert
                    color="blue"
                    title={t("admin.system.yaml.title")}
                    icon={<TbInfoCircle size={16} />}
                  >
                    <FormattedMessage id="admin.system.yaml.description" />
                  </Alert>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <StatusPanel
                    icon={<TbServer size={20} />}
                    title={t("admin.system.panel.config")}
                    rows={[
                      [
                        t("admin.system.field.source"),
                        t(`admin.system.config-source.${status.config.source}`),
                      ],
                      [
                        t("admin.system.field.config-file"),
                        status.config.filePath,
                      ],
                      [
                        t("admin.system.field.editable"),
                        yesNo(status.config.editable, t),
                      ],
                    ]}
                  />
                  <StatusPanel
                    icon={<TbDatabase size={20} />}
                    title={t("admin.system.panel.database")}
                    rows={[
                      [
                        t("admin.system.field.database-url"),
                        status.database.url,
                      ],
                      [
                        t("admin.system.field.database-path"),
                        status.database.path ||
                          t("admin.system.value.not-applicable"),
                      ],
                      [
                        t("admin.system.field.live-move"),
                        yesNo(status.database.liveMoveSupported, t),
                      ],
                    ]}
                  />
                  <StatusPanel
                    icon={<TbMail size={20} />}
                    title={t("admin.system.panel.email")}
                    rows={[
                      [
                        t("admin.system.field.smtp-enabled"),
                        yesNo(status.smtp.enabled, t),
                      ],
                      [
                        t("admin.system.field.smtp-host"),
                        status.smtp.host || t("admin.system.value.not-set"),
                      ],
                      [
                        t("admin.system.field.smtp-ready"),
                        yesNo(status.smtp.configured, t),
                      ],
                    ]}
                  />
                </div>

                <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-text dark:text-text-dark">
                        <FormattedMessage id="admin.system.storage.title" />
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        <FormattedMessage id="admin.system.storage.description" />
                      </p>
                    </div>
                    <Badge
                      variant={
                        status.storage.provider === "LOCAL"
                          ? "success"
                          : "primary"
                      }
                    >
                      {status.storage.provider}
                    </Badge>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <InfoBlock
                      label={t("admin.system.field.current-upload-path")}
                      value={status.storage.localUploadPath}
                      description={t(
                        "admin.system.field.current-upload-path.description",
                      )}
                    />
                    <InfoBlock
                      label={t("admin.system.field.default-upload-path")}
                      value={status.storage.defaultLocalUploadPath}
                      description={t(
                        "admin.system.field.default-upload-path.description",
                      )}
                    />
                    <InfoBlock
                      label={t("admin.system.field.temp-upload-path")}
                      value={status.storage.tempUploadPath}
                      description={t(
                        "admin.system.field.temp-upload-path.description",
                      )}
                    />
                  </div>

                  <label className="mt-5 block text-sm font-semibold text-text dark:text-text-dark">
                    <FormattedMessage id="admin.system.storage.target-path-label" />
                  </label>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    <FormattedMessage id="admin.system.storage.target-path-help" />
                  </p>
                  <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
                    <Input
                      disabled={
                        !canEditConfig || isMigrationActive(migrationJob)
                      }
                      value={targetPath}
                      onChange={(event) => {
                        setTargetPath(event.target.value);
                        setValidation(null);
                        setDryRun(null);
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={validatePath}
                        loading={isValidating}
                      >
                        <FormattedMessage id="admin.system.storage.validate" />
                      </Button>
                      <Button
                        onClick={saveStoragePath}
                        loading={isSaving}
                        disabled={!canEditConfig || !isPathDirty}
                      >
                        <FormattedMessage id="common.button.save" />
                      </Button>
                    </div>
                  </div>

                  {validation && <ValidationResult validation={validation} />}
                </section>

                <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-text dark:text-text-dark">
                        <FormattedMessage id="admin.system.migration.title" />
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        <FormattedMessage id="admin.system.migration.description" />
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={runDryRun}
                        loading={isDryRunning}
                        disabled={isMigrationActive(migrationJob)}
                      >
                        <FormattedMessage id="admin.system.migration.dry-run" />
                      </Button>
                      <Button
                        onClick={startMigration}
                        loading={isStarting}
                        disabled={!canStartMigration}
                      >
                        <TbPlayerPlay className="mr-2" size={18} />
                        <FormattedMessage id="admin.system.migration.start" />
                      </Button>
                      {isMigrationActive(migrationJob) && (
                        <Button
                          variant="danger"
                          onClick={cancelMigration}
                          loading={isCancelling}
                        >
                          <FormattedMessage id="common.button.cancel" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {isPathDirty && (
                    <Alert
                      className="mt-4"
                      color="yellow"
                      icon={<TbAlertTriangle size={16} />}
                      title={t("admin.system.migration.unsaved-path.title")}
                    >
                      <FormattedMessage id="admin.system.migration.unsaved-path.description" />
                    </Alert>
                  )}

                  <div className="mt-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                    <Checkbox
                      checked={deleteEmptySourceRoots}
                      disabled={isMigrationActive(migrationJob)}
                      label={t(
                        "admin.system.migration.cleanup-source-roots.label",
                      )}
                      onChange={(event) =>
                        setDeleteEmptySourceRoots(event.target.checked)
                      }
                    />
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      <FormattedMessage id="admin.system.migration.cleanup-source-roots.description" />
                    </p>
                  </div>

                  {dryRun && <DryRunResult dryRun={dryRun} />}

                  {migrationJob && (
                    <div className="mt-5 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-text dark:text-text-dark">
                            <FormattedMessage id="admin.system.migration.latest-job" />
                          </p>
                          <p className="text-xs text-gray-500">
                            {migrationJob.id}
                          </p>
                        </div>
                        <Badge variant={statusVariant(migrationJob.status)}>
                          {statusLabel(migrationJob.status, t)}
                        </Badge>
                      </div>
                      <div className="mt-4">
                        <Progress value={migrationProgress} />
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          <FormattedMessage
                            id="admin.system.migration.progress"
                            values={{
                              done:
                                migrationJob.movedShares +
                                migrationJob.skippedShares,
                              total: migrationJob.totalShares,
                              bytes: formatBytes(
                                parseInt(migrationJob.movedBytes || "0", 10),
                              ),
                            }}
                          />
                        </p>
                      </div>
                      {migrationJob.errorMessage && (
                        <Alert className="mt-4" color="red">
                          {migrationJob.errorMessage}
                        </Alert>
                      )}
                      <MigrationItems job={migrationJob} />
                    </div>
                  )}
                </section>

                <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
                  <h3 className="text-lg font-semibold text-text dark:text-text-dark">
                    <FormattedMessage id="admin.system.roots.title" />
                  </h3>
                  <div className="mt-4 space-y-3">
                    {status.storage.localRoots.map((root) => (
                      <div
                        key={root.path}
                        className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                      >
                        <p className="break-all text-sm font-medium text-text dark:text-text-dark">
                          {root.path}
                        </p>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          <FormattedMessage
                            id="admin.system.roots.summary"
                            values={{
                              shares: root.shares,
                              files: root.files,
                              bytes: formatBytes(root.bytes),
                            }}
                          />
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    as={Link}
                    href="/admin/config/storage"
                  >
                    <FormattedMessage id="admin.system.storage.advanced" />
                  </Button>
                </div>
              </div>
            )}
          </Container>
        </main>
      </div>
    </>
  );
}

function StatusPanel({
  icon,
  title,
  rows,
}: {
  icon: ReactNode;
  title: string;
  rows: [ReactNode, ReactNode][];
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-center gap-2 text-text dark:text-text-dark">
        {icon}
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="space-y-3">
        {rows.map(([label, value], index) => (
          <InfoBlock key={index} label={label} value={value} />
        ))}
      </div>
    </section>
  );
}

function InfoBlock({
  label,
  value,
  description,
}: {
  label: ReactNode;
  value: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 break-all text-sm text-text dark:text-text-dark">
        {value}
      </p>
      {description && (
        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
          {description}
        </p>
      )}
    </div>
  );
}

function ValidationResult({
  validation,
}: {
  validation: StoragePathValidation;
}) {
  return (
    <div className="mt-4">
      {validation.valid ? (
        <Alert color="green" icon={<TbCheck size={16} />}>
          <FormattedMessage
            id="admin.system.storage.validation.valid"
            values={{
              path: validation.normalizedPath,
              space: formatBytes(validation.availableBytes),
            }}
          />
        </Alert>
      ) : (
        <Alert color="red" icon={<TbX size={16} />}>
          <ul className="list-disc pl-5">
            {validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}

function DryRunResult({ dryRun }: { dryRun: StorageMigrationDryRun }) {
  return (
    <div className="mt-5 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InfoBlock
          label={<FormattedMessage id="admin.system.field.shares" />}
          value={`${dryRun.affectedShares} / ${dryRun.totalLocalShares}`}
        />
        <InfoBlock
          label={<FormattedMessage id="admin.system.field.data" />}
          value={formatBytes(dryRun.totalBytes)}
        />
        <InfoBlock
          label={<FormattedMessage id="admin.system.field.free-space" />}
          value={formatBytes(dryRun.availableBytes)}
        />
      </div>
      {dryRun.blockingIssues.length > 0 ? (
        <Alert color="red" icon={<TbAlertTriangle size={16} />}>
          <ul className="list-disc pl-5">
            {dryRun.blockingIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </Alert>
      ) : (
        <Alert color="green" icon={<TbCheck size={16} />}>
          <FormattedMessage id="admin.system.migration.dry-run-ok" />
        </Alert>
      )}
      {dryRun.items.length > 0 && (
        <div className="space-y-2">
          {dryRun.items.slice(0, 8).map((item) => (
            <div
              key={item.shareId}
              className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium text-text dark:text-text-dark">
                  {item.shareId}
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  <FormattedMessage
                    id="admin.system.file-count"
                    values={{ count: item.fileCount }}
                  />{" "}
                  - {formatBytes(item.bytes)}
                </p>
              </div>
              <p className="mt-2 break-all text-xs text-gray-500">
                {item.sourceDirectory} {"->"} {item.targetDirectory}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MigrationItems({ job }: { job: StorageMigrationJob }) {
  if (job.items.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      {job.items.slice(0, 10).map((item) => (
        <div
          key={item.id}
          className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-medium text-text dark:text-text-dark">
              {item.shareId}
            </p>
            <Badge variant={statusVariant(item.status)}>
              <FormattedMessage
                id={`admin.system.migration.status.${item.status.toLowerCase()}`}
              />
            </Badge>
          </div>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            <FormattedMessage
              id="admin.system.file-count"
              values={{ count: item.files }}
            />{" "}
            - {formatBytes(parseInt(item.bytes, 10))}
          </p>
          {item.errorMessage && (
            <p className="mt-2 text-red-600 dark:text-red-400">
              {item.errorMessage}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function isMigrationActive(job?: StorageMigrationJob | null) {
  return !!job && ACTIVE_MIGRATION_STATUSES.includes(job.status);
}

function percentage(value: number, total: number) {
  if (total === 0) return 100;
  return Math.round((value / total) * 100);
}

function formatBytes(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (value === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${
    units[index]
  }`;
}

function statusVariant(
  status: string,
): "primary" | "secondary" | "success" | "warning" | "danger" | "gray" {
  if (["COMPLETED"].includes(status)) return "success";
  if (["COMPLETED_WITH_WARNINGS", "CLEANUP_FAILED"].includes(status)) {
    return "warning";
  }
  if (["FAILED", "CANCELLED"].includes(status)) return "danger";
  if (["RUNNING", "PENDING", "CANCEL_REQUESTED"].includes(status)) {
    return "primary";
  }
  return "secondary";
}

function statusLabel(status: string, t: TranslateFn) {
  return t(`admin.system.migration.status.${status.toLowerCase()}`);
}

function yesNo(value: boolean, t: TranslateFn) {
  return value ? t("common.yes") : t("common.no");
}
