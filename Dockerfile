FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN npm run build
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/backend-sat-puno ./backend-sat-puno
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json
ENV NODE_ENV=production HOST=0.0.0.0
USER node
CMD ["npm", "start"]
