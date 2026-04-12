FROM node:22-alpine AS build

WORKDIR /opt/app/backend

RUN apk add --no-cache g++ make openssl python3

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --progress=false

COPY backend ./
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS production

ENV NODE_ENV=docker \
    PORT=3000 \
    DATA_DIRECTORY=/data \
    UPLOAD_DIRECTORY=/data/uploads/shares \
    DATABASE_URL=file:/data/mediapult-transfer.db?connection_limit=1

WORKDIR /opt/app/backend

RUN apk add --no-cache openssl

COPY --from=build /opt/app/backend/node_modules ./node_modules
COPY --from=build /opt/app/backend/dist ./dist
COPY --from=build /opt/app/backend/prisma ./prisma
COPY --from=build /opt/app/backend/package.json ./package.json
COPY --from=build /opt/app/backend/package-lock.json ./package-lock.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
