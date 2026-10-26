# Zugzwang game server (Express + Socket.IO)
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

USER node
EXPOSE 4000
CMD ["node", "src/index.js"]
