import { IsString } from "class-validator";

export class UpdateShareExpirationDTO {
  @IsString()
  expiration: string;
}
