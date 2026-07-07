# Container dedicado — API Express (porta 3001)
# Build a partir da raiz do repositório:
#   docker build -f docker/backend/Dockerfile -t sorelle-backend .

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ .

COPY docker/backend/docker-entrypoint.sh /docker-entrypoint.sh
COPY docker/backend/docker-start.sh /docker-start.sh
RUN chmod +x /docker-entrypoint.sh /docker-start.sh

RUN mkdir -p uploads/generated uploads/products uploads/temp uploads/invoices uploads/labels

EXPOSE 3001

ENTRYPOINT ["/docker-entrypoint.sh"]

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=25s \
  CMD curl -f http://127.0.0.1:3001/api/health || exit 1

CMD ["npm", "start"]
