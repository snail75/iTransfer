import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { createReadStream } from "fs";
import * as fs from "fs/promises";
import * as mime from "mime-types";
import { ClamScanService } from "src/clamscan/clamscan.service";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";
import { resolveShareDirectory } from "src/storage/localStoragePath.util";
import { validate as isValidUUID } from "uuid";
import { Readable } from "stream";

@Injectable()
export class LocalFileService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private clamScanService: ClamScanService,
  ) {}

  async create(
    data: string,
    chunk: { index: number; total: number },
    file: { id?: string; name: string },
    shareId: string,
    allowCompletedShareUpload = false,
    allowVersioning = false,
    allowPublicUpload = false,
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
    const shareDirectory = resolveShareDirectory(share);

    if (share.uploadLocked && !allowCompletedShareUpload)
      throw new BadRequestException("Share is already completed");

    const versionedFiles = allowVersioning
      ? share.files.filter((savedFile) => savedFile.name === file.name)
      : [];
    const versionedFileSize = versionedFiles.reduce(
      (n, { size }) => n + parseInt(size),
      0,
    );

    if (
      share.uploadLocked &&
      allowVersioning &&
      !allowPublicUpload &&
      versionedFiles.length === 0
    ) {
      throw new BadRequestException("Versioning requires an existing file name");
    }

    let diskFileSize: number;
    try {
      diskFileSize = (
        await fs.stat(`${shareDirectory}/${file.id}.tmp-chunk`)
      ).size;
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
    const fileSizeSum = share.files.reduce(
      (n, { size }) => n + parseInt(size),
      0,
    ) - versionedFileSize;

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

    await fs.appendFile(
      `${shareDirectory}/${file.id}.tmp-chunk`,
      buffer,
    );

    const isLastChunk = chunk.index == chunk.total - 1;
    if (isLastChunk) {
      await fs.rename(
        `${shareDirectory}/${file.id}.tmp-chunk`,
        `${shareDirectory}/${file.id}`,
      );
      const filePath = `${shareDirectory}/${file.id}`;
      const fileSize = (await fs.stat(filePath)).size;
      let scanResult: {
        scanStatus: string;
        scanCheckedAt: Date;
        scanMessage: string;
      };
      try {
        scanResult = await this.clamScanService.scanLocalFile(
          filePath,
          file.name,
        );
      } catch (error) {
        await fs.rm(filePath, { force: true });
        throw error;
      }

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
            name: file.name,
          },
        });
      }
      await this.prisma.file.create({
        data: {
          id: file.id,
          name: file.name,
          size: fileSize.toString(),
          scanStatus: scanResult.scanStatus,
          scanCheckedAt: scanResult.scanCheckedAt,
          scanMessage: scanResult.scanMessage,
          share: { connect: { id: shareId } },
        },
      });
      if (share.uploadLocked) {
        await this.prisma.share.update({
          where: { id: shareId },
          data: { isZipReady: false },
        });
      }
    }

    return file;
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

    const file = createReadStream(`${resolveShareDirectory(fileMetaData.share)}/${fileId}`);

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

  async deleteAllFiles(shareId: string) {
    const share = await this.prisma.share.findUnique({ where: { id: shareId } });
    if (!share) return;
    await fs.rm(resolveShareDirectory(share), {
      recursive: true,
      force: true,
    });
  }

  async getZip(shareId: string): Promise<Readable> {
    const share = await this.prisma.share.findUnique({ where: { id: shareId } });
    if (!share) throw new NotFoundException("Share not found");
    return new Promise((resolve, reject) => {
      const zipStream = createReadStream(
        `${resolveShareDirectory(share)}/archive.zip`,
      );

      zipStream.on("error", (err) => {
        reject(new InternalServerErrorException(err));
      });

      zipStream.on("open", () => {
        resolve(zipStream);
      });
    });
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
}
