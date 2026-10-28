# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: build
# Compiles the React app into a static bundle (build/).
# ---------------------------------------------------------------------------
FROM node:18-alpine AS build

WORKDIR /app

# Do not let a CI environment turn lint warnings into build failures.
ENV CI=false

# Copy the manifest first so the dependency install layer is cached and is only
# rebuilt when package.json actually changes.
COPY package*.json ./
RUN npm install

# Copy the application source and produce the production bundle.
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: runtime
# nginx serves the static bundle. Unlike "npm start" (a webpack dev server that
# must compile before it binds the port), nginx is ready within milliseconds, so
# http://localhost:3000 responds immediately.
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine

# Replace the stock config with one that also proxies /api to the backend.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# The compiled bundle produced by the build stage.
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

# nginx serves the SPA; container health is measured by hitting the entry page.
# 127.0.0.1 is used instead of "localhost" because on Alpine "localhost"
# resolves to ::1 first while nginx only listens on IPv4.
HEALTHCHECK --interval=5s --timeout=3s --retries=5 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
