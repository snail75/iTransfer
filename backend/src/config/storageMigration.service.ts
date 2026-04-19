import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import {
  CONFIG_FILE,
  DATABASE_URL,
  SHARE_DIRECTORY,
  UPLOAD_TEMP_DIRECTORY,
} from "src/constants";
import { PrismaService } from "src/prisma/prisma.service";
import { ConfigService } from "./config.service";
import { StorageMigrationLockService } from "./storageMigrationLock.service";

const ACTIVE_JOB_STATUSES = ["PENDING", "RUNNING", "CANCEL_REQUESTED"];

type MigrationPlanItem = {
  shareId: string;
  sourceRoot: string;
  sourceDirectory: string;
  targetDirectory: string;
  fileCount: number;
  bytes: number;
  issues: string[];
};

@Injectable()
export class StorageMigrationService implements OnModuleInit {
  private readonly logger = new Logger(StorageMigrationService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private lock: StorageMigrationLockService,
  ) {}

  async onModuleInit() {
    const { count } = await this.prisma.storageMigrationJob.updateMany({
      where: { status: { in: ACTIVE_JOB_STATUSES } },
      data: {
        status: "FAILED",
        errorMessage: "Migration was interrupted by a backend restart.",
        completedAt: new Date(),
        currentShareId: null,
      },
    });

    if (count > 0) {
      await this.prisma.storageMigrationJobItem.updateMany({
        where: { status: { in: ACTIVE_JOB_STATUSES } },
        data: {
          status: "FAILED",
          errorMessage: "Migration was interrupted by a backend restart.",
        },
      });
      this.logger.warn(
        `Marked ${count} interrupted storage migration job(s) as failed.`,
      );
    }
  }

  async getSystemStatus() {
    const localShares = await this.prisma.share.findMany({
      where: { storageProvider: "LOCAL" },
      include: { files: true },
    });
    const s3Shares = await this.prisma.share.count({
      where: { storageProvider: "S3" },
    });
    const currentLocalUploadPath = this.getConfiguredLocalUploadPath();
    const localRoots = new Map<
      string,
      { path: string; shares: number; files: number; bytes: number }
    >();

    for (const share of localShares) {
      const root = path.resolve(share.localStoragePath || SHARE_DIRECTORY);
      const current = localRoots.get(root) ?? {
        path: root,
        shares: 0,
        files: 0,
        bytes: 0,
      };
      current.shares += 1;
      current.files += share.files.length;
      current.bytes += this.sumFileBytes(share.files);
      localRoots.set(root, current);
    }

    return {
      config: {
        source: this.config.isEditAllowed() ? "database" : "yaml",
        editable: this.config.isEditAllowed(),
        filePath: path.resolve(CONFIG_FILE),
      },
      database: {
        url: DATABASE_URL,
        path: this.resolveSqliteDatabasePath(DATABASE_URL),
        liveMoveSupported: false,
      },
      storage: {
        provider: this.config.get("s3.enabled") ? "S3" : "LOCAL",
        localUploadPath: currentLocalUploadPath,
        defaultLocalUploadPath: path.resolve(SHARE_DIRECTORY),
        tempUploadPath: path.resolve(UPLOAD_TEMP_DIRECTORY),
        s3Enabled: this.config.get("s3.enabled"),
        localShareCount: localShares.length,
        s3ShareCount: s3Shares,
        localRoots: [...localRoots.values()].sort((a, b) =>
          a.path.localeCompare(b.path),
        ),
      },
      smtp: {
        enabled: this.config.get("smtp.enabled"),
        host: this.config.get("smtp.host"),
        port: this.config.get("smtp.port"),
        email: this.config.get("smtp.email"),
        configured:
          this.config.get("smtp.enabled") &&
          !!this.config.get("smtp.host") &&
          !!this.config.get("smtp.port") &&
          !!this.config.get("smtp.email"),
      },
      activeMigration: await this.getActiveMigration(),
    };
  }

  async validateLocalUploadPath(targetPath: string) {
    const result = await this.validateTargetPath(targetPath, false);
    return result;
  }

