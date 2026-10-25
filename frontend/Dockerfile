# syntax=docker/dockerfile:1

# Reflex Cube web client: built with Vite, served by nginx.
#
#   docker build -t reflex-cube-web ./frontend

FROM node:20-alpine AS build

WORKDIR /app

# Install from the lockfile alone first, so the dependency layer survives
# source changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Baked into the bundle at build time. Empty means "same origin", which is what
# the nginx config below serves by proxying /api to the backend.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build


FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
