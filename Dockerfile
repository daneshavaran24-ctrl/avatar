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

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Migrations and the admin seeder ship with the image so they can be run with
# `liara shell` against the attached database.
COPY --from=build /app/.output ./.output
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