  async createDryRun(targetPath?: string) {
    const targetRoot = await this.resolveTargetRoot(targetPath);
    const validation = await this.validateTargetPath(targetRoot, true);
    const plan = await this.buildMigrationPlan(validation.normalizedPath);

    return {
      targetPath: validation.normalizedPath,
      validation,
      ...plan,
    };
  }

  async createMigration(targetPath?: string, deleteEmptySourceRoots = false) {
    await this.ensureNoActiveMigration();

    const dryRun = await this.createDryRun(targetPath);
    if (dryRun.blockingIssues.length > 0) {
      throw new BadRequestException({
        message: "Storage migration has blocking issues",
        issues: dryRun.blockingIssues,
      });
    }

    const job = await this.prisma.storageMigrationJob.create({
      data: {
        status: dryRun.affectedShares === 0 ? "COMPLETED" : "PENDING",
        targetPath: dryRun.targetPath,
        deleteEmptySourceRoots,
        totalShares: dryRun.affectedShares,
        totalBytes: dryRun.totalBytes.toString(),
        completedAt: dryRun.affectedShares === 0 ? new Date() : null,
        items: {
          create: dryRun.items.map((item) => ({
            shareId: item.shareId,
            sourcePath: item.sourceDirectory,
            targetPath: item.targetDirectory,
            files: item.fileCount,
            bytes: item.bytes.toString(),
          })),
        },
      },
      include: { items: true },
    });

    if (dryRun.affectedShares > 0) {
      setImmediate(() => {
        void this.runMigration(job.id).catch((error) => {
          this.logger.error(`Storage migration ${job.id} failed`, error);
        });
      });
    }

    return this.getMigrationJob(job.id);
  }

