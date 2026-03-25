# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only (no devDependencies)
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
