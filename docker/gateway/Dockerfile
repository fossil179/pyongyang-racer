FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js name-filter.js leaderboard.js ./

USER node
EXPOSE 8080
CMD ["node", "server.js"]
