import { IsBoolean, IsOptional, IsString } from "class-validator";

export class TransferOwnershipDTO {
  @IsString()
  targetUserId: string;

  @IsBoolean()
  @IsOptional()
  includeReverseShares?: boolean;
}
