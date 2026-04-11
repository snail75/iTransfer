import {
  ExecutionContext,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { User } from "@prisma/client";
import { Request } from "express";
import * as moment from "moment";
import { ApiTokenService } from "src/apiToken/apiToken.service";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";
import { JwtGuard } from "../../auth/guard/jwt.guard";

@Injectable()
export class ShareOwnerGuard extends JwtGuard {
  constructor(
    private configService: ConfigService,
    apiTokenService: ApiTokenService,
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {
    super(configService, apiTokenService);
  }

  async canActivate(context: ExecutionContext) {
    const request: Request = context.switchToHttp().getRequest();
    const shareId = Object.prototype.hasOwnProperty.call(
      request.params,
      "shareId",
    )
      ? request.params.shareId
      : request.params.id;

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { security: true },
    });

    if (!share) throw new NotFoundException("Share not found");

    // Run the JWTGuard to set the user
    await super.canActivate(context);
    const user = request.user as User;

    // If the user is an admin, allow access
    if (user?.isAdmin) return true;

    if (!share.creatorId) return this.verifyAnonymousOwnerToken(request, share);

    // If not signed in, deny access
    if (!user) return false;

    // If the user is the creator of the share, allow access
    return share.creatorId == user.id;
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
