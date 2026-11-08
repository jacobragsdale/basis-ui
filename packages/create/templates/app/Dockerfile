# The image serves the build: run `vp build` first, so dist/ holds the app and its precompressed files.
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY dist /srv
