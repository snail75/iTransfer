import { Expose, plainToClass } from "class-transformer";
import { IsString, Length } from "class-validator";

export class CreateApiTokenDTO {
  @IsString()
  @Length(1, 64)
  name: string;
}

export class UpdateApiTokenDTO {
  @IsString()
  @Length(1, 64)
  name: string;
}

export class ApiTokenDTO {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  createdAt: Date;

  @Expose()
  lastUsedAt?: Date;

  @Expose()
  token?: string;

  from(partial: Partial<ApiTokenDTO>) {
    return plainToClass(ApiTokenDTO, partial, {
      excludeExtraneousValues: true,
    });
  }

  fromList(partial: Partial<ApiTokenDTO>[]) {
    return partial.map((part) => this.from(part));
  }
}

export class CreatedApiTokenDTO extends ApiTokenDTO {
  @Expose()
  token: string;

  from(partial: Partial<CreatedApiTokenDTO>) {
    return plainToClass(CreatedApiTokenDTO, partial, {
      excludeExtraneousValues: true,
    });
  }
}
