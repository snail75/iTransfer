import { ExecutionContext, Injectable } from "@nestjs/common";
import { ApiTokenService } from "src/apiToken/apiToken.service";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { ConfigService } from "src/config/config.service";
import { ReverseShareService } from "src/reverseShare/reverseShare.service";

@Injectable()
export class CreateShareGuard extends JwtGuard {
  constructor(
    configService: ConfigService,
    apiTokenService: ApiTokenService,
    private reverseShareService: ReverseShareService,
  ) {
    super(configService, apiTokenService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (await super.canActivate(context)) return true;

    const reverseShareTokenId = context.switchToHttp().getRequest()
      .cookies.reverse_share_token;

    if (!reverseShareTokenId) return false;

    const isReverseShareTokenValid =
      await this.reverseShareService.isValid(reverseShareTokenId);

    return isReverseShareTokenValid;
  }
}
