# syntax=docker/dockerfile:1
#
# One image, not the two finance ships. Finance splits them because its API is a
# Nest process and its client is static files behind nginx; here `server/index.ts`
# already serves `dist/` and `/api` from the same process, so a second container
# would exist only to do what the first is doing anyway.
#
# The server is plain TypeScript: Node 24 strips the types at load, so there is no
# build step for it and nothing to keep in sync with a compiled copy.
FROM node:24-alpine AS base
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
# Type-checks the client and the server before bundling, so a broken deploy fails
# here rather than at container start.
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production TZ=UTC PORT=4002 DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
# Shipped as source on purpose: these are what Node actually runs.
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared

# su-exec is the whole reason this stage installs anything: the entrypoint needs to
# take ownership of the bind-mounted /data as root, then drop, in one process.
RUN apk add --no-cache su-exec \
    && mkdir -p /data && chown -R node:node /data
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
