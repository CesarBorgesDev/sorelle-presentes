#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_ENV="${SCRIPT_DIR}/.env.deploy"

# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

load_deploy_env "$DEPLOY_ENV"

BASE_URL="$(site_public_url)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
ok()   { echo -e "${GREEN}OK${NC}  $*"; }
fail() { echo -e "${RED}FALHA${NC} $*"; }
warn() { echo -e "${YELLOW}AVISO${NC} $*"; }

echo "=== Diagnóstico Sorelle ==="
print_deploy_paths
echo ""

echo "Docker:"
if docker ps --format '  {{.Names}}: {{.Status}}' 2>/dev/null | grep -E 'sorelle-(db|backend)'; then
  ok "Containers encontrados"
else
  fail "Containers sorelle-db / sorelle-backend não estão rodando"
  echo "  → docker compose -f deploy/aapanel/docker-compose.backend.yml up -d --build"
fi
echo ""

echo "API local (127.0.0.1:3001):"
if curl -sf http://127.0.0.1:3001/api/health >/dev/null; then
  ok "$(curl -s http://127.0.0.1:3001/api/health)"
else
  fail "API não responde em 127.0.0.1:3001"
  echo "  → docker logs sorelle-backend --tail 50"
fi
echo ""

echo "API via Nginx:"
if [ -n "${API_DOMAIN:-}" ] && ! is_ipv4 "${DOMAIN:-}"; then
  API_URL="$(api_public_url)/api/health"
else
  API_URL="${BASE_URL}/api/health"
fi
HTTP_CODE=$(curl -s -o /tmp/sorelle-health.json -w "%{http_code}" "${API_URL}" || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  ok "HTTP ${HTTP_CODE} — $(cat /tmp/sorelle-health.json) (${API_URL})"
else
  fail "HTTP ${HTTP_CODE} em ${API_URL}"
  if [ -n "${API_DOMAIN:-}" ]; then
    echo "  → Crie o site api no aaPanel: ${API_DOMAIN}"
    echo "  → bash deploy/aapanel/fix-access.sh"
  else
    echo "  → bash deploy/aapanel/fix-access.sh"
  fi
fi
echo ""

if [ -n "${API_DOMAIN:-}" ] && ! is_ipv4 "${DOMAIN:-}"; then
  echo "API subdomínio (${API_DOMAIN}):"
  SUB_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$(api_public_url)/api/health" || echo "000")
  if [ "$SUB_CODE" = "200" ]; then
    ok "HTTP ${SUB_CODE} — $(api_public_url)/api/health"
  else
    fail "HTTP ${SUB_CODE} — DNS ou vhost de ${API_DOMAIN} incorreto"
    echo "  → DNS: ${API_DOMAIN} → A → IP do servidor"
    echo "  → aaPanel: Website → Add site → ${API_DOMAIN}"
  fi
  echo ""
fi

echo "Frontend (${BASE_URL}/):"
FRONT_CODE=$(curl -s -o /tmp/sorelle-front.html -w "%{http_code}" "${BASE_URL}/" || echo "000")
if [ "$FRONT_CODE" = "200" ]; then
  if grep -q 'id="root"' /tmp/sorelle-front.html 2>/dev/null; then
    ok "HTTP ${FRONT_CODE} — loja React"
  elif grep -q 'Congratulations' /tmp/sorelle-front.html 2>/dev/null; then
    fail "HTTP ${FRONT_CODE} — ainda é a página padrão do aaPanel"
    echo "  → bash deploy/aapanel/fix-homepage.sh"
  else
    warn "HTTP ${FRONT_CODE} — conteúdo inesperado em ${SITE_ROOT}"
  fi
else
  fail "HTTP ${FRONT_CODE}"
fi
echo ""

echo "Login admin (teste):"
LOGIN_URL="$(api_public_url)/api/auth/login"
LOGIN_CODE=$(curl -s -o /tmp/sorelle-login.json -w "%{http_code}" \
  -X POST "${LOGIN_URL}" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sorelle.com.br","password":"__invalid__"}' || echo "000")
if [ "$LOGIN_CODE" = "401" ]; then
  ok "HTTP 401 — API de login respondendo ($(cat /tmp/sorelle-login.json))"
elif [ "$LOGIN_CODE" = "200" ]; then
  warn "Login retornou 200 com senha inválida — verifique auth"
else
  fail "HTTP ${LOGIN_CODE} — $(cat /tmp/sorelle-login.json 2>/dev/null || echo 'sem resposta')"
fi
echo ""

echo "server/.env (DATABASE_URL):"
if [ -f "${APP_DIR}/server/.env" ]; then
  grep '^DATABASE_URL=' "${APP_DIR}/server/.env" | sed 's/:[^:@]*@/:***@/'
  if grep -q '@db:5432' "${APP_DIR}/server/.env"; then
    warn "Host 'db' no .env — use 127.0.0.1 no host VPS"
    echo "  → sed -i 's|@db:5432|@127.0.0.1:5432|' server/.env"
  fi
else
  warn "server/.env não encontrado em ${APP_DIR}"
fi

echo ""
echo "=== Fim do diagnóstico ==="
