# syntax=docker/dockerfile:1
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/carta/package.json apps/carta/
RUN pnpm install --frozen-lockfile --filter @gula/carta...
COPY packages/shared packages/shared
COPY apps/carta apps/carta
RUN pnpm --filter @gula/carta exec vite build

FROM caddy:2
COPY --from=build /repo/apps/carta/dist /srv/carta
COPY infra/Caddyfile /etc/caddy/Caddyfile
