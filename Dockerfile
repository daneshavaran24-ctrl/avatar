# Built as an image rather than relying on platform buildpack detection: both
# bun.lock and package-lock.json are present (ambiguous to auto-detection), and
# the server entrypoint is Nitro's .output/server/index.mjs, a path no buildpack
# can infer without reading vite.config.ts.

FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# NODE_ENV must not be "development" here: it would bake the development JSX
# runtime into the server bundle and every page would fail to render.
ENV NODE_ENV=production
RUN npm run build

# Compile migration/seed TS scripts to standalone ESM so the runtime image
# needs only the two small pure-JS deps (postgres, bcryptjs) — no tsx/esbuild.
RUN npx esbuild scripts/migrate.ts --bundle --platform=node --format=esm \
      --outfile=scripts/migrate.mjs --external:postgres && \
    npx esbuild scripts/seed-admin.ts --bundle --platform=node --format=esm \
      --outfile=scripts/seed-admin.mjs --external:postgres --external:bcryptjs

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000

COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build /app/scripts/seed-admin.mjs ./scripts/seed-admin.mjs

# Only two small pure-JS packages needed at runtime (for migration/seed scripts).
# Nitro bundles everything the server itself needs into .output/.
COPY --from=build /app/node_modules/postgres ./node_modules/postgres
COPY --from=build /app/node_modules/bcryptjs ./node_modules/bcryptjs

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
