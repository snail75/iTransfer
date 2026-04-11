import { Injectable } from "@nestjs/common";
import { User } from "@prisma/client";
import * as argon from "argon2";
import * as crypto from "crypto";
import { PrismaService } from "src/prisma/prisma.service";

const API_TOKEN_PREFIX = "mtp";

@Injectable()
export class ApiTokenService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, name: string) {
    const id = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString("base64url");
    const token = `${API_TOKEN_PREFIX}.${id}.${secret}`;

    const apiToken = await this.prisma.apiToken.create({
      data: {
        id,
        name,
        tokenHash: await argon.hash(secret),
        user: { connect: { id: userId } },
      },
    });

    return { ...apiToken, token };
  }

  async list(userId: string) {
    return this.prisma.apiToken.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async remove(userId: string, id: string) {
    await this.prisma.apiToken.deleteMany({
      where: {
        id,
        userId,
      },
    });
  }

  async getUserForToken(token: string): Promise<User | null> {
    const [prefix, id, secret] = token.split(".");

    if (prefix !== API_TOKEN_PREFIX || !id || !secret) {
      return null;
    }

    const apiToken = await this.prisma.apiToken.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!apiToken || !(await argon.verify(apiToken.tokenHash, secret))) {
      return null;
    }

    await this.prisma.apiToken.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });

    return apiToken.user;
  }
}
