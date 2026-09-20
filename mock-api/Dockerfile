FROM node:20-alpine

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src
COPY data ./data

EXPOSE 8000

CMD ["npm", "run", "dev"]
