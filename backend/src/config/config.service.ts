import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Config } from "@prisma/client";
import * as argon from "argon2";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "src/prisma/prisma.service";
import { stringToTimespan } from "src/utils/date.util";
import { parse as yamlParse } from "yaml";
import { YamlConfig } from "../../prisma/seed/config.seed";
import { CONFIG_FILE, SHARE_DIRECTORY } from "src/constants";

/**
 * ConfigService extends EventEmitter to allow listening for config updates,
 * now only `update` event will be emitted.
 */
@Injectable()
export class ConfigService extends EventEmitter {
  yamlConfig?: YamlConfig;
  logger = new Logger(ConfigService.name);

  constructor(
    @Inject("CONFIG_VARIABLES") private configVariables: Config[],
    private prisma: PrismaService,
  ) {
    super();
  }

  // Initialize gets called by the ConfigModule
  async initialize() {
    await this.loadYamlConfig();

    if (this.yamlConfig) {
      await this.migrateInitUser();
    }
  }

  private async loadYamlConfig() {
    let configFile: string = "";
    try {
      configFile = fs.readFileSync(CONFIG_FILE, "utf8");
    } catch {
      this.logger.log(
        "Config.yaml is not set. Falling back to UI configuration.",
      );
    }
    try {
      this.yamlConfig = yamlParse(configFile);

      if (this.yamlConfig) {
        for (const configVariable of this.configVariables) {
          const category = this.yamlConfig[configVariable.category];
          if (!category) continue;
          configVariable.value = category[configVariable.name];
          this.emit("update", configVariable.name, configVariable.value);
        }
      }
    } catch (e) {
      this.logger.error(
        "Failed to parse config.yaml. Falling back to UI configuration: ",
        e,
      );
    }
  }

