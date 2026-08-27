ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

WORKDIR /workspace

RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile \
    && pnpm build \
    && pnpm --filter server --prod deploy --legacy /release

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=6001
ENV STORAGE_DRIVER=local
ENV LOCAL_STORAGE_ROOT=/data
ENV LOCAL_PUBLIC_BASE_URL=/media

WORKDIR /app

COPY --from=builder /release/ ./

RUN mkdir -p /data && chown -R node:node /app /data

USER node

EXPOSE 6001
VOLUME ["/data"]

CMD ["node", "dist/main.js"]
