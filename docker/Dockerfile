# syntax=docker/dockerfile:1
#
# One image, not the two finance ships. Finance splits them because its API is a
# Nest process and its client is static files behind nginx; here `server/index.ts`
# already serves `dist/` and `/api` from the same process, so a second container
# would exist only to do what the first is doing anyway.
#
# The server is plain TypeScript: Node 24 strips the types at load, so there is no
# build step for it and nothing to keep in sync with a compiled copy.
#
# The node and alpine tags are pinned to the same Alpine release: the runtime
# stage borrows the node binary, and it has to find the libstdc++ it was built
# against.

# Everything up to the runtime stage runs on the builder's own platform. Its
# output (the Vite bundle, and pure-JS node_modules) is the same bytes on every
# architecture, so a multi-arch build does this once, natively, instead of again
# under QEMU for each target.
FROM --platform=$BUILDPLATFORM node:24-alpine3.24 AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH TZ=UTC
RUN corepack enable
WORKDIR /app

# Production dependencies only — hono and @hono/node-server, both pure JS.
#
# Everything the browser uses (React, Base UI, date-fns, the vendored calendar's
# tree) is a devDependency on purpose: Vite bundles it into dist/, so the Node
# process never imports any of it and it has no business in this stage.
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts

FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY . .
# Baked into the bundle: the canonical URL, the social card and the web manifest are
# build-time values (src/lib/consts.ts). Override for a different host.
ARG VITE_SITE_URL
ENV VITE_SITE_URL=${VITE_SITE_URL}
# Type-checks the client and the server before bundling, so a broken release fails
# here rather than at container start.
RUN pnpm build

# The target platform's node, and nothing else from its image.
FROM node:24-alpine3.24 AS node

# Bare Alpine plus the node binary: no npm, corepack, yarn or pnpm, none of which
# the running app calls.
FROM alpine:3.24 AS runtime
ARG VERSION=dev
LABEL org.opencontainers.image.title="Timeinator" \
      org.opencontainers.image.description="A world clock and a group scheduler. Self-hosted, no accounts, one SQLite file." \
      org.opencontainers.image.source="https://github.com/FrrCode/Timeinator" \
      org.opencontainers.image.url="https://timeinator.frrcode.com" \
      org.opencontainers.image.licenses="ISC AND LicenseRef-Commons-Clause" \
      org.opencontainers.image.version="${VERSION}"
ENV NODE_ENV=production TZ=UTC PORT=4002 DATA_DIR=/data

# su-exec: the entrypoint takes ownership of the bind-mounted /data as root, then
# drops, in one process. uid 1000 matches the official node image, so a data
# directory created by an earlier release stays readable.
RUN apk add --no-cache libstdc++ su-exec \
    && addgroup -g 1000 node \
    && adduser -u 1000 -G node -s /bin/sh -D node \
    && mkdir -p /data && chown -R node:node /data
COPY --from=node /usr/local/bin/node /usr/local/bin/node

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
# Shipped as source on purpose: these are what Node actually runs.
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

VOLUME ["/data"]
EXPOSE 4002

# Hits the endpoint that queries SQLite, so a container that has lost its volume
# reports unhealthy rather than merely "running".
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4002/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Starts as root only to chown /data, then execs as `node` — see entrypoint.sh.
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]