  private async migrateInitUser(): Promise<void> {
    if (!this.yamlConfig.initUser.enabled) return;

    const userCount = await this.prisma.user.count({
      where: { isAdmin: true },
    });
    if (userCount === 1) {
      this.logger.log(
        "Skip initial user creation. Admin user is already existent.",
      );
      return;
    }
    await this.prisma.user.create({
      data: {
        email: this.yamlConfig.initUser.email,
        username: this.yamlConfig.initUser.username,
        password: this.yamlConfig.initUser.password
          ? await argon.hash(this.yamlConfig.initUser.password)
          : null,
        isAdmin: this.yamlConfig.initUser.isAdmin,
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(key: `${string}.${string}`): any {
    const configVariable = this.configVariables.filter(
      (variable) => `${variable.category}.${variable.name}` == key,
    )[0];

    if (!configVariable) throw new Error(`Config variable ${key} not found`);

    const value = configVariable.value ?? configVariable.defaultValue;

    if (configVariable.type == "number" || configVariable.type == "filesize")
      return parseInt(value);
    if (configVariable.type == "boolean") return value == "true";
    if (configVariable.type == "string" || configVariable.type == "text")
      return value;
    if (configVariable.type == "timespan") return stringToTimespan(value);
  }

  async getByCategory(category: string) {
    const configVariables = this.configVariables
      .filter((c) => !c.locked && category == c.category)
      .sort((c) => c.order);

    return configVariables.map((variable) => {
      return {
        ...variable,
        key: `${variable.category}.${variable.name}`,
        value: variable.value ?? variable.defaultValue,
        allowEdit: this.isEditAllowed(),
      };
    });
  }

  async list() {
    const configVariables = this.configVariables.filter((c) => !c.secret);

    return configVariables.map((variable) => {
      return {
        ...variable,
        key: `${variable.category}.${variable.name}`,
        value: variable.value ?? variable.defaultValue,
      };
    });
  }

  async updateMany(data: { key: string; value: string | number | boolean }[]) {
    if (!this.isEditAllowed())
      throw new BadRequestException(
        "You are only allowed to update config variables via the config.yaml file",
      );

    const response: Config[] = [];

    for (const variable of data) {
      response.push(await this.update(variable.key, variable.value));
    }

    return response;
  }

  async update(key: string, value: string | number | boolean) {
    if (!this.isEditAllowed())
      throw new BadRequestException(
        "You are only allowed to update config variables via the config.yaml file",
      );

    const configVariable = await this.prisma.config.findUnique({
      where: {
        name_category: {
          category: key.split(".")[0],
          name: key.split(".")[1],
        },
      },
    });

    if (!configVariable || configVariable.locked)
      throw new NotFoundException("Config variable not found");

    if (value === "") {
      value = null;
    } else if (
      typeof value != configVariable.type &&
      typeof value == "string" &&
      configVariable.type != "text" &&
      configVariable.type != "timespan"
    ) {
      throw new BadRequestException(
        `Config variable must be of type ${configVariable.type}`,
      );
    }

    this.validateConfigVariable(key, value);

    const updatedVariable = await this.prisma.config.update({
      where: {
        name_category: {
          category: key.split(".")[0],
          name: key.split(".")[1],
        },
      },
      data: { value: value === null ? null : value.toString() },
    });

    this.configVariables = await this.prisma.config.findMany();

    this.emit("update", key, value);

    return updatedVariable;
  }

  async migrateLocalSharesToConfiguredStoragePath() {
    const configuredPath = this.get("storage.localUploadPath");
    const targetRoot = path.resolve(configuredPath || SHARE_DIRECTORY);

    if (configuredPath) {
      this.validateConfigVariable("storage.localUploadPath", configuredPath);
    } else {
      fs.mkdirSync(targetRoot, { recursive: true });
      fs.accessSync(targetRoot, fs.constants.W_OK);
    }

    const shares = await this.prisma.share.findMany({
      where: { storageProvider: "LOCAL" },
      include: { files: true },
    });

    const moves = shares.map((share) => {
      const sourceRoot = path.resolve(
        share.localStoragePath || SHARE_DIRECTORY,
      );
      const sourceDirectory = path.join(sourceRoot, share.id);
      const targetDirectory = path.join(targetRoot, share.id);

      return {
        share,
        sourceRoot,
        sourceDirectory,
        targetDirectory,
        needsMove: !this.arePathsEqual(sourceDirectory, targetDirectory),
      };
    });

    for (const move of moves) {
      if (!move.needsMove) continue;

      if (!fs.existsSync(move.sourceDirectory)) {
        if (move.share.files.length > 0) {
          throw new BadRequestException(
            `Cannot move share ${move.share.id}: source directory is missing`,
          );
        }
        continue;
      }

      if (fs.existsSync(move.targetDirectory)) {
        throw new BadRequestException(
          `Cannot move share ${move.share.id}: target directory already exists`,
        );
      }
    }

    let movedShares = 0;
    let updatedShares = 0;

    for (const move of moves) {
      if (move.needsMove && fs.existsSync(move.sourceDirectory)) {
        await this.moveDirectory(move.sourceDirectory, move.targetDirectory);
        movedShares += 1;
      }

      if (!this.arePathsEqual(move.sourceRoot, targetRoot)) {
        await this.prisma.share.update({
          where: { id: move.share.id },
          data: { localStoragePath: targetRoot },
        });
        updatedShares += 1;
      }
    }

    return {
      targetPath: targetRoot,
      totalShares: shares.length,
      movedShares,
      updatedShares,
    };
  }

  validateConfigVariable(key: string, value: string | number | boolean) {
    const validations = [
      {
        key: "share.shareIdLength",
        condition: (value: number) => value >= 2 && value <= 50,
        message: "Share ID length must be between 2 and 50",
      },
      {
        key: "share.zipCompressionLevel",
        condition: (value: number) => value >= 0 && value <= 9,
        message: "Zip compression level must be between 0 and 9",
      },
      // TODO add validation for timespan type
    ];

    const validation = validations.find((validation) => validation.key == key);
    if (validation) {
      const numValue =
        typeof value === "number" ? value : parseInt(String(value), 10);
      if (!validation.condition(numValue)) {
        throw new BadRequestException(validation.message);
      }
    }

    if (key == "storage.localUploadPath" && value) {
      const localUploadPath = String(value).trim();
      if (!path.isAbsolute(localUploadPath)) {
        throw new BadRequestException("Local upload path must be absolute");
      }
      const parsedPath = path.parse(localUploadPath);
      if (localUploadPath == parsedPath.root) {
        throw new BadRequestException(
          "Local upload path cannot be a filesystem root",
        );
      }

      try {
        fs.mkdirSync(localUploadPath, { recursive: true });
        fs.accessSync(localUploadPath, fs.constants.W_OK);
      } catch {
        throw new BadRequestException("Local upload path must be writable");
      }
    }
  }

  isEditAllowed(): boolean {
    return this.yamlConfig === undefined || this.yamlConfig === null;
  }

  private arePathsEqual(firstPath: string, secondPath: string) {
    return (
      path.resolve(firstPath).toLowerCase() ==
      path.resolve(secondPath).toLowerCase()
    );
  }

  private async moveDirectory(source: string, target: string) {
    fs.mkdirSync(path.dirname(target), { recursive: true });

    try {
      await fs.promises.rename(source, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code != "EXDEV") throw error;

      await fs.promises.cp(source, target, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      await fs.promises.rm(source, { recursive: true, force: true });
    }
  }
}
