import { Expose, plainToClass } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  Length,
  Matches,
  MinLength,
} from "class-validator";

export class UserDTO {
  @Expose()
  id: string;

  @Expose()
  @Matches("^[a-zA-Z0-9_.]*$", undefined, {
    message: "Username can only contain letters, numbers, dots and underscores",
  })
  @Length(3, 32)
  username: string;

  @Expose()
  @IsEmail()
  email: string;

  @Expose()
  hasPassword: boolean;

  @MinLength(8)
  password: string;

  @Expose()
  isAdmin: boolean;

  @Expose()
  @IsBoolean()
  @IsOptional()
  isDisabled: boolean;

  @Expose()
  @IsOptional()
  storageQuotaBytes?: string | null;

  @Expose()
  isLdap: boolean;

  ldapDN?: string;

  @Expose()
  totpVerified: boolean;

  @Expose()
  shareCount?: number;

  @Expose()
  reverseShareCount?: number;

  from(
    partial: Partial<UserDTO> & {
      _count?: { shares?: number; reverseShares?: number };
    },
  ) {
    const result = plainToClass(UserDTO, partial, {
      excludeExtraneousValues: true,
    });
    result.isLdap = partial.ldapDN?.length > 0;
    result.shareCount = partial._count?.shares ?? partial.shareCount;
    result.reverseShareCount =
      partial._count?.reverseShares ?? partial.reverseShareCount;
    return result;
  }

  fromList(
    partial: (Partial<UserDTO> & {
      _count?: { shares?: number; reverseShares?: number };
    })[],
  ) {
    return partial.map((part) => this.from(part));
  }
}
