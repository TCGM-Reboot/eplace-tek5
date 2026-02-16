# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Installer les deps d'abord (meilleur cache)
COPY package*.json ./
# Si tu utilises pnpm ou yarn, adapte les commandes ci-dessous.
RUN npm ci

# Copier le reste et build
COPY . .
RUN npm run build

# ---- Runtime stage (serve static) ----
# Nginx non-root, adapté Cloud Run
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime

# Nginx écoute en 8080 (Cloud Run)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier le build Vite (dist) vers le dossier statique Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Optionnel: petit hardening
# (image unprivileged => déjà non-root)
EXPOSE 8080
