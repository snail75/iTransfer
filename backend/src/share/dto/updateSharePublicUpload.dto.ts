import { IsBoolean } from "class-validator";

export class UpdateSharePublicUploadDTO {
  @IsBoolean()
  allowPublicUpload: boolean;
}
