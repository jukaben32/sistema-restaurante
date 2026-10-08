# Restaurant Martin POS — imagen para el VPS (Dokploy)
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependencias primero (aprovecha la caché de Docker)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Carpeta para archivos subidos (logos); la base de datos está en Supabase
RUN mkdir -p public/uploads

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server.js"]
