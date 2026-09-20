FROM node:20-alpine

WORKDIR /app

COPY package.json tsconfig.json vite.config.ts index.html ./
RUN npm install

COPY src ./src

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
