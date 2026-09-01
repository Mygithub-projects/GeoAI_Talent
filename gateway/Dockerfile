FROM nginx:1.27-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV POSTGREST_HOST=geo-postgrest-xniwjc4tha-as.a.run.app \
    GOTRUE_HOST=geo-gotrue-xniwjc4tha-as.a.run.app
EXPOSE 8080
