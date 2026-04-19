import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SkipThrottle } from "@nestjs/throttler";
import { AdministratorGuard } from "src/auth/guard/isAdmin.guard";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { EmailService } from "src/email/email.service";
import { ConfigService } from "./config.service";
import { AdminConfigDTO } from "./dto/adminConfig.dto";
import { ConfigDTO } from "./dto/config.dto";
import { TestEmailDTO } from "./dto/testEmail.dto";
import UpdateConfigDTO from "./dto/updateConfig.dto";
import { LogoService } from "./logo.service";
import { StorageMigrationService } from "./storageMigration.service";

@Controller("configs")
export class ConfigController {
  constructor(
    private configService: ConfigService,
    private logoService: LogoService,
    private emailService: EmailService,
    private storageMigrationService: StorageMigrationService,
  ) {}

  @Get()
  @SkipThrottle()
  async list() {
    return new ConfigDTO().fromList(await this.configService.list());
  }

  @Get("admin/:category")
  @UseGuards(JwtGuard, AdministratorGuard)
  async getByCategory(@Param("category") category: string) {
    return new AdminConfigDTO().fromList(
      await this.configService.getByCategory(category),
    );
  }

  @Patch("admin")
  @UseGuards(JwtGuard, AdministratorGuard)
  async updateMany(@Body() data: UpdateConfigDTO[]) {
    return new AdminConfigDTO().fromList(
      await this.configService.updateMany(data),
    );
  }

  @Post("admin/testEmail")
  @UseGuards(JwtGuard, AdministratorGuard)
  async testEmail(@Body() { email }: TestEmailDTO) {
    await this.emailService.sendTestMail(email);
  }

  @Post("admin/storage/migrate")
  @UseGuards(JwtGuard, AdministratorGuard)
  async migrateLocalSharesToConfiguredStoragePath() {
    return await this.storageMigrationService.runLegacyMigrationToConfiguredPath();
  }

  @Get("admin/system/status")
  @UseGuards(JwtGuard, AdministratorGuard)
  async getSystemStatus() {
    return await this.storageMigrationService.getSystemStatus();
  }

  @Post("admin/storage/validate")
  @UseGuards(JwtGuard, AdministratorGuard)
  async validateStoragePath(@Body() body: { path: string }) {
    return await this.storageMigrationService.validateLocalUploadPath(
      body.path,
    );
  }

  @Post("admin/storage/migrations/dry-run")
  @UseGuards(JwtGuard, AdministratorGuard)
  async dryRunStorageMigration(@Body() body: { targetPath?: string }) {
    return await this.storageMigrationService.createDryRun(body.targetPath);
  }

  @Post("admin/storage/migrations")
  @UseGuards(JwtGuard, AdministratorGuard)
  async createStorageMigration(
    @Body() body: { targetPath?: string; deleteEmptySourceRoots?: boolean },
  ) {
    return await this.storageMigrationService.createMigration(
      body.targetPath,
      body.deleteEmptySourceRoots,
    );
  }

  @Get("admin/storage/migrations/:id")
  @UseGuards(JwtGuard, AdministratorGuard)
  async getStorageMigration(@Param("id") id: string) {
    return await this.storageMigrationService.getMigrationJob(id);
  }

  @Post("admin/storage/migrations/:id/cancel")
  @UseGuards(JwtGuard, AdministratorGuard)
  async cancelStorageMigration(@Param("id") id: string) {
    return await this.storageMigrationService.cancelMigration(id);
  }

  @Post("admin/logo")
  @UseInterceptors(FileInterceptor("file"))
  @UseGuards(JwtGuard, AdministratorGuard)
  async uploadLogo(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new FileTypeValidator({ fileType: "image/png" })],
      }),
    )
    file: {
      buffer: Buffer;
    },
  ) {
    return await this.logoService.create(file.buffer);
  }
}
