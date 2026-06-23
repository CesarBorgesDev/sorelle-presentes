FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p uploads/generated uploads/products uploads/temp

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=20s \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["npm", "start"]
