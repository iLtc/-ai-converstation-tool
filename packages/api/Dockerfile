FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

# Install workspace deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json
RUN pnpm install --frozen-lockfile

# Copy sources
COPY packages/shared packages/shared
COPY packages/api packages/api

ENV NODE_ENV=production
EXPOSE 8787
WORKDIR /app/packages/api
CMD ["pnpm", "start"]
