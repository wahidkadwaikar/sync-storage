FROM node:20-alpine AS build

RUN corepack enable && corepack prepare pnpm@9.15.3 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps/api/package.json apps/api/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/sdk/package.json packages/sdk/package.json

RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm -r build

FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.3 --activate

COPY --from=build /app /app

EXPOSE 4000

CMD ["pnpm", "--filter", "@sync-storage/api", "start"]
