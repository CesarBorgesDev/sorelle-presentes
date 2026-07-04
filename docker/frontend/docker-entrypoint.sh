#!/bin/sh
set -eu

API_URL="${SORELLE_API_URL:-${VITE_API_URL:-/api}}"
API_URL="${API_URL%/}"

printf 'window.__SORELLE_API_URL__ = %s;\n' "'${API_URL}'" > /usr/share/nginx/html/sorelle-config.js

exec nginx -g 'daemon off;'
