import { Global, Module } from "@nestjs/common";
import { ApiTokenService } from "./apiToken.service";

@Global()
@Module({
  providers: [ApiTokenService],
  exports: [ApiTokenService],
})
export class ApiTokenModule {}
