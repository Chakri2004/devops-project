FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY index.js .
COPY swagger.js .

EXPOSE 5000

CMD ["npm", "start"]