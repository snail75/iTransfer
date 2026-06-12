import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { createReadStream } from "fs";
import * as fs from "fs/promises";
import * as mime from "mime-types";
import * as archiver from "archiver";
import { ClamScanService } from "src/clamscan/clamscan.service";
import { ConfigService } from "src/config/config.service";
import { StorageMigrationLockService } from "src/config/storageMigrationLock.service";
import { PrismaService } from "src/prisma/prisma.service";
import { resolveShareDirectory } from "src/storage/localStoragePath.util";
import { validate as isValidUUID } from "uuid";
import { Readable } from "stream";

export function createAvailableFileName(name: string, usedNames: string[]) {
  const used = new Set(usedNames);
  if (!used.has(name)) return name;

  const dotIndex = name.lastIndexOf(".");
  const hasExtension = dotIndex > 0;
  const basename = hasExtension ? name.slice(0, dotIndex) : name;
  const extension = hasExtension ? name.slice(dotIndex) : "";

  for (let index = 2; ; index++) {
    const candidate = `${basename} (${index})${extension}`;
    if (!used.has(candidate)) return candidate;
  }
}

@Injectable()
export class LocalFileService {
  private readonly logger = new Logger(LocalFileService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private clamScanService: ClamScanService,
    private storageMigrationLock: StorageMigrationLockService,
  ) {}

