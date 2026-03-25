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

# Install canvas native dependencies (required for PDF→image rendering in OCR)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .

# Pre-download Tesseract OCR language models (Slovak + Czech + English)
# Avoids runtime CDN downloads — enables offline OCR for scanned PDFs
ENV TESSERACT_LANG_PATH=/app/tessdata
RUN mkdir -p /app/tessdata && \
    for lang in slk ces eng; do \
      echo "Downloading tessdata: $lang" && \
      curl -fsSL "https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz" \
        -o "/app/tessdata/${lang}.traineddata.gz" || \
      echo "Warning: Failed to download ${lang} tessdata"; \
    done

EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
