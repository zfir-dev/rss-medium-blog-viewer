# syntax=docker/dockerfile:1

# ---- Build the Ember app -------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# The Ember app reads these at build time (they are baked into the bundle).
ARG PAGE_TITLE
ARG ICON_URL
ARG GA_ID
ARG MEDIUM_URL
ARG MEDIUM_FEED_URL
ARG RSS_2_JSON_API_KEY
ARG POSTS_API_URL
RUN npm run build

# ---- Runtime: tiny Node server, no npm dependencies ------------------------
FROM node:22-alpine
WORKDIR /app

# Build args double as runtime defaults; runtime env vars override them.
ARG PAGE_TITLE
ARG ICON_URL
ARG MEDIUM_FEED_URL
ARG RSS_2_JSON_API_KEY
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DIST_DIR=/app/dist \
    DATA_DIR=/data \
    PAGE_TITLE=${PAGE_TITLE} \
    ICON_URL=${ICON_URL} \
    MEDIUM_FEED_URL=${MEDIUM_FEED_URL} \
    RSS_2_JSON_API_KEY=${RSS_2_JSON_API_KEY}

COPY package.json ./
COPY server ./server
COPY --from=build /app/dist ./dist

RUN mkdir -p /data && chown node:node /data
USER node

# The post archive lives here; mount a volume so it survives redeploys.
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