  async runLegacyMigrationToConfiguredPath() {
    const job = await this.createMigration();

    while (
      ACTIVE_JOB_STATUSES.includes((await this.getMigrationJob(job.id)).status)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const completedJob = await this.getMigrationJob(job.id);
    if (completedJob.status === "FAILED") {
      throw new BadRequestException(completedJob.errorMessage);
    }

    return {
      targetPath: completedJob.targetPath,
      totalShares: completedJob.totalShares,
      movedShares: completedJob.movedShares,
      updatedShares: completedJob.movedShares + completedJob.skippedShares,
    };
  }

  async getMigrationJob(id: string) {
    const job = await this.prisma.storageMigrationJob.findUnique({
      where: { id },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });

    if (!job) throw new NotFoundException("Storage migration job not found");
    return job;
  }

  async getActiveMigration() {
    return await this.prisma.storageMigrationJob.findFirst({
      where: { status: { in: ACTIVE_JOB_STATUSES } },
      orderBy: { createdAt: "desc" },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
  }

  async cancelMigration(id: string) {
    const job = await this.getMigrationJob(id);

    if (job.status === "PENDING") {
      await this.prisma.storageMigrationJob.update({
        where: { id },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
    } else if (job.status === "RUNNING") {
      await this.prisma.storageMigrationJob.update({
        where: { id },
        data: { status: "CANCEL_REQUESTED" },
      });
    }

    return await this.getMigrationJob(id);
  }

  private async runMigration(jobId: string) {
    const cleanupWarnings: string[] = [];

    await this.prisma.storageMigrationJob.update({
      where: { id: jobId },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    const items = await this.prisma.storageMigrationJobItem.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
    });

    for (const item of items) {
      const job = await this.prisma.storageMigrationJob.findUnique({
        where: { id: jobId },
      });

      if (job.status === "CANCEL_REQUESTED") {
        await this.prisma.storageMigrationJob.update({
          where: { id: jobId },
          data: {
            status: "CANCELLED",
            completedAt: new Date(),
            currentShareId: null,
          },
        });
        return;
      }

      if (!item.shareId) {
        await this.markItemSkipped(jobId, item.id, "Share no longer exists.");
        continue;
      }

      this.lock.lock(item.shareId);
      try {
        await this.prisma.storageMigrationJobItem.update({
          where: { id: item.id },
          data: { status: "RUNNING" },
        });
        await this.prisma.storageMigrationJob.update({
          where: { id: jobId },
          data: { currentShareId: item.shareId },
        });

        const result = await this.migrateItem(jobId, item.id);
        if (result.skipped) {
          await this.markItemSkipped(jobId, item.id, result.message);
          continue;
        }

        await this.prisma.storageMigrationJobItem.update({
          where: { id: item.id },
          data: {
            status: result.cleanupError ? "CLEANUP_FAILED" : "COMPLETED",
            errorMessage: result.cleanupError,
          },
        });
        await this.prisma.storageMigrationJob.update({
          where: { id: jobId },
          data: {
            movedShares: { increment: 1 },
            movedBytes: {
              set: (
                parseInt((await this.getMigrationJob(jobId)).movedBytes) +
                result.bytesMoved
              ).toString(),
            },
          },
        });

        if (result.cleanupError) {
          cleanupWarnings.push(
            `Could not delete old share folder ${item.sourcePath}: ${result.cleanupError}`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.prisma.storageMigrationJobItem.update({
          where: { id: item.id },
          data: { status: "FAILED", errorMessage: message },
        });
        await this.prisma.storageMigrationJob.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            failedShares: { increment: 1 },
            errorMessage: message,
            completedAt: new Date(),
            currentShareId: null,
          },
        });
        return;
      } finally {
        this.lock.unlock(item.shareId);
      }
    }

    const completedJob = await this.prisma.storageMigrationJob.findUnique({
      where: { id: jobId },
    });

    if (completedJob?.deleteEmptySourceRoots) {
      cleanupWarnings.push(
        ...(await this.cleanupEmptySourceRoots(jobId, completedJob.targetPath)),
      );
    }

    await this.prisma.storageMigrationJob.update({
      where: { id: jobId },
      data: {
        status:
          cleanupWarnings.length > 0 ? "COMPLETED_WITH_WARNINGS" : "COMPLETED",
        errorMessage:
          cleanupWarnings.length > 0 ? cleanupWarnings.join("\n") : null,
        completedAt: new Date(),
        currentShareId: null,
      },
    });
  }

  private async migrateItem(jobId: string, itemId: string) {
    const item = await this.prisma.storageMigrationJobItem.findUnique({
      where: { id: itemId },
      include: { job: true, share: { include: { files: true } } },
    });

    if (!item?.share) {
      return {
        skipped: true,
        message: "Share no longer exists.",
        bytesMoved: 0,
      };
    }

    const share = item.share;
    if (share.storageProvider !== "LOCAL") {
      return {
        skipped: true,
        message: "Share is no longer stored locally.",
        bytesMoved: 0,
      };
    }

    const targetRoot = path.resolve(item.job.targetPath);
    const sourceRoot = path.resolve(share.localStoragePath || SHARE_DIRECTORY);
    const sourceDirectory = path.join(sourceRoot, share.id);
    const targetDirectory = path.join(targetRoot, share.id);
    const tempDirectory = path.join(
      targetRoot,
      `${share.id}.migration-${jobId}`,
    );
    const bytesMoved = this.sumFileBytes(share.files);

    if (this.arePathsEqual(sourceRoot, targetRoot)) {
      return {
        skipped: true,
        message: "Share is already on the target path.",
        bytesMoved: 0,
      };
    }

    if (fs.existsSync(targetDirectory)) {
      throw new BadRequestException(
        `Cannot move share ${share.id}: target directory already exists`,
      );
    }

    await fs.promises.rm(tempDirectory, { recursive: true, force: true });

    if (!fs.existsSync(sourceDirectory)) {
      if (share.files.length > 0) {
        throw new BadRequestException(
          `Cannot move share ${share.id}: source directory is missing`,
        );
      }

      await fs.promises.mkdir(targetDirectory, { recursive: true });
      await this.prisma.share.update({
        where: { id: share.id },
        data: { localStoragePath: targetRoot },
      });
      return { skipped: false, bytesMoved };
    }

    await this.assertExpectedFilesExist(sourceDirectory, share.files);
    await fs.promises.mkdir(path.dirname(targetDirectory), { recursive: true });
    await fs.promises.cp(sourceDirectory, tempDirectory, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    await this.assertExpectedFilesExist(tempDirectory, share.files);
    await fs.promises.rename(tempDirectory, targetDirectory);

    try {
      await this.prisma.share.update({
        where: { id: share.id },
        data: { localStoragePath: targetRoot },
      });
    } catch (error) {
      await fs.promises.rm(targetDirectory, { recursive: true, force: true });
      throw error;
    }

    let cleanupError: string | undefined;
    try {
      await fs.promises.rm(sourceDirectory, { recursive: true, force: true });
    } catch (error) {
      cleanupError = error instanceof Error ? error.message : String(error);
    }

    return { skipped: false, bytesMoved, cleanupError };
  }

  private async cleanupEmptySourceRoots(jobId: string, targetPath: string) {
    const warnings: string[] = [];
    const targetRoot = path.resolve(targetPath);
    const items = await this.prisma.storageMigrationJobItem.findMany({
      where: { jobId },
      select: { sourcePath: true },
    });
    const sourceRoots = new Set(
      items
        .map((item) => path.dirname(path.resolve(item.sourcePath)))
        .filter((sourceRoot) => !this.arePathsEqual(sourceRoot, targetRoot)),
    );

    for (const sourceRoot of sourceRoots) {
      const parsedPath = path.parse(sourceRoot);
      if (this.arePathsEqual(sourceRoot, parsedPath.root)) {
        warnings.push(
          `Old upload root was not deleted because it is a filesystem root: ${sourceRoot}`,
        );
        continue;
      }

      try {
        await fs.promises.rmdir(sourceRoot);
      } catch (error) {
        const code =
          typeof error === "object" && error && "code" in error
            ? String((error as NodeJS.ErrnoException).code)
            : "";

        if (code === "ENOENT") continue;
        if (code === "ENOTEMPTY" || code === "EEXIST") {
          warnings.push(
            `Old upload root was left in place because it is not empty: ${sourceRoot}`,
          );
          continue;
        }

        warnings.push(
          `Could not delete old upload root ${sourceRoot}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return warnings;
  }

  private async markItemSkipped(
    jobId: string,
    itemId: string,
    message: string,
  ) {
    await this.prisma.storageMigrationJobItem.update({
      where: { id: itemId },
      data: { status: "SKIPPED", errorMessage: message },
    });
    await this.prisma.storageMigrationJob.update({
      where: { id: jobId },
      data: { skippedShares: { increment: 1 } },
    });
  }

  private async ensureNoActiveMigration() {
    const activeJob = await this.getActiveMigration();
    if (activeJob) {
      throw new BadRequestException("A storage migration is already running");
    }
  }

  private async resolveTargetRoot(targetPath?: string) {
    if (targetPath !== undefined) return String(targetPath).trim();

    const configuredPath = this.config.get("storage.localUploadPath");
    return configuredPath
      ? String(configuredPath).trim()
      : path.resolve(SHARE_DIRECTORY);
  }

  private async validateTargetPath(
    targetPath: string,
    throwOnInvalid: boolean,
  ) {
    const inputPath = String(targetPath || "").trim();
    const errors: string[] = [];
    let normalizedPath = inputPath ? path.resolve(inputPath) : "";
    let exists = false;
    let writable = false;
    let availableBytes: number | null = null;

    if (!inputPath) errors.push("Local upload path is required");
    if (inputPath && !path.isAbsolute(inputPath)) {
      errors.push("Local upload path must be absolute");
      normalizedPath = inputPath;
    }

    if (normalizedPath) {
      const parsedPath = path.parse(normalizedPath);
      if (normalizedPath === parsedPath.root) {
        errors.push("Local upload path cannot be a filesystem root");
      }
    }

    if (errors.length === 0) {
      try {
        exists = fs.existsSync(normalizedPath);
        fs.mkdirSync(normalizedPath, { recursive: true });
        const testFile = path.join(
          normalizedPath,
          `.mediapult-write-test-${process.pid}-${Date.now()}`,
        );
        await fs.promises.writeFile(testFile, "ok");
        await fs.promises.rm(testFile, { force: true });
        writable = true;
        const stat = await fs.promises.statfs(normalizedPath);
        availableBytes = stat.bavail * stat.bsize;
      } catch {
        errors.push("Local upload path must be writable");
      }
    }

    if (throwOnInvalid && errors.length > 0) {
      throw new BadRequestException(errors.join(", "));
    }

    return {
      inputPath,
      normalizedPath,
      valid: errors.length === 0,
      exists,
      writable,
      availableBytes,
      errors,
    };
  }

  private async buildMigrationPlan(targetRoot: string) {
    const shares = await this.prisma.share.findMany({
      where: { storageProvider: "LOCAL" },
      include: { files: true },
    });
    const items: MigrationPlanItem[] = [];
    const blockingIssues: string[] = [];

    for (const share of shares) {
      const sourceRoot = path.resolve(
        share.localStoragePath || SHARE_DIRECTORY,
      );
      if (this.arePathsEqual(sourceRoot, targetRoot)) continue;

      const sourceDirectory = path.join(sourceRoot, share.id);
      const targetDirectory = path.join(targetRoot, share.id);
      const bytes = this.sumFileBytes(share.files);
      const issues: string[] = [];

      if (!fs.existsSync(sourceDirectory) && share.files.length > 0) {
        issues.push(`Share ${share.id}: source directory is missing`);
      }
      if (fs.existsSync(targetDirectory)) {
        issues.push(`Share ${share.id}: target directory already exists`);
      }
      if (this.isPathInside(targetDirectory, sourceDirectory)) {
        issues.push(
          `Share ${share.id}: target directory is inside the source directory`,
        );
      }

      if (fs.existsSync(sourceDirectory)) {
        for (const file of share.files) {
          const filePath = path.join(sourceDirectory, file.id);
          if (!fs.existsSync(filePath)) {
            issues.push(
              `Share ${share.id}: file ${file.name} is missing on disk`,
            );
          }
        }
      }

      blockingIssues.push(...issues);
      items.push({
        shareId: share.id,
        sourceRoot,
        sourceDirectory,
        targetDirectory,
        fileCount: share.files.length,
        bytes,
        issues,
      });
    }

    const validation = await this.validateTargetPath(targetRoot, true);
    const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0);
    if (
      validation.availableBytes !== null &&
      totalBytes > validation.availableBytes
    ) {
      blockingIssues.push(
        "The target path does not have enough free space for this migration",
      );
    }

    return {
      totalLocalShares: shares.length,
      affectedShares: items.length,
      totalBytes,
      availableBytes: validation.availableBytes,
      blockingIssues,
      items,
    };
  }

  private async assertExpectedFilesExist(
    directory: string,
    files: { id: string; name: string; size: string }[],
  ) {
    for (const file of files) {
      const filePath = path.join(directory, file.id);
      const stat = await fs.promises.stat(filePath);
      if (stat.size !== parseInt(file.size, 10)) {
        throw new BadRequestException(
          `File ${file.name} has an unexpected size after copy`,
        );
      }
    }
  }

  private getConfiguredLocalUploadPath() {
    return path.resolve(
      this.config.get("storage.localUploadPath") || SHARE_DIRECTORY,
    );
  }

  private sumFileBytes(files: { size: string }[]) {
    return files.reduce((sum, file) => sum + parseInt(file.size || "0", 10), 0);
  }

  private arePathsEqual(firstPath: string, secondPath: string) {
    return (
      path.resolve(firstPath).toLowerCase() ===
      path.resolve(secondPath).toLowerCase()
    );
  }

  private isPathInside(childPath: string, parentPath: string) {
    const relativePath = path.relative(parentPath, childPath);
    return (
      relativePath !== "" &&
      !relativePath.startsWith("..") &&
      !path.isAbsolute(relativePath)
    );
  }

  private resolveSqliteDatabasePath(databaseUrl: string) {
    if (!databaseUrl.startsWith("file:")) return null;

    const withoutProtocol = databaseUrl.slice("file:".length).split("?")[0];
    return path.resolve(withoutProtocol);
  }
}
