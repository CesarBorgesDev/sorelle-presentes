# Container dedicado — loja React (Nginx :3000)
# Build a partir da raiz do repositório:
#   docker build -f docker/frontend/Dockerfile --build-arg VITE_API_URL=/api -t sorelle-frontend .

FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build \
  && printf 'window.__SORELLE_API_URL__ = %s;\n' "'${VITE_API_URL}'" > /app/dist/sorelle-config.js

FROM nginx:stable-alpine

COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/frontend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=15s \
  CMD wget -q --spider http://127.0.0.1:3000/ || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