  async create(
    data: string,
    chunk: { index: number; total: number },
    file: { id?: string; name: string; replaceFileId?: string },
    shareId: string,
    allowCompletedShareUpload = false,
    allowVersioning = false,
    allowPublicUpload = false,
    isShareOwnerUpload = false,
  ) {
    if (!file.id) {
      file.id = crypto.randomUUID();
    } else if (!isValidUUID(file.id)) {
      throw new BadRequestException("Invalid file ID format");
    }

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { files: true, reverseShare: true, creator: true },
    });
    if (!share) throw new NotFoundException("Share not found");
    this.storageMigrationLock.assertShareIsNotLocked(shareId);
    const shareDirectory = resolveShareDirectory(share);

    if (share.uploadLocked && !allowCompletedShareUpload)
      throw new BadRequestException("Share is already completed");

    const canReplace = allowVersioning || isShareOwnerUpload;
    const wantsReplacement = canReplace && !!file.replaceFileId;
    const versionedFiles = wantsReplacement
      ? share.files.filter((savedFile) => savedFile.id === file.replaceFileId)
      : [];
    if (wantsReplacement && versionedFiles.length === 0) {
      throw new BadRequestException("Replacement file not found");
    }
    const replacedFileIds = new Set(
      versionedFiles.map((savedFile) => savedFile.id),
    );
    const fileName = createAvailableFileName(
      file.name,
      share.files
        .filter((savedFile) => !replacedFileIds.has(savedFile.id))
        .map((savedFile) => savedFile.name),
    );
    const versionedFileSize = versionedFiles.reduce(
      (n, { size }) => n + parseInt(size),
      0,
    );

    if (
      share.uploadLocked &&
      !isShareOwnerUpload &&
      allowVersioning &&
      !allowPublicUpload &&
      !wantsReplacement
    ) {
      throw new BadRequestException(
        "Versioning requires an existing file name",
      );
    }

    let diskFileSize: number;
    try {
      diskFileSize = (await fs.stat(`${shareDirectory}/${file.id}.tmp-chunk`))
        .size;
    } catch {
      diskFileSize = 0;
    }

    // If the sent chunk index and the expected chunk index doesn't match throw an error
    const chunkSize = this.config.get("share.chunkSize");
    const expectedChunkIndex = Math.ceil(diskFileSize / chunkSize);

    if (expectedChunkIndex != chunk.index)
      throw new BadRequestException({
        message: "Unexpected chunk received",
        error: "unexpected_chunk_index",
        expectedChunkIndex,
      });

    const buffer = Buffer.from(data, "base64");

    // Check if there is enough space on the server
    const space = await fs.statfs(shareDirectory);
    const availableSpace = space.bavail * space.bsize;
    if (availableSpace < buffer.byteLength) {
      throw new InternalServerErrorException("Not enough space on the server");
    }

    // Check if share size limit is exceeded
    const fileSizeSum =
      share.files.reduce((n, { size }) => n + parseInt(size), 0) -
      versionedFileSize;

    const shareSizeSum = fileSizeSum + diskFileSize + buffer.byteLength;
    const userStorageUsage = await this.getUserStorageUsageBytes(
      share.creatorId,
    );
    const userQuotaBytes = share.creator?.storageQuotaBytes
      ? parseInt(share.creator.storageQuotaBytes)
      : null;

    if (
      shareSizeSum > this.config.get("share.maxSize") ||
      (share.reverseShare?.maxShareSize &&
        shareSizeSum > parseInt(share.reverseShare.maxShareSize))
    ) {
      throw new HttpException(
        "Max share size exceeded",
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    if (
      userQuotaBytes !== null &&
      userStorageUsage - versionedFileSize + diskFileSize + buffer.byteLength >
        userQuotaBytes
    ) {
      throw new HttpException(
        "User storage quota exceeded",
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    this.storageMigrationLock.assertShareIsNotLocked(shareId);
    await fs.appendFile(`${shareDirectory}/${file.id}.tmp-chunk`, buffer);

    const isLastChunk = chunk.index == chunk.total - 1;
    if (isLastChunk) {
      this.storageMigrationLock.assertShareIsNotLocked(shareId);
      await fs.rename(
        `${shareDirectory}/${file.id}.tmp-chunk`,
        `${shareDirectory}/${file.id}`,
      );
      const filePath = `${shareDirectory}/${file.id}`;
      const fileSize = (await fs.stat(filePath)).size;

      if (versionedFiles.length > 0) {
        await Promise.all(
          versionedFiles.map(async (savedFile) => {
            await fs.rm(`${shareDirectory}/${savedFile.id}`, {
              force: true,
            });
          }),
        );
        await this.prisma.file.deleteMany({
          where: {
            shareId,
            id: { in: versionedFiles.map((savedFile) => savedFile.id) },
          },
        });
      }
      await this.prisma.file.create({
        data: {
          id: file.id,
          name: fileName,
          size: fileSize.toString(),
          scanStatus: "UNSCANNED",
          scanCheckedAt: new Date(),
          scanMessage: "Virus scan queued.",
          share: { connect: { id: shareId } },
        },
      });
      void this.scanFileInBackground(
        shareId,
        shareDirectory,
        file.id,
        fileName,
      );
      if (share.uploadLocked) {
        await this.prisma.share.update({
          where: { id: shareId },
          data: { isZipReady: false },
        });
      }
    }

    return { ...file, name: fileName };
  }

  async get(shareId: string, fileId: string) {
    const fileMetaData = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { share: true },
    });

    if (!fileMetaData) throw new NotFoundException("File not found");
    if (["PENDING", "INFECTED", "ERROR"].includes(fileMetaData.scanStatus)) {
      throw new NotFoundException("File not found");
    }

    const file = createReadStream(
      `${resolveShareDirectory(fileMetaData.share)}/${fileId}`,
    );

    return {
      metaData: {
        mimeType: mime.contentType(fileMetaData.name.split(".").pop()),
        ...fileMetaData,
        size: fileMetaData.size,
      },
      file,
    };
  }

  async remove(shareId: string, fileId: string) {
    const fileMetaData = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { share: true },
    });

    if (!fileMetaData) throw new NotFoundException("File not found");

    await fs.unlink(`${resolveShareDirectory(fileMetaData.share)}/${fileId}`);

    await this.prisma.file.delete({ where: { id: fileId } });
  }

  async rename(shareId: string, fileId: string, name?: string) {
    const desiredName = name?.trim();
    if (!desiredName) {
      throw new BadRequestException("File name is required");
    }

    const fileMetaData = await this.prisma.file.findFirst({
      where: { id: fileId, shareId },
      include: { share: { include: { files: true } } },
    });

    if (!fileMetaData) throw new NotFoundException("File not found");

    const fileName = createAvailableFileName(
      desiredName,
      fileMetaData.share.files
        .filter((file) => file.id !== fileId)
        .map((file) => file.name),
    );

    const file = await this.prisma.file.update({
      where: { id: fileId },
      data: { name: fileName },
    });

    if (fileMetaData.share.uploadLocked) {
      await this.prisma.share.update({
        where: { id: shareId },
        data: { isZipReady: false },
      });
    }

    return file;
  }

  async deleteAllFiles(shareId: string) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
    });
    if (!share) return;
    await fs.rm(resolveShareDirectory(share), {
      recursive: true,
      force: true,
    });
  }

  async getZip(shareId: string): Promise<Readable> {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: {
        files: {
          where: {
            scanStatus: { in: ["CLEAN", "UNSCANNED"] },
          },
        },
      },
    });
    if (!share) throw new NotFoundException("Share not found");

    const shareDirectory = resolveShareDirectory(share);
    const compressionLevel = this.config.get("share.zipCompressionLevel");
    const archive = archiver("zip", {
      zlib: { level: parseInt(compressionLevel) },
    });

    archive.on("error", (err) => {
      archive.destroy(new InternalServerErrorException(err));
    });

    for (const file of share.files) {
      archive.append(createReadStream(`${shareDirectory}/${file.id}`), {
        name: file.name,
      });
    }

    void archive.finalize();
    return archive;
  }

  private async getUserStorageUsageBytes(userId?: string | null) {
    if (!userId) return 0;

    const files = await this.prisma.file.findMany({
      where: {
        share: {
          creatorId: userId,
        },
      },
      select: { size: true },
    });

    return files.reduce((sum, file) => sum + parseInt(file.size), 0);
  }

  private async scanFileInBackground(
    shareId: string,
    shareDirectory: string,
    fileId: string,
    fileName: string,
  ) {
    const filePath = `${shareDirectory}/${fileId}`;

    try {
      const scanResult = await this.clamScanService.scanLocalFile(
        filePath,
        fileName,
      );

      await this.updateFileScanStatus(fileId, {
        scanStatus: scanResult.scanStatus,
        scanCheckedAt: scanResult.scanCheckedAt,
        scanMessage: scanResult.scanMessage,
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        await fs
          .rm(shareDirectory, { recursive: true, force: true })
          .catch((removeError) => {
            this.logger.warn(
              `Could not delete files for infected share ${shareId}: ${
                removeError instanceof Error
                  ? removeError.message
                  : String(removeError)
              }`,
            );
          });
        await this.prisma.file
          .deleteMany({ where: { shareId } })
          .catch((deleteError) => {
            this.logger.warn(
              `Could not delete file records for infected share ${shareId}: ${
                deleteError instanceof Error
                  ? deleteError.message
                  : String(deleteError)
              }`,
            );
          });
        await this.prisma.share
          .update({
            where: { id: shareId },
            data: {
              isZipReady: false,
              removedReason: `Your share got removed because the file ${fileName} is malicious.`,
            },
          })
          .catch((updateError) => {
            this.logger.warn(
              `Could not mark share ${shareId} as removed after malware detection: ${
                updateError instanceof Error
                  ? updateError.message
                  : String(updateError)
              }`,
            );
          });
        this.logger.warn(
          `Share ${shareId} deleted because ${fileName} is malicious.`,
        );
        return;
      }

      this.logger.error(
        `Virus scan failed for ${fileName}`,
        error instanceof Error ? error.stack : String(error),
      );

      await this.updateFileScanStatus(fileId, {
        scanStatus: "ERROR",
        scanCheckedAt: new Date(),
        scanMessage: "ClamAV scan failed.",
      });
    }
  }

  private async updateFileScanStatus(
    fileId: string,
    data: { scanStatus: string; scanCheckedAt: Date; scanMessage: string },
  ) {
    await this.prisma.file
      .update({
        where: { id: fileId },
        data,
      })
      .catch((error) => {
        this.logger.warn(
          `Could not update scan status for file ${fileId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }
}
