# The app's own, from the template: an image that serves the build with Caddy. Change it as the app's registry, base
# image and user need. Run `vp build` first, so dist/ holds the app and its precompressed files.
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY dist /srv
