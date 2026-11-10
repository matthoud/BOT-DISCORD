# ---------- Étape 1 : compilation ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

# OpenSSL est requis par le moteur de Prisma.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx prisma generate \
  && npm run build \
  && npm prune --omit=dev

# ---------- Étape 2 : image d'exécution ----------
FROM node:20-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

# Le bot tourne sans privilèges ; il n'écrit que dans /app/logs.
RUN mkdir -p logs && chown -R node:node /app
USER node

# Applique les migrations en attente, puis démarre le bot.
# `exec` fait de Node le processus principal afin qu'il reçoive SIGTERM (arrêt propre).
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/index.js"]
