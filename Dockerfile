FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
COPY apps/client/.npmrc apps/client/
COPY packages/shared/package.json packages/shared/
COPY packages/game_engine/package.json packages/game_engine/
COPY packages/games/package.json packages/games/
RUN pnpm install --frozen-lockfile

# Build everything
FROM deps AS build
COPY . .
RUN pnpm build

# Production: prune to runtime deps, then copy build artifacts
FROM deps AS pruned
RUN pnpm prune --prod

FROM base AS production
COPY --from=pruned /app ./
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/client/build ./apps/client/build
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/game_engine/dist ./packages/game_engine/dist
COPY --from=build /app/packages/game_engine/package.json ./packages/game_engine/
COPY --from=build /app/packages/games/dist ./packages/games/dist
COPY --from=build /app/packages/games/package.json ./packages/games/

ENV PORT=3001
EXPOSE 3001
CMD ["node", "apps/server/dist/index.js"]
