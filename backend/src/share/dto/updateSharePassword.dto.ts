import { IsOptional, IsString, Length } from "class-validator";

export class UpdateSharePasswordDTO {
  @IsString()
  @IsOptional()
  @Length(3, 30)
  password?: string;
}
