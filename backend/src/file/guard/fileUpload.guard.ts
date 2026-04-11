import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { User } from "@prisma/client";
import { Request } from "express";
import * as moment from "moment";
import { ApiTokenService } from "src/apiToken/apiToken.service";
import { ConfigService } from "src/config/config.service";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { PrismaService } from "src/prisma/prisma.service";
import { ShareService } from "src/share/share.service";

@Injectable()
export class FileUploadGuard extends JwtGuard {
  constructor(
    private configService: ConfigService,
    apiTokenService: ApiTokenService,
    private prisma: PrismaService,
    private shareService: ShareService,
    private jwtService: JwtService,
  ) {
    super(configService, apiTokenService);
  }

  async canActivate(context: ExecutionContext) {
    const request: Request = context.switchToHttp().getRequest();
    const shareId = request.params.shareId;

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { security: true },
    });

    if (!share) throw new NotFoundException("Share not found");
    request["allowPublicUpload"] = share.allowPublicUpload;
    request["allowVersioning"] = share.allowVersioning;

    try {
      await super.canActivate(context);
      const user = request.user as User;
      if (
        user?.isAdmin ||
        share.creatorId === user?.id ||
        (!share.creatorId && this.verifyAnonymousOwnerToken(request, share))
      ) {
        request["allowCompletedShareUpload"] = true;
        return true;
      }
    } catch {
      // Fall through to public link upload checks.
    }

    if (!share.allowPublicUpload && !share.allowVersioning) {
      throw new ForbiddenException("Public upload is not enabled");
    }

    if (
      moment().isAfter(share.expiration) &&
      !moment(share.expiration).isSame(0)
    ) {
      throw new NotFoundException("Share not found");
    }

    const shareToken = request.cookies[`share_${shareId}_token`];
    if (!(await this.shareService.verifyShareToken(shareId, shareToken))) {
      throw new ForbiddenException(
        "Share token required",
        "share_token_required",
      );
    }

    request["allowCompletedShareUpload"] = true;
    return true;
  }

  private verifyAnonymousOwnerToken(
    request: Request,
    share: { id: string; createdAt: Date; expiration: Date },
  ) {
    const token = request.cookies[`share_${share.id}_owner`];
    if (!token) return false;

    try {
      const claims = this.jwtService.verify(token, {
        secret: this.configService.get("internal.jwtSecret"),
        ignoreExpiration: moment(share.expiration).isSame(0),
      });

      return (
        claims.tokenType === "shareOwner" &&
        claims.shareId === share.id &&
        claims.shareCreatedAt === moment(share.createdAt).unix()
      );
    } catch {
      return false;
    }
  }
}
