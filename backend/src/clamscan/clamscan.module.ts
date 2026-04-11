import { Module } from "@nestjs/common";
import { ClamScanService } from "./clamscan.service";

@Module({
  providers: [ClamScanService],
  exports: [ClamScanService],
})
export class ClamScanModule {}
