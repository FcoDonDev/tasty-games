# ---------- Build ----------
FROM node:22-alpine AS build

# pnpm es obligatorio en este repo (.npmrc: node-linker=hoisted)
RUN corepack enable && corepack prepare pnpm@11.0.8 --activate

WORKDIR /app

# Instalar dependencias primero para aprovechar la caché de capas
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Copiar el resto del código y exportar la web (build de producción static)
COPY . .
# En producción no existe canal E2E: EXPO_PUBLIC_E2E queda sin definir
RUN CI=1 pnpm exec expo export --platform web

# ---------- Runtime ----------
FROM nginx:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
