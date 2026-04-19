import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { ShareSecurityDTO } from "./shareSecurity.dto";

export class CreateShareDTO {
  @IsString()
  @Matches("^[a-zA-Z0-9_-]*$", undefined, {
    message: "ID can only contain letters, numbers, underscores and hyphens",
  })
  @Length(3, 50)
  id: string;

  @Length(3, 128)
  @IsOptional()
  name: string;

  @IsString()
  @IsOptional()
  expiration: string;

  @MaxLength(512)
  @IsOptional()
  description: string;

  @IsBoolean()
  @IsOptional()
  allowPublicUpload?: boolean;

  @IsBoolean()
  @IsOptional()
  allowVersioning?: boolean;

  @IsEmail({}, { each: true })
  recipients: string[];

  @ValidateNested()
  @Type(() => ShareSecurityDTO)
  security: ShareSecurityDTO;
}
