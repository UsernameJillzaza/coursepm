# CoursePM production image (Lab 5, Issue #25).
#
# One image serves the API (Express) and the built React client on $PORT
# (3000), so the UI and API share one origin and the SameSite=Lax session
# cookie works without CORS. The same image also runs the migrate/seed step
# (docker-compose `migrate` service locally, a Cloud Run job on GCP).
#
# Build from the repository root:   docker build -t coursepm .
# No secret is baked in: DATABASE_URL, SEED_PASSWORD, etc. are runtime env vars.
# Adapted from the Lab 5 starter kit (TokTickIT) Dockerfile.

# ---- Stage 1: build the React client (Vite) ---------------------------------
FROM node:24-alpine AS client-builder
WORKDIR /app/client
# Package files first, so `npm ci` stays cached until dependencies change.
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# #29: the deploy workflow passes the full commit SHA it tags the image with;
# Vite bakes it into the bundle for the release footer. Empty = dev build.
ARG APP_COMMIT=
ENV VITE_APP_COMMIT=$APP_COMMIT
RUN npm run build

# ---- Stage 2: build the server (TypeScript + Prisma client) -----------------
FROM node:24-alpine AS server-builder
WORKDIR /app/server
# `npm ci` runs the postinstall `prisma generate`, which needs the schema and
# prisma.config.ts, so they are copied before installing.
COPY server/package.json server/package-lock.json server/prisma.config.ts ./
COPY server/prisma ./prisma
RUN npm ci
COPY server/ ./
# `prisma generate && tsc` -> dist/ (prisma generate does not need DATABASE_URL)
RUN npm run build

# ---- Stage 3: runtime --------------------------------------------------------
FROM node:24-alpine AS production
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app/server
# The full node_modules (dev dependencies included) is kept on purpose: the
# migrate/seed step runs `prisma migrate deploy` and `prisma db seed`, and the
# seed runs through tsx from src/. prisma/ holds the migrations it applies.
COPY --from=server-builder /app/server/package.json /app/server/package-lock.json /app/server/prisma.config.ts ./
COPY --from=server-builder /app/server/node_modules ./node_modules
COPY --from=server-builder /app/server/dist ./dist
COPY --from=server-builder /app/server/src ./src
COPY --from=server-builder /app/server/prisma ./prisma
# Built SPA. From dist/server.js, path.resolve(__dirname, '../../client/dist')
# points here (/app/client/dist) and also to client/dist in a local checkout.
COPY --from=client-builder /app/client/dist /app/client/dist

# Run as the unprivileged `node` user that the official image provides.
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
