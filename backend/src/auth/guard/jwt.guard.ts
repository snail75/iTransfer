import { ExecutionContext, Injectable, Optional } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request } from "express";
import { ApiTokenService } from "src/apiToken/apiToken.service";
import { ConfigService } from "src/config/config.service";

@Injectable()
export class JwtGuard extends AuthGuard("jwt") {
  constructor(
    private config: ConfigService,
    @Optional() private apiTokenService?: ApiTokenService,
  ) {
    super();
  }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    const bearerToken = this.extractBearerToken(request);

    if (bearerToken) {
      const user = await this.apiTokenService?.getUserForToken(bearerToken);
      if (!user) return false;

      request.user = user;
      return true;
    }

    try {
      return (await super.canActivate(context)) as boolean;
    } catch {
      return this.config.get("share.allowUnauthenticatedShares");
    }
  }

  private extractBearerToken(request: Request) {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}
