FROM node:22-slim
LABEL "language"="nodejs"
WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-noto-cjk ca-certificates && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
COPY . .
RUN npm ci --omit=dev
EXPOSE 8080
CMD ["node", "bootstrap.js"]
