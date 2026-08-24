FROM oven/bun:1.3.14

WORKDIR /app

COPY package.json bun.lock ./
COPY packages/api-gateway/package.json packages/api-gateway/package.json
COPY packages/chat-provider-interface/package.json packages/chat-provider-interface/package.json
COPY packages/data-layer/package.json packages/data-layer/package.json
COPY packages/harness/package.json packages/harness/package.json
COPY packages/pi-agent/package.json packages/pi-agent/package.json
COPY packages/pi-ai/package.json packages/pi-ai/package.json
COPY packages/pi-client/package.json packages/pi-client/package.json
COPY packages/pi-coding-agent/package.json packages/pi-coding-agent/package.json
COPY packages/pi-protocol/package.json packages/pi-protocol/package.json
COPY packages/pi-telemetry/package.json packages/pi-telemetry/package.json
COPY packages/pi-tui/package.json packages/pi-tui/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/tool-resolver/package.json packages/tool-resolver/package.json
COPY packages/tool-runtime/package.json packages/tool-runtime/package.json
COPY packages/web-ui/package.json packages/web-ui/package.json
COPY tests-js/package.json tests-js/package.json

RUN bun install --frozen-lockfile

COPY . .
RUN bun run build:web

ENV SUBPOLAR_HOST=0.0.0.0 \
    SUBPOLAR_DATA_DIR=/opt/data

EXPOSE 8080
CMD ["bun", "packages/api-gateway/src/server.ts"]
