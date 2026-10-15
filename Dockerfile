FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --ignore-scripts --no-audit --no-fund
COPY src ./src
COPY tests ./tests
COPY index.html ./index.html
CMD ["npm", "test"]
