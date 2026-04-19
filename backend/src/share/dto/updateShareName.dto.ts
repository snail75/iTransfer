import { IsOptional, IsString, Length } from "class-validator";

export class UpdateShareNameDTO {
  @IsString()
  @IsOptional()
  @Length(3, 128)
  name?: string;
}
