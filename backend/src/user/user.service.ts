import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import * as argon from "argon2";
import * as crypto from "crypto";
import { Entry } from "ldapts";
import { AuthSignInDTO } from "src/auth/dto/authSignIn.dto";
import { EmailService } from "src/email/email.service";
import { PrismaService } from "src/prisma/prisma.service";
import { inspect } from "util";
import { ConfigService } from "../config/config.service";
import { FileService } from "../file/file.service";
import { CreateUserDTO } from "./dto/createUser.dto";
import { UpdateUserDto } from "./dto/updateUser.dto";

@Injectable()
export class UserSevice {
  private readonly logger = new Logger(UserSevice.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private fileService: FileService,
    private configService: ConfigService,
  ) {}

  async list() {
    return await this.prisma.user.findMany({
      include: {
        _count: {
          select: {
            shares: true,
            reverseShares: true,
          },
        },
      },
    });
  }

  async get(id: string) {
    return await this.prisma.user.findUnique({ where: { id } });
  }

  async create(dto: CreateUserDTO) {
    let hash: string;
    dto.storageQuotaBytes = this.normalizeStorageQuota(dto.storageQuotaBytes);

    // The password can be undefined if the user is invited by an admin
    if (!dto.password) {
      const randomPassword = crypto.randomUUID();
      hash = await argon.hash(randomPassword);
      await this.emailService.sendInviteEmail(dto.email, randomPassword);
    } else {
      hash = await argon.hash(dto.password);
    }

    try {
      return await this.prisma.user.create({
        data: {
          ...dto,
          password: hash,
        },
      });
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError) {
        if (e.code == "P2002") {
          const duplicatedField: string = e.meta.target[0];
          throw new BadRequestException(
            `A user with this ${duplicatedField} already exists`,
          );
        }
      }
      throw e;
    }
  }

  async update(id: string, user: UpdateUserDto) {
    try {
      const hash = user.password && (await argon.hash(user.password));
      user.storageQuotaBytes = this.normalizeStorageQuota(
        user.storageQuotaBytes,
      );

      return await this.prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({
          where: { id },
          select: { id: true, isAdmin: true, isDisabled: true },
        });

        if (!existingUser) throw new BadRequestException("User not found");

        const removesActiveAdmin =
          existingUser.isAdmin &&
          !existingUser.isDisabled &&
          (user.isAdmin === false || user.isDisabled === true);

        if (removesActiveAdmin) {
          const activeAdminCount = await tx.user.count({
            where: { isAdmin: true, isDisabled: false },
          });

          if (activeAdminCount === 1) {
            throw new BadRequestException(
              "Cannot disable or demote the last active admin user",
            );
          }
        }

        const updatedUser = await tx.user.update({
          where: { id },
          data: { ...user, password: hash },
        });

        if (user.isDisabled === true && !existingUser.isDisabled) {
          await tx.refreshToken.deleteMany({ where: { userId: id } });
          await tx.loginToken.deleteMany({ where: { userId: id } });
          await tx.resetPasswordToken.deleteMany({ where: { userId: id } });
        }

        return updatedUser;
      });
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError) {
        if (e.code == "P2002") {
          const duplicatedField: string = e.meta.target[0];
          throw new BadRequestException(
            `A user with this ${duplicatedField} already exists`,
          );
        }
      }
      throw e;
    }
  }

  async delete(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { shares: true },
    });
    if (!user) throw new BadRequestException("User not found");

    if (user.isAdmin && !user.isDisabled) {
      const userCount = await this.prisma.user.count({
        where: { isAdmin: true, isDisabled: false },
      });

      if (userCount === 1) {
        throw new BadRequestException(
          "Cannot delete the last active admin user",
        );
      }
    }

    await Promise.all(
      user.shares.map((share) => this.fileService.deleteAllFiles(share.id)),
    );

    return await this.prisma.user.delete({ where: { id } });
  }

  async getTransferOwnershipSummary(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new BadRequestException("User not found");

    const [shareCount, reverseShareCount, files] = await Promise.all([
      this.prisma.share.count({
        where: { creatorId: id },
      }),
      this.prisma.reverseShare.count({
        where: { creatorId: id },
      }),
      this.prisma.file.findMany({
        where: {
          share: {
            creatorId: id,
          },
        },
        select: {
          size: true,
        },
      }),
    ]);

    const totalSizeBytes = files
      .reduce((acc, file) => acc + BigInt(file.size), 0n)
      .toString();

    return {
      sourceUserId: id,
      shareCount,
      reverseShareCount,
      totalSizeBytes,
    };
  }

  async transferOwnership(
    sourceUserId: string,
    targetUserId: string,
    includeReverseShares = true,
  ) {
    if (sourceUserId === targetUserId) {
      throw new BadRequestException("Source and target user must be different");
    }

    const [sourceUser, targetUser] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: sourceUserId },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, isDisabled: true },
      }),
    ]);

    if (!sourceUser) throw new BadRequestException("Source user not found");
    if (!targetUser) throw new BadRequestException("Target user not found");
    if (targetUser.isDisabled) {
      throw new BadRequestException(
        "Transfers can't be moved to a disabled user",
      );
    }

    const summary = await this.getTransferOwnershipSummary(sourceUserId);

    const result = await this.prisma.$transaction(async (tx) => {
      const shares = await tx.share.updateMany({
        where: { creatorId: sourceUserId },
        data: { creatorId: targetUserId },
      });

      const reverseShares = includeReverseShares
        ? await tx.reverseShare.updateMany({
            where: { creatorId: sourceUserId },
            data: { creatorId: targetUserId },
          })
        : { count: 0 };

      return {
        sharesTransferred: shares.count,
        reverseSharesTransferred: reverseShares.count,
      };
    });

    return {
      sourceUserId,
      targetUserId,
      ...result,
      totalSizeBytes: summary.totalSizeBytes,
    };
  }

  async findOrCreateFromLDAP(
    providedCredentials: AuthSignInDTO,
    ldapEntry: Entry,
  ) {
    const fieldNameMemberOf = this.configService.get("ldap.fieldNameMemberOf");
    const fieldNameEmail = this.configService.get("ldap.fieldNameEmail");

    let isAdmin = false;
    const fieldNameMemberOfStr = String(fieldNameMemberOf);
    if (fieldNameMemberOfStr in ldapEntry) {
      const adminGroup = String(this.configService.get("ldap.adminGroups"));
      const entryGroups = Array.isArray(ldapEntry[fieldNameMemberOfStr])
        ? ldapEntry[fieldNameMemberOfStr]
        : [ldapEntry[fieldNameMemberOfStr]];
      isAdmin = entryGroups.includes(adminGroup) ?? false;
    } else {
      this.logger.warn(
        `Trying to create/update a ldap user but the member field ${fieldNameMemberOfStr} is not present.`,
      );
    }

    let userEmail: string | null = null;
    const fieldNameEmailStr = String(fieldNameEmail);
    if (fieldNameEmailStr in ldapEntry) {
      const value = Array.isArray(ldapEntry[fieldNameEmailStr])
        ? ldapEntry[fieldNameEmailStr][0]
        : ldapEntry[fieldNameEmailStr];
      if (value) {
        userEmail = value.toString();
      }
    } else {
      this.logger.warn(
        `Trying to create/update a ldap user but the email field ${fieldNameEmail} is not present.`,
      );
    }

    if (providedCredentials.email) {
      /* if LDAP does not provides an users email address, take the user provided email address instead */
      userEmail = providedCredentials.email;
    }

    const randomId = crypto.randomUUID();
    const placeholderUsername = `ldap_user_${randomId}`;
    const placeholderEMail = `${randomId}@ldap.local`;

    try {
      const user = await this.prisma.user.upsert({
        create: {
          username: providedCredentials.username ?? placeholderUsername,
          email: userEmail ?? placeholderEMail,
          password: await argon.hash(crypto.randomUUID()),

          isAdmin,
          ldapDN: ldapEntry.dn,
        },
        update: {
          isAdmin,
          ldapDN: ldapEntry.dn,
        },
        where: {
          ldapDN: ldapEntry.dn,
        },
      });

      if (user.username === placeholderUsername) {
        /* Give the user a human readable name if the user has been created with a placeholder username */
        await this.prisma.user
          .update({
            where: {
              id: user.id,
            },
            data: {
              username: `user_${user.id}`,
            },
          })
          .then((newUser) => {
            user.username = newUser.username;
          })
          .catch((error) => {
            this.logger.warn(
              `Failed to update users ${user.id} placeholder username: ${inspect(error)}`,
            );
          });
      }

      if (userEmail && userEmail !== user.email) {
        /* Sync users email if it has changed */
        await this.prisma.user
          .update({
            where: {
              id: user.id,
            },
            data: {
              email: userEmail,
            },
          })
          .then((newUser) => {
            this.logger.log(
              `Updated users ${user.id} email from ldap from ${user.email} to ${userEmail}.`,
            );
            user.email = newUser.email;
          })
          .catch((error) => {
            this.logger.error(
              `Failed to update users ${user.id} email to ${userEmail}: ${inspect(error)}`,
            );
          });
      }

      return user;
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError) {
        if (e.code == "P2002") {
          const duplicatedField: string = e.meta.target[0];
          throw new BadRequestException(
            `A user with this ${duplicatedField} already exists`,
          );
        }
      }
    }
  }

  private normalizeStorageQuota(storageQuotaBytes?: string | null) {
    if (!storageQuotaBytes || parseInt(storageQuotaBytes) <= 0) return null;
    const quota = parseInt(storageQuotaBytes);
    if (!Number.isFinite(quota)) {
      throw new BadRequestException("Storage quota must be a number of bytes");
    }
    return quota.toString();
  }
}
