import { IsBoolean } from "class-validator";

export class UpdateShareVersioningDTO {
  @IsBoolean()
  allowVersioning: boolean;
}
