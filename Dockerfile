FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache git
COPY package*.json ./
COPY packages/game-core/package.json packages/game-core/package.json
COPY apps/react-web/package.json apps/react-web/package.json
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=2567
ENV KALITIRI_DATA_DIR=/data/tables
RUN mkdir -p /data/tables
EXPOSE 2567
CMD ["npm", "start"]
