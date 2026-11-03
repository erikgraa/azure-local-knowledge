# Self-contained Azure Local Compendium: the built site, with the index baked in, served by nginx.
# The site is built by the Deploy workflow (after the nightly index) into ./dist-container; this image
# only packages it, so there is no Node toolchain and no network access needed at runtime.
#
#   docker run --rm -p 8080:8080 ghcr.io/erikgraa/azure-local-knowledge:latest
FROM nginxinc/nginx-unprivileged:1.30-alpine

ARG VERSION=dev
ARG REVISION=unknown
ARG CREATED=unknown
LABEL org.opencontainers.image.title="Azure Local Compendium" \
      org.opencontainers.image.description="Searchable Azure Local troubleshooting guides and known issues, with the index baked in. Community project, not affiliated with Microsoft." \
      org.opencontainers.image.source="https://github.com/erikgraa/azure-local-knowledge" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}"

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY dist-container/ /usr/share/nginx/html/

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
