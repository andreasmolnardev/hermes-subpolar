FROM oven/bun:1.3.14

WORKDIR /app

COPY package.json bun.lock ./
COPY packages/api-gateway/package.json packages/api-gateway/package.json
COPY packages/chat-provider-interface/package.json packages/chat-provider-interface/package.json
COPY packages/data-layer/package.json packages/data-layer/package.json
COPY packages/harness/package.json packages/harness/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/subpolar-server/package.json packages/subpolar-server/package.json
COPY packages/tool-resolver/package.json packages/tool-resolver/package.json
COPY packages/tool-runtime/package.json packages/tool-runtime/package.json
COPY packages/web-ui/package.json packages/web-ui/package.json

RUN bun install --frozen-lockfile

COPY . .
RUN bun run build:web

EXPOSE 8080
CMD ["bun", "packages/subpolar-server/src/cli.ts", "--host", "0.0.0.0", "--data-dir", "/opt/data"]
