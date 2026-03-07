# syntax=docker/dockerfile:1

FROM node:22-alpine

WORKDIR /app

# Install deps first for better caching
COPY package.json package-lock.json ./
RUN npm ci

# App source
COPY . .

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

# Dev server for fast iteration / UX review
CMD ["npm","run","dev","--","-H","0.0.0.0","-p","3000"]
