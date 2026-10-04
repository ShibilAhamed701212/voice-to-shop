# Single image: builds the React app and serves it from the Express API.
FROM node:20-alpine AS build
WORKDIR /app
COPY mock-api/package*.json mock-api/
COPY frontend/package*.json frontend/
RUN npm --prefix mock-api ci && npm --prefix frontend ci
COPY mock-api mock-api
COPY frontend frontend
RUN npm --prefix frontend run build && npm --prefix mock-api run build && npm --prefix mock-api prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8000 DATA_DIR=/app/state
COPY --from=build /app/mock-api/dist mock-api/dist
COPY --from=build /app/mock-api/node_modules mock-api/node_modules
COPY --from=build /app/mock-api/data mock-api/data
COPY --from=build /app/mock-api/package.json mock-api/
COPY --from=build /app/frontend/dist frontend/dist
RUN mkdir -p /app/state && chown node:node /app/state
USER node
EXPOSE 8000
CMD ["node", "mock-api/dist/server.js"]
