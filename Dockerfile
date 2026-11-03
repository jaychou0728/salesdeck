FROM node:24-bookworm-slim AS build
RUN corepack enable && apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY --from=build /app .
ENV NODE_ENV=production PORT=3000 DEMO_MODE=true
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
