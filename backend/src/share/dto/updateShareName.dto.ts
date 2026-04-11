import { IsOptional, IsString, Length } from "class-validator";

export class UpdateShareNameDTO {
  @IsString()
  @IsOptional()
  @Length(3, 30)
  name?: string;
}
