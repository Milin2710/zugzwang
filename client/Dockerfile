# Zugzwang web app (Next.js). NEXT_PUBLIC_* values are baked into the browser bundle at build time.
FROM node:22-slim
WORKDIR /app

# postinstall copies the Stockfish files, so the script must exist before `npm ci`
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npm", "start"]
