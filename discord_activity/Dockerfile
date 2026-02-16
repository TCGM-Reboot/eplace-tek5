# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Copier les manifests du client (IMPORTANT)
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci

# Copier le reste du client et build
COPY client ./client
RUN cd client && npm run build

# ---- runtime stage (serve static) ----
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime

# Nginx écoute sur 8080 (Cloud Run)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier le build Vite (dist)
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
