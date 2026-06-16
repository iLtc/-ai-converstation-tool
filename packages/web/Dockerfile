# Build stage
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
# Copy every workspace manifest so --frozen-lockfile can validate the full
# workspace; --filter @app/web... still limits the actual install to web + its deps.
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/web/package.json packages/web/package.json
RUN pnpm install --frozen-lockfile --filter @app/web...
COPY packages/shared packages/shared
COPY packages/web packages/web
RUN pnpm --filter @app/web build

# Serve stage
FROM nginx:alpine
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/packages/web/dist /usr/share/nginx/html
EXPOSE 80
