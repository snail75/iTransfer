import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import * as NodeClam from "clamscan";
import * as fs from "fs";
import { PrismaService } from "src/prisma/prisma.service";
import { resolveShareDirectory } from "src/storage/localStoragePath.util";
import { CLAMAV_HOST, CLAMAV_PORT, CLAMAV_REQUIRED } from "../constants";

const clamscanConfig = {
  clamdscan: {
    host: CLAMAV_HOST,
    port: CLAMAV_PORT,
    localFallback: false,
  },
  preference: "clamdscan",
};
@Injectable()
export class ClamScanService {
  private readonly logger = new Logger(ClamScanService.name);

  constructor(private prisma: PrismaService) {}

  private ClamScan: Promise<NodeClam | null> = new NodeClam()
    .init(clamscanConfig)
    .then((res) => {
      this.logger.log("ClamAV is active");
      return res;
    })
    .catch(() => {
      this.logger.log("ClamAV is not active");
      return null;
    });

  async check(shareId: string) {
    const clamScan = await this.ClamScan;

    if (!clamScan) return [];

    const infectedFiles = [];
    const share = await this.prisma.share.findUnique({ where: { id: shareId } });
    if (!share) return [];
    const shareDirectory = resolveShareDirectory(share);

    const files = fs
      .readdirSync(shareDirectory)
      .filter((file) => file != "archive.zip" && !file.endsWith(".tmp-chunk"));

    for (const fileId of files) {
      const { isInfected } = await clamScan
        .isInfected(`${shareDirectory}/${fileId}`)
        .catch(() => {
          this.logger.log("ClamAV is not active");
          return { isInfected: false };
        });

      const fileRecord = await this.prisma.file.findUnique({
        where: { id: fileId },
      });
      if (!fileRecord) continue;
      const fileName = fileRecord.name;

      if (isInfected) {
        infectedFiles.push({ id: fileId, name: fileName });
      }
    }

    return infectedFiles;
  }

  async checkAndRemove(shareId: string) {
    const infectedFiles = await this.check(shareId);

    if (infectedFiles.length > 0) {
      const share = await this.prisma.share.findUnique({ where: { id: shareId } });
      if (!share) return;
      await fs.promises.rm(resolveShareDirectory(share), {
        recursive: true,
        force: true,
      });
      await this.prisma.file.deleteMany({ where: { shareId } });

      const fileNames = infectedFiles.map((file) => file.name).join(", ");

      await this.prisma.share.update({
        where: { id: shareId },
        data: {
          removedReason: `Your share got removed because the file(s) ${fileNames} are malicious.`,
        },
      });

      this.logger.warn(
        `Share ${shareId} deleted because it contained ${infectedFiles.length} malicious file(s)`,
      );
    }
  }

  async scanLocalFile(filePath: string, fileName: string) {
    const clamScan = await this.ClamScan;

    if (!clamScan) {
      if (CLAMAV_REQUIRED) {
        throw new ServiceUnavailableException("ClamAV is not active");
      }

      this.logger.warn(
        `Skipping virus scan for ${fileName} because ClamAV is not active.`,
      );
      return {
        scanStatus: "UNSCANNED",
        scanCheckedAt: new Date(),
        scanMessage: "ClamAV is not active.",
      };
    }

    let scanResult: { isInfected: boolean };
    try {
      scanResult = await clamScan.isInfected(filePath);
    } catch {
      if (!CLAMAV_REQUIRED) {
        this.logger.warn(
          `Skipping virus scan for ${fileName} because ClamAV scan failed.`,
        );
        return {
          scanStatus: "UNSCANNED",
          scanCheckedAt: new Date(),
          scanMessage: "ClamAV scan failed.",
        };
      }

      throw new ServiceUnavailableException("ClamAV scan failed");
    }

    if (scanResult.isInfected) {
      throw new BadRequestException(`Malware detected in ${fileName}`);
    }

    return {
      scanStatus: "CLEAN",
      scanCheckedAt: new Date(),
      scanMessage: "Virus-free",
    };
  }
}
