FROM nginx:alpine

# Copie les fichiers statiques dans le dossier servi par nginx
COPY index.html /usr/share/nginx/html/index.html
COPY style.css  /usr/share/nginx/html/style.css
COPY app.js     /usr/share/nginx/html/app.js

# Config nginx légère pour SPA statique
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
