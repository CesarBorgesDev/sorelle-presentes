# @deprecated — prefira: docker build -f docker/backend/Dockerfile -t sorelle-backend .

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN chmod +x docker-entrypoint.sh

RUN mkdir -p uploads/generated uploads/products uploads/temp

EXPOSE 3001

ENTRYPOINT ["/app/docker-entrypoint.sh"]

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=25s \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["npm", "start"]
